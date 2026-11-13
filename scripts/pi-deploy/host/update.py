import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid


APP = Path('/opt/strahov-crazy-show')
CONFIG = Path('/etc/strahov-crazy-show')
STATE = Path('/var/lib/strahov-crazy-show')
PROJECT = 'strahov-crazy-show'
VOLUME_LABEL = 'cz.reomnik.strahov.managed=1'
ORIGIN = 'https://strahov.reomnik.com'
RELEASE_REPO = 'ghcr.io/varnahg/strahovcrazyshow-release'
REPOSITORIES = {
    'game': 'ghcr.io/varnahg/strahovcrazyshow-game',
    'tools': 'ghcr.io/varnahg/strahovcrazyshow-rag-tools',
    'db': 'docker.io/pgvector/pgvector',
}
DB_DIGEST = 'sha256:215ae4d47393a980e9ef7ff7760f7dad53ec3e84bceb9fbd45cef34e50b5ba0f'
DIGEST = r'sha256:[0-9a-f]{64}'
VOLUME = r'strahov-crazy-show-rag-[0-9a-f]{32}'
METADATA_LIMIT = 64 * 1024
RESERVE = 2 * 1024**3
WORK_MARGIN = 256 * 1024**2


def matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def validate_release(value):
    if (not isinstance(value, dict) or set(value) != {'version', 'platform', 'commit', 'images'}
            or type(value['version']) is not int or value['version'] != 1
            or value['platform'] != 'linux/arm64' or not matches(r'[0-9a-f]{40}', value['commit'])
            or not isinstance(value['images'], dict) or set(value['images']) != set(REPOSITORIES)):
        raise ValueError('neplatný produkční manifest')
    layer_sizes = {}
    for name, repository in REPOSITORIES.items():
        image = value['images'][name]
        if (not isinstance(image, dict) or set(image) != {'ref', 'layers'}
                or not matches(re.escape(repository) + '@' + DIGEST, image['ref'])
                or not isinstance(image['layers'], list) or not 1 <= len(image['layers']) <= 128):
            raise ValueError(f'neplatný obraz {name} v produkčním manifestu')
        if name == 'db' and image['ref'] != f'{repository}@{DB_DIGEST}':
            raise ValueError('neschválená verze PostgreSQL')
        for layer in image['layers']:
            if (not isinstance(layer, dict) or set(layer) != {'digest', 'compressed', 'unpacked'}
                    or not matches(DIGEST, layer['digest'])
                    or any(type(layer[key]) is not int or not 0 < layer[key] <= 64 * 1024**3
                           for key in ('compressed', 'unpacked'))):
                raise ValueError(f'neplatná velikost nebo digest vrstvy obrazu {name}')
            sizes = layer['compressed'], layer['unpacked']
            if layer_sizes.setdefault(layer['digest'], sizes) != sizes:
                raise ValueError('vrstva má v manifestu rozdílné velikosti')
    return value


def release_key(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def read_bounded(argv, limit, timeout=20):
    deadline = time.monotonic() + timeout
    with subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as proc:
        try:
            data = bytearray()
            with selectors.DefaultSelector() as selector:
                selector.register(proc.stdout, selectors.EVENT_READ)
                while True:
                    if not selector.select(max(0, deadline - time.monotonic())):
                        raise TimeoutError('vypršel čas na čtení manifestu z GHCR')
                    chunk = os.read(proc.stdout.fileno(), min(8192, limit + 1 - len(data)))
                    if not chunk:
                        break
                    data.extend(chunk)
                    if len(data) > limit:
                        raise ValueError('manifest překročil povolenou velikost')
            if proc.wait(timeout=max(0, deadline - time.monotonic())):
                raise RuntimeError('GHCR nevrátil produkční manifest. Ověř přístup k balíčku.')
            return bytes(data)
        finally:
            if proc.poll() is None:
                proc.kill()


def fetch_release():
    config = str(CONFIG / 'docker' / 'config.json')
    artifact = json.loads(read_bounded(
        ['oras', 'manifest', 'fetch', '--registry-config', config, RELEASE_REPO + ':production'],
        METADATA_LIMIT))
    layers = artifact.get('layers') if isinstance(artifact, dict) and artifact.get('schemaVersion') == 2 else None
    if not isinstance(layers, list) or len(layers) != 1 or not isinstance(layers[0], dict):
        raise ValueError('produkční OCI manifest musí mít jedinou vrstvu')
    layer = layers[0]
    digest, size = layer.get('digest'), layer.get('size')
    annotations = layer.get('annotations', {})
    if (layer.get('mediaType') != 'application/json' or not isinstance(annotations, dict)
            or annotations.get('org.opencontainers.image.title') != 'release.json'
            or not matches(DIGEST, digest) or type(size) is not int or not 0 < size <= METADATA_LIMIT):
        raise ValueError('produkční OCI manifest neobsahuje platný release.json')
    data = read_bounded(['oras', 'blob', 'fetch', '--registry-config', config, '--output', '-',
                         f'{RELEASE_REPO}@{digest}'], size)
    if len(data) != size or f'sha256:{hashlib.sha256(data).hexdigest()}' != digest:
        raise ValueError('obsah release.json neodpovídá digestu')
    return validate_release(json.loads(data))


def extra_layer_bytes(candidate, installed):
    compressed, unpacked = set(), set()

    def charge(image, count):
        total = 0
        chain = ()
        for layer in image['layers']:
            digest = layer['digest']
            chain += (digest,)
            if digest not in compressed:
                total += layer['compressed'] if count else 0
                compressed.add(digest)
            # Stejná vrstva nad jinou základnou může mít další snapshot overlayfs.
            if chain not in unpacked:
                total += layer['unpacked'] if count else 0
                unpacked.add(chain)
        return total

    for image in installed:
        charge(image, False)
    return sum(charge(image, True) for image in candidate['images'].values())


def refs(deployment):
    return {key: value['ref'] for key, value in deployment['release']['images'].items()}


def new_database(active, release):
    return active is None or any(active['release']['images'][name]['ref'] != release['images'][name]['ref']
                                 for name in ('tools', 'db'))


def validate_deployment(value):
    if not isinstance(value, dict) or set(value) != {'release', 'volume'} or not matches(VOLUME, value['volume']):
        raise ValueError('neplatný stav nasazení')
    validate_release(value['release'])


class State:
    def __init__(self, directory):
        self.directory = directory
        self.path = directory / 'state.json'

    def load(self):
        try:
            with self.path.open('rb') as handle:
                raw = handle.read(8 * METADATA_LIMIT + 1)
        except FileNotFoundError:
            return dict(active=None, previous=None, pending=None, rejected=None, retired=[])
        if len(raw) > 8 * METADATA_LIMIT:
            raise ValueError('soubor stavu překročil povolenou velikost')
        value = json.loads(raw)
        if not isinstance(value, dict) or set(value) != {'active', 'previous', 'pending', 'rejected', 'retired'}:
            raise ValueError('neplatný soubor stavu')
        if value['rejected'] is not None and not matches(r'[0-9a-f]{64}', value['rejected']):
            raise ValueError('neplatný klíč odmítnutého vydání')
        for name in ('active', 'previous'):
            if value[name] is not None:
                validate_deployment(value[name])
        if value['active'] is None and value['previous'] is not None:
            raise ValueError('záloha bez aktivního vydání')
        pending = value['pending']
        if pending is not None:
            if (not isinstance(pending, dict) or set(pending) != {'phase', 'deployment'}
                    or pending['phase'] not in ('pulling', 'switching')):
                raise ValueError('neplatný stav probíhající aktualizace')
            validate_deployment(pending['deployment'])
        if not isinstance(value['retired'], list):
            raise ValueError('neplatný stav vyřazených vydání')
        for deployment in value['retired']:
            validate_deployment(deployment)
        return value

    def save(self, value):
        data = json.dumps(value, separators=(',', ':')).encode('utf-8')
        if len(data) > 8 * METADATA_LIMIT:
            raise ValueError('soubor stavu překročil povolenou velikost')
        temporary = None
        try:
            with tempfile.NamedTemporaryFile('wb', dir=self.directory, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
            if os.name == 'posix':
                fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


class Docker:
    def docker(self, *args, capture=False, check=True, timeout=60, env=None):
        return subprocess.run(['docker', '--config', str(CONFIG / 'docker'),
                               '--host', 'unix:///var/run/docker.sock', *args],
                              text=True, capture_output=capture, check=check, timeout=timeout, env=env)

    def compose(self, deployment, *args, auth_mode='google', **kwargs):
        images = refs(deployment)
        env = dict(os.environ, STRAHOV_GAME_IMAGE=images['game'], STRAHOV_TOOLS_IMAGE=images['tools'],
                   STRAHOV_DB_IMAGE=images['db'], STRAHOV_RAG_DATA_VOLUME=deployment['volume'],
                   BIND_ADDRESS='127.0.0.1', HTTP_PORT='8081', OPENAI_SECRET_FILE=str(CONFIG / 'openai_api_key'),
                   CRAZY_TYPKA_ALLOWED_ORIGINS=ORIGIN, FEEDBACK_ALLOWED_ORIGINS=ORIGIN,
                   STRAHOV_PI_AUTH_MODE=auth_mode,
                   RAG_BOOTSTRAP_MAX_INPUTS='0', RAG_BOOTSTRAP_MAX_BYTES='0')
        return self.docker('compose', '--project-directory', str(APP), '--project-name', PROJECT,
                           '--env-file', '/dev/null', '-f', str(APP / 'compose.full.yaml'),
                           '-f', str(APP / 'compose.pi.yaml'), *args, env=env, **kwargs)

    def image_exists(self, ref):
        result = self.docker('image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', ref,
                             capture=True, check=False)
        return result.returncode == 0 and result.stdout.strip() == 'linux/arm64'

    def free_bytes(self):
        docker_root = self.docker('info', '--format', '{{.DockerRootDir}}', capture=True).stdout.strip()
        if not docker_root or not Path(docker_root).is_absolute():
            raise RuntimeError('Docker nevrátil cestu k úložišti')
        paths = [Path(docker_root), STATE]
        if Path('/var/lib/containerd').exists():
            paths.append(Path('/var/lib/containerd'))
        return min(shutil.disk_usage(path).free for path in paths)

    def database_bytes(self, deployment):
        volume_path = self.docker('volume', 'inspect', '--format', '{{.Mountpoint}}', deployment['volume'],
                                  capture=True).stdout.strip()
        if not volume_path or not Path(volume_path).is_absolute():
            raise RuntimeError('Docker nevrátil cestu k databázovému volume')
        result = subprocess.run(['du', '--summarize', '--block-size=1', '--apparent-size', '--', volume_path],
                                check=True, capture_output=True, text=True, timeout=30)
        return int(result.stdout.split()[0])

    def pull(self, deployment):
        for ref in refs(deployment).values():
            if not self.image_exists(ref):
                self.docker('pull', '--platform', 'linux/arm64', ref, timeout=600)
                if not self.image_exists(ref):
                    raise RuntimeError(f'chybí lokální obraz arm64 {ref}')

    def create_volume(self, deployment):
        self.docker('volume', 'create', '--label', VOLUME_LABEL, deployment['volume'])

    def clone_database(self, active, candidate):
        old, new = active['volume'], candidate['volume']
        db_id = self.compose(active, 'ps', '--quiet', 'rag-db', capture=True).stdout.strip()
        if not matches(r'[0-9a-f]{12,64}', db_id):
            raise RuntimeError('nelze bezpečně identifikovat běžící PostgreSQL')
        self.compose(active, 'stop', '--timeout', '30', 'game', 'rag-db', timeout=90)
        stopped = self.docker('inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', db_id,
                              capture=True).stdout.strip()
        if stopped != 'exited 0':
            raise RuntimeError('PostgreSQL nebyl čistě zastaven')
        attached = self.docker('ps', '--quiet', '--filter', f'volume={old}', capture=True).stdout
        if attached.strip():
            raise RuntimeError('původní databázový volume se stále používá')
        self.docker('run', '--rm', '--name', new + '-copy', '--pull', 'never', '--network', 'none',
                    '--user', '0:0', '--label', VOLUME_LABEL, '--entrypoint', '/bin/sh',
                    '--mount', f'type=volume,src={old},dst=/old,readonly',
                    '--mount', f'type=volume,src={new},dst=/new,volume-nocopy', refs(active)['db'],
                    '-ec', 'test -f /old/PG_VERSION; test ! -e /old/postmaster.pid; '
                    'test -d /old/pg_tblspc; test -z "$(ls -A /old/pg_tblspc)"; test -z "$(ls -A /new)"; '
                    'cp -a /old/. /new/; sync -f /new', timeout=240)

    def stop_helper(self, name):
        result = self.docker('inspect', '--type', 'container', '--format',
                             '{{index .Config.Labels "cz.reomnik.strahov.managed"}}', name,
                             capture=True, check=False)
        if result.returncode == 0:
            if result.stdout.strip() != '1':
                raise RuntimeError('pomocný kontejner nepatří updateru')
            self.docker('rm', '--force', name)

    def has_google_gate(self, deployment):
        result = self.docker('image', 'inspect', '--format',
                             '{{index .Config.Labels "cz.reomnik.strahov.multiplayer-auth"}}',
                             refs(deployment)['game'], capture=True)
        return result.stdout.strip() == 'google-v1'

    def start(self, deployment, bootstrap=False, force_closed=False):
        # Persistent across RAG data clones and game image rollbacks.
        self.docker('volume', 'create', 'strahov-crazy-show-player-accounts', capture=True)
        google = CONFIG / 'google'
        google.mkdir(mode=0o750, exist_ok=True)
        if not google.is_dir() or google.is_symlink():
            raise RuntimeError('Neplatný adresář Google přihlášení')
        gated = self.has_google_gate(deployment)
        marker = CONFIG / 'google-gate-active'
        if gated and (google / 'client_id').is_file() and (google / 'client_secret').is_file():
            self.mark_google_gate(marker)
        if marker.exists() and not gated:
            raise RuntimeError('Starší obraz by zpřístupnil anonymní multiplayer')
        if bootstrap:
            self.run_setup(deployment, 'rag-secrets', 90)
        up = ('up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120')
        self.compose(deployment, *up, 'rag-db', timeout=150)
        if bootstrap:
            self.run_setup(deployment, 'rag-bootstrap', 240)
        mode = 'closed' if force_closed else 'google'
        self.compose(deployment, *up, 'game', timeout=150, auth_mode=mode)
        for route, field in (('/api/health', 'ok'), ('/api/ai/status', 'enabled')):
            with urllib.request.urlopen(f'http://127.0.0.1:8081{route}', timeout=10) as response:
                body = json.loads(response.read(8192))
            if not isinstance(body, dict) or body.get(field) is not True:
                raise RuntimeError(f'kontrola připravenosti {route} selhala')
        if gated:
            with urllib.request.urlopen('http://127.0.0.1:8081/api/auth/session', timeout=10) as response:
                auth = json.loads(response.read(8192))
            if not isinstance(auth, dict) or auth.get('mode') not in ('google', 'closed') or auth.get('account') is not None:
                raise RuntimeError('Kontrola režimu multiplayerového přihlášení selhala')
            if force_closed and auth['mode'] != 'closed':
                raise RuntimeError('Nouzový režim musí uzavřít multiplayer')
            if auth['mode'] == 'google' and not marker.exists():
                self.mark_google_gate(marker)

    @staticmethod
    def mark_google_gate(marker):
        with marker.open('a') as handle:
            handle.flush()
            os.fsync(handle.fileno())
        if os.name == 'posix':
            descriptor = os.open(marker.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)

    def run_setup(self, deployment, service, timeout):
        self.compose(deployment, 'run', '--rm', '--no-deps', '--pull', 'never', '--label', VOLUME_LABEL,
                     '--name', deployment['volume'] + '-' + service, service, timeout=timeout)

    def restore(self, active, candidate):
        for helper in ('copy', 'rag-secrets', 'rag-bootstrap'):
            self.stop_helper(candidate['volume'] + '-' + helper)
        self.compose(candidate, 'stop', '--timeout', '30', 'game', 'rag-db', timeout=90)
        if (CONFIG / 'google-gate-active').exists() and active is not None and not self.has_google_gate(active):
            print('Návrat před Google bránu přeskočen. Obnovuji režim sólo.', file=sys.stderr)
            try:
                self.start(candidate, force_closed=True)
                return candidate
            except OP_ERRORS as error:
                print(f'Nouzové sólo se nespustilo: {error}', file=sys.stderr)
                return False
        if active is not None:
            self.start(active)
        else:
            self.compose(candidate, 'rm', '--force', 'game', 'rag-db')

    def discard_images(self, deployment, protected):
        keep_refs = {ref for item in protected for ref in refs(item).values()}
        for name, ref in refs(deployment).items():
            if name != 'db' and ref not in keep_refs and self.image_exists(ref):
                self.docker('image', 'rm', ref, capture=True)

    def discard(self, deployment, protected):
        self.discard_images(deployment, protected)
        volume = deployment['volume']
        if any(item['volume'] == volume for item in protected):
            return
        info = self.docker('volume', 'inspect', '--format', '{{index .Labels "cz.reomnik.strahov.managed"}}',
                           volume, capture=True, check=False)
        if info.returncode == 0:
            if info.stdout.strip() != '1':
                raise RuntimeError('vyřazený volume nepatří updateru')
            self.docker('volume', 'rm', volume, capture=True)


OP_ERRORS = (OSError, ValueError, RuntimeError, subprocess.SubprocessError)


class Updater:
    def __init__(self, state, docker):
        self.state = state
        self.docker = docker

    def collect(self, state):
        protected = [item for item in (state['active'], state['previous']) if item is not None]
        # Při neúspěšném úklidu neztratit záznam, podle něhož lze bezpečně opakovat.
        for item in list(state['retired']):
            try:
                self.docker.discard(item, protected)
            except OP_ERRORS as error:
                print(f'Úklid vydání {item["release"]["commit"]} odložen: {error}', file=sys.stderr)
                continue
            state['retired'].remove(item)
            self.state.save(state)

    def recover(self, state):
        pending = state['pending']
        if pending is None:
            return False
        candidate = pending['deployment']
        switching = pending['phase'] == 'switching'
        if switching:
            print(f'Obnovuji poslední funkční vydání po neúspěchu {candidate["release"]["commit"]}.')
            restored = self.docker.restore(state['active'], candidate)
            if restored is False:
                state['retired'].append(state['active'])
                state['active'] = None
            elif restored is not None:
                state['retired'].append(state['active'])
                state['active'] = restored
            state['rejected'] = release_key(candidate['release'])
        if state['active'] != candidate:
            state['retired'].append(candidate)
        state['pending'] = None
        self.state.save(state)
        return switching and state['active'] is not None

    def boot(self, state):
        if not self.recover(state) and state['active'] is not None:
            if state['rejected'] == release_key(state['active']['release']):
                self.docker.start(state['active'], force_closed=True)
            else:
                self.docker.start(state['active'])
        self.collect(state)

    def space(self, release, active, previous, clone):
        images = list(release['images'].values())
        for old in (active, previous):
            if old is not None:
                images.extend(old['release']['images'].values())
        installed = [image for image in images if self.docker.image_exists(image['ref'])]
        database_space = self.docker.database_bytes(active) if clone and active is not None else 0
        required = RESERVE + WORK_MARGIN + extra_layer_bytes(release, installed) + database_space
        return self.docker.free_bytes(), required

    def update(self, state, retry=False):
        self.recover(state)
        self.collect(state)
        active = state['active']
        release = fetch_release()
        if (active is not None and release == active['release'] and
                (not retry or release_key(release) != state['rejected'])) or (
                not retry and release_key(release) == state['rejected']):
            return
        clone = new_database(active, release)
        previous = state['previous']
        available, required = self.space(release, active, previous, clone)
        if available < required and previous is not None:
            # Stávající vydání a jeho DB zůstávají dostupné pro návrat kandidáta.
            # Ještě starší DB zálohu ponecháme a uvolníme jen její nadbytečné obrazy.
            try:
                self.docker.discard_images(previous, [active, dict(release=release)])
            except OP_ERRORS as error:
                print(f'Uvolnění starších obrazů odloženo: {error}', file=sys.stderr)
            available, required = self.space(release, active, previous, clone)
        if available < required:
            print(f'Odkládám {release["commit"]}: dostupných {available} B, potřeba {required} B včetně rezervy.')
            return
        volume = f'{PROJECT}-rag-{uuid.uuid4().hex}' if clone else active['volume']
        candidate = dict(release=release, volume=volume)
        state['pending'] = dict(phase='pulling', deployment=candidate)
        self.state.save(state)
        print(f'Stahuji vydání {release["commit"]}.', flush=True)
        try:
            self.docker.pull(candidate)
            # Po skutečném pullu ještě ověřit rezervu před první změnou běžícího stacku.
            database_space = self.docker.database_bytes(active) if clone and active is not None else 0
            if self.docker.free_bytes() < RESERVE + WORK_MARGIN + database_space:
                raise RuntimeError('po stažení už nezbývá prostor pro bezpečné přepnutí')
            state['pending']['phase'] = 'switching'
            self.state.save(state)
            if clone:
                self.docker.create_volume(candidate)
                if active is not None:
                    self.docker.clone_database(active, candidate)
            self.docker.start(candidate, bootstrap=clone)
            if self.docker.free_bytes() < RESERVE:
                raise RuntimeError('kandidát nezachoval požadovanou diskovou rezervu')
        except OP_ERRORS:
            self.recover(state)
            self.collect(state)
            raise
        if state['previous'] is not None:
            state['retired'].append(state['previous'])
        state.update(active=candidate, previous=active, pending=None, rejected=None)
        self.state.save(state)
        self.collect(state)
        print(f'Nasazeno {release["commit"]}.')


def main(argv):
    import fcntl

    if argv not in (['boot'], ['update'], ['update', '--retry']):
        raise ValueError('použití: update.py boot | update [--retry]')
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'lock').open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        disk = State(STATE)
        state = disk.load()
        updater = Updater(disk, Docker())
        if argv == ['boot']:
            updater.boot(state)
        else:
            updater.update(state, retry=len(argv) == 2)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except OP_ERRORS as error:
        print(f'StrahovCrazyShow: {error}', file=sys.stderr)
        raise SystemExit(1)

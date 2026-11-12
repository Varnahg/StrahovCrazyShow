import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import update


def layer(letter, compressed=100, unpacked=400):
    return dict(digest='sha256:' + letter * 64, compressed=compressed, unpacked=unpacked)


def release(commit='a', game='b', tools='c'):
    return dict(version=1, platform='linux/arm64', commit=commit * 40, images={
        'game': dict(ref=update.REPOSITORIES['game'] + '@sha256:' + game * 64,
                     layers=[layer('1'), layer('2'), layer(game)]),
        'tools': dict(ref=update.REPOSITORIES['tools'] + '@sha256:' + tools * 64,
                      layers=[layer('1'), layer(tools)]),
        'db': dict(ref=update.REPOSITORIES['db'] + '@' + update.DB_DIGEST, layers=[layer('3')]),
    })


def deployment(value, volume='d'):
    return dict(release=value, volume='strahov-crazy-show-rag-' + volume * 32)


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.installed = set()
        self.space = 17 * 1024**3
        self.fail = None
        self.post_pull_space = None

    def image_exists(self, ref):
        return ref in self.installed

    def database_bytes(self, item):
        return 4096

    def free_bytes(self):
        return self.space

    def pull(self, item):
        self.calls.append(('pull', item))
        self.installed.update(update.refs(item).values())
        if self.post_pull_space is not None:
            self.space = self.post_pull_space

    def create_volume(self, item):
        self.calls.append(('create', item))

    def clone_database(self, old, new):
        self.calls.append(('clone', old, new))

    def start(self, item, bootstrap=False):
        self.calls.append(('start', item, bootstrap))
        if item['release'] == self.fail:
            raise RuntimeError('nezdravý kandidát')

    def restore(self, active, candidate):
        self.calls.append(('restore', active, candidate))

    def discard_images(self, item, protected):
        self.calls.append(('discard_images', item, protected))

    def discard(self, item, protected):
        self.calls.append(('discard', item, protected))


class ReleaseTests(unittest.TestCase):
    def test_rejects_other_architecture_untrusted_images_and_invalid_sizes(self):
        for change in ('architecture', 'registry', 'tag', 'size', 'pinned-db'):
            value = release()
            if change == 'architecture':
                value['platform'] = 'linux/amd64'
            elif change == 'registry':
                value['images']['game']['ref'] = 'docker.io/varnahg/test@sha256:' + 'b' * 64
            elif change == 'tag':
                value['images']['tools']['ref'] = update.REPOSITORIES['tools'] + ':latest'
            elif change == 'size':
                value['images']['game']['layers'][0]['compressed'] = True
            else:
                value['images']['db']['ref'] = update.REPOSITORIES['db'] + '@sha256:' + 'd' * 64
            with self.subTest(change=change), self.assertRaises(ValueError):
                update.validate_release(value)

    def test_fetch_binds_release_json_to_oci_layer_hash(self):
        value = release()
        data = json.dumps(value).encode()
        descriptor = json.dumps(dict(schemaVersion=2, layers=[dict(mediaType='application/json',
            size=len(data), digest='sha256:' + hashlib.sha256(data).hexdigest(),
            annotations={'org.opencontainers.image.title': 'release.json'})])).encode()
        with patch.object(update, 'read_bounded', side_effect=[descriptor, data]) as read:
            self.assertEqual(update.fetch_release(), value)
        self.assertIn('ghcr.io/varnahg/strahovcrazyshow-release:production', read.call_args_list[0].args[0])
        with patch.object(update, 'read_bounded', side_effect=[descriptor, data.replace(b'arm64', b'amd64')]):
            with self.assertRaisesRegex(ValueError, 'digestu'):
                update.fetch_release()

    def test_space_counts_compressed_once_and_only_reuses_matching_unpacked_prefix(self):
        old = release()
        new = release('e', game='f')
        self.assertEqual(update.extra_layer_bytes(new, old['images'].values()), 500)
        new['images']['game']['layers'] = [layer('3'), layer('2'), layer('f')]
        self.assertEqual(update.extra_layer_bytes(new, old['images'].values()), 900)


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(temporary.cleanup)
        self.disk = update.State(Path(temporary.name))
        self.state = self.disk.load()
        self.docker = FakeDocker()
        self.updater = update.Updater(self.disk, self.docker)
        self.old = deployment(release())
        self.state['active'] = self.old
        self.docker.installed.update(update.refs(self.old).values())
        self.new = release('e', game='f', tools='a')
        output = contextlib.redirect_stdout(io.StringIO())
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)

    def run_update(self, value=None):
        if not self.disk.path.exists():
            self.disk.save(self.state)
        with patch.object(update, 'fetch_release', return_value=value or self.new):
            self.updater.update(self.disk.load())

    def test_low_disk_leaves_stack_and_journal_alone(self):
        self.docker.space = update.RESERVE
        self.run_update()
        self.assertEqual(self.docker.calls, [])
        self.assertEqual(self.disk.load(), self.state)

    def test_post_pull_space_loss_never_touches_running_stack(self):
        self.docker.post_pull_space = update.RESERVE
        with self.assertRaisesRegex(RuntimeError, 'prostor'):
            self.run_update()
        self.assertEqual([call[0] for call in self.docker.calls], ['pull', 'discard'])
        self.assertEqual(self.disk.load(), self.state)

    def test_tool_change_keeps_rollback_database_and_commits_only_healthy_candidate(self):
        self.run_update()
        new_state = self.disk.load()
        candidate = new_state['active']
        self.assertEqual(candidate['release'], self.new)
        self.assertNotEqual(candidate['volume'], self.old['volume'])
        self.assertEqual(new_state['previous'], self.old)
        self.assertIsNone(new_state['pending'])
        self.assertEqual(self.docker.calls, [('pull', candidate), ('create', candidate),
                         ('clone', self.old, candidate), ('start', candidate, True)])

    def test_game_only_change_preserves_live_database_and_skips_bootstrap(self):
        self.run_update(release('e', game='f'))
        candidate = self.disk.load()['active']
        self.assertEqual(candidate['volume'], self.old['volume'])
        self.assertEqual(self.docker.calls, [('pull', candidate), ('start', candidate, False)])

    def test_failed_candidate_rolls_back_and_is_not_retried_by_next_timer(self):
        self.docker.fail = self.new
        with self.assertRaisesRegex(RuntimeError, 'nezdravý'):
            self.run_update()
        current = self.disk.load()
        self.assertEqual(current['active'], self.old)
        self.assertEqual(current['rejected'], update.release_key(self.new))
        self.assertIsNone(current['pending'])
        self.assertEqual([call[0] for call in self.docker.calls],
                         ['pull', 'create', 'clone', 'start', 'restore', 'discard'])
        self.assertEqual(self.docker.calls[-2][1], self.old)
        self.run_update()
        self.assertEqual(len(self.docker.calls), 6)

    def test_offline_boot_restores_interrupted_switch_before_any_registry_check(self):
        candidate = deployment(copy.deepcopy(self.new), 'e')
        self.state['pending'] = dict(phase='switching', deployment=candidate)
        self.disk.save(self.state)
        with patch.object(update, 'fetch_release', side_effect=AssertionError('nečekané síťové volání')):
            self.updater.boot(self.disk.load())
        self.assertEqual(self.docker.calls, [('restore', self.old, candidate), ('discard', candidate, [self.old])])
        self.assertEqual(self.disk.load()['active'], self.old)

    def test_offline_boot_starts_local_game_and_db_without_bootstrap(self):
        self.disk.save(self.state)
        with patch.object(update, 'fetch_release', side_effect=AssertionError('nečekané síťové volání')):
            self.updater.boot(self.disk.load())
        self.assertEqual(self.docker.calls, [('start', self.old, False)])


class DockerTests(unittest.TestCase):
    def test_offline_start_uses_local_images_and_never_runs_bootstrap(self):
        docker = update.Docker()
        candidate = deployment(release())
        with patch.object(docker, 'compose') as compose, patch.object(update.urllib.request, 'urlopen',
                side_effect=[io.BytesIO(b'{"ok":true}'), io.BytesIO(b'{"enabled":true}')]):
            docker.start(candidate)
        invocations = [call.args[1:] for call in compose.call_args_list]
        self.assertEqual([args[-1] for args in invocations], ['rag-db', 'game'])
        for args in invocations:
            self.assertEqual(args[0], 'up')
            self.assertIn('--no-build', args)
            self.assertIn('--no-deps', args)
            self.assertEqual(args[args.index('--pull') + 1], 'never')


if __name__ == '__main__':
    unittest.main()

"""Publikace předem ověřené sady modelových souborů s obnovitelným žurnálem.

Jednotlivé přejmenování je atomické, více různých cest nikoli. Žurnál a zálohy
zachovají předchozí kompletní checkpoint při chybě a umožní obnovu po přerušení.
Tento pomocník nenahrazuje projektové rezervace ani verzi runtime manifestu.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil


def oriented_triangle(points):
    """Stabilní pořadí pro porovnání exportů, se zachováním orientace plochy."""
    values=tuple(tuple(float(value) for value in point) for point in points)
    if len(values)!=3:
        raise ValueError('Očekáván trojúhelník')
    offset=min(range(3),key=lambda i:values[i:]+values[:i])
    return values[offset:]+values[:offset],offset


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def contained(path: Path, root: Path) -> Path:
    path, root = path.resolve(), root.resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError(f'Cesta není uvnitř vyhrazeného workspace: {path}')
    return path


def write_journal(path: Path, data: dict) -> None:
    temporary = path.with_name(path.name + '.next')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, path)


def restore_checkpoint(journal: Path, workspace: Path, expected_targets: list[Path]) -> dict:
    journal = contained(journal, workspace)
    data = json.loads(journal.read_text(encoding='utf-8'))
    if data.get('schemaVersion') != 1:
        raise ValueError('Neznámý formát publikačního žurnálu')
    if data['state'] in ('committed', 'rolled-back'):
        return data
    targets = {contained(path, workspace) for path in expected_targets}
    recorded = {contained(Path(item['target']), workspace) for item in data['files']}
    if targets != recorded or len(recorded) != len(data['files']):
        raise ValueError('Žurnál neodpovídá výslovně zadaným cílovým souborům')
    # Nejprve ověřit CELÝ rozsah; nevyměňovat první soubor před odhalením cizího zápisu.
    for item in data['files']:
        target = Path(item['target'])
        current = digest(target) if target.exists() else None
        if current not in (item['oldSha256'], item['newSha256']):
            raise RuntimeError(f'Cílový soubor mezitím změnil jiný zapisující: {target}')
        if item['oldSha256'] is not None:
            backup = contained(Path(item['backup']), journal.parent)
            if not backup.is_file() or digest(backup) != item['oldSha256']:
                raise RuntimeError(f'Chybí platná záloha checkpointu: {backup}')
    for index, item in enumerate(data['files']):
        target = Path(item['target'])
        current = digest(target) if target.exists() else None
        if current == item['oldSha256']:
            continue
        if item['oldSha256'] is None:
            # Maže se pouze námi vytvořený soubor s právě ověřeným novým hashem.
            target.unlink()
        else:
            recovery = journal.parent / f'restore-{index}{target.suffix}'
            shutil.copy2(item['backup'], recovery)
            os.replace(recovery, target)
    data['state'] = 'rolled-back'
    write_journal(journal, data)
    return data


def recover_pending(staging: Path, workspace: Path, expected_targets: list[Path]) -> None:
    staging = contained(staging, workspace)
    if not staging.exists():
        return
    for journal in sorted(staging.glob('b01-*/publication.json')):
        restore_checkpoint(journal, workspace, expected_targets)


def publish_files(pairs: list[tuple[Path, Path]], transaction: Path, workspace: Path) -> dict:
    """Publikuje pouze hotové, předem zkontrolované soubory uvnitř workspace."""
    transaction = contained(transaction, workspace)
    transaction.mkdir(parents=True, exist_ok=True)
    journal = transaction / 'publication.json'
    if journal.exists():
        raise FileExistsError('Pro každý checkpoint je nutný nový transakční adresář')
    normalized = [(contained(source, transaction), contained(target, workspace)) for source, target in pairs]
    if len({target for _, target in normalized}) != len(normalized):
        raise ValueError('Duplicitní publikační cíl')
    if any(target.is_relative_to(transaction) for _, target in normalized):
        raise ValueError('Publikační cíl nesmí ležet v dočasné transakci')
    for source, target in normalized:
        if not source.is_file():
            raise FileNotFoundError(source)
        if target.exists() and not target.is_file():
            raise ValueError(f'Cíl není soubor: {target}')
    records = []
    for index, (source, target) in enumerate(normalized):
        target.parent.mkdir(parents=True, exist_ok=True)
        backup = transaction / f'previous-{index}{target.suffix}'
        old_sha = digest(target) if target.exists() else None
        if old_sha is not None:
            shutil.copy2(target, backup)
        records.append({'source': str(source), 'target': str(target), 'backup': str(backup),
                        'oldSha256': old_sha, 'newSha256': digest(source)})
    data = {'schemaVersion': 1, 'state': 'prepared', 'files': records}
    write_journal(journal, data)
    try:
        for item in records:
            target = Path(item['target'])
            current = digest(target) if target.exists() else None
            if current != item['oldSha256']:
                raise RuntimeError(f'Cíl se změnil po přípravě publikace: {target}')
            os.replace(item['source'], target)
        data['state'] = 'committed'
        write_journal(journal, data)
    except Exception:
        restore_checkpoint(journal, workspace, [target for _, target in normalized])
        raise
    return data

import copy
import hashlib
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from strahov_rag_ingestion.contracts import ExtractionError, canonical
from strahov_rag_ingestion.normalize_openai import execute
from strahov_rag_ingestion.openai_normalizer import (
    NormalizationRequest, _api_digest, native_fidelity_issues, normalize, validate_candidate,
)


def pdf(text='Discount does not apply: 125 CZK.', pages=1, image=False):
    data = io.BytesIO()
    canvas = Canvas(data, pagesize=(595, 842), invariant=1)
    for _ in range(pages):
        if image:
            canvas.drawImage(ImageReader(Image.new('RGB', (80, 80), 'white')), 50, 500, 80, 80)
        else:
            canvas.drawString(50, 700, text)
        canvas.showPage()
    canvas.save()
    return data.getvalue()


def candidate(raw_sha, blocks=None, pages=1):
    identity = {'version': 1, 'provider': 'openai', 'model': 'gpt-6.1-sol', 'reasoningEffort': 'low',
                'detail': 'high', 'promptSha256': '1' * 64, 'schemaSha256': '2' * 64}
    profile = {'id': _api_digest(identity), **identity}
    return {'kind': 'candidate', 'rawSha256': raw_sha, 'extractionKey': _api_digest(['openai-pdf-v1', raw_sha, profile['id']]),
            'profile': profile, 'countRequestHash': '3' * 64, 'observedModel': 'gpt-6.1-sol', 'responseId': 'resp_test',
            'pages': [{'page': i + 1, 'blocks': copy.deepcopy(blocks or [{'kind': 'paragraph', 'text': 'Discount does not apply: 125 CZK.'}]),
                       'unresolved': []} for i in range(pages)],
            'accounting': {'phase': 'extract', 'requestHash': '4' * 64, 'attempted': True, 'requestId': 'req_test',
                           'usage': {'inputTokens': 100, 'outputTokens': 25, 'totalTokens': 125, 'reasoningTokens': 2}}}


@pytest.fixture
def make(request_for, tmp_path):
    counter = 0
    def create(data=None, value=None, **document_overrides):
        nonlocal counter
        counter += 1
        document = request_for(data or pdf(), f'source-{counter}.pdf', **document_overrides)
        value = value or candidate(document.inputSha256)
        path = tmp_path / f'candidate-{counter}.json'
        raw = canonical(value).encode('utf-8')
        path.write_bytes(raw)
        request = NormalizationRequest(schemaVersion=1, document=document, candidatePath=str(path),
            candidateSha256=hashlib.sha256(raw).hexdigest(), expectedProfileId=value['profile']['id'])
        return request, value
    return create


def rewrite(request, value):
    data = canonical(value).encode('utf-8')
    Path(request.candidatePath).write_bytes(data)
    return request.model_copy(update={'candidateSha256': hashlib.sha256(data).hexdigest()})


def test_complete_native_text_is_context_bound_and_chunked(make):
    request, value = make()
    first = normalize(request)
    assert first['status'] == 'ok', first
    assert first['document'] == {'title': 'Český zdroj', 'pageCount': 1, 'complete': True}
    assert first['parserProfile']['id'] == 'openai-pdf-normalizer-v1'
    assert first['parserProfile']['pipeline'] == 'openai-pdf:gpt-6.1-sol'
    assert first['quality']['expectedPages'] == first['quality']['processedPages'] == 1
    assert first['blocks'][0]['spans'][0]['page'] == 1
    assert 'bbox' not in first['blocks'][0]['spans'][0]
    assert first['chunks'][0]['text'] == value['pages'][0]['blocks'][0]['text']
    assert first == normalize(request)
    for key, replacement in [('sourceId', 'other-source'), ('sourceUrl', 'https://example.test/other'),
                             ('title', 'Jiný název'), ('mime', 'application/pdf; charset=utf-8'), ('filename', 'other.pdf')]:
        changed = request.model_copy(update={'document': request.document.model_copy(update={key: replacement})})
        result = normalize(changed)
        assert result['status'] == 'ok', result
        assert result['parserProfile']['configurationHash'] != first['parserProfile']['configurationHash']
        if key == 'sourceId':
            assert result['blocks'][0]['id'] != first['blocks'][0]['id']


def test_native_gate_allows_column_reorder_and_word_fragment_whitespace():
    references = [{'text': 'Zař ízení je správné.\nSecond language paragraph.',
                   'fragments': ['Zař ízení je správné.', 'Second language paragraph.'], 'hasImages': False}]
    page = {'blocks': [{'kind': 'paragraph', 'text': 'Second language paragraph.'},
                       {'kind': 'paragraph', 'text': 'Zařízení je správné.'}], 'unresolved': []}
    assert native_fidelity_issues(references, [page]) == []


@pytest.mark.parametrize('changed,expected', [
    ('Sleva platí 125 Kč.', 'native-characters-not-preserved'),
    ('Sleva neplatí 12 Kč.', 'native-numbers-not-preserved'),
    ('125 Kč. Sleva neplatí', 'native-fragments-not-covered'),
])
def test_native_gate_rejects_negation_number_and_same_charbag_phrase_reordering(changed, expected):
    reference = {'text': 'Sleva neplatí 125 Kč.', 'fragments': ['Sleva neplatí 125 Kč.'], 'hasImages': False}
    page = {'blocks': [{'kind': 'paragraph', 'text': changed}], 'unresolved': []}
    assert expected in native_fidelity_issues([reference], [page])


def test_short_fragment_multiplicity_and_weak_reference_are_not_ignored():
    reference = {'text': 'Long unchanged sentence. NE.', 'fragments': ['Long unchanged sentence.', 'NE.'], 'hasImages': False}
    page = {'blocks': [{'kind': 'paragraph', 'text': 'Long unchanged sentence.'}], 'unresolved': []}
    assert 'native-fragments-not-covered' in native_fidelity_issues([reference], [page])
    reference = {'text': 'AA BB CC', 'fragments': ['AA', 'BB', 'CC'], 'hasImages': False}
    page['blocks'] = [{'kind': 'paragraph', 'text': t} for t in ['CC', 'BB', 'AA']]
    assert 'native-reference-too-fragmented' in native_fidelity_issues([reference], [page])
    page['blocks'].reverse()
    assert native_fidelity_issues([reference], [page]) == []
    reference = {'text': 'Repeated complete phrase. Repeated complete phrase.',
                 'fragments': ['Repeated complete phrase.', 'Repeated complete phrase.'], 'hasImages': False}
    page['blocks'] = [{'kind': 'paragraph', 'text': 'Repeated complete phrase.'}]
    assert 'native-fragments-not-covered' in native_fidelity_issues([reference], [page])


def table():
    # Header row1 is not the first row; a vertical cell crosses that header.
    return {'kind': 'table', 'rows': 4, 'columns': 2,
            'cells': [{'row': 0, 'column': 0, 'rowSpan': 3, 'columnSpan': 1, 'text': 'Student'},
                      *[{'row': r, 'column': 1, 'rowSpan': 1, 'columnSpan': 1, 'text': str(-25 - r)} for r in range(4)],
                      {'row': 3, 'column': 0, 'rowSpan': 1, 'columnSpan': 1, 'text': 'Other'}],
            'headerRows': [1], 'headerColumns': [0], 'caption': 'Ceník\nRoční sazby', 'notes': ['Sleva neplatí.']}


def test_table_structure_and_lineage_survive_but_require_review(make):
    request, value = make(data=pdf(image=True))
    value['pages'][0]['blocks'] = [table()]
    result = normalize(rewrite(request, value))
    assert result['status'] == 'review-required', result
    assert 'openai-table-semantics-unverified' in result['quality']['issues']
    assert 'native-text-reference-unavailable' in result['quality']['issues']
    block = result['blocks'][0]
    assert block['tableChunking'] == {'contextLineCount': 3, 'headerLineIndexes': [4]}
    assert block['text'].count('Student') == 3
    assert 'Sleva neplatí.' in block['text']
    assert '-28' in block['text']
    assert result['chunks'] and result['quality']['tableCount'] == 1
    assert all(chunk['blockIds'] == [block['id']] for chunk in result['chunks'])


def test_image_only_and_unresolved_keep_complete_candidate_content_for_review(make):
    request, value = make(data=pdf(image=True))
    value['pages'][0]['unresolved'] = [{'kind': 'uncertain-structure', 'description': 'Selected row is not encoded.'}]
    result = normalize(rewrite(request, value))
    assert result['status'] == 'review-required' and not result['document']['complete']
    assert {'openai-unresolved', 'native-text-reference-unavailable', 'native-page-images-unverified'} <= set(result['quality']['issues'])
    assert result['blocks'] and result['chunks']


@pytest.mark.parametrize('mutation', [
    lambda c: c.update(extra=True), lambda c: c.update(rawSha256='f' * 64),
    lambda c: c.update(extractionKey='f' * 64), lambda c: c['profile'].update(detail='low'),
    lambda c: c['profile'].update(version=True), lambda c: c['accounting'].update(attempted=False),
    lambda c: c['accounting']['usage'].update(inputTokens=True),
    lambda c: c['accounting']['usage'].update(totalTokens=1),
    lambda c: c['pages'][0].update(page=True), lambda c: c['pages'][0].update(page=2),
    lambda c: c['pages'][0]['blocks'][0].update(text='bad\x00text'),
    lambda c: c['pages'][0]['blocks'][0].update(kind=[]),
])
def test_complete_candidate_schema_and_binding_reject_malformed_values(make, mutation):
    request, value = make()
    mutation(value)
    result = normalize(rewrite(request, value))
    assert result['status'] == 'failed'
    assert result['blocks'] == [] and result['chunks'] == []


@pytest.mark.parametrize('mutation', [
    lambda b: b['cells'].pop(), lambda b: b['cells'].append(dict(b['cells'][0])),
    lambda b: b['cells'][0].update(rowSpan=True), lambda b: b['cells'][0].update(columnSpan=3),
    lambda b: b.update(headerRows=[1, 1]), lambda b: b.update(headerColumns=[2]),
])
def test_table_grid_rejects_gaps_overlap_boolean_and_invalid_headers(make, mutation):
    request, value = make()
    block = table()
    mutation(block)
    value['pages'][0]['blocks'] = [block]
    with pytest.raises(ExtractionError, match='invalid-openai-candidate'):
        validate_candidate(value, request, 1)


def test_document_candidate_hash_page_count_and_tokenizer_limits(make, monkeypatch):
    request, value = make()
    assert normalize(request.model_copy(update={'candidateSha256': 'f' * 64}))['errorCode'] == 'candidate-hash-mismatch'
    wrong_raw = request.model_copy(update={'document': request.document.model_copy(update={'inputSha256': 'f' * 64})})
    assert normalize(wrong_raw)['errorCode'] == 'input-hash-mismatch'
    wrong_profile = request.model_copy(update={'expectedProfileId': 'f' * 64})
    assert normalize(wrong_profile)['errorCode'] == 'invalid-openai-candidate'
    two_pages, value = make(data=pdf(pages=2))
    assert normalize(two_pages)['errorCode'] == 'candidate-page-mismatch'
    monkeypatch.delenv('TIKTOKEN_CACHE_DIR', raising=False)
    result = normalize(request)
    assert result['errorCode'] == 'tokenizer-unavailable' and not result['chunks']


def test_duplicate_blocks_and_page_relocation_have_stable_ids(make):
    request, value = make(data=pdf(pages=2))
    value['pages'] = [{'page': i + 1, 'blocks': [{'kind': 'paragraph', 'text': 'Same copied text.'}], 'unresolved': []} for i in range(2)]
    first = normalize(rewrite(request, value))
    assert len({b['id'] for b in first['blocks']}) == 2
    value['pages'][0]['blocks'] = []
    value['pages'][1]['blocks'] *= 2
    second = normalize(rewrite(request, value))
    assert [b['id'] for b in first['blocks']] == [b['id'] for b in second['blocks']]
    assert [c['id'] for c in first['chunks']] == [c['id'] for c in second['chunks']]
    assert second['blocks'][0]['spans'][0]['page'] == 2


def test_entrypoint_preserves_existing_files_and_timeout_cleanup(make, monkeypatch):
    request, _ = make()
    work = Path(request.document.workDir)
    output = work / 'result.json'
    output.write_text('sentinel')
    with pytest.raises(ValueError): execute(request, output)
    assert output.read_text() == 'sentinel'
    (work / '.worker-result.json').write_text('foreign intermediate')
    with pytest.raises(ValueError): execute(request, work / 'other.json')
    assert (work / '.worker-result.json').read_text() == 'foreign intermediate'
    other, _ = make()
    calls = []
    class Stuck:
        alive = False
        exitcode = None
        def start(self): self.alive = True; calls.append('start')
        def join(self, timeout): calls.append(('join', timeout))
        def is_alive(self): return self.alive
        def terminate(self): calls.append('terminate')
        def kill(self): self.alive = False; calls.append('kill')
        def close(self): calls.append('close')
    monkeypatch.setattr('strahov_rag_ingestion.normalize_openai.multiprocessing.get_context',
                        lambda _: SimpleNamespace(Process=lambda **kwargs: Stuck()))
    result = execute(other, Path(other.document.workDir) / 'result.json')
    assert result['errorCode'] == 'normalizer-timeout'
    assert 'terminate' in calls and 'kill' in calls and calls[-1] == 'close'
    assert not (Path(other.document.workDir) / '.normalizer-claim').exists()


def test_real_module_cli_is_offline_and_never_overwrites(make, tmp_path):
    request, _ = make()
    path = tmp_path / 'request.json'
    path.write_text(request.model_dump_json(), encoding='utf-8')
    output = Path(request.document.workDir) / 'result.json'
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1'}
    run = subprocess.run([sys.executable, '-B', '-m', 'strahov_rag_ingestion.normalize_openai', '--request', str(path), '--output', str(output)],
                         env=env, capture_output=True, text=True, timeout=40)
    assert run.returncode == 0, (run.stdout, run.stderr)
    result = json.loads(output.read_text(encoding='utf-8'))
    assert result['status'] == 'ok' and result['chunks']
    before = output.read_bytes()
    again = subprocess.run([sys.executable, '-B', '-m', 'strahov_rag_ingestion.normalize_openai', '--request', str(path), '--output', str(output)],
                           env=env, capture_output=True, text=True, timeout=10)
    assert again.returncode == 1
    assert output.read_bytes() == before
    assert not list(Path(request.document.workDir).glob('.normalizer-*'))


def test_request_versions_and_network_paths_are_rejected_before_io(make):
    request, _ = make()
    value = request.model_dump()
    for target in [value, value['document']]:
        old = target['schemaVersion']
        target['schemaVersion'] = True
        with pytest.raises(ValueError): NormalizationRequest.model_validate(value)
        target['schemaVersion'] = old
    if os.name == 'nt':
        value['candidatePath'] = r'\\example.test\private\candidate.json'
        with pytest.raises(ValueError): NormalizationRequest.model_validate(value)


def test_byte_token_and_expansion_budgets_are_explicit(make):
    tiny_input, _ = make(limits={'maxInputBytes': 10})
    assert normalize(tiny_input)['errorCode'] == 'input-size-limit'
    tiny_output, _ = make(limits={'maxOutputBytes': 2048})
    result = normalize(tiny_output)
    assert result['errorCode'] == 'output-size-limit'
    assert result['parserProfile']['id'] == 'openai-pdf-normalizer-v1'
    assert len(canonical(result).encode('utf-8')) <= 2048
    tiny_context, value = make(limits={'maxChunkTokens': 1})
    value['pages'][0]['blocks'] = [{'kind': 'heading', 'text': 'Context cannot fit inside a single embedding token.'}]
    result = normalize(rewrite(tiny_context, value))
    assert result['status'] == 'review-required' and result['errorCode'] == 'embedding-context-exceeds-budget'
    expanded, value = make(limits={'maxOutputBytes': 10000})
    value['pages'][0]['blocks'] = [{'kind': 'table', 'rows': 1000, 'columns': 1,
        'cells': [{'row': 0, 'column': 0, 'rowSpan': 1000, 'columnSpan': 1, 'text': 'Long retained category ' * 30}],
        'headerRows': [], 'headerColumns': [], 'caption': '', 'notes': []}]
    assert normalize(rewrite(expanded, value))['errorCode'] == 'output-size-limit'


def test_parent_constructor_failure_cleans_only_owned_marker(make, monkeypatch):
    request, _ = make()
    work = Path(request.document.workDir)
    sentinel = work / 'foreign.json'
    sentinel.write_text('keep')
    def fail(**_kwargs): raise RuntimeError('constructor-failed')
    monkeypatch.setattr('strahov_rag_ingestion.normalize_openai.multiprocessing.get_context',
                        lambda _: SimpleNamespace(Process=fail))
    with pytest.raises(RuntimeError, match='constructor-failed'):
        execute(request, work / 'result.json')
    assert sentinel.read_text() == 'keep'
    assert not (work / '.normalizer-claim').exists()
    assert not (work / 'result.json').exists()


def test_isolation_precedes_parser_and_blocks_external_audit_events(make, tmp_path):
    request, _ = make()
    request_path, script = tmp_path / 'request.json', tmp_path / 'boundary.py'
    request_path.write_text(request.model_dump_json(), encoding='utf-8')
    output = Path(request.document.workDir) / 'result.json'
    boundary = Path(request.document.workDir) / 'boundary.json'
    script.write_text('''import json, os, sys
from pathlib import Path
from strahov_rag_ingestion.normalize_openai import normalization_child
from strahov_rag_ingestion import openai_normalizer as normalizer
original = normalizer.normalize
def probe(request):
    result = {"secretRemoved": "OPENAI_API_KEY" not in os.environ}
    for event in ["socket.connect", "socket.getaddrinfo", "subprocess.Popen", "os.system"]:
        try:
            sys.audit(event, None, None)
            result[event] = False
        except PermissionError:
            result[event] = True
    Path(request.document.workDir, "boundary.json").write_text(json.dumps(result))
    return original(request)
normalizer.normalize = probe
normalization_child(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")), sys.argv[2])
''', encoding='utf-8')
    run = subprocess.run([sys.executable, '-B', str(script), str(request_path), str(output)],
                         env={**os.environ, 'OPENAI_API_KEY': 'synthetic-sentinel', 'PYTHONDONTWRITEBYTECODE': '1'},
                         capture_output=True, text=True, timeout=40)
    assert run.returncode == 0, (run.stdout, run.stderr)
    assert all(json.loads(boundary.read_text()).values())
    assert json.loads(output.read_text(encoding='utf-8'))['status'] == 'ok'


def form_pdf(count=1):
    data = io.BytesIO()
    canvas = Canvas(data, invariant=1)
    canvas.drawString(50, 700, 'OK')
    for index in range(count):
        name = f'form-{index}'
        canvas.beginForm(name)
        canvas.drawString(50, 600 - index * 30, 'IMPORTANT long form content.')
        canvas.endForm()
        canvas.doForm(name)
    canvas.showPage()
    canvas.save()
    return data.getvalue()


@pytest.mark.parametrize('setting,limit', [('MAX_NATIVE_CHARACTERS', 10), ('MAX_NATIVE_FRAGMENTS', 1)])
def test_form_cannot_swallow_native_reference_limit_and_publish_partial_text(make, monkeypatch, setting, limit):
    request, value = make(data=form_pdf())
    value['pages'][0]['blocks'] = [{'kind': 'paragraph', 'text': 'OK'}]
    monkeypatch.setattr('strahov_rag_ingestion.openai_normalizer.' + setting, limit)
    result = normalize(rewrite(request, value))
    assert result['status'] == 'review-required', result
    assert result['errorCode'] == 'native-reference-limit'
    assert not result['document']['complete'] and not result['chunks']


def test_expanded_budget_includes_referenced_form_streams(make):
    from pypdf import PdfReader
    data = form_pdf(2)
    reader = PdfReader(io.BytesIO(data))
    page = reader.pages[0]
    root_bytes = len(page.get_contents().get_data())
    form_sizes = [len(value.get_object().get_data()) for value in page['/Resources']['/XObject'].values()]
    limit = max(root_bytes, *form_sizes) + 1
    assert root_bytes + sum(form_sizes) > limit
    request, value = make(data=data, limits={'maxExpandedBytes': limit})
    value['pages'][0]['blocks'] = [{'kind': 'paragraph', 'text': reader.pages[0].extract_text()}]
    result = normalize(rewrite(request, value))
    assert result['errorCode'] == 'expanded-size-limit', result
    assert result['status'] == 'failed'


def test_pdf_decode_warnings_require_review_even_with_matching_partial_reference(make, monkeypatch):
    import logging
    from pypdf._page import PageObject
    request, _ = make()
    original = PageObject.extract_text
    def warn_then_extract(self, *args, **kwargs):
        logging.getLogger('pypdf._page').warning('Impossible to decode XFormObject synthetic-reference')
        return original(self, *args, **kwargs)
    monkeypatch.setattr(PageObject, 'extract_text', warn_then_extract)
    result = normalize(request)
    assert result['status'] == 'review-required'
    assert 'native-reference-decode-warning' in result['quality']['issues']
    assert result['blocks'] and result['chunks']


def test_complete_form_reference_remains_supported(make):
    from pypdf import PdfReader
    data = form_pdf()
    request, value = make(data=data)
    value['pages'][0]['blocks'] = [{'kind': 'paragraph', 'text': PdfReader(io.BytesIO(data)).pages[0].extract_text()}]
    result = normalize(rewrite(request, value))
    assert result['status'] == 'ok', result


def test_form_graph_reuse_is_counted_once_and_cycles_are_rejected():
    from pypdf.generic import ContentStream, DecodedStreamObject, DictionaryObject, NameObject
    from strahov_rag_ingestion.openai_normalizer import _check_decoded_stream_budget
    form = DecodedStreamObject()
    form.set_data(b'BT ET')
    form.update({NameObject('/Subtype'): NameObject('/Form'), NameObject('/Resources'): DictionaryObject()})
    root = DecodedStreamObject()
    root.set_data(b'/A Do /A Do')
    resources = DictionaryObject({NameObject('/XObject'): DictionaryObject({NameObject('/A'): form})})
    reader = SimpleNamespace(strict=True)
    page = SimpleNamespace(get_contents=lambda: ContentStream(root, reader), get=lambda name: resources)
    reader.pages = [page]
    _check_decoded_stream_budget(reader, len(root.get_data()) + len(form.get_data()))
    form.set_data(b'/Self Do')
    form['/Resources'][NameObject('/XObject')] = DictionaryObject({NameObject('/Self'): form})
    with pytest.raises(ExtractionError, match='native-form-cycle-or-depth'):
        _check_decoded_stream_budget(reader, 1000)


def test_parent_rejects_malformed_child_envelope_without_unsafe_cli_output(make, monkeypatch):
    request, _ = make()
    class BrokenResult:
        exitcode = 0
        def __init__(self, *, args, **_kwargs): self.output = Path(args[1])
        def start(self): self.output.write_text('["wrong"]')
        def join(self, _timeout): pass
        def is_alive(self): return False
        def close(self): pass
    monkeypatch.setattr('strahov_rag_ingestion.normalize_openai.multiprocessing.get_context',
                        lambda _: SimpleNamespace(Process=BrokenResult))
    output = Path(request.document.workDir) / 'result.json'
    result = execute(request, output)
    assert result['errorCode'] == 'invalid-normalizer-result'
    assert not list(Path(request.document.workDir).glob('.normalizer-*'))


@pytest.mark.parametrize('root_operations', [b'/A Do', b'/B Do /A Do'])
def test_seen_form_subtree_cannot_bypass_depth_limit(root_operations, monkeypatch):
    from pypdf.generic import ContentStream, DecodedStreamObject, DictionaryObject, NameObject
    from strahov_rag_ingestion.openai_normalizer import _check_decoded_stream_budget
    def form(data, children):
        stream = DecodedStreamObject()
        stream.set_data(data)
        stream.update({NameObject('/Subtype'): NameObject('/Form'), NameObject('/Resources'):
            DictionaryObject({NameObject('/XObject'): DictionaryObject({NameObject(name): value for name, value in children.items()})})})
        return stream
    c = form(b'q Q', {})
    b = form(b'/C Do', {'/C': c})
    a = form(b'/B Do', {'/B': b})
    root = DecodedStreamObject()
    root.set_data(root_operations)
    resources = DictionaryObject({NameObject('/XObject'): DictionaryObject({NameObject('/A'): a, NameObject('/B'): b})})
    reader = SimpleNamespace(strict=True)
    reader.pages = [SimpleNamespace(get_contents=lambda: ContentStream(root, reader), get=lambda _name: resources)]
    monkeypatch.setattr('strahov_rag_ingestion.openai_normalizer.MAX_FORM_DEPTH', 2)
    with pytest.raises(ExtractionError, match='native-form-cycle-or-depth'):
        _check_decoded_stream_budget(reader, 1000000)

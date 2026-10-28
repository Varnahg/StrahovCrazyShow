from docling_core.types.doc import DoclingDocument, DocItemLabel, TableCell, TableData

from strahov_rag_ingestion.chunking import Chunker
from strahov_rag_ingestion.docling_adapter import normalize_doc
from strahov_rag_ingestion.worker import run


def cell(row, column, text, header=False):
    return TableCell(start_row_offset_idx=row, end_row_offset_idx=row + 1,
                     start_col_offset_idx=column, end_col_offset_idx=column + 1,
                     text=text, column_header=header)


def test_nonleading_disjoint_headers_have_exact_chunk_lineage(request_for):
    document = DoclingDocument(name='Explicit table lineage')
    caption = document.add_text(label=DocItemLabel.CAPTION, text='Ceník\nPoznámka: sleva neplatí.')
    cells = [cell(row, col, ('Hlavička Kč' if row in {1, 7} else f'Opakovaná hodnota {row} neplatí. ' * 4), row in {1, 7})
             for row in range(14) for col in range(2)]
    document.add_table(data=TableData(num_rows=14, num_cols=2, table_cells=cells), caption=caption)
    request = request_for(b'fixture', limits={'maxChunkTokens': 300})
    blocks, issues, _ = normalize_doc(document, 'docx', request)
    assert issues == []
    table = next(block for block in blocks if block['kind'] == 'table')
    assert table['tableChunking'] == {'contextLineCount': 2, 'headerLineIndexes': [3, 9]}
    chunks = Chunker(request).chunks([table])
    assert len(chunks) > 1
    source = table['text'].split('\n')
    prefix_indexes = [0, 1, 3, 9]
    prefix = [source[i] for i in prefix_indexes]
    body = []
    for chunk in chunks:
        lines = chunk['text'].split('\n')
        assert lines[:len(prefix)] == prefix
        body.extend(lines[len(prefix):])
    assert body == [line for i, line in enumerate(source) if i not in prefix_indexes]


def test_missing_table_row_is_reviewed_and_indexes_follow_rendered_text(request_for):
    document = DoclingDocument(name='Sparse parser output')
    document.add_table(data=TableData(num_rows=4, num_cols=1, table_cells=[
        cell(0, 0, 'První data'), cell(2, 0, 'Hlavička', True), cell(3, 0, 'Poslední data')]))
    blocks, issues, _ = normalize_doc(document, 'docx', request_for(b'fixture'))
    assert 'unrepresented-table-row' in issues
    table = next(block for block in blocks if block['kind'] == 'table')
    assert table['tableChunking'] == {'contextLineCount': 0, 'headerLineIndexes': [1]}
    assert len(table['text'].split('\n')) == 3


def test_delimited_table_exports_no_invented_headers(request_for):
    for name, data in [('table.csv', b'Name,Value\nA,-42\nA,-42\n'),
                       ('table.tsv', b'Name\tValue\nA\t-42\nA\t-42\n')]:
        result = run(request_for(data, name))
        assert result['status'] == 'ok', result
        block = result['blocks'][0]
        assert block['tableChunking'] == {'contextLineCount': 0, 'headerLineIndexes': []}
        assert result['chunks'][0]['text'] == block['text']
        assert block['text'].count('-42') == 2

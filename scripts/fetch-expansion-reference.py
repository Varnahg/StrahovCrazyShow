"""Keep an independent open-data ortho for the expanded campus; preserve the
original georeference used by the manually interpreted crown/parking datasets.
"""
from pathlib import Path
import importlib.util
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('strahov_streets_reference',root/'scripts/fetch-streets.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
output_dir=root/'docs/reality-pack/expansion'
output_dir.mkdir(parents=True,exist_ok=True)
module.ortho(output_dir)

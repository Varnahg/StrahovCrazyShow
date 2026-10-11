"""Current Blender tree-pack entry point; clean individual reference-guided trees."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('tree-pack-blender.py')), run_name='__main__')

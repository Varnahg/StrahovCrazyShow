# Photographic short lawn sources

Original photographic channels and plant master: Poly Haven Grass Medium 01, modelling by Rico Cilliers, photography by Rob Tuytel. Original assets are CC0-1.0. Source: https://polyhaven.com/a/grass_medium_01 ; licence: https://polyhaven.com/license . The official download URLs, MD5, SHA-256 and sizes are preserved in highest-master-download-audit.json.

The full source-highest 8k package is copied as actual files, not a junction. Original image pixels and master bytes are unchanged. This generic source does not identify a Strahov species or constitute a local survey. Authored v1 and v2 are separate editable interpretations with original photographic UV references. Their Blender links resolve through ../source-highest/textures. Both masters remain available for A/B.

The highest-v2 authoring model is not reduced for frame-rate targets. Runtime LODs are separate UV-aware row/whole-leaf derivatives. Geometry, alpha sampling and original source hashes have separate audits. CPU and component checks are not full-game GPU acceptance.

Rebuild with Blender 5.2 background, two threads, using scripts/build-photographic-lawn-highest.py. It saves and reopens without rendering. The Python environment needs numpy (bundled in Blender or supplied in .cache/street-python). Then run node scripts/export-photographic-lawn.mjs; it writes a staged .cache/photographic-lawn-export candidate for inspection instead of silently overwriting public runtime assets.

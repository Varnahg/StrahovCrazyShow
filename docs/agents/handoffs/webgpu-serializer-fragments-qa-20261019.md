# Předání: per-call fragment zápisy

- Owner webgpu-01a15102-fragments, cwd29fa; pouze izolovaný CPU kandidát/evidence. Runtime main, patch/lock/deps i hrané buildy beze změny.
- Rozhodnutí: sparse fragment zápisy nepřijmout. Warm PBR4,7073→4,6211ms, Standard4,0861→3,9839ms, surface5,0113→4,9520ms; coldPBR10,7174→11,1265ms, Standard7,2825→7,3026ms. Proložené3A/3S, metodika a limity v README; nejde o GPU/FPS důkaz.
- A/S26/26 semantic/WGSL/shared/prototype testů,6×5warm+6×2cold a oba syntheticchurn PASS. Přesná actual source parity/shaders/layout/uniforms,24source receipts, původní F3 metadata aktivní. Původní dva harness neúspěchy zachované, finálníprotokol runs03.
- Žádné služby/taby nezačaly. Samostatné review/evidence/commit/main a Linear uzavírají tento experiment, nikoli KEY31/32 či cíl. Podrobnosti docs/performance/evidence/webgpu-migration-20261016/serializer-fragments-qa/README.md.

# CPU vlákna klienta

Výzkumný checkpoint a rozhodnutí jsou v [BMAD zprávě](../../../_bmad-output/planning-artifacts/research/technical-client-threading-2026-10-19/research.md). [Produkční profil](../evidence/client-threading-20261019/README.md) doplnil skutečný Edge test; není to FPS A/B ani hotová vícevláknová hra.

Rozhodnutí: fyzika není hlavní CPU limit dodaného testu. Jeden worker s celým rendererem neparalelizuje scene.render. První produkční profil zúžil přípravu prostředí na transit/NPC, takže se nejdřív ověřuje a odstraňuje zbytečná scene-owned práce. Čistý schedule/geometry worker nebo OffscreenCanvas mají smysl až s doloženým přínosem proti jednodušší opravě.

`manual-phases.json` vzniká z přesného původního JSONL (SHA kontrola v programu):

```powershell
node docs/performance/client-threading/analyze-manual-phases.mjs C:/cesta/50f80eab-61bd-4576-b6b6-8b3b17911653.jsonl C:/cesta/manual-phases.json
```

Používá stejných 8 761 Medium a 7 578 High snímků jako původní souhrn; maximální fázové časy nemusí patřit nejdelšímu frame intervalu. Nový profil i původní přepočet rozlišují CPU wall time od skutečně vykonávaného CPU času a od GPU timestampů.

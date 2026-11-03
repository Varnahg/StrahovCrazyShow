# Výzkum plynulosti – předání3.11.2026

- Výchozímain22398e38. [Report](../../../_bmad-output/planning-artifacts/research/technical-gameplay-smoothness-2026-11-03/research.md), primární import, tři veřejné digests, review a staleness jsou ve stejném run folderu.
- Závěr: hlavní kandidát je snížit opakovanou renderovací práci; konkrétní příčina ale vyžaduje cílený trace/kontrolu. Zvlášť řešit startup a dlouhé mezery. Další shadercache/plošnéworkery nejsou prioritou podle dosavadních důkazů.
- Důležitá korekce: C9 interval1329,6ms s66ms CPU neprokazuje pauzu mimo celýcallback. Scope končí před recorderem/HUD; tail je neměřený. PlnýlastCpuFrameMs existuje, ale není spárovanýperhitch.
- Konkrétní kontraktová mezera: Game produkuje frameIntervalsMs aWebGPUmainpass údaje; shared/local-benchmark.tsje nepropustí. UI i server používají tento projektor. Případná oprava musí zachovat bounded numeric whitelist a scopeGPU, ne odstranit ochrany.
- Výzkum byl pouze čtecí. Žádný server/GPU/test/build, žádná změna hry. Paralelní části pouzečetly a vracely podklady. Citace15/15, žádné dangling/orphan; rootspotcheckdat a nezávislásemantic/structure/prose kontrola. Dva semantic a dva prose nálezy opraveny; příčina mezery a budoucí výkonový zisk nadále neověřené.
- Uživatel výslovně zadal po research také implementaci nejlepšího zásahu. Navázat samostatnou rezervací, úzkým doplněním důkazů a jedním kauzálně doloženým patchem; nejde o oprávnění přepsat celýrenderer nebo obejít startup gates. Aktuální další plán je součástíreportu.
- Jen dokumentační commit; cizí tři konsolidační soubory zůstávají nedotčené. Rezervace po předání uvolnit. Root nepředává běžící proces ani neprohlašuje výkonnostní cíl za dosažený.

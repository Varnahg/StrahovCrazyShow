# Předání: primitive fragment reuse CPU rozhodnutí

- Owner webgpu-01a15102-primitive-qa, cwd29fa. Helper manifest4d89e6…, candidate084ce468… protiF33cc739…, exactinverse7hunků. Převzatá implementace+refaktoring+25targeted/scopedTS a vlastní actualCPUprotokol.
- **Odmítnuto bez runtime/GPU:** wholewarmPBR4,9579→8,3701ms, Standard4,0832→6,7301ms, surface5,1142→8,9192ms. ColdPBR11,8911→15,2364, Standard8,0207→11,7552ms.499projection A23,2825/22,6446 vsP61,9144/62,1064ms. Přínos se nepotvrdil, žádnýFPSclaim.
- A/P26/26 actualtests,11WGSL/55states,6warm×5+6cold×2 a2churn/4pressurePASS.28receipts, shader/layout/uniform parity přesná,75frozenroot sources; boundedcache lifecycle10newtestsPASS. Explicitnípayloadlimit se nevydává za heaplimit.
- Žádné services/GPU/browser nepřibyly, fyzickédeps/patch/lock/Game/hranésnapshoty mimozápis. Metadata root/helpertasku přijímá koordinátor; vlastnícache/evidence se commitují samostatněbezforeignWIP. Přejímka celé migrace neníhotová.
- Přesné varianty, rozhodnutí, raw a limity: docs/performance/evidence/webgpu-migration-20261016/primitive-fragments-qa/README.md. Dále hledat podstatnější odstranění přípravy/submission, neintegrovat tuto neúspěšnoucache.

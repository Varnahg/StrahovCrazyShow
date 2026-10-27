# Dokončené části na main · 27. 10. 2026

Výslovný požadavek uživatele: dokončené věci začlenit do main, pushnout a sjednotit main. Koordinátor `trees-main-publication-root-01a16b37` oddělil přijaté části od rozpracované herní aktivace.

## Publikovaný výsledek

[PR #28](https://github.com/Varnahg/StrahovCrazyShow/pull/28) je sloučený. Merge commit **`a0e0e31286ae9521f1282a8bd966b40e8fdad628`**, původní base `8516c7b1877ec66c37120d9088264d44c52882f1`, přijatý head `3174418d05d327b8df734e56ea87619b42922978`. Místní main, origin/main a čerstvý `ls-remote` shodně vracejí merge commit. Merge tree je identický s přijatým headem.

Samostatné commity:

- `fcd2a261c644ec78ec1fa853b23629f69958bd36`: pasivní katalog 110 editovatelných modelů a runtime LOD, přesné závislosti z release seznamu, parsers/fenologické podklady a skutečná release regrese.
- `8d8d0305ed8d70c8d1b19f47bc6ae7cf36a7313d`: PCF readiness, potřebný pasivní seasonal plugin, regresní testy a doložené GPU podklady.
- `62d5099109b606e67256e505e942cead755ff65d`: statické vstupy snapshotu a odpovídající fixture.
- `3174418d05d327b8df734e56ea87619b42922978`: již dokončená dokumentační analýza issues, převzatá z neduplikovaného místního commitu df6b53af.

Game, UI, Vegetation ani renderer factory nejsou v těchto změnách upravené. Aktivace celého katalogu, výchozí WebGPU a NCM follow-up zůstávají v rozpracovaném checkoutu; celý KEY-62 není Done.

## Přijetí

Čistá kombinace přijatého headu: 49/49 cílených testů, LFS preflight 563 souborů, celý TypeScript, produkční build, izolovaná integrace a source hygiene 6449 textových souborů PASS. Čistě čtecí nezávislé review přesného diffu bez blokujícího nálezu. Push dokončil 551 LFS objektů / 5,3 GB.

[Povinné CI PR](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40543794695) a [source hygiene PR](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40543795141) PASS. Přijetí pro přesný head/base a důvod praktického přijetí jsou v popisu PR. `project-acceptance=success` byl vydán až po těchto výsledcích a po opětovném ověření headu; merge použil expected head. Pasivní assety nejsou vydávané za GPU přijetí celého světa, PCF má vlastní skutečný v9–v12 CM důkaz.

Automatické [CI na merge commitu](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40546405264) při poslední kontrole ještě běželo; jeho source hygiene již prošlo. To nemění úspěšnou přejímku stejného tree v PR a není to tvrzení o dokončeném post-merge běhu.

## Místní větve a zachování práce

Čistý main je v `D:/CodexWorkspaces/StrahovCrazyShow-main-20261027`, sleduje origin/main a má čistý index i pracovní strom. Původní `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow` zůstal na totožném HEAD `b3cf05582af36daf0d8ce71e7278b950f84a3ddd` pod názvem **`codex/primary-wip-20261027`**. Před/po přejmenování se shodují hashe všech 134 rozpracovaných souborů i samotného indexu. Nebyl proveden checkout, reset, restore, clean ani stash nad cizím WIP. Staré upstream tracking původní větve bylo odstraněné, aby se nezaměňovala s canonical main.

Původní B1 a feedback commity již byly patchově ekvivalentní upstreamu; neduplicitní hotová analýza je nyní převzatá. Celá původní historie zůstává dostupná přes zachovanou větev.

Rozpracované vlastní změny zůstávají v `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, HEAD přijatého PR. Testovací v13 server ani jeho soubory nebyly změněné. Žádné vlastní validační či upload procesy už neběží.

## Provozní podklady a kapacita

Přesné logy a receipts jsou v `.cache/trees-main-publication-20261027/`: `validation.json`, `hydration.json`, `push.log`, `primary-preservation.json`, source scanner a lokální test/build/integration logy. LFS úložiště zůstává na D podle `activate.ps1`. Clean checkout má ověřené read-only hardlinky LFS assetů z neměnného v13; před budoucím přepisem konkrétního assetu je nutné vytvořit jeho samostatnou writable kopii. Nikdy neměnit sdílené snapshot bajty in-place. Dependency junction je pouze ke čtení; žádná instalace nebyla provedena.

Po hydrataci ukazoval Git změněný stat cache, přestože clean-filter hash odpovídal indexu. Přesný seznam LFS cest byl znovu zaindexován; tree `41bbc68b06f5274273217d2713ea3447e2431b3f` před i po byl shodný a status je čistý. Původní stažené licence a provider metadata zachovávají své bajty včetně whitespace; autorské změny prošly whitespace kontrolou s podporou CRLF.

Heavy okno a publikační claim budou po tomto předání uvolněné. Ostatní vlastní WIP rezervace dál chrání nedokončenou herní práci; uvolnění této publikace neoznačuje celý modelový úkol za dokončený.

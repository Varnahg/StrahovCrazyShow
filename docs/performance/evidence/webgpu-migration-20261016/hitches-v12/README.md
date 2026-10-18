# KEY-31: samostatná nativní oprava inactive falloff defines

18.10.2026. WT **76978db3250c9a8a3ce3fc99f44f93fb4aedc8a1** integrován jako main **f9e3806d99e683bd54fb9d1f8d354f499ba31948**. Pouze4soubory: stávající Babylon patch, lockfile a2nové regresní testy. [Původní reprodukce](../hitches-v10/README.md) a [opakovaný GPU důkaz s kombinovanou QA přípravou](../hitches-v11/README.md) zůstávají oddělené.

Při deaktivaci světelného slotu nyní původní helper resetuje také3falloff flags. Všechno ostatní v instalovaném Babylon9.30 kontraktu zůstává: aktivní příznaky, globální PBR režimy, dirty guard, cap/clamp, shader producer, cache i lifecycle. Starý9103B patch zůstává prefixem; lock obsahuje přesně6náhrad jeho SHA. Nový patch `0811815a615a8e501c4542ee2fa38fcc5fdd1a4394fbc610cb0aa5a0ae62c578`. Žádný install ani úprava běžících node_modules.

Nativní přenos odstranil pouze2absolutní QA-path assertions a nevyužité importy/stav původního proofu. Skutečný loader/core realpath, GLB instanceof, draw/readiness, plné defines/Effect reuse a cleanup assertions zůstaly. Strukturální kontrola zachovala28+16ostatních assertions. Předání [native-transfer.json](native-transfer.json) má SHA `00ab7390cd1dceb631350d8c5afa0e3674462dcfbc0d1c88bbd2175d1c7d51b7`; [úplný vlastní diff](transfer/owned.diff). Čtecí review bez nálezů.

## Úplné ověření

Čistý native snapshot **eb061b9eb34a0cdf8a94560ad7803ef9235ab1447e9b4d986c7cb640e2f0b7b3** obsahuje celý nativní zdroj včetně testů a pouze tuto4file změnu. Nevnáší QA Game/light-preparation/camera/Cinematic/inventory prototypy. Vlastní fyzický node_modules/tool-output root používá již ověřené frozen core/loaders kopie; jejich10860bytes hashes a původní V5 se ověřují před/po fázích. Assets/public/docs jsou explicitní readonly odkazy, nikoli GPU přejímka.

- Cílený přenos16/16 PASS, scoped TypeScript3134souborů/0chyb.
- **pnpm test1312/1312 PASS**,0failed/cancelled/skipped.
- **pnpm build --configLoader native PASS**, včetně úplného TypeScript.
- **Izolovaný pnpm test:integration PASS**, port2568 předem volný, vlastní testovací procesy ukončené.
- Zdrojový snapshot, dependency soubory i sdílená metadata po ověření nezměněné. Kombinovaný QA V4 samostatně prošel1384/1384/build/integration v hitches-v11.

[Validation receipt](inactive-light-native-v1-validation.json), [source manifest](native-source-manifest.json.gz), [composition](native-source-composition.json), [commit receipt](inactive-light-native-commit.json), [main integration](main-integration.json). Všechny logy jsou součástí [20file archivního manifestu](archive-manifest.json), včetně ověření rozbaleného gzip obsahu. Main integrace kontrolovala přesný4file diff, shodu target base/working bytes a zachovala **133ostatních pracovních cest**.

## Hranice přijetí

Přijatá je konkrétní chyba historie neaktivních příznaků. Úspěšné GPU Day0modulů/0pipeline v hitches-v11 je zatím kombinace této opravy s QA prewarm etapami; nativní větev je zatím neobsahuje. Proto tato integrace **neprohlašuje odstranění všech nativních gameplay záseků** nebo dokončení migrace.

Stale frozen draw, fallback-string canonicalizace a explicitní Node-light cesta nejsou součástí opravy. Startup kolísá, zbytkové přechody přesahují100ms, V4 B6 se znovu neprošlo. Zůstávají přesná coverage/startup práce, finální obrazy a funkční matice, opakované produkční WebGL2/WebGPU série a výchozí renderer. Hrané4193/4192/4188 beze změny; KEY-31 a celkový cíl otevřené.

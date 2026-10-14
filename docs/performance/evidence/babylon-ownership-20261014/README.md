# KEY-17: ověřený kandidát vlastnictví image-processing prostředků

14. 10. 2026. Pinovaný patch `@babylonjs/core@9.30.0` řeší interně vytvořený Thin wrapper, který base PostProcess považoval za půjčený a neuvolňoval. Zachovává caller-owned wrapper, jeho konfiguraci a event subscribers; opravuje také validní `effectWrapper: undefined` a opakované rušení přes více kamer. Nemění barevné hodnoty, shadery, světelné intenzity ani žádnou další verzi závislosti.

## Identita a izolace

Patch SHA256: `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805`.

Úplný herní checkpoint `8eea61632293796a6ea9a72434d44fc03e8a455c86eb13532590ace23b73fb17` má8409 vstupů, z toho512 source/config/test. Proti neměnnému B6 kandidátu `cbc158068138e3454a6959a0d7a945465ea2974e6c246e86ed231abf92a4b5dc` se liší přesně4 vstupy: patch, pnpm lock, pnpm workspace a nový ownership test. Ostatní herní zdroje a asset reference zůstávají stejné. IMAGE-01 a nový Game interpolation fix nejsou součástí tohoto checkpointu.

Vlastní i nezávislá čistá instalace používají core9.30.0 a schema5.0.36. Původní resolverový pokus nechtěně navýšil schema na5.0.39; tento výsledek byl odmítnut a původní lock verze obnoveny. Po odebrání jedné patch registry položky a pěti patch suffixů je výsledný lock byte-identický Git základu. `package.json` je beze změny.

Plný audit původní main instalace porovnal17238 entries a všechny4 staré dependency aliasy:0 změn, shodný digest `50a1b986d40d5f21da2258ccaa50c820377d599d23d3ec1434a039043283e387`. Starý uživatelský B6 build na4186 se nepřepsal.

## Skutečné výsledky

- Původní red:1/10 PASS,9 FAIL. Po zpřesnění fixtures integrátor spustil **tutéž finální verzi testu** SHA `7b5805fa068351965467304170576df59805770d58670659b610b37a4c9a6d6a` proti původní neměnné knihovně: opět1 PASS/9 FAIL. Opravená knihovna má10/10 PASS.
- Testy ověřují skutečný observer baseline, actual createEffect/release, zachování cizích subscribers/config, explicit-undefined, nahrazení konfigurace a double/reentrant/multi-camera disposal. Event assertions vyžadují nárůst až po nové mutaci, takže je nesplní replay události při subscribe.
- Narrow TypeScript:0 diagnostik. Původní cinematic/art/pipeline testy beze změn:16/16 PASS.
- Čistá offline instalace z frozen lockfile exit0, následný test po potvrzeném skončení instalátoru10/10 PASS. Předběžný test spuštěný ještě během dojezdu instalace zůstává oddělený a není použitý jako finální důkaz.
- Stabilní úplná hra: **pnpm test888/888 PASS, pnpm build PASS, celá pnpm test:integration PASS**. Časy a exit codes v [pipeline.jsonl](pipeline.jsonl), vstupy a dependency hashes v [checkpoint.json](checkpoint.json). Po pipeline512/512 zdrojových hashů i dva patched JS hashes beze změny. Integrační2568 po doběhu bez listeneru.

Raw stdout/stderr, procesní identity, původní neúspěchy a kompletní source manifest jsou lokálně v `.cache/image-processing-ownership/` a `.cache/babylon-ownership-validation/`. Provozní PID se do této evidence necommitují. Build zachovává varování o neúčinném dynamic importu B6/vegetace a velikosti chunku; nejedná se o novou opravu dělení bundle.

## Hranice přijetí

NullEngine a skutečné JS lifecycle testy dokazují chování wrapperů a callbacků, nikoli výsledné pixely, GPU výkon či celý noční vzhled. Žádná nová browser/GPU přejímka neproběhla. KEY-14/4 a finální přejímka zůstávají otevřené. Stock ThinBloom/FXAA vlastnící mezera je samostatný source nález, který tento patch neřeší ani nevydává za nově změřený živý leak. Runtime integrace do main a klientská IMAGE-01 změna jsou navazující oddělené kroky.

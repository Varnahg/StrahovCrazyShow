# Obnova zdrojového otisku navigace · 11. 10. 2026

Po přidání výkladu legacy OSM přechodů se změnil `shared/streets.ts`, ale produkční odvozená navigace stále uváděla jeho starší SHA. Cílený zdrojový test tuto nesrovnalost správně odmítl. Data byla znovu vytvořena původním `scripts/rebuild-campus-transit-navigation.ts`, nikoliv opravena ručním přepsáním hashe. Neúspěšný checkpoint L se neměnil.

Nový SHA-256 `shared/data/transit-navigation.json` je `0b635cd4f842055c6a274c4cf654547d3f3c21df1f855256e0171263e861dc70`. Předchozí soubor měl `81976eb49770366ba8603fb218e20464cc94ccc96a8796359d458f822d3ac8b0`. Tento SHA označuje navigační data, nikoliv kompletní zdrojový snapshot hry.

Nezávislé porovnání všech polí kromě slovníku `sourceHashes` potvrdilo zcela shodné runtime trasy, body, délky, identifikátory zdrojových cest, cíle a ostatní metadata. Ve slovníku se změnil pouze otisk `shared/streets.ts`, z `7e2f86ba7ae9b72ab14bd14a5c2fa48ff42fcaeded152b7c06dfdc05d2bfc520` na `b216be738513a39bb81c42fddacb78fa4ad0a2a6eb2da0a0879cc97d399d7da9`. Druhé nezávislé spuštění generátoru vytvořilo byte-identický soubor. Generátor se neměnil.

Aktuální [audit v JSON](navigation-source-refresh-20261011.json) zaznamenává:

- všech 9 cílových bloků a 18 příchodových tras ze dvou zastávek, žádnou vynechanou trasu;
- 18 717 vzorků po 0,25 m proti půdorysům a 3 284 aktuálním pevným objektům, bez nalezené překážky;
- skutečný souvislý průchod kapsle všemi 9 kritickými přístupy na horní podesty, včetně porovnání 108 schodnic s Rapier kolizí;
- zachování explicitní diagonální dlážděné spojky B6 v obou trasách;
- 12/12 cílených transit/navigation/route testů PASS, délka běhu 4,351 s.

Kritické fyzicky prošlé úseky měřily 4,406–10,834 m. Nový test B6 prochází poslední schodišťový přístup 4,406 m, nikoliv celou dlouhou cestu od zastávky. Dlouhé trasy jsou v tomto auditu kontrolované geometricky. Výsledek neověřuje GPU výkon, dynamické vyhýbání jedoucím autům ani vstup cestujících do pokojů.

Při kontrole životního cyklu se ověřilo, že stávající auditní pomocné funkce uvolňují vytvořené postavy a Rapier světy v `finally`. Generátor drží pouze data jednorázového offline výpočtu; dodatečný runtime stav, cache ani alokace do herního snímku nebyly přidány. Zbytečný refaktoring reprodukčního generátoru nebyl pro aktualizaci odvozených dat potřebný.

Opakování:

```powershell
pnpm exec tsx scripts/rebuild-campus-transit-navigation.ts
pnpm exec tsx --test tests/transit-navigation-source.test.ts tests/transit-route-reality.test.ts tests/transit.test.ts
```

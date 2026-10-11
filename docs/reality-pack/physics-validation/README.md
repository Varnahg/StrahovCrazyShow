# Fyzika na skutečném terénu a nové dispozici B6

Regrese v `tests/physics.test.ts`, `tests/stability.test.ts` a `tests/netcode.test.ts` používají aktuální DMR povrch, společné kolizní moduly a zvýšení základu B6. Žádný test nepředpokládá, že celý Strahov leží ve výšce nula. Čas světa je v těchto testech zafixován, aby fyzikální očekávání nezávisela na právě projíždějícím autobusu.

## Co testy skutečně kontrolují

- Venkovní vzorky začínají ve výšce `groundHeight(x,z)+1`. Budovy, stromy, lampy a parkovaná auta nejsou mylně klasifikovány jako díra v zemi. Kontroluje se skutečná výška nad terénem v konečné poloze, nepovolené přesunutí a použití záchranného teleportu. Stejné oblasti u B6 mají samostatné průchodové testy.
- Klidový kontakt má stále limit **3 mm** pro výškové kolísání i odchylku od podpůrné geometrie. Očekávaná poloha kapsle se odvozuje ze spodní kulové části nad skutečnými sousedními trojúhelníky 4m DEM; samotná normála v jediném bodě na hraně buněk nestačí. Rovinné řešení `halfHeight + radius / normal.y` se používá pouze uvnitř jednoho trojúhelníku, kde jeho nekonečné prodloužení nezavádí chybu na konkávní hraně.
- Chůze přes několik buněk musí měnit absolutní výšku podle skutečného svahu a současně držet stálou výšku nad podpůrným povrchem. Strmý přibližně 60° svah u x 36,01 / z −150 se ověřuje zvlášť jako klouzání dolů; jeho legitimní změna nadmořské výšky není vykazována jako klidová vibrace. Počáteční kapsle zde musí stát nad svým vypočteným podpůrným obalem, aby fixture nezačínala v průniku se svahem.
- B6 používá `foundationOffset=0.9` právě jednou. Souvislá cesta vede od x −13 přes šest venkovních stupňů do recepce, servisní chodby a po vnitřním schodišti na další podlaží. Po celé cestě je zakázaný fallback teleport.
- Všech **228 modelových pokojových dveří** se zkouší ze skutečné chodby do skutečného pokoje. Test zvlášť ověřuje podlahy všech **230 katalogových prostorů včetně dvou suterénních zón** a všech šest schodišťových ramen. Počet a názvy prostorů jsou kalibrace modelu, nikoli potvrzený inventář skutečné B6.
- Okenní raycast musí narazit na tenký skleněný collider, nikoli na neprůhlednou náhradní stěnu. Kapsle se pokouší projít oknem nad nábytkem; samostatný skutečný výskok musí zastavit střecha. Kamera má vlastní kolizní sweep.
- Test auta nastavuje fyzickou pozici a orientaci přes `car.reset()`, rozjede skutečné dynamické šasi a kontroluje dosaženou rychlost i přiblížení k překážce. Nastavení pěšího `actor.yaw` se za řízení auta nevydává. Hraniční kolejnice se testují také tam, kde postava stojí níže než starý absolutní limit y −8.
- Replay používá stejné terénní výšky na klientu i serveru, stejný čas prostředí, normalizovaný vstup a skutečný výskok. Je zachován limit chyby 5 mm.

## Zjištěná a opravená skutečná chyba

Nový test původně odhalil 12 nedostupných dveří: východní buňky 16 a 17 ve všech šesti obytných úrovních. Schodišťová mezera a pravé zábradlí spotřebovaly jejich přístup z chodby. Model opravil schodiště na střed x 7,7 / šířku 1,8 m, doplnil společně vykreslovanou a kolizní boční galerii x 8,8–10 a přesunul zábradlí na x 6,7 / 8,7. Žádné pokoje ani selhávající testy nebyly vynechány. Opakovaný průchod všech 228 dveří prošel.

## Skutečné cílené výsledky 10. 10. 2026

| Kontrola | Výsledek |
| --- | --- |
| Venkovní DEM pokrytí v integračním běhu koordinátora | **1 026 bodů prošlo**, z toho 525 se zápornou absolutní výškou postavy a 133 na sklonu s normálou y < 0,99. Tento záznam pochází z přísnějšího 30tickového usazení. Finální test používá 18 ticků: z počátečního ground+1 je podpůrná výška dosažena přibližně za 9 ticků; 18 poskytuje další interval pro usazení a nepodporovaná kapsle už spadne o 0,855 m. Pokrytí ani tolerance se nemění. |
| Osm klidových kontaktních míst, 120 měřených ticků každé | Největší oscilace **1,733806 mm**, největší chyba vůči podpůrnému obalu **1,091774 mm**; limit 3 mm dodržen. |
| Chůze x 176 → přes 194, z přibližně 10 | Skutečný výškový pokles **0,521218 m**, kolísání odchylky od podpůrného obalu **0,248735 mm**; limit 3 mm dodržen. |
| Regrese stability včetně strmého svahu a deště | **4/4 prošly.** |
| Síťový pohyb, replay a sociální nekolidující dav | **6/6 prošly.** |
| Venkovní šestistupňový vstup → první vnitřní podlaží | **Prošlo**, také po opravě boční galerie. |
| Všech 228 dveří po opravě galerie | **Prošlo**, cílený běh 42,806 s. |
| Všech 230 podlahových prostorů a šest schodišťových ramen | **Prošlo.** Finální celkový běh ještě ověřuje výslednou kombinaci modulů. |
| Sklo, skutečný výskok proti střeše a kolizní kamera | **Prošlo.** |
| Pěší a dynamické auto proti zdi; hranice na záporném terénu | **Prošlo.** |
| TypeScript po posledních testových změnách | **Prošel.** |

Tyto výsledky jsou fyzikální regrese, ne měření GPU FPS. Finální `pnpm test`, `pnpm build` a izolovaný `pnpm test:integration` provádí koordinátor nad konečným snapshotem; jeho výsledky patří do `docs/verification.md`.

## NPC a parkování

`npc-clearance.ts` a jeho `npc-clearance.json` vzorkují všech 16 navigačních tras po 20 cm proti skutečným půdorysům 24 parkovaných aut, rozšířeným o kruhový průřez kapsle o poloměru 0,42 m. Po nové západní ose přístupu B6 stále platí **0 blokovaných tras**. Je to statická kontrola parkovacích překážek, nikoli ověření živých poloh autobusů nebo skutečných počtů cestujících.

Poslední část obou B6 tras nyní vede přes (−11; −89,28) → (−11; −73) → (−7,9; −73). Končí na posledním venkovním stupni před OSM obrysem. Přibližné modelové dveře x −7,06 jsou ještě 0,84 m dále; konec NPC trasy se proto nevydává za přesně zaměřený průchod skutečnou recepcí.

Reprodukce:

```powershell
pnpm exec tsx --test tests/physics.test.ts tests/stability.test.ts tests/netcode.test.ts
pnpm exec tsx docs/reality-pack/physics-validation/npc-clearance.ts
pnpm exec tsx docs/reality-pack/physics-validation/snapshot-evidence.ts
```

`source-snapshot.json` obsahuje SHA-256 testů i jejich fyzikálních a mapových závislostí. DMR zdroj má 4m pracovní mřížku a explicitně adaptovaný základ B6; takto přesný test numerického kontaktu neznamená milimetrově zaměřený skutečný Strahov.

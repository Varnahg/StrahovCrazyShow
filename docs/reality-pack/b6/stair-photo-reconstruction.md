# B6: dvě schodišťová jádra a materiálová typologie B3

11. 10. 2026. Původní osmimetrové přímé schody zabírající hlavní chodbu neodpovídaly schématu B6. Nahradila je dvě oddělená jádra v západním servisním pásu, vždy se dvěma protilehlými rameny a mezipodestou. Hlavní chodba zůstává rovná a široká čtyři modelové metry. Severní vstup přes kryté venkovní schody do vrátnice je zachován.

## Přímo prohlédnuté zdroje

- [Schéma B6 na wiki SH](https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg), [místní původní JPEG](../../references/media/blok-6-plan-2023.jpg), SHA256 `afdb05307e6fb770a42f0363708acd4f06983c8b1a6db20bbb169a3bac95dd7c`. Znovu stažený originál 11. 10. 2026 má shodný hash. Metadata média uvádějí 20. 3. 2023, ne datum zaměření. Axonometrie má dvě schodišťové sekce, chodbu, vrátnicový výstupek a mezipatrové prostory. Nemá kóty ani severku.
- [Wiki B6](https://wiki.sh.cvut.cz/kolej/bloky/blok_6), revize 26. 9. 2026, znovu prohlédnutá 11. 10. 2026. Text výslovně umísťuje studovnu do prvního mezipatra, SHernu do třetího a klubovnu mezi čtvrté a páté patro. To potvrzuje potřebu polopodlaží; nedokládá konkrétní metrické rozměry ani dnešní barvy.
- [Uživatelem dodané foto](../../references/media/user-b3-stair-20261011.png), SHA256 `6e4913f3e1b8ec9a985874e2e2385c9936d8e3377aecebfa0a21e18f5fd69594`, dodané 11. 10. 2026, datum pořízení neznámé. Snímek je výslovně označen **BLOK 3**. Vidět jsou souvislé natřené betonové spodky schodů, šedé teracové nášlapy, drobné černé svislé tyčky, hnědé dřevěné madlo, světlá omítka s teplejší spodní částí a tmavá pásová dlažba. Tyto znaky určují materiálovou typologii; fotografie se nevydává za B6 ani se nepoužívá jako herní textura.

## Co je doložené a co interpretované

| Vlastnost | Stav |
|---|---|
| Dvě jádra v západním pásu, severní poblíž vrátnicového výstupku | Interpretace viditelné topologie B6 schématu a mapového obalu |
| Protilehlá ramena, polopodlažní podesty | Schéma a text wiki; materiálová forma také typologické foto B3 |
| Jádra `x=0,25..5,75`, severní `z=-78,6..-71,1`, jižní `z=-38,1..-30,6` | Nekótovaný modelový odhad na stávajícím obalu 16×70 m |
| Rameno 2,4 m, nášlap 0,35 m, stoupačka 0,15 m, deset stupňů, 3m podlaží | Modelový odhad; nejde o stavební zaměření |
| Rameno stoupající k severu v pravé části jádra | Interpretace navazující na současnou herní recepci |
| Černé tyčky 18 mm, dřevěné madlo 60×55 mm, 1,02m výška | Typologické foto; rozměry odhadnuté |
| Pásové dlaždice, šedé teraco, teplá světlá omítka | Vlastní autorské PBR materiály podle B3 typologie; současný B6 povrch neověřen |
| 35 ilustračních ložnic / modelovou obytnou úroveň | Modelový počet po uvolnění tří bay pozic pro jižní schodiště, nikoli skutečný inventář B6 |

Mezipodesty jsou průchozí v obou jádrech. Úplné zaměření a současná skutečná dispozice studovny, SHerny či klubovny nejsou touto změnou dokončené. Modelové číslování podlaží zachovává dosavadní herní výškový rámec; neřeší ověřený stavební pasport všech prostor 0.NP a suterénu.

## Sdílená geometrie a materiály

`shared/b6-stairs.ts` poskytuje skutečné schodové povrchy s uzavřenými bočnicemi a spojitou šikmou spodní deskou. Každý zdrojový vrchol jde beze změny polohy do Rapier trimeshe i Babylon rendereru; oba přičítají pouze společnou základnu 1,8 m. Babylon při nahrávání převrací pořadí trojúhelníků z fyzikální CCW konvence na svou boxovou CW konvenci. To mění orientaci zápisu, nikoli rozměry či povrch. Kolize používají `FIX_INTERNAL_EDGES` stejně jako celá hra.

Mezipodesty a všechny svislé balustry jsou v `B6_REALITY_BOXES`; žádná stará osmimetrová zábradelní GLB instance není umístěna přes nové rameno. Schodišťové povrchy a madla se slučují podle podlaží a materiálu do 18 renderovacích batchů. Konstrukce má 2 640 trojúhelníků v 96 zdrojových částech; každá část má identitu jádra, podlaží a materiálu.

`shared/b6-stair-materials.ts` určuje PBR barvy, roughness, metallic i 1,28m fyzické opakování UV. `scripts/create-b6-stair-textures.ts` vytváří dvě původní 512px PNG textury: pásové chodby a jemné teraco. Neobsahují osoby, auta, stíny z fotogrammetrie ani pixely referenční fotografie. Dřevo používá dosavadní autorský vzor.

První skutečný GPU náhled kořenového agenta odhalil dlažbu také na spodních stranách podest. Oprava rozděluje původní floor box trojúhelníky podle skutečných normál: pouze horní +Y plocha používá podlahový materiál; spodní a svislé plochy mají hladkou světlou natřenou betonovou omítku. Každý původní trojúhelník a vrchol je použitý právě jednou, nepřidává se druhá stropní geometrie. Původní tenké překryvné stropní skořápky byly odstraněny. Polohy a fyzikální kolize se nezměnily. Stejnou továrnu `createB6BoxFaceParts` používá herní renderer i samostatný archiv B6. Madlo má tmavší hnědý materiálový odstín `#70482e` podle fotografie B3.

## Skutečně provedené ověření

- `pnpm exec tsx --test tests/b6-reality.test.ts`: **11/11 PASS** po materiálové opravě. Skutečný Rapier character controller jde od venkovního severního vstupu přes recepci na první patro; zvlášť souvisle projde obě jádra na dvě patra a zpět, bez skoku nebo změny pozice. Kontroluje 42 východních dveřních přístupů proti oběma jádrům, podlažní culling/disposal, přesnou shodu všech renderovacích vrcholů a fyzikálních zdrojů, kladné normály nášlapů, záporné normály spodní desky a žádné degenerované trojúhelníky. Další kontrola skutečných bufferů controlleru ověřuje, že všechny dlažby/vinyl mají pouze +Y normály, stropy jsou hladké bez textury a každý box zachovává přesně původních 12 trojúhelníků a 24 face-vrcholů.
- `pnpm exec tsx --test --test-name-pattern 'B6 exterior north|every catalogued B6 room|B6 catalogued room floors' tests/physics.test.ts`: **3/3 PASS v celé Simulation**. Prochází všech 222 katalogizovaných modelových dveří (210 ložnic + 12 sociálních místností), obě jádra z každé z šesti spodních úrovní, pokojové podlahy, suterén i severní dvanáctistupňový přístup. Zákaz teleportu a původní tolerance se nezměnily.
- `pnpm exec tsc --noEmit`: **PASS** během implementace. Kořenová integrace provádí finální celý test/build po sloučení.

GPU náhled a fyzikální průchod jsou dvě různé věci. [Komponentový náhled](stair-photo-preview.html?view=corridor) vykresluje stejný `B6RealityController` jako hra, se skutečnými rekvizitami. Subagent neměl připojený žádný browser surface; finální screenshot a vizuální kontrolu proto zajišťuje kořenový agent. Žádný FPS údaj komponentového náhledu se nevydává za výkon celé hry.

# Předání: building-reference-models

- Vlastník: `buildings-01a12b28-references` (`/root/building_references`); příjemce: koordinátor budov `buildings-01a12b28-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, větev `codex/building-models`. Výchozí commit rezervace: `de5647a3550f59af5eb48ecf4c2b2b16a4093bb7`. Vlastní modelářský WIP vznikl dříve nad `918a59ce63d7ba7c3a97c209a739cd59a4e00475`; koordinační commit byl následně přijat fast-forward bez změny runtime.
- Výsledek: dokončené zdrojové podklady, autorský market kit a lokalizovaný datový plán tří fasád B4. Napojení rendereru patří `building-model-integration`; panelové Blender modely B4 patří `building-window-authoring`; plný stavební archiv patří `building-archive-export`. Toto předání neprohlašuje hotovou celou herní přejímku.

## Přesný předávaný rozsah

- `scripts/create-market-detail-kit.py`
- `assets/blender/market-detail-kit/market-flue-highest.blend`
- `assets/blender/market-detail-kit/highest-geometry.json`
- `public/models/architecture/market-detail-kit/market-flue-near.glb`
- `public/models/architecture/market-detail-kit/market-flue-far.glb`
- `shared/data/market-detail-kit.json`
- `tests/market-detail-kit.test.ts`
- `shared/b4-facade-plan.ts`
- `shared/data/b4-facade-plan.json`
- `assets/blender/b4-facade/source-plan.json`
- `scripts/export-b4-facade-plan.ts`
- `tests/b4-facade-plan.test.ts`
- `shared/data/facade-reality.json`: pouze B4 phenotype a odpovídající nový záznam zdroje; jiné bloky nebyly přepsány.
- `docs/building-modeling-20261012/references/observations.json`
- `docs/building-modeling-20261012/references/market-model.md`
- `docs/building-modeling-20261012/references/market-kit-blender-audit.json`
- `docs/building-modeling-20261012/references/b4-facade-plan.md`
- `docs/building-modeling-20261012/references/handoff-targeted-tests.log`
- `docs/building-modeling-20261012/references/handoff-files.json`
- Toto předání.

Při claimu bylo přijato 17 vlastních existujících dirty cest přes výslovně autorizované `--adopt-dirty`. Jde o původního autora, nikoli o převzetí cizího WIP. Nepřebíral jsem `client/architecture-reality.ts`, oknový/panelový Blender kit jiného agenta, společné herní vstupy ani počasí/mobiliář v hlavním checkoutu.

## Podklady, pozorování a omezení

Všechny odkazy a konkrétní fotografie jsou v [observations.json](../../building-modeling-20261012/references/observations.json). Fotografie byly skutečně prohlédnuté běžným prohlížečem; pouhá extrakce URL nebyla považována za prohlídku. Žádné pixely ČVUT, Google nebo Mapy.com nejsou archivované ani použité jako textura.

- **Potraviny/R-ko, OSM 7645350:** Mapy panorama `101883310`, UI uvádí pořízení **1. 6. 2023**, Seznam/Cyclomedia. Východní pohled dokládá kulatý kouřovod, objímky, zvýšenou dešťovou čepici a nízkou ochrannou mříž. Kit má skutečný otevřený plášť, objímky, čepici s podporami, zadní držáky a ochranné pruty. Přesné rozměry, počet/rozteč objímek a konstrukce držáků/mříže jsou interpretace. Dosavadní centrum, posun 0.3 m dovnitř fasády, poloměr pláště 0.17 m a celková výška 5.4 m zůstávají. Nové díly se vejdou do 0.28 m kolem osy a zůstávají v půdorysu budovy. Bod provozovny není vydáván za dveře.
- **B4, OSM 53929057:** ČVUT fotografie Jiřího Ryszawého z **20. 6. 2024**, snímky 1, 2 a 8, prokazují identitu číslem a vzhled detailů. Severní panorama `Vf0vxZZEYzkbdybWxPSX4w` je **květen 2024**, kamera severně, pohled k jihu. Severozápadní přispěvatelské panorama `CIHM0ogKEICAgIDZ6Z2S-QE` uvádí v patičce **pořízení září 2023**, v kartě přispěvatele **říjen 2023**; tato data nejsou zaměněna.
- **B4 plán:** přesné stávající OSM hrany severní věže 6.521 m, severního ústupu 10.133 m a západního návratu 12.352 m. Pořadí otvorů: šest párů malých severních oken, pět schodišťových pásů u západního okraje severního ústupu a šest řad po třech malých oknech na západním návratu. `blankEasternPartOfNorthFace` označuje zbytek tohoto krátkého severního čela, nikoli dlouhou východní fasádu.
- **Metrické odhady:** malá okna 0.72 × 0.78 m, schodišťové pásy 2.4 × 0.66 m, patrový modul 3 m, konkrétní lokální středy i panelové spáry 1.5 m jsou výslovně interpretace, ne zaměření. Šedé drážkované panely mají **nezjištěné složení**; bylo odstraněno nepodložené tvrzení o bedněném betonu B4.
- **Malé rámy B4:** prohlédnuté ČVUT 1/2 ukazují tmavé šedohnědé rámy a světlé samostatné parapety. Vysoká jistota rozlišení tmavého rámu a světlého parapetu, střední jistota hnědého odstínu ve stínu. `#4c4b44` je artist estimate, substrát není prokázán; žádná kresba dřeva se nepřenáší z neidentifikované fotografie standardních čtyřtabulových oken.
- **Neosazené detaily:** bílé kryty dokumentované červnovými fotografiemi a vystrčené číslo 4 zůstávají fakty bez nové metrické placement. Plošná generická značka je na třech zmapovaných fasádách potlačena, aby nekryla schodišťová okna. Pozorovaný přízemní vstup je zapsán jako oblast bez nového průchozího otvoru či změny kolize.
- **Školicí centrum:** prohlédnuté panorama `mnUJggtVk6NkiDjSiYDzrA`, **září 2025**, a oficiální SH Wiki rozlišují nízkou světlou budovu od sousední šedé komerční budovy. Úplné otvory a přiřazení k OSM jsou omezené zakrytím; žádný model nebo dveře centra nebyly z tohoto dílčího pohledu vymyšleny.

## Refaktoring a životní cyklus

Market generátor má společné autorské primitivy, jeden převod vyhodnocené geometrie a jednotnou validaci pro highest/near/far. Dočasné evaluated meshes se vždy uvolní v `finally`; kit nevyžaduje textury ani další síťové prostředky. Runtime dostává skutečné Blender trojúhelníky sdružené do dvou materiálových rolí. Highest master je uložen před tvorbou nižších variant a zachovává editovatelné komponenty a modifikátory.

B4 má jediný autoritativní datový plán; export vytváří byte-identickou kopii pro Blender. Resolver páruje oba endpointy místo obecného směru/délky. Při opačné orientaci vrací stejné světové středy otvorů a ponechává kanonický základ geometrie. Otvory jsou vlastněné kopie, takže renderer nemůže změnit zdrojový katalog. Funkce běží při stavbě scény, nepřidává per-frame cache nebo výpočty.

## Ověření a identita předání

- Původní autorské CPU Blender běhy před přijetím registru: Blender **5.2.2 LTS**, `--background --threads 2 --python scripts/create-market-detail-kit.py`, exit **0**, bez GPU renderu. Native reopen ověřil **29 highest mesh objektů / 8 336 trojúhelníků**, editovatelné modifikátory, polohy, bounds a normály. Near má **1 984**, far **600** trojúhelníků; oba dvě materiálové role. Detaily a hashe obsahuje [market-kit-blender-audit.json](../../building-modeling-20261012/references/market-kit-blender-audit.json). Tyto běhy nejsou zpětně označené jako rezervace `heavy-validation`.
- Cílené testy původní práce: 3/3 market a 3/3 B4; samostatná strict TypeScript kontrola vlastních TS souborů exit **0**. Nešlo o full suite ani GPU test.
- Po claimu, **12. 10. 2026 přibližně 11:53 UTC**, `pnpm exec tsx --test tests/market-detail-kit.test.ts tests/b4-facade-plan.test.ts`: exit **0**, **6/6 prošlo**. [Úplný krátký log](../../building-modeling-20261012/references/handoff-targeted-tests.log) zahrnuje kontrolu GLB nodetransformů a shodu skutečných trojúhelníků s runtime JSON, hashe native source, OSM anchor invarianty, počty/typy oken, neexistenci nových dveří a reverzní hrany.
- `git diff --check` pro vlastní scope: exit **0** při předání. Nový full build, integrace, Blender export nebo GPU kontrola se v této metadatové fázi nespouštěly.
- [Manifest vlastní dodávky](../../building-modeling-20261012/references/handoff-files.json) byl vytvořen **2026-10-12T11:53:39.011Z** a obsahuje **18 přesných souborů včetně obou testů**, velikosti a SHA-256. Jeho SHA-256 je **`50da96fb4eb1243437b1af7a174e488be122d43a15af99385ee8cf9627b8a095`**. Manifest nezahrnuje sám sebe a toto odkazující předání. Není to snapshot celé hry ani tvrzení, že sdílený dirty strom představuje stabilní checkpoint.

## Procesy, další krok a rezervace

**Živé vlastní pomocné procesy: 0; porty: žádné; GPU scény: 0.** Oba vlastní Blender běhy skončily exit 0. Referenční browser tab byl zavřen. Pozdější pokus o nové zvětšení referencí narazil na prázdný browser inventory a žádnou kartu neotevřel; nepřinesl nové pixelové měření. Testovací a export-copy příkazy byly krátké procesy, všechny dokončené. Cizí preview/server/GPU procesy nebyly ukončovány ani přebírány.

Rezervace `building-reference-models` byla získána s ownerem `buildings-01a12b28-references` a `--adopt-dirty`. Po uložení a kontrole tohoto předání následuje explicitní `release`; konečný výsledek příkazu je předán koordinátorovi. Tato zpráva nepředává živý proces a nepřepíná task na `done`.

Integrátor převezme vlastní metadata přes svůj koordinační slot a nastaví stav tasku. Následující společný stavební checkpoint musí dokončit novou panelovou geometrii, plný archiv a praktickou GPU přejímku po uvolnění náročného okna počasí/mobiliáře. PBR vlastnosti standalone market GLB nejsou v dosavadním StandardMaterial runtime reprodukované zcela; runtime používá sdílený kovový materiál s relativním tónováním. **Výkon GeForce ani cílových 60 FPS toto předání neověřuje.**

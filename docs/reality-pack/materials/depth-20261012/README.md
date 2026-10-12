# Omítka: klidnější barva a čitelnější jemný reliéf — 12. 10. 2026

Omezená materiálová úprava po U1, původní základ `76ae037`. Mění pouze rodinu omítky v `client/cinematic-art.ts` a společnou organizaci shaderového kódu. `SurfacePack`, ostatní rodiny, barevné tónování scény, osvětlení, UV, geometrie a původní bitmapy zůstávají v této dílčí práci beze změny. Není to prohlášení o dokončení vzhledu areálu nebo dosažení 60 FPS.

## Podklady před změnou

- Původní ambientCG Color / NormalGL / Roughness z [manifestu](../../../../shared/data/assets/surfaces-manifest.json), import 10. 10. 2026, CC0. Prohlédnuty Plaster001, Concrete034, PavingStones112 a aktuální herní snímek. Generické mapy nejsou fotografickým měřením Strahova; Grass001 je procedurální materiál. Skript [audit-channels.py](audit-channels.py) ověřil všech **21 SHA-256** a četl každý osmý pixel od x=y=4. Nezapisuje žádný obrazový soubor. Výsledek [channel-audit.json](channel-audit.json) obsahuje rozměry, původní SHA, lineární albedo, roughness a odvozené úhly normál.
- [Archivovaný B12 detail](../../../world-architecture/media/b12-detail-2009.jpg), Ondrej.konicek, 6. 10. 2009, CC BY-SA 3.0, [licence a původ](../../../world-architecture/LICENSES.md). Prohlédnutý historický snímek dokládá jemný reliéf světlé omítky; jeho odlupování a praskliny nejsou kopírované na dnešní B7 ani vydávané za dnešní stav.
- [ČVUT: Exteriéry kolejí Strahov](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov), Jiří Ryszawy, 20. 6. 2024. Dne 12. 10. 2026 znovu ověřena stránka a autor/datum. Dva identifikované přímé JPG odkazy se webovým nástrojem neotevřely; tento audit netvrdí jejich nové vizuální prohlédnutí a nearchivuje je.
- [u1-block7.jpg](u1-block7.jpg) je nezměněný herní screenshot pořízený hlavním agentem v primárním checkoutu, kopie `.cache/gameplay-quality-20261012/u1-block7.jpg`, dne 12. 10. 2026. Dodaný kontext: U1, střední kvalita, CSS/interní 1280 × 720, skutečný den a zatažené počasí. Původní snímek byl prohlédnut, SHA kopie `acb3eaa116a51745ab4d900c3b79d6cf21eb182a85cf8645dc10eef83969dd35`. Viditelné číslo HUD není benchmark. Samotný JPEG neobsahuje úplný zdrojový/GPU záznam; nesuplujeme jej domněnkou.
- Instalovaný Babylon 9.30.0: `pbrBlockAlbedoOpacity` převádí Color ze sRGB do lineárního prostoru, `pbrBlockReflectivity` používá zelený roughness kanál, XY normály násobí texture level. [Předchozí U1 ověření orientace normál](../normal-transfer-20261012.md) zůstává platné a nezměněné.

## Nález a omezená změna

Globální přenos kanálů nebyl rozbitý: albedo má `gammaSpace=true`, normály/roughness `false`, grayscale roughness se nepoužívá jako metalness. Asfalt 2,5 m a beton 1,1 × 0,55 m drží rozměry poskytovatele; omítka 1 m a dlažba 2,4 m jsou nadále výslovně výtvarné aproximace. Výchozí zatažené světlo přirozeně potlačuje přímou světelnou odezvu. Samotná homogenní šedá plocha proto není důvod přebarvit asfalt nebo zvýšit všechny kontrasty.

Plaster001 má široké měkké barevné skvrny již ve zdroji, které předchozí poměr albeda a normály zvýrazňoval proti jemnému reliéfu. Zdrojová lineární luminance má průměr 0,66494 a směrodatnou odchylku 0,03513. U1 zachovávalo 94 % jejího blízkého / 82 % vzdáleného kontrastu a přidávalo další makrovariaci. Současně tlumilo XY normál na 18 %.

| Omítka | U1 | Tento kandidát |
|---|---:|---:|
| Kontrast albeda blízko / daleko | 0,94 / 0,82 | 0,68 / 0,52 |
| Přidaná makrovariace albeda | 0,035 | 0 |
| Přidaná makrovariace roughness | 0,012 | 0 |
| Síla původní NormalGL | 0,18 | 0,32 |
| Median / p90 / p99 sklonu normály, bez mipů a osvětlení | 1,63° / 3,84° / 6,91° | 2,89° / 6,80° / 12,16° |

Původní normály mají median/p90/p99 8,98°/20,43°/33,94°. Zvolená odezva je stále významně utlumená, bez nové height/displacement mapy. Hodnoty jsou **výtvarné nastavení opřené o kontrolu zdroje**, nikoli změřený strahovský povrch nebo fotometrická kalibrace.

Albedo se pouze míchá s vlastním lineárním průměrem; nejde o blur ani přidání cizí barvy. Zdrojové texely, mipmapy, normal/roughness mapy, jejich metrické měřítko a tón `[0.98, 0.965, 0.91]` zůstávají. Očekávaný efekt je menší barevné mramorování a lepší jemná odezva světla při pohybu. Praktický vzhled musí potvrdit hlavní agent v celé hře.

Samostatně byla nalezena chyba `buildingFoundationData`: normalizované u=0..1 přes celou hranu a v=0..1 přes měnící se výšku neodpovídalo `uvMetresPerRepeat:4`. To skutečně roztahuje betonový vzor podle délky/výšky sukně. Oprava byla předána vlastníkovi geometrie; nenahrazujeme ji barvou materiálu. Přiřazení šedých řádků ve screenshotu B7 právě tomuto meshi je zatím inference, nikoli záznam výběru meshe pod kamerou.

## Refaktoring, cache a ověření

Shaderové receptury jsou sdílené neměnné objekty. Omítka s nulovou makrovariací už vůbec neinjektuje noise/hash funkce ani umělé roughness operace; ostatní rodiny používají stejnou dosavadní recepturu. Bind uniformů nezpracovává spread iterátor RGB tuple. Žádný nový sampler, textura, draw call, světlo, mesh nebo snímkový stav. Jde o strukturální kontrolu nákladů, ne měření zrychlení.

Regrese používá skutečné Babylon materiály, dva sdílející stejné tři mapy, změnu medium→low→high, 120 klidových aktualizací, návrat původních materiálů a release vlastněných textur. Odděluje existující Babylon BRDF lookup od tří map SurfacePacku. Ověřuje i nedotčený již existující PBR, autorské spáry, mokro ostatních rodin a U1 RH NormalGL směr na skutečných DMR UV.

```powershell
pnpm exec tsx --test tests/surface-pilot.test.ts tests/cinematic.test.ts tests/cinematic-art.test.ts tests/render-maintenance.test.ts tests/surface-normal.test.ts
pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --resolveJsonModule --skipLibCheck --strict client/surface-pack.ts client/cinematic-art.ts tests/surface-pilot.test.ts tests/cinematic-art.test.ts tests/surface-normal.test.ts
git diff --check
```

**20/20 testů PASS** (2,442 s runner), scoped TypeScript exit 0, diff check exit 0. První testovací průchod 10/20 odhalil, že Babylon z base konstruktoru volá `getCustomCode` před inicializací `art`; opraveno bezpečnou registrací úplné sady hooků před pozdějším výběrem shaderu. Druhý průchod 19/20 odhalil chybu nové testovací baseline, která počítala sdílený BRDF lookup jako novou mapu. Po explicitním vytvoření původního PBR baseline všechny testy prošly. Žádný z těchto prvních stavů nebyl předán jako hotový kandidát.

Čas a SHA dílčího předání jsou v [validation.json](validation.json); [cinematic-art.ts.txt](cinematic-art.ts.txt) uchovává tehdejší zdrojový soubor včetně nezměněného gradingu. Pozdější oddělená úprava osvětlení nebo gradingu hlavním agentem se nesmí vydávat za tento historický snapshot; společný build potřebuje vlastní source ID.

Read-only audit nejprve narazil na nepoužitelné Python 3.13 cache balíčky v Python 3.12. Závislost na cache byla odstraněna; úspěšný běh používá dodaný Python 3.12 s jeho Pillow/NumPy. Vstupní pixelové soubory se ani při tomto selhání nezapisovaly.

Tyto CPU kontroly nedokládají GLSL kompilaci na skutečné GPU, vizuální přijetí ani FPS. Zde neběžel GPU náhled, Blender, server, plná sada, build ani integrace. Ty koordinuje hlavní agent po společném stabilním checkpointu; výsledek v celé hře má být připojen k celkové evidenci.

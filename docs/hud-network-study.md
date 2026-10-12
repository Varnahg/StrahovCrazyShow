# HUD: čitelné ovládání a pravdivý stav

Průzkum a implementace: **12. 10. 2026 (Europe/Prague)**. Tato poznámka popisuje cílenou změnu stávajícího HUD; nenahrazuje výsledky produkčního ověření v `docs/verification.md`.

## Primární podklady

- [Game Accessibility Guidelines: Provide high contrast between text/UI and background](https://gameaccessibilityguidelines.com/provide-high-contrast-between-text-ui-and-background/), datum vydání na stránce neuvedeno, ověřeno 12. 10. 2026. Doporučuje čitelný kontrast, jednolitý podklad a alespoň 4,5:1 mezi textem a podkladem. Z toho vychází neprůsvitné tmavé plochy nových stavových prvků. Nejde o důkaz přístupnosti celé hry.
- [Jakob Nielsen: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/), 3. 12. 2006, ověřeno 12. 10. 2026. Důležité ovládání má zůstat snadno dostupné; podrobnosti lze ukázat až na vyžádání, pokud mají vstupy jasné názvy. V HUD proto zůstávají přímé vstupy do existujících panelů. Na široké obrazovce mají textové názvy; při menší šířce se název objeví při najetí nebo klávesnicovém fokusu. Diagnostika zůstává v nastavení.

## Zjištění v původním kódu

Navigace zobrazovala sedm samotných ikon s `title`; podstatné stavové řádky počasí a časového náhledu skrývalo CSS. Text připojení měl 9–10 px, odznak demo 8 px a FPS 9 px. Každá aktualizace statistik a hodin znovu vytvářela seznam navigace i jeho obsluhy.

## Změna

`WorldDock` zachovává sedm existujících akcí a jejich pořadí. Používá skutečná tlačítka, přístupný název navigace, stisknutý stav, počet žádostí v názvu tlačítka Lidé a metadata skutečných zkratek M/J. Klávesnicový fokus zobrazí stručné vysvětlení Tab, Enter a Esc; do pohybu se uživatel vrátí kliknutím do hry. Chování kláves a panelů se nemění.

Memoizovaná komponenta dostává stabilní obsluhu `togglePanel` a pouze aktuální panel, otevření deníku a počet žádostí. Nadále samostatně sleduje změnu jazyka. Nepřidává časovače, globální posluchače, efekty rozmazání ani práci v renderovací smyčce. Úspora vykreslení Reactu není tvrzením o změřeném zvýšení GPU FPS.

Počasí vedle teploty rozlišuje čerstvé měření stanice, starší měření, model, starší model a nedostupná data. Podrobné zdroje stanice a oblačnosti zůstávají v popisku. Na úzké obrazovce se celý údaj počasí nadále skrývá. Čas ukazuje Prahu a případný náhled světla; demo a náhled autobusu zůstávají označené. Samostatná prohlídka neuvádí žádný počet multiplayerových hráčů. Odpojení výslovně vybízí k obnovení spojení.

Dotčené stavové a navigační texty mají nejméně 12 CSS px. To je místní úsporný kompromis, nikoli obecně dostatečná velikost pro všechny uživatele. Nové tmavé plochy mají tyto vypočtené kontrasty sRGB; jde o výpočet deklarovaných neprůsvitných barev, nikoli měření displeje:

| Text / podklad                        |   Poměr |
| ------------------------------------- | ------: |
| `#d9e1dd` / `#111d28`                 | 12,81:1 |
| `#b9c6c8` / `#111d28`                 |  9,73:1 |
| `#e3c990` / `#263a41` (demo)          |  7,38:1 |
| `#ffffff` / `#674c81` (počet žádostí) |  7,17:1 |

## Ověření a meze

Levné kontroly: skutečný render komponent do HTML v češtině i angličtině, rozlišení všech stavů počasí, názvy a stavy tlačítek, překlady nových serverových oznámení a stávající test potlačení pohybu při ovládání rozhraní. Toto ověření nepotvrzuje rozložení CSS ani skutečný průchod klávesnicí.

`pnpm exec tsx --test tests/hud-status.test.ts tests/i18n.test.ts tests/interaction.test.ts`: **16/16 prošlo** dne 12. 10. 2026. Kontrola Prettier všech sedmi dotčených souborů a `git diff --check` také prošly. Existující test interakce používá NullEngine pouze pro logiku vstupů a výběru, nikoli jako důkaz GPU výkonu.

Navazující [produkční kontrola B3](verification-evidence/network-responsive-20261012/production-ui.json) ověřila široké a kompaktní zobrazení, české i anglické názvy, viditelný fokus, návrat z deníku, samostatného hosta a denní i noční náhled. Při 320×640 měl skutečný dokument šířku 320 px, hlavička končila v y=107,2, panel začínal v 115,2 a končil v 564,0, navigace začínala v 567,4. Při 390×844 se anglický panel také vešel mezi hlavičku a navigaci bez vodorovného přesahu. Jde o browserové viewporty, nikoli test fyzického telefonu a dotykového řízení.

Tab z mapového tlačítka skutečně přesunul fokus na deník, zobrazil obrys i klávesnicovou nápovědu; Enter otevřel deník a Esc vrátil fokus. Host při jiném připojeném SDK hráči zobrazil samostatnou prohlídku bez jeho jména; po návratu a po reloadu se znovuvstupem multiplayer ukázal právě dvě relace. Finální načtení mělo připravený svět/fyziku/auto/B6, nulové render chyby a prázdnou konzoli warning/error. Nejde o úplný audit přístupnosti všech starších panelů.

Tři skutečné 10s intervaly celé hry s HUD, 30 relacemi, Intel UHD 630, low, CSS 1920×1080 a interním 1476×830 daly 28,9 / 29,5 / 30,9 FPS. [Snímkové časy, zdrojové otisky a omezení](performance/network-state-20261012.md) neprokazují zvýšení FPS; hlavním doloženým přínosem této části je čitelnost a ovladatelnost.

## Podrobnosti benchmarku: převzatá oprava a dokončený export

Dne 12. 10. 2026 byly po výslovném předání vlastnictví převzaty `client/benchmark-presentation.ts`, jeho test a pouze čtecí změna `client/model-review.ts` z worktree `visual-quality-jump/StrahovCrazyShow`. Zdrojový checkout měl HEAD `e000d4842d585fb9defd3e2c0d87642ea626c6c9`; předávané úpravy byly pracovní změny, nikoli obsah tohoto commitu. SHA-256 zdrojových souborů před rozšířením:

- `client/benchmark-presentation.ts`: `a603d309d02add0eaa32b24349df09d3bdd367a299fff1b08d7940cc1e938a42`.
- `tests/benchmark-presentation.test.ts`: `dfbadcbcf1b617d07462ed02c354dba885f2e5a77bed5e399d7216f7d93ca2b8`.
- `client/model-review.ts`: `e6728f7464c330160a5fddefb222088ab0591344b787fc2fbb98672a2f5d7dfb`.

Podnětem bylo rodičem reprodukované zamrznutí při otevření obrovského inventáře modelů v produkčním běhu P5. Viditelný JSON nyní ponechává všechny intervaly snímků, čítače a ostatní naměřená data; pouze `modelReview` nahrazuje počtem modelů a informací o úplném exportu. Původní výsledek v paměti ani ukládání do místního sběrače se nemění. Nevytváříme dojem, že odstranění inventáře z DOM samo zrychlilo 3D vykreslování.

Tlačítko **Stáhnout úplný záznam / Download full record** serializuje původní výsledek včetně inventáře až na výslovné kliknutí. Integrovaná správa prostředků vždy zkusí odstranit dočasný odkaz; po úspěšném kliknutí uvolní Blob URL s odkladem jedné sekundy, při chybě okamžitě. Při zavření panelu zruší zbývající časovače a uvolní URL. Synchronická chyba dostane přeloženou zprávu a lze ji zopakovat. O skutečném uložení souboru rozhoduje prohlížeč, proto je potřeba samostatná kontrola reálného stažení.

Inventář už nevynucuje `computeWorldMatrix(true)`: diagnostika čte poslední vyhodnocené prostorové obálky a nemá opravovat pozorovanou scénu. U skrytých modelů mohou obálky odpovídat jejich poslednímu vyhodnocení; nejde o nově přepočítané zaměření celé scény.

`pnpm exec tsx --test tests/benchmark-presentation.test.ts tests/benchmark-render-profile.test.ts tests/i18n.test.ts`: **21/21 prošlo**. Testy potvrzují zachování původního výsledku, úplný obsah JSON Blobu, odložené uvolnění, úklid při chybách vytvoření odkazu/kliknutí/odstranění/plánování i při opakovaném ukončení a neovlivnění uložených transformačních dat. `pnpm exec tsc --noEmit` prošel. Samostatné produkční stažení bylo ověřeno v angličtině v B1 a třikrát v češtině v B3: soubory v Downloads skutečně obsahovaly úplné raw intervaly i inventář. [Anglický export](verification-evidence/network-state-20261012/benchmark-download-check.json), [kontrola všech B3 exportů](performance/evidence/network-state-20261012/gpu-b3-check.json). Jednotkové testy samotné tento skutečný přenos ani GPU výkon nepotvrzují.

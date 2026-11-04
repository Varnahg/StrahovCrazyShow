# Profil celé hry · konsolidovaný checkpoint 2. 11. 2026

**Stav: částečný, profil FPS není dokončen.** Připravený produkční build, měřicí harness a jeden neúspěšný WebGPU startup jsou zachované na `main`. Hra se při tomto pokusu nedostala do připraveného stavu. Žádné zvýšení FPS, dominantní CPU/GPU příčina ani další konkrétní optimalizace nejsou prokázané. Tento commit nemění herní API ani grafické chování.

## Identita a rozsah

Baseline `fdc7b91911e1ef0ca655bddce7b6a8e077c907e2`, source/test SHA-256 `a03e0c635074c656ad73259b1626d3dafbe9e79ebd0a6e843f22c01fb684f904` (945 vstupů). Build vznikl pouze v `.cache/render-profile-20261102/build/dist`; nebyla vytvořena větev, worktree ani kopie projektu. Public assety se servírovaly z hlavního checkoutu pouze pro čtení. Hashe zdrojů, testů, 8 064 public souborů, instalovaných Babylon core/loaders souborů, ostatních vybraných dependency metadat a harnessu obsahuje přesný komprimovaný [manifest buildu](artifacts/build-identity.json.gz). Nejde o hash všech bajtů každé tranzitivní závislosti.

Izolované API 2568 a preview 4179 použily explicitní [QA počasí](artifacts/weather.json). Původní Docker 8080 zůstal zachovaný. UI vstup použil vlastní testovací profil a striktní `renderBackend=webgpu`. Edge hlásil `156.0.0.0`; renderer NVIDIA/Pascal, systémová karta GTX 1060 6 GiB, ovladač 582.28. CSS viewport byl 1280 × 720; konečný canvas také 1280 × 720, během Low přípravy 984 × 553. Medium / 60 FPS a den/léto jsou **požadované podmínky**, nikoli dokončená a změřená herní konfigurace.

## Co se skutečně podařilo změřit

Automatická session začala `2026-11-02T16:06:51.019Z`. Původní JSONL obsahuje 153 souvislých záznamů `seq 0–152`; nemá `session-end`, proto nelze tvrdit kompletní závěrečný flush. [Vybrané přesné události](artifacts/startup-events.json) zachovávají začátek, identitu, renderer, přípravu, chybu a dispose. Nejde o celý JSONL; jeho původní lokální cesta a SHA jsou v [souhrnu](summary.json).

| Pozorování | Výsledek a hranice výkladu |
| --- | --- |
| Inicializace rendereru | WebGPU, bez fallbacku; zaznamenaná inicializace 235,5 ms. Není to celý startup. |
| Síť před chybou | Relace se připojila v 16:07:20.973 UTC, ale v 16:07:27.969 nastalo `network-left` s důvodem `identity-change`. Nepovažovat pokus za stabilní multiplayerové měření. Příčinná vazba na timeout není doložena. |
| Příprava světel | Timeout po 30 051,6 ms aktivního času, paused 0. Jen neúplný Low průchod, fáze vehicle-0 a vehicle-1. |
| Plánování přípravy | 24 RAF ticků za 23 936,4 ms v první fázi, 4 za 5 637,7 ms v druhé. Takto řídké callbacky vyžadují samostatné ověření prostředí. |
| CPU render v přípravě | 7 volání celkem 1 498,3 ms, poté 1 volání 1 490,4 ms. Jde o CPU wall intervaly; nejsou GPU časy ani ustálený herní náklad. |
| Chyba | Pipeline fault „Příprava světel: timeout“, následně startup-error a game-dispose. [Snímek](artifacts/startup-timeout.jpg). |
| Herní benchmarky | 0 platných desetisekundových intervalů, 0 ready startů, 0 připojených SDK spoluhráčů. FPS, p95/p99 a maximální herní interval nejsou k dispozici. |
| Systémový sběr | 292 vzorků po přibližně 2 s; 15 warmup, 277 dalších. Celá karta a systém, nikoli izolovaný výkon hry. Raw zůstává lokálně, v souhrnu je přesný hash. |

V okně renderer-ready → startup-error je 25 systémových vzorků po warmupu: celokaretní GPU vytížení min/medián/max 0/1/10 %, VRAM 623/3385/3504 MiB. NVIDIA vzorek byl při sběru starý 685–1246 ms. Tato data nevylučují krátké špičky a nedokládají příčinu timeoutu. Celý následný sběr měl medián režie loggeru 2,19 % jednoho logického CPU; nejde o nulovou instrumentační režii ani o měření herní spotřeby RAM.

Shaderové a asynchronní pipeline latence ve vybraných událostech se mohou překrývat. Jejich součet nevyjadřuje dobu blokování ani GPU výkon. Vnořené CPU intervaly se také nesčítají. Případný WebGPU main-pass údaj nepokrývá celou GPU práci; tento pokus žádnou ustálenou řadu GPU snímků nedodal.

## Nevyřešená příčina a pokračování

Browserové události uváděly visible/focused. Až po selhání bylo jedno fyzické okno Edge zjištěno jako minimalizované; nebylo spolehlivě ověřeno, že právě ono obsahovalo měřenou kartu v době přípravy. Omezené plánování zakrytého/minimalizovaného okna je tedy **hypotéza**, ne potvrzená příčina. Computer Use při kontrole fyzického okna následně zastavilo ovládání, protože nedokázalo dostatečně spolehlivě určit jeho aktuální URL. Ochrana nebyla obcházena.

Volba další grafické optimalizace z těchto dat by byla předčasná. Před změnou runtime je nutné ověřit skutečné viditelné okno s měřenou kartou, obnovit stejný neměnný build a provést tři nezávislé starty podle [protokolu](measurement-plan.md). Selže-li příprava i v potvrzeném popředí, oddělený CPU profil startupu musí rozlišit čekání mezi RAF, synchronní render a asynchronní kompilaci. Teprve úspěšný startup dovolí plánované tříhráčové scény, B6/vegetaci, auto, svítilnu a Low/High srovnání. Timeout ani readiness guard se kvůli dokončení měření neoslabuje.

Neměnný produkční build byl zvolen proti HMR (mění zdroje za běhu) a kopii projektu (odporuje zadání). Příprava dvojice SDK peers používá běžné session/join/timeline kontrakty, s vlastnictvím room před připojením, timeoutem a abortem; praktický SDK start tohoto nového harnessu ale zůstal neověřený. Změna celého presetu nebo přechod na WebGL2 by nebyly izolovaným důkazem jediné příčiny. V této etapě se proto neprovádí žádný zásah do vzhledu, herní paměti, cache ani lifecycle rendereru.

## Ověření a úklid

- Harness: **7/7 cílených testů PASS**, syntax kontrola, nezávislé čtecí review bez zbývajícího nálezu. [Aktuální testový log](artifacts/harness-tests.log). STOP/SDK join regresní testy jsou syntetické, nenahrazují skutečnou SDK relaci.
- Neměnný Vite produkční build: **PASS**, [log](artifacts/build.log); existující chunk/font/deprecation upozornění zůstala zachovaná. Tento příkaz není nový úplný `pnpm build` s TypeScriptem ani celá testová sada.
- Skutečné API/preview nastartovalo; ukončení přes STOP: `apiExited=true`, `inputsRevalidated=true`, `failure=null`, žádné cleanup chyby. Sampler skončil s `status=stopped`, závěrečným summary a bez cleanup chyb. [Výsledek úklidu](artifacts/cleanup-result.json).
- Při konsolidaci ověřena absence vlastních procesů a volné 2568/4179; 8080 dál naslouchal. Dočasný viewport Edge byl úspěšně resetován a měřicí karta 4179 už nebyla otevřená.
- Nový celý `pnpm test` ani `pnpm test:integration` nebyl spuštěn. Známé předchozí PDF/řadičové nestability se tím nemění; zelená celoprojektová přejímka se netvrdí.

Lokální provozní PID/rezervace ani celý systémový procesní inventář se necommitují. Původní raw soubory zůstávají beze změny v `.cache`; jejich velikosti a SHA, vybrané verzované artefakty a měřicí mezery sjednocuje [summary.json](summary.json). Hlavní profilovací úkol zůstává blokovaný/nedokončený; konsolidace je uzavření dohledatelného checkpointu.

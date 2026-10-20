# StrahovCrazyShow · hratelné demo

[English version](README.md)

Virtuální Strahov v prohlížeči: areál podle doložených podkladů, rekonstruovaný interiér B6, upravitelné postavy, jeden anonymní společný svět, fiktivní akce a společné aktivity. Areál lze procházet také samostatně jako izolovaný host. Není zde přihlášení do IS, ověřování bydliště, heslo ani skutečný studentský profil; přezdívka označuje dočasnou relaci.

Hlavní hra používá samostatné modely budov, vozidel a vegetace. Historický IPR 3D sken zůstává prostorovou referencí v odděleném prohlížeči. Mapy, fotografie, výškopis a modelářské odhady mají různé meze přesnosti; viz [rozcestník dokumentace](docs/README.md) a [Reality Pack](docs/reality-pack/README.md).

## Místní spuštění

Nainstaluj **Git + Git LFS, Node.js 24 a pnpm 11.25.0**. Blender je potřeba jen pro tvorbu modelů. Použij úplný LFS klon:

```powershell
git lfs install
git clone https://github.com/Varnahg/StrahovCrazyShow.git
cd StrahovCrazyShow
git lfs pull
pnpm install --frozen-lockfile
pnpm dev
```

Pokud pnpm chybí, po instalaci Node.js použij `npm install --global pnpm@11.25.0`. V existujícím klonu před instalací/buildem stáhni jeho LFS objekty. GitHub ZIP je nenahrazuje.

`pnpm dev` spustí Vite a multiplayerový/API server. Klient se obvykle otevře na [http://127.0.0.1:5173/](http://127.0.0.1:5173/), `/api` a `/realtime` směřují přes proxy na **127.0.0.1:2567**. Ověř URL vypsanou Vite: při obsazeném 5173 může vybrat jiný port. Jde o vývojové výchozí hodnoty, nikoli tvrzení o běžícím testovacím buildu. Ve sdíleném checkoutu před startem procesů nebo přestavbou hrané verze dodrž [koordinaci agentů](docs/agents/README.md).

Případně spusť `pnpm dev:server` a `pnpm dev:client` v oddělených terminálech. Host se může procházet jen s klientem; aktuální odpověď počasí vyžaduje server. Astronomie, místní mapová data, uložené jízdní řády PID a sólové aktivity jsou nezávislé na multiplayeru.

## Spuštění v Dockeru

S přítomnými Git LFS objekty a běžícím Dockerem pro Linux kontejnery:

```sh
docker compose up -d --build
```

Výchozí adresa je [http://localhost:8080](http://localhost:8080). Jeden kontejner obsluhuje web, API i multiplayer. Grafiku vykresluje prohlížeč hráče; hostitelský Node.js ani serverové GPU nejsou potřeba. Restart vynuluje dočasný svět. Nastavení, logy, aktualizace a HTTPS popisuje [návod pro Docker](docs/deployment/docker.md).

## Hraní

Pro vyzkoušení pohybu a globálního chatu otevři dvě karty s různými přezdívkami a zvol **Vstoupit do společného světa**. Soukromá zpráva vyžaduje přijatý kontakt. Třetí karta s volbou **Prohlédnout si Strahov sám** nesmí dostávat multiplayerové hráče ani zprávy. Všechny multiplayerové relace sdílejí jeden svět; nevznikají skupiny po osmi. Kapacita závisí na změřeném výkonu klienta, serveru a sítě.

Rozhraní i deník podporují češtinu a angličtinu, přepínatelné na úvodní stránce a v Nastavení. Prohlížeč volbu ukládá; poprvé použije podporovaný jazyk prohlížeče, jinak angličtinu. Vlastní jména, chat a texty setkání zůstávají zachované.

| Klávesa / vstup | Funkce |
| --- | --- |
| Krátké levé kliknutí | Výběr postavy/místa; v první osobě zachytit myš |
| Tažení levým či pravým tlačítkem | Otáčení kamery ve třetí osobě / autě |
| W A S D / šipky | Chůze; v autě plyn, brzda/zpátečka a řízení |
| Shift | Běh |
| Mezerník | Skok / ruční brzda auta |
| E | Interakce; nastoupit/vystoupit z auta |
| V | První/třetí osoba; vzdálenost kamery auta |
| F | Svítilna při chůzi |
| M / J | Mapa / deník Strahova |
| G, potom 1–4 | Rychlá gesta |
| R | Bezpečný návrat na start |
| Kolečko myši | Vzdálenost kamery ve třetí osobě |
| Esc | Zavřít menu nebo uvolnit kurzor |

Sdílené auto začíná u startu. S nejprve brzdí a potom couvá; E dovolí vystoupit po zastavení a nalezení volného místa. Odpojení řidiče auto zaparkuje. Řízení je arkádovou interpretací.

Akce a vlastní setkání jsou fiktivní, nejde o skutečný kalendář areálu. NPC cestující, obsazenost parkování a osvětlená okna jsou simulované. PID používá uložený jízdní řád, nikoli živé polohy vozidel. Počasí rozlišuje čerstvou stanici, modelový fallback a zastaralá data; směr větru říká, **odkud** proudí. Astronomie používá skutečný UTC okamžik a souřadnice Strahova.

Vzhled, přezdívka, odměny, nastavení vykreslení, jazyk a čtení deníku zůstávají v tomto prohlížeči. Multiplayerové přihlašovací údaje používají session storage. Server drží relace, kontakty, zprávy, setkání a aktivity v paměti; restart tento stav odstraní. Trvalé účty nejsou zavedené. Uživatelská diagnostika zůstává místní.

## Renderer, ověření a omezení

**Výchozí je WebGL2.** WebGPU je výslovná QA volba na loopbacku (`?renderBackend=webgpu` nebo `webgpu-fast`), bez tichého přepnutí backendu; viz [postup migrace a přejímky](docs/performance/webgpu-migration.md). QA volba není veřejný default ani výsledek měření výkonu.

Klient a server musí mít kompatibilní zdroje: [současný protokol je 11](shared/netcode.ts), společná simulace má **60 Hz** a autoritou je server. Server odesílá pohyb 20 Hz. Po změně společné fyziky/protokolu nasazuj obě strany společně.

```powershell
pnpm check:readme
pnpm test
pnpm build
pnpm test:integration
```

Build kontroluje TypeScript a vytváří klientský `dist`; multiplayerový server nespouští. Integrace sama spustí a ukončí server na **2568**, který musí být volný. Plné ověření/build/integrace ve sdíleném workspace vyžadují [příslušné rezervace](docs/agents/README.md). CI spouští tyto brány spolu s LFS kontrolami; Docker má samostatný harness `pnpm test:docker`. Viz [mapa kódu](docs/agents/architecture.md) a [návod CI](docs/agents/ci.md).

[Přehled ověření](docs/verification.md) eviduje identity zdrojů, skutečné výsledky i historická selhání. D2/P5 a jejich staré adresy náhledů jsou historické checkpointy. Tento návod neurčuje právě běžící testovací build. Každý výsledek platí jen pro zaznamenané source ID a podmínky ověření; úspěch výchozí verze nepotvrzuje pozdější kandidáty.

Fotografická věrnost, všechny povolené interiéry a denní/davový cíl **60 FPS na GeForce GTX 1060** nejsou jako celek přijaté. B6 je doložená rekonstrukce, nikoli zaměřený současný inventář. Další zamýšlené interiéry jsou kolejní bloky, školicí centrum, R-ko a Potraviny; ostatní budovy včetně stadionu mají pouze exteriér. Viz [přejímkový seznam](docs/acceptance.md) a [metodika výkonu](docs/performance/README.md). NullEngine, CPU testy ani jedno číslo HUD nedokládají výkon GPU.

## Podklady a licence

Půdorysy/cesty: **© OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)**. Terén používá ČÚZK DMR 5G; snímky IPR a referenční fotografie mají vlastní atribuce. Souřadnice jsou v metrech, +X východ a +Z jih, počátek 50.08065 N / 14.39175 E. Vykreslení a kolize používají sdílená prostorová data.

Začni v [Reality Packu](docs/reality-pack/README.md), [review budov/modelů](docs/model-review/README.md), [licencích modelů](public/models/README.md), [postavách](docs/characters/student-garments/README.md), [vegetaci](docs/vegetation/realistic-pack.md) a [provenienci PID](docs/transit/README.md). Referenční snímky nejsou volně použitelnými herními texturami. Zveřejnění repozitáře nemění licence třetích stran; vlastní kód projektu zatím nemá samostatně zvolenou open-source licenci.

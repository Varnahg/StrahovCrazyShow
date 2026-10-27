# Předání: home-ai-20261027-client

- Vlastník: `home-ai-client-01a17e9d`; příjemce: koordinátor `/root`, chat `01a17e9d-dd4a-7fe3-91ac-4f3bc548982d`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/clean-home-crazy-typka`, výchozí commit `a0e0e31286ae9521f1282a8bd966b40e8fdad628`.
- Výsledek: samostatné komponenty úvodu, loaderu a AI chatu implementovány a cíleně CPU ověřeny. Zapojení do UI, celková pipeline a vizuální/3D přejímka jsou úkol integrátora. Žádný commit tohoto podagenta.
- Změněné soubory: `client/welcome-screen.tsx`, `client/welcome-screen.css`, `client/startup-progress.ts`, `client/loading-screen.tsx`, `client/crazy-typka.tsx`, `client/crazy-typka.css`, `tests/welcome-screen.test.ts`, `tests/startup-progress.test.ts`, `tests/crazy-typka-ui.test.ts`, toto předání a `.cache/home-ai-20261027-client/`.
- Cizí WIP: žádný převzatý. Root research/spec/task soubory a server/shared změny jiného agenta byly pouze čtené. `ui.tsx`, i18n, AvatarEditor, Game ani závislosti nebyly změněny.
- Podklady: specifikace KEY-63/64 v `_bmad-output/implementation-artifacts/home-ai-20261027/`, `docs/home-ai/20261027/research.md`, čtecí audit výchozího main. Uživatelské povolení souhrnného online počtu je zaznamenáno v research dokumentu. API potvrzeno s agentem `audit_rag` a validováno přes `shared/crazy-typka.ts`.

## Veřejné props a zapojení

`WelcomeScreen` přijímá:

```ts
{
  profile: Profile;
  onChange: (profile: Profile) => void;
  enter: (mode: "guest" | "multi") => void;
  busy: boolean;
  error?: string;
  locale: "cs" | "en";
  editor: ReactNode;
  map: ReactNode;
  language: ReactNode;
  feedback: ReactNode;
  assistant?: ReactNode;
  presence?: PublicPresenceState;
}
```

`presence` je volitelný externí snapshot; bez něj komponenta vlastní GET `/api/presence` polling. Všechny ostatní sloty jsou pasivní ReactNode. `assistant` není import z AI modulu, proto lze úvod commitnout odděleně. Feedback dialog nepatří do `feedback` tlačítkového slotu: může zůstat vedle komponenty v React fragmentu. Editor se před otevřením skutečně nemountuje, tedy nevytváří 3D preview. Primární přezdívka zůstává na úvodu; existující `.ae-nickname` uvnitř otevřeného editoru je v tomto kontextu CSS skrytá.

`LoadingScreen` props: `{stage:string, locale:"cs"|"en", error?:string, onLeave:()=>void, onFeedback:()=>void}`. Import CSS `./welcome-screen.css` provede integrátor v UI. Komponenty CSS samy neimportují kvůli Node SSR testům. Pro novou startup generaci/fallback použít nový React `key`, aby začal nový monotonic elapsed čas.

`observeStartupProgress(canvas,onStage)` sleduje pouze `data-boot-stage` dané canvas a vrací cleanup. Integrátor ho zavolá před konstrukcí Game; při odchodu/chybě/ready nebo výměně canvasu volá cleanup. UI vlastní fáze jsou `import`, `renderer`, `renderer-fallback`, `world-construction`. Když fáze ještě chybí, observer nevymýšlí stav. Známé Game fáze se mapují na srozumitelné CZ/EN popisky; unknown/prototype názvy mají bezpečný fallback. `ready` je jen popisek: původní Game/render-health gate zůstává jediným zdrojem připravenosti.

AI integrace:

```tsx
const ai = useCrazyTypka(); // jediný hook v App, mimo menu/game větvení
const aiWidget = <CrazyTypkaChat state={ai} locale={locale} />;
```

Na úvodu použít `assistant={aiWidget}`, ve hře vlastní AI kanál/panel s tímtéž `state`. Importovat `./crazy-typka.css` v integračním UI. Hook automaticky volá pouze bezplatný lokální status GET. Session ani chat nevznikají před explicitním submit. Náhodný token je pouze v closure klienta, nikdy ve snapshotu/stavu JSX, URL nebo storage. Draft i zprávy přežijí přechod mezi menu a hrou, protože vlastníkem je App. Nepropojovat s `Player`, `ChatMessage` nebo lidským multiplayerem.

`useCrazyTypka` vrací `availability`, `busy`, `draft`, `messages`, `error`, `setDraft`, `send(locale)`, `reset()`, `cancel()`, `refreshStatus()`. Reset/cancel smažou lokální obsah, invalidují starou generaci a DELETE revoke serverovou relaci. Tlačítko při práci výslovně říká „Zastavit a smazat konverzaci“. Pokud DELETE selže, UI netvrdí potvrzené smazání na serveru. App unmount dispose také ruší probíhající dotazy a provede best-effort revoke. Ztracená session odpověď může zanechat serverovou relaci do TTL; žádný nulový retention slib se nepoužívá.

## Refaktoring a lifecycle

- Jediný presence poller bez překryvů, timeout 5 s, interval 30 s, skrytá stránka nepolluje; cleanup ruší timer, request i listener. Abort/pozdní výsledek po odchodu nemění nový režim. Neúspěch je „nedostupné“, nikoli 0.
- Startup observer deduplikuje změny a ignoruje queued callback po cleanupu; timer používá `performance.now()` a končí při chybě/ready/unmount.
- AI controller odděluje transport/lifecycle od obou pohledů a používá sdílené validátory, maximální délku i zdrojové typy. Neprovádí automatický placený retry, souběžný send ani klientské role/history. Paměť UI je omezená na 40 zpráv; server vlastní kratší kontext.
- AI text zůstává React plain text. Každá odpověď nese AI badge, citace mají ověřené HTTPS URL, datum kontroly, autora/licenci a označení parafráze. Uživatelské/zdrojové texty se nepřekládají ani neinterpretují jako HTML.
- Auto-scroll sleduje nové zprávy jen tehdy, když uživatel předtím četl konec konverzace.

## Ověření

27. 10. 2026, dokončení cca 20:04 Europe/Prague:

- `node --import tsx --test tests/welcome-screen.test.ts tests/startup-progress.test.ts tests/crazy-typka-ui.test.ts`: **20/20 PASS**, exit 0; `.cache/home-ai-20261027-client/targeted-tests-final.log`. Pokrývá odložený editor, CZ/EN SSR, dostupnost/0/invalid count, abort/late response, hidden polling, observer generations, unknown stage, chybu loaderu, žádné placené automatické volání, token-only API, reset a pozdní session/odpověď, timeout, nepotvrzené serverové smazání, neplatnou citaci, escapování, AI badge a starý status callback.
- Cílený `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --esModuleInterop --lib ES2022,DOM,DOM.Iterable --types node,vite/client` nad čtyřmi novými TS/TSX moduly a třemi testy: **PASS**, exit 0, `.cache/home-ai-20261027-client/targeted-types-final.log`.
- První runtime běh: 11 PASS a jeden neotevřený testový soubor kvůli chybnému importu `DEFAULT_PROFILE` z profile místo types; opraveno. První targeted tsc našel widenovaný literal `role` a testové DOM stub casty; opraveno, původní log zachován v `targeted-types-first.log`. Meziběh 18/18 je v `targeted-tests.log`.
- Manifest SHA-256 všech devíti vlastních zdrojových/testových souborů: `.cache/home-ai-20261027-client/files.sha256.json`. Zahrnuje testy. Není to hash celého pracovního stromu.
- Žádný port, herní proces, GPU, build, plná sada ani placený endpoint nebyl spuštěn. Příkazy doběhly; závislosti read-only junction nezměněny.

## Omezení a další krok

Ještě není potvrzeno skutečné browserové rozložení, fokus a malé rozlišení ani průchod reálným Game startupem. SSR/CPU není vizuální nebo GPU důkaz. Integrátor musí zapojit UI, endpoint, původní health gate a provést dohodnuté praktické kontroly. Zrychlení startu se netvrdí: synchronní buildWorld může blokovat UI stejně jako dříve. Kvalita živých OpenAI odpovědí nebyla ověřena.

Rezervace: po tomto předání bude uvolněna CLI, bez živých procesů. Příjemce přebírá přesné nové soubory výše; neznamená to přijetí celé funkce ani volný neznámý WIP. Stav tasku a integraci mění root.

## Dodatek: potvrzované doručení a obnovení odpovědi

Etapa 27. 10. 2026, dokončena přibližně 23:54 Europe/Prague. Vlastník `home-ai-client-refine-01a17e9d`, příjemce `/root`; stejná pracovní kopie a větev, výchozí HEAD `17e811ed43480a67b4f2c90f5d667f116403a330`. Čisté klientské soubory výslovně předal root v `docs/home-ai/20261027/adoption.md`. Claim získán před zápisem; žádný cizí WIP převzatý. Rootovy mezitím integrované composer/fokus opravy, expiry notice a všechny dosavadní testy zůstaly zachované.

Přesný změnový rozsah této etapy: `client/crazy-typka.tsx`, `client/crazy-typka.css`, `tests/crazy-typka-ui.test.ts`, tento dodatek a nové `.cache/home-ai-20261027-client/refinement-*`. Žádné změny `ui.tsx`, shared/server nebo soukromé konfigurace. Bez commitu.

### Chování a integrační kontrakt

- Klient posílá `requestSeq` od 1 v každé AI session. `nextRequestSeq`, přesný pending payload `(requestSeq,message,locale,token)` i token zůstávají pouze v closure. Snapshot neobsahuje číslo operace, token ani transportní payload; v logu je obvyklý zobrazený uživatelský text.
- Doručení ověřují serverovým agentem přidané `isCrazyTypkaChatResponse` a `isCrazyTypkaErrorResponse`. Pořadí postupuje jen po validní terminální odpovědi/chybě s přesnou shodou `requestSeq`. Chybějící/nesouhlasné potvrzení, nečitelný body nebo transportní chyba zachovají tutéž pending operaci.
- `useCrazyTypka()` má navíc `recovery: "none" | "retry" | "reset"` a `retry(): Promise<void>`. App zapojení se nemění, pokud předává celý hook state. `retry()` nemá locale/text argument: explicitní „Obnovit odpověď“ odešle byte-identický payload ve stejné session. Nezaloží další user log entry, nesmaže další rozepsanou otázku a nepřevezme nově zvolený jazyk. Žádný automatický replay ani nová placená send smyčka.
- Nový send je během nevyřešeného doručení blokovaný i uvnitř controlleru. Textarea dál přijímá další draft. Obnovovací tlačítko vrací fokus do composeru stejně jako původní nabídky/send/reset.
- Nepotvrzené pending `busy` a admission chyby nabízejí obnovení téže operace. `request-conflict` a `request-out-of-order` vyžadují explicitní reset; klient nehádá nové číslo. Potvrzené `response-expired` ukončí původní operaci bez zobrazení staré odpovědi a dovolí další vědomý dotaz s následujícím číslem.
- Expirace zjištěná na request/retry/response hranici, reset a dispose zruší pending a číslování; nová session začíná od 1. Pozdní session je revokována a pozdní reply staré generace nemůže obnovit obsah nové konverzace. Expiry notice zůstává viditelný při novém začátku.
- Privacy text nyní pravdivě uvádí „Zprávy a kontext této konverzace může zpracovat OpenAI“, aby pokrýval místní první pozdrav i jeho možné pozdější zahrnutí do serverové historie. Žádné nízkoúrovňové číslování ani modelové detaily se uživateli nevypisují.

### Refaktoring a ověření této etapy

Odeslání a obnovení sdílejí jedinou funkci `perform` s timeoutem, validací potvrzení a cleanupem. `forgetSession` sjednocuje invalidaci pending pořadí, `confirm` má jediné místo pro jeho posun. Formatter byl spuštěn pouze nad třemi vlastními změněnými soubory.

- První cílený běh AI: **29/29 PASS**, scoped tsc **PASS**, logy `refinement-tests-1.log` a `refinement-types-1.log`.
- Finální `node --import tsx --test tests/crazy-typka-ui.test.ts tests/welcome-screen.test.ts tests/startup-progress.test.ts`: **43/43 PASS** (31 AI + 12 stávajících home/loader), exit 0, `refinement-tests-final.log`.
- Cílený `tsc --noEmit` se stejnými explicitními ES2022/Bundler/React/strict volbami jako výše nad `client/crazy-typka.tsx` a `tests/crazy-typka-ui.test.ts`: **PASS**, exit 0, `refinement-types-final.log`.
- `git diff --check -- client/crazy-typka.tsx client/crazy-typka.css tests/crazy-typka-ui.test.ts`: **PASS**.
- Nové testy pokrývají ztracenou odpověď, přesný replay po změně jazyka/draftu, potvrzené chyby včetně pozdě doručené cached chyby, pending busy/admission, malformed/missing/wrong-seq odpovědi, konflikty/pořadí, místní/serverovou expiraci, reset/dispose při pending recovery, pozdní odpověď po expiraci a nejistou tvorbu session. Původní focus/composer, transparentnost, zdroje, session a abort testy zůstaly.
- SHA-256 manifest tří souborů včetně testů: `.cache/home-ai-20261027-client/refinement-files.sha256.json`. Původní logy a manifesty nebyly přepsány.

Všechny HTTP odpovědi v testech byly injektované fake fetch; žádný server, port, OpenAI klíč/endpoint, build, celá sada ani GPU této etapě neběžely. Žádný vlastní proces nezůstává. Browserovou přejímku nového retry/fokusu musí dokončit root; CPU/SSR ji nenahrazují. Po tomto předání podagent uvolní claim a root přebírá pouze uvedený konkrétní diff.

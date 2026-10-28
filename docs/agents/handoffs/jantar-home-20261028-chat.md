# Předání: jantar-home-20261028-chat

- Vlastník: `jantar-chat-01a17fd8`; příjemce: koordinátor `/root` chatu `01a17fd8-017a-7852-87f9-cd1538e1bde2`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`, větev `codex/jantar-home`. Výchozí HEAD pro porovnání: `e09d60fa24419a93b26f15e21c862e95e44aff2f`; přijatý main podkladu `de6f87a2efbf8596bb03efae863e8d6763e22774`.
- Výsledek: volitelná kompaktní prezentace implementována, cíleně refaktorována a CPU ověřena. Výchozí herní pohled je zachovaný. Bez vlastního commitu nebo změny stavu tasku.
- Změněné soubory: `client/crazy-typka.tsx`, `client/crazy-typka.css`, nový `tests/crazy-typka-compact.test.ts`, toto předání a vlastní ignorované výstupy `.cache/jantar-home-20261028-chat/`.
- Cizí WIP: žádný převzatý. `tests/crazy-typka-ui.test.ts` byl pouze čtený a spuštěný; patří RAG práci. Žádné změny UI entrypointu, serveru, shared kontraktu, assetů, manifestu/lockfile, rendereru ani avatar editoru.
- Podklady: aktuální AGENTS/policy a `_bmad-output/implementation-artifacts/jantar-home-20261028/SPEC.md`, přímé zadání koordinátora, stávající klientský store/hook a jeho regresní testy. Portrét `/ui/crazy-typka.svg` poskytuje samostatný task assets; soubor při předání existuje.

## Rozhodnutí a integrační rozhraní

CSS-only zmenšení by nechalo dlouhé disclosure bloky a neposkytlo menší přístupný composer. Samostatný druhý chat by duplikoval transport a jeho lifecycle. Zvolen opt-in render stávající komponenty: `variant?: "default" | "compact"`, výchozí `"default"`.

```tsx
<CrazyTypkaChat state={ai} locale={locale} variant="compact" />
```

Jde stále o tentýž App-owned `ai` stav. Komponenta nepřidává klienta, relaci, request, timer nebo storage. Úvod vlastní launcher, otevření a zavření popupu. Zavření nesmí volat `reset`, `cancel` či `dispose`; vstup do hry může widget odmountovat a následný herní pohled použije tentýž App store.

Compact má kořen `crazy-chat crazy-compact`. Hlavička obsahuje skutečný lokální portrét a AI badge; `padding-right: 40px` rezervuje místo pro vnější close tlačítko rodiče. Výchozí podtitulek se v kompaktním pohledu nevypisuje. Native `<details className="crazy-privacy">` uchovává celý původní text o fiktivní identitě, OpenAI, soukromí, heslech/osobních údajích a omezené relaci. Viditelný hint pod composerem navíc uvádí zpracování OpenAI a původní upozornění na chybovost/citované podklady.

Zachované jsou availability/check-again, notices/expiry, všechny chyby, pending/retry/reset/cancel, citace s HTTPS validací a proveniencí, escapování a původní pravidla editovatelnosti textarea. Kompaktní odeslání je ikonové s CZ/EN `aria-label`; textarea má stále skutečný label, jednořádkový výchozí rozměr a možnost zvětšení. Klávesa Enter si zachovává dosavadní víceřádkovou textarea sémantiku.

CSS je výhradně pod `.crazy-compact`; běžná herní varianta se nerebarví. Dědí `--home-text`, `--home-muted`, `--home-accent`, `--home-button-ink`, `--home-tint` a `--home-panel`, s Jantar fallbacky. Bubliny AI/uživatele jsou rozlišené polohou i tvarem, citace zůstávají v rozbalovacím detailu zprávy. Rodič vlastní rozměr a případný vnější scroll popupu; message log má bounded vnitřní scroll.

## Refaktoring, cache a lifecycle

Původní dva privacy odstavce jsou jeden společný JSX fragment používaný oběma prezentacemi. Není zduplikovaná textová pravda. Store, `useCrazyTypka`, transport i error formatter před `CrazyTypkaChat` zůstaly shodné s výchozím HEAD po normalizaci konců řádků. Žádný nový cache nebo lifecycle controller nevznikl. Zachované jsou composer refs/fokus a auto-scroll respektující čtení starších zpráv.

## Skutečné ověření

Dokončeno 28. 10. 2026 přibližně 12:49 Europe/Prague (11:49 UTC).

- `node --import tsx --test tests/crazy-typka-compact.test.ts tests/crazy-typka-ui.test.ts`: **39/39 PASS**, exit 0; 8 nových compact případů + 31 stávajících AI UI/transport regresí. Log `.cache/jantar-home-20261028-chat/targeted-tests-final.log`.
- Scoped `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --esModuleInterop --skipLibCheck --lib ES2022,DOM,DOM.Iterable --types node,vite/client client/crazy-typka.tsx tests/crazy-typka-compact.test.ts`: **PASS**, exit 0; `targeted-types-final.log`.
- `node --import tsx .cache/jantar-home-20261028-chat/compare-default.tsx`: **16/16 výchozích renderů identických s HEAD baseline**, oba jazyky, empty/reply/busy/disabled/error/retry/reset/expiry. Log `default-markup-comparison-final.log`. `prepare-baseline.mjs` také ověřil nezměněný prefix store/hook/transportu.
- `node node_modules/prettier/bin/prettier.cjs --check client/crazy-typka.tsx client/crazy-typka.css tests/crazy-typka-compact.test.ts`: **PASS**, exit 0; `format-check.log`.
- `git diff --check -- client/crazy-typka.tsx client/crazy-typka.css tests/crazy-typka-compact.test.ts`: **PASS**.
- SHA-256 manifest tří vlastních zdrojových/testových souborů: `.cache/jantar-home-20261028-chat/files.sha256.json`; obsahuje nový test. Není to hash celé hry.

První cílený běh také prošel 39/39 (`targeted-tests-first.log`). První pomocný baseline compare selhal na chybějícím explicitním React importu v ignorovaném cache modulu s jinou JSX transformací; opraven pouze cache helper, původní selhání zůstalo v `default-markup-comparison.log`. Produkční kód se kvůli tomu neměnil. Pnpm ani instalace balíků nebyly tímto taskem použity.

## Omezení a převzetí

Testy používají SSR a fake transport stávajících regresí. Žádný server, GPU, hra, build, celá testovací sada, skutečný provider nebo port této etapě neběžel. Browserové rozměry, ořezávání, rodičovské close/Escape/fokus a menu → hra → menu musí ověřit integrátor ve společné produkční přejímce; CPU/SSR je nenahrazují.

Výslovně předávám uvedené vlastní dirty soubory koordinátorovi `/root` k integraci. Žádný jiný dirty soubor nepředávám. Po předání bude uvolněn claim `jantar-home-20261028-chat`; žádný vlastní pomocný proces nezůstává. Integrátor přijímá výsledek, integruje `variant="compact"` v menu a ponechá in-game volání bez varianty; stav tasku mění až on.

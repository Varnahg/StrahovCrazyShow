# Předání: rag-vector-20261028-embeddings

- Vlastník: `rag-embeddings-01a17e9d` (`/root/final_edges`); příjemci `/root`, store `/root/audit_rag` a runtime `/root/audit_security`.
- Cwd `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/rag-sources-sh-suz`, výchozí HEAD `986ab3d82caf0ebf0297d3a684caa42ad22f2359`.
- Výsledek: dokončený samostatný embedding adapter podle finálního vector-contract, ověřený fake transportem a scoped TypeScriptem. Není to potvrzení živé OpenAI/DB pipeline ani integrace.
- Před zápisem načteny aktuální AGENTS, BMAD policy, source-contract, vector-contract a task. Ověřeny git status/worktree list/registry; získán vlastní disjunktní claim. Cizí runtime, package/lock, katalog, research a validation WIP se nepřebíraly ani neměnily.

## Soubory a API

- `server/rag-embeddings.ts`
- `tests/rag-embeddings.test.ts`
- `docs/home-ai/20261028/embeddings/adapter.md`
- `docs/agents/handoffs/rag-vector-20261028-embeddings.md`

Všechny exporty/signatury z kontraktu zachovány: `EmbeddingProfile`, `createEmbeddingProfile`, `documentEmbeddingInput`, `embeddingInputHash`, `EmbeddingResult`, `Embedder`, `createOpenAIEmbedder`. Navíc export `EmbeddingError` a `EmbeddingErrorCode` pro bezpečné mapování chyb. Oba integrátoři byli informováni po úplném zápisu API a po úspěšných testech.

Profil a vstupní hash jsou deterministické a nezahrnují metadata kontrolních dat. Default small/1536; explicitní large bez rozměru používá 3072. Profil přijatý z DB se validuje včetně ID; podporovány oba ověřené v3 modely. Cache musí kombinovat profil a input hash. Adapter nezná DB, revize ani importní retry politiku.

Limity: batch 32; vstup 8191 UTF-8 bajtů; batch text 64 KiB; request 128 KiB; response 4 MiB. Velikostní overrides jen snižují stropy. Timeout default 20 s, maximálně 60 s. `user` nejvýše 128 UTF-8 bajtů. Vektory se kontrolují na model, úplné unikátní indexy, počet, dimenzi, finite komponenty a nenulovou jednotkovou normu s tolerancí 1e-3; vracejí se seřazené.

`onAttempt` je synchronní, přesně jednou po lokální validaci před fetch. Caller budget výjimka zůstává identická; není převáděna na upstream chybu. Modul nevrací rezervovaný rozpočet při timeoutu/abortu a neposkytuje smyčku retry. Volající musí evidovat nejisté výsledky a nebrat chybějící usage jako nulu. Adapter vrací validní usage jen s úplně validní odpovědí; žádný text nebo klíč neloguje.

## Refaktoring a podklady

Volba samostatného bounded fetch modulu proti SDK nebo přimíchání do chat provideru je doložena v `adapter.md` s oficiálními primárními odkazy. Sdíleny lokální validátory profilu, vstupů/limitů, response a abortable wrapper. Žádná změna vzhledu hry, kurátorovaných textů, jiného provideru ani SQL.

Vstupy a config se zachytí před async prací, aby změna caller pole neovlivnila transportní payload nebo očekávaný počet odpovědí. Buffer roste omezeně místo hromadění všech stream chunků. Cleanup odpojuje timer/listener a ruší reader; pozdní fetch response se zruší i při ignorovaném AbortSignal. Deadline se kontroluje také během dočítání, aby jej neobešel stream okamžitých mikroúloh. Nezavedeny perzistentní cache ani nové závislosti.

## Skutečné ověření

28. 10. 2026, pouze vlastní cílené CPU kontroly:

- První `node --import tsx --test tests/rag-embeddings.test.ts`: **39/39 PASS**, exit 0; `.cache/rag-vector-20261028-embeddings/tests-initial.log`.
- Doplněny sparse inputs, invalid fetch config a production dimension/split-body případy. Finální stejný testový příkaz: **40/40 PASS**, exit 0, 697 ms; `tests-final.log`.
- `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --resolveJsonModule --esModuleInterop --strict --skipLibCheck --types node server/rag-embeddings.ts tests/rag-embeddings.test.ts`: **PASS**, exit 0 bez diagnostiky; `types-initial.log` a finální `types-final.log`.
- Prettier pouze nad dvěma vlastními TS soubory, exit 0. Žádné formátování cizího stromu.
- `git diff --check` nad vlastními cestami: exit 0; jde o nové nestagované soubory, takže rozhodující obsahové důkazy jsou vykonané testy a scoped tsc.

Testová matice zahrnuje přesné model/profile/input hash, změnu title/locator/text versus checkedAt, neplatné/null profily, nesouhlasný model, chybné/duplicitní indexy, dimenze, nulové/neunit/overflow vektory, malformed usage, UTF-8 včetně českých a CJK/emoji dotazů, celkové body limity, chyby HTTP/transportu, budget odmítnutí, timeout fetch/body, pre-abort, abort během čekání, odstranění listenerů a pozdní response cancel. Nespouštějí skutečnou síť.

Manifest všech čtyř souborů včetně testu a evidence je `.cache/rag-vector-20261028-embeddings/manifest.json`; finální SHA-256 manifestu bude předán koordinátorovi. Žádný commit ani staging.

## Hranice přejímky a procesy

Neověřeny skutečný OpenAI účet/model, síťová latence, účtované usage, český recall, SQL integrace ani relevance threshold. Bez reálného klíče, placených API, DB, full suite, buildu, serveru, GPU, scheduleru nebo dalších agentů. Toleranci normy a velikostní limity dokumentujeme jako aplikační rozhodnutí, nikoli měřenou retrieval kvalitu.

Všechny vlastní krátké procesy skončily; žádný port ani dlouhožijící proces nezůstává. Po předání bude claim uvolněn. Release neznamená Done: koordinátor převezme přesný scope, provede integrační review a společné kontroly, aktualizuje Linear/task a integruje samostatný commit. Hraný snapshot se neměnil.

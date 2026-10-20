# Předání: global-refactor-autodev-source-20261020

- Vlastník: `refactor-01a15658-autodev-source`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`; výchozí commit tohoto tasku `53d608113b6e8dbafaebf6fd6a0e4661b1f8f806`.
- Stav: implementace, cílený refaktoring i finální přidělená CPU sada dokončeny, připraveno k nezávislému review a integraci. Žádný staging ani commit.
- Změněné soubory: `scripts/autodev/adapters.mjs`, nový `scripts/autodev/source.mjs`, `tests/autodev-adapters.test.ts` a toto předání.
- Cizí WIP: při zahájení existovaly změny dokumentace, avatarů/assets a podkladů koordinátora a již předaný quaternion scope. Vlastní writePaths byly čisté; nic cizího nebylo převzato či upraveno. Quaternion scope zůstává po předchozím předání beze změny. Žádný staging/commit.
- Rezervace: read-only kontrola společného registru neprokázala kolizi; claim uspěl 20. 10. 2026 v 07:05:23 UTC. Heartbeat byl obnoven během sériového testování.

## Průzkum a volba

Primární podklady z 20. 10. 2026: skutečný zdroj `adapters.mjs`, celý přesouvaný blok, zbývající volání jeho helperů, importy `github.mjs`/`store.mjs`/`linear.mjs`/`codex.mjs`, dynamický import adaptéru v `engine.mjs`, veřejný launcher `scripts/autodev.mjs`, odpovídající source/stage/recovery testy. Kontext a oprávnění: task JSON a `spec-maintenance.md`; projektová pravidla a BMAD policy byly již výslovně načteny pro předchozí úkol této relace. Rekurzivní BMAD se nespouštěl.

Blok původních řádků 424–705 obsahuje osm veřejných funkcí pro scope, bezpečné cesty, dirty/ignored/working snapshoty a identitu zdrojů. Mimo blok zůstávají volání `slash`, `overlap`, `git`, `nul`, `samePath`: claim identita a kolize, amendment temp identity, evidenční cesty, zjištění HEAD a explicitní Git staging. Zbylý adaptér nadále potřebuje `createHash`, `lstat`, `readFile` a `realpath`, proto nebyly odstraněny. `createReadStream`, `execFile`, `promisify` a `execFileAsync` patří nově do source modulu. Původní kontrola `assertStageScope` měla stejné inScope/chybové větve pro změnu kanonické hodnoty a pro existenci klíče.

Varianty: ponechat soudržný blok v rozsáhlém adaptéru znamená zachovat smíšené odpovědnosti; široké dělení recovery state machine by měnilo výrazně více hranic a nebylo přidělené. Zvolen úzký přesun skutečného bloku do `source.mjs`, beze změny jeho algoritmů, Git voleb, digestů nebo chyb. Pět interních helperů se exportuje pouze z interního source modulu pro potřeby adaptéru; `normal` a `hashFile` zůstávají soukromé. Žádné nové závislosti, cache, sdílený mutovatelný stav, síťové volání nebo persistentní proces při importu.

Jediná logická úprava slučuje dvě shodné větve `assertStageScope` do podmínky `(canonical-value-diff || own-key-diff) && !inScope`. Kanonizace obou hodnot zůstává před kontrolou existence a scope; absence a explicitní null jsou stále různé. Zachováno pořadí unie klíčů a původní `STAGE_SCOPE` text. Porovnání se týká běžných snapshot map používaných produkcí; nepřidává se obecná nová specifikace pro Proxy/gettery s vedlejšími efekty. `inScope` se při obou rozdílech nyní vyhodnotí jednou. Není přidána žádná bezpečnostní výjimka či změna autorizace.

Lifecycle: `execFileAsync` zůstává jednou při inicializaci vytvořená funkce; streamy v `hashFile` se nadále vytvářejí a dokončují v původním for-await průchodu. Reexporty zachovávají identitu funkcí, nevznikly wrappery. Přínosem je vlastnictví odpovědnosti; žádné měřené zrychlení hry či řadiče se netvrdí.

## Exporty a import graf

Původní i nový skutečný namespace `adapters` má přesně následujících **11 jmen**, bez přidaného nebo odebraného exportu:

```text
assertStageScope
auditScope
createAdapter
ignoredSnapshot
inScope
parseDirty
reconcileSpecification
safePath
sourceIdentity
workingSnapshot
writeSpecification
```

Osm source funkcí je importováno a reexportováno se stejnou referenční identitou: `inScope`, `parseDirty`, `safePath`, `ignoredSnapshot`, `auditScope`, `workingSnapshot`, `assertStageScope`, `sourceIdentity`. Interní `source` navíc exportuje pouze `slash`, `overlap`, `git`, `nul`, `samePath`; `normal` a `hashFile` nejsou exporty. Veřejný CLI, protokol, auth, recovery ani stavové formáty se neměnily.

Statický graf místních importů ověřen přes AST:

```text
adapters -> store, github, linear, source, codex
source   -> store, github
github   -> store
linear   -> store
codex    -> store
store    -> žádný místní modul
```

Žádný cyklus ani zpětný import do `adapters`. `engine` si zachovává svůj původní dynamický import adaptéru.

## Ověření

- Výchozí namespace zachycen před změnami dynamickým importem: výše uvedených 11 jmen.
- Výchozí čtyři source/scope regrese bez escalace: příkaz `node --import tsx --test --test-name-pattern='source identity is invariant|ignored audit detects|stage audit rejects|scope guards reject' tests/autodev-adapters.test.ts`, exit 1, 0 PASS / 4 FAIL, 1709.3062 ms. Všechny selhaly při `git init` vlastního dočasného repozitáře ještě před změnami kódu: `could not write config file .../autodev-adapters-<unique>/repo/.git/config: Permission denied`, `could not set core.repositoryformatversion to 0`. Žádná produktová chyba se z toho nevyvozovala.
- Stejný výchozí příkaz v povoleném nesandboxovaném běhu: exit 0, **4 PASS / 0 FAIL / 0 SKIP**, 10763.5122 ms. Fixtures zůstaly sériové a jejich původní cleanup odstranil pouze vlastní temp adresáře. Žádný testový limit se nezměnil.
- AST porovnání s přímo načteným `git show 53d608113b6e8dbafaebf6fd6a0e4661b1f8f806:scripts/autodev/adapters.mjs`: **14 přesunutých deklarací textově přesně shodných**, s výjimkou úmyslně sloučeného `assertStageScope`; odečten je pouze nově přidaný export modifier interních helperů. **Všech 12 zbývajících deklarací adaptéru, včetně celého createAdapter a recovery řetězce, textově shodných.** Namespace a osm reexportovaných referencí přesně shodné, privátnost normal/hashFile a acyklický graf ověřeny. Exit 0.
- Skutečný původní `assertStageScope`, `inScope`, `normal`, `slash` vybrán AST z výchozího commitu a vykonán ve VM s původními `canonicalJson` a `problem`. Pro 10 map před/po a 5 allowed seznamů **500 porovnání výstupu nebo error code/message PASS**. Zahrnuto: absence, explicitní null/undefined, stejné/different sha256, pořadí klíčů, neplatný JSON, více vlastníků a case-insensitive scope hranice. Nejde o ruční kopii algoritmu do testu.
- Přidány pouze dva chybějící trvalé kontrakty: přesný veřejný export surface a kanonická ekvivalence/odstranění explicitního null/původní pořadí `INVALID_JSON` před scope odmítnutím. Stávající testy nadále pokrývají invariant digestu po add/commit, nové testy/smazání/mód souboru, ignored edits, controller evidence, junction escape, rename cesty a recovery chování.
- Finální task příkaz: `node --import tsx --test tests/autodev-adapters.test.ts` (jeden běh, subprocess fixtures sériově, povolený zápis vlastních temp .git), 20. 10. 2026 přibližně 07:08–07:37 UTC. Exit 0, **102 PASS / 0 FAIL / 0 SKIP**, Node duration **1702027.4442 ms**. Existující native kill/recovery scénáře dominují trvání; limity nebyly upraveny. Diagnostiky `controlled fixture failure` a `diagnostic české selhání` jsou očekávanou součástí úspěšných negativních testů, nikoli selháním sady. Kompaktní konečný stdout:

  ```text
  tests 102
  suites 0
  pass 102
  fail 0
  cancelled 0
  skipped 0
  todo 0
  duration_ms 1702027.4442
  ```
- `git diff --check -- scripts/autodev/adapters.mjs tests/autodev-adapters.test.ts`: exit 0.

## Identita payloadu

Manifest obsahuje zdroje a testy včetně nového untracked modulu; toto sebereferenční předání je mimo manifest. SHA-256 `JSON.stringify` pole objektů `{path,sha256}` v následujícím pořadí: `0415dc51577a163e2cc7d94a546fe6cc6f9ce911d558b45f767022cb121fef17`.

| Soubor | SHA-256 |
| --- | --- |
| scripts/autodev/adapters.mjs | f0f2c6c4a1a2f6d0276792b8a442f93f89edf30e109fbfd434bd9dcb3282263b |
| scripts/autodev/source.mjs | bce4349af29188a64e25b64f92c463c997b8637ac104108a5133b512b3aa4cd3 |
| tests/autodev-adapters.test.ts | 1570792a7f7866a200f95c882c3f86c4b074298647a2cf20bf8616d1375d47fc |

## Procesy, limity a převzetí

Procesy: přidělený foreground Node test runner skončil s exit 0, stejně jako výchozí testy, AST/VM kontroly a ostatní vlastní CLI. Fixtures používaly jedinečné `autodev-adapters-*` temp repozitáře a svůj původní `t.after` cleanup. Read-only CIM kontrola 20. 10. 2026 v 07:37:36 UTC potvrdila **0 běžících node.exe procesů s autodev-adapters-* fixture cestou**; nic nebylo zabíjeno. CIM kontrola vyžadovala stejný povolený nesandboxovaný přístup, protože sandbox CIM odmítl. Žádný produkční server, hra, GPU, Blender ani externí GitHub/Linear zprávy se nespouštěly. Nezůstávají žádné vlastní procesy ani porty.

Plná repo sada, build, integrace a skutečná produkční přejímka nejsou v tomto tasku a neběžely. Integrovaný CLI nebo síťový pilot nebyl proveden; změna nepřiděluje oprávnění k externím akcím. CPU důkazy se nevydávají za GPU výkon. Finální nezávislé review, změna task stavu, společná verification evidence a samostatný commit/integrace patří příjemci `refactor-01a15658-audit`.

Finální předání je připravené k doručení příjemci. Následuje standardní CLI release; jeho skutečný výsledek a čas potvrdí závěrečná zpráva a společný registr. Po uvolnění se do scope již nebude zapisovat. Necommitnuté změny zůstávají výslovně předaným výsledkem tohoto tasku.

## Doplnění integrátora po review

Příjemce refactor-01a15658-audit po novémclaimu odstranil pouze nadbytečný prázdný EOF řádek v novém source.mjs, který původní unstaged gitdiffcheck neviděl. Před/po SHA a totožný TypeScriptprinted JS AST: post-review-hygiene.json v artefaktechKEY48. Žádný executabletoken, funkce, export nebo testovýkontrakt se nezměnil. Node syntax a stagedwhitespacecheck následují; plná finálnísada poběží nad novým immutablecheckpointem. Původní per-cell handoffhash je časový checkpoint před touto zdokumentovanou hygienou a bindingcleanup.

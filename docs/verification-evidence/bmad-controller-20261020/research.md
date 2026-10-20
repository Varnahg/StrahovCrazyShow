# Výzkum řadiče KEY-46

Datum 20.10.2026, přijatý základ `ceddc0802cd98dccfbee9d44fc00d6331ac9d749`. Žádné změny herního runtime; 134 cizích dirty cest v primárním checkoutu se nepřebírá. Vývoj používá samostatný spravovaný worktree a přesné task rezervace.

## Doložené mechanismy
- Existující claim CLI odmítá i opakovaný claim téhož ownera. Resume musí porovnat registry owner/worktree/base/scope/resources a použít heartbeat.
- PID je informativní, ne důkaz vlastnictví procesu. OS IPC endpoint používáme jako aktuální singleton/liveness; Windows named pipe první instance je výlučná.
- Codex CLI `0.163.0-alpha.10.2`, Node `v24.19.0`. Samostatný `codex app-server --stdio` s ephemeral read-only contextem načetl KEY-46 přes `mcpServer/tool/call` serveru `codex_apps`. Není třeba druhý API klíč. Jde o experimentální API instalované verze, ne slib kompatibility se všemi Codex verzemi.
- Skutečný `codex exec` se zakázanými apps/multi_agent, prázdným mcp_servers a read-only sandboxem spustil `node -p process.version`, exit0 a strukturovaný JSON podle schématu. Použil výchozí model bez override. Raw logy jsou ignorované v `.cache/bmad-controller-development/`.
- Dotted override `mcp_servers.cua_repl.enabled=false` v app-server probe selhal `invalid transport`; nevznikl modelový turn. Náprava použila platnou nezměněnou app-server konfiguraci. Chybný log zůstal zachovaný.

## Varianty a volba
| Varianta | Náklady a rizika | Rozhodnutí |
|---|---|---|
| Řízení pouze z chatu | Žádný samostatný příkaz/stav, závislost na historii | Nesplní zadání |
| Obecný loop/scheduler | Další závislost, instalace a rozsah nad jeden issue | Nepřidávat |
| PID/timeout a retry | Levné, ale může spustit duplicitní živý worker | Odmítnuto |
| Node state machine + supervisor/IPC/receipt | Malý přenositelný kód, auditovatelné side effects | Zvoleno pro Win/Linux |
| OS Job Objects / native containment | Silnější garance při pádu supervisoru, nová nativní vrstva | V1 místo toho bezpečně zastaví unknown |

Výkon hry, vzhled a asset cache se nemění. Náklady jsou procesy Codex/gh a krátké diskové checkpointy. Důležité lifecycle body: uzavřít app-server, neukončovat cizí PID, při pádu controlleru ponechat supervisor, při jeho ztrátě nerozmnožit worker. Atomický rename + flush je procesní crash odolnost; nedokládáme odolnost proti výpadku napájení.

## Rizika, která musí ověřit implementace
Identita review je digest zdrojového kandidáta proti base, nikoli starý HEAD. Checks nesmí po review změnit zdroj. Evidence generovaná controllerem se od implementačních zdrojů rozlišuje explicitně, bez vynechání testů. Reconcile commitu ověří parent/tree/marker, PR head/base/repo a všechny stavy, Linear komentář přes run marker a ID. Ztracená odpověď mutace nesmí vést k okamžitému create retry bez důkazu.

Scope audit musí zahrnout untracked i relevantní ignored výstupy a symlink/junction úniky; výsledný diff není důkaz každého historického zápisu procesu. Manifest/task/intent se zmrazí, runner nevybírá backlog. CI přejímá konkrétní check ID/app/event a SHA, nikoli poslední zelený výsledek libovolného běhu. Main CI se vztahuje k merge SHA. Při změně base/head se staré přijetí nepoužije.

## Primární podklady
- [Node IPC](https://nodejs.org/api/net.html#ipc-support), [libuv Windows pipe](https://github.com/libuv/libuv/blob/v1.x/src/win/pipe.c).
- [Node filesystem sync](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlesync), [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
- Instalované `codex exec --help`, `codex app-server generate-json-schema --experimental`; [oficiální neinteraktivní režim](https://learn.chatgpt.com/docs/non-interactive-mode).
- [GitHub commit statuses](https://docs.github.com/en/rest/commits/statuses), [PR merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request), [PR Actions event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
- [Git status](https://git-scm.com/docs/git-status), [Git ls-files](https://git-scm.com/docs/git-ls-files), projektové `scripts/agent-tasks.mjs` a `docs/agents/ci.md`.

Tento soubor zachycuje průzkum před implementací. Testy engine, skutečný crash/recovery a živý PR pilot zde zatím nejsou označeny za provedené.


### Skutečná odchylka GitHub API při implementaci
Read-only kontrola známého PR#9 odhalila, že workflow runy39332391809 (verify) a39332391434 (source-secret-hygiene) vracejí event=pull_request a správný head/head_branch, ale prázdné pull_requests. Totéž platí pro check_runs. Požadovat neprázdné pole by nepropustilo ani skutečně úspěšný run. Předáno autorovi adapteru: vazbu na PR a testovaný base doložit konkrétním head_branch/head a skutečným CI logem kroku Record verification identity, případně stejným checkout merge SHA obou jobů. Není přípustné jen oslabit kontrolu na zelené jméno jobu. Jde o skutečné měření backendu, nikoli hypotézu z dokumentace.

### Linear marker roundtrip
Koordinátor v rámci průběžné aktualizace KEY-46 přidal do existujícího komentáře f9f4e16a-9f0a-44d6-8a69-eaa804282a93 marker <!-- autodev:format-probe-key-46 -->. Nové list_comments čtení jej vrátilo přesně, nikoli jen echo odpověď mutace. Linear rich-text převod tedy v ověřeném backendu zachovává potřebný identifikátor. Nevznikl nový komentář a KEY-47 nebyl tímto probe změněn. Jde o rodičovskou evidence aktualizaci; adapter subagent sám neprováděl vzdálené mutace.
20.10.2026: Integrátor přímo načetl skutečný rodičovský snapshot f484d4f55325390b3da8 přes nový loadBmadSnapshot; všech9 instrukčních souborů prošlo kontrolou manifest hashů, exit0. Renderer nebyl opakován a snapshot se neměnil.

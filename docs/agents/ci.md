# CI a přijetí změn do main

CI běží na každém PR a push do `main`. Job `verify` používá SHA-připnuté actions, Node 24, pnpm 11.25.0, frozen lockfile a skutečné Git LFS objekty. Postupně kontroluje katalog tasků, odkazy README, celou sadu testů, produkční build a izolovanou integraci na portu 2568. Log obsahuje testovaný Git commit i PR head/base. Linux GitHub-hosted runner je samostatný stroj; jeho ephemeral porty a build nekolidují s místním hraným snapshotem. Místní plné kontroly dál vyžadují `heavy-validation`, build `workspace-build`, integrace `port:2568`.

Před instalací dependencies běží malé CLI testy `node --test tests/lfs-assets.test.ts tests/lfs-assets-edge-cases.test.ts` a `node scripts/check-lfs-assets.mjs`. Preflight čte inventář committed `HEAD` a ověřuje skutečné pracovní soubory: existenci, běžný typ a umístění uvnitř checkoutu, deklarovanou velikost a nepřítomnost LFS pointeru. Lze jej spustit také jako `node scripts/check-lfs-assets.mjs --root CESTA`. Čte nanejvýš 1024 bajtů z jednoho souboru, nic nestahuje ani nepřepisuje. `downloaded: true` v LFS inventáři potvrzuje pouze objektové úložiště, nikoli připravenost checkoutu. Preflight není checksum kontrola stejně dlouhého poškozeného modelu; původní `git lfs fsck` a asset testy zůstávají součástí CI. [Pilot a důkaz obnovy](../verification-evidence/ci-lfs-pilot-20261019/README.md).

## Povinné podmínky integrace

Aktivní ruleset `main` vyžaduje PR, větev aktuální vůči `main` a úspěšné checky `verify`, `source-secret-hygiene` a status `project-acceptance`. Force-push a smazání jsou zakázané. Pravidla nemají trvalý bypass; povinný počet lidských approvals je nula. Přesné nasazené nastavení a první skutečné runy dokládá [evidence KEY-44](../verification-evidence/ci-main-20261019/README.md).

`project-acceptance` vydává přidělený integrátor prostřednictvím GitHub Commit Status API na **přesné aktuální head SHA PR**. CI tento status sama nevydává. Integrátor před vydáním:

1. Přečte aktuální head i base a ověří vlastní rozsah a přijaté nezávislé review. Nevyřešené podložené nálezy znamenají nepřijato.
2. Ověří výsledky povinných kontrol pro současný kandidát. Při změně base aktualizuje větev a zopakuje relevantní ověření; textová bezkonfliktnost nestačí.
3. Posoudí task acceptance. Vyžaduje-li skutečnou hru, obraz, síť nebo výkon, zaznamená identitu testovaného produkčního buildu, zdrojů včetně testů a assetů, scénář, skutečný výsledek a odkaz na přijaté důkazy. Unit test nebo NullEngine nenahrazují GPU přejímku. U čisté infrastruktury uvede, proč herní přejímka není relevantní.
4. Uloží doklad obsahující `headSha`, `baseSha`, odkazy na review a CI run, rozhodnutí o praktické přejímce a jeho důvod. Doklad může být GitHub/Linear záznam; nemusí vznikat nový commit jen kvůli vložení vlastního SHA do zdrojů.
5. Znovu ověří head PR a vydá status `project-acceptance` s odkazem `target_url` na doklad. Merge provede s očekávaným head SHA (například `gh pr merge --match-head-commit SHA`).

Nový head potřebuje nové přijetí. Při změně testovaného kódu, assetů nebo výsledné kombinace s base se platnost praktických důkazů znovu posoudí. Při čekajícím nebo neúspěšném testu, chybějícím review nebo praktické přejímce zůstává status pending/failure nebo nevydaný, takže merge není dovolený. Oprávnění vydat status mají přístupové údaje integrátora; běžný CI workflow má pouze `contents: read`. Status dokládá rozhodnutí integrátora, není kryptografickou zárukou pravdivosti lidského/agentního posouzení.

## Obnova a údržba

Po neúspěchu zachovej původní run a jeho log, claim i rozpracovaný diff. Oprav příčinu v přiděleném scope; nevypínej test, neměň očekávání kvůli zelenému výsledku a nesnižuj ruleset. Nová relace načte handoff, ověří worktree/HEAD/registry a naváže po doloženém převodu vlastnictví. Zastaralý claim se automaticky nepřebírá. `release` přichází až po předání a ukončení vlastních procesů.

Při změně názvu jobu nejprve ověř skutečný název check-run přes GitHub API a současně uprav required check; zobrazený název workflow není totéž jako check context. SHA-piny a Node/pnpm verze měň jen v samostatném ověřeném rozsahu. Cache ani paralelní joby nejsou nutné k první funkční bráně; přidávej je podle měření. Ruleset/API změny jsou externí konfigurace, nejsou automaticky verzované commitem.

Primární zdroje ověřené 19. 10. 2026: [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [checkout a LFS](https://github.com/actions/checkout), [pnpm CI](https://pnpm.io/continuous-integration). Projektová autorita zůstává v [policy](bmad-policy.md), [koordinaci](README.md) a taskových rezervacích.

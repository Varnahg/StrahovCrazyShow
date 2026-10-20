# Docker: opakovaná instalace před buildem

## Důkazy a mechanismus

Přejímkový image s připnutým pnpm11.25.0 skončil při `RUN VITE_MULTIPLAYER_URL=/ pnpm build` na `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Stack jednoznačně vede přes `runDepsStatusCheck` do dalšího `pnpm install`; původní frozen instalace před COPY již proběhla. Původní log zůstává v docker-smoke-up.log/docker-smoke.log.

Primární lokální distribuovaný kód stejné verze potvrzuje: pre-run check při neaktuálním stavu volá install. Jeho createInstallArgs přenáší jen dev/prod/optional, nikoli původní --store-dir. Check používá také čas změny manifestů, locku a patchů; COPY může metadata identických souborů obnovit. Diagnostický build se stejným zdrojem a režimem error nyní přesně vypsal `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN: Patches were modified`. V připnutém kódu tento predikát vzniká z mtime patchů vůči lastValidatedTimestamp; obsah patchů se mezi frozen cache vrstvou a COPY nezměnil. Původní i diagnostický log jsou zachované.

SHA256 lokálního pnpm11.25.0 dist: ddc64218bc85fb88d28b5def06eb01fafb39cb67f7a9465ce736456658cc7f11. Zdroj checku byl přečten přímo z této instalace, ne odvozován z dnešní nové major verze.

[Oficiální nastavení](https://pnpm.io/settings/build#verifydepsbeforerun) popisuje pre-run instalaci a možné režimy. [Upstream hlášení](https://github.com/pnpm/pnpm/issues/15173) dokládá problémy implicitní instalace v odděleném/read-only store. [Upstream rozbor mtime](https://github.com/pnpm/pnpm/issues/16322) je podpůrný pro jinou verzi, ne důkaz našeho konkrétního predikátu.

CLI kontrolní experiment v čerstvém dočasném projektu s úmyslně nedostupnou závislostí a vynuceným offline režimem: původní default exit1 a build se nespustil; stejný příkaz se scoped false exit0 a build marker vznikl. Žádná síť/nová instalace nebyla potřebná. pnpm-cli-control.json uchovává obě odpovědi. Automatická regrese spouští skutečný pnpm příkaz vyčtený z Dockerfile, kontroluje build marker a nepřítomnost nového node_modules. Cílené deployment testy8/8PASS.

## Porovnání variant

| Varianta | Náklady a důsledky | Volba |
|---|---|---|
| CI=true a povolit automatickou reinstalaci | Další mutable instalace po frozen kroku, potenciální síť a purge, jiný store; léčí prompt, ne neočekávanou práci. | Ne. |
| Přesunout/replikovat frozen install až po celém COPY | Správná validace, ale každá změna source/assetu ruší cache instalace; další kopie a patch práce. | Zbytečně širší změna. |
| Vypnout check globálně ve workspace | Mění lokální i CI chování mimo Docker. | Ne. |
| Vypsat tsc/vite ručně místo package scriptu | Odstraní pnpm check, ale duplikuje canonical build příkaz. | Ne. |
| Nepřepisovat metadata package/lock/patch souborů při COPY | Vyžaduje další seznam COPY vstupů či novější Docker syntax; rozšiřuje vlastnictví seznamu build vstupů. | Nyní nepřiměřené. |
| Scoped false pouze pro Docker RUN po frozen install | Jeden explicitní příkaz, zachované frozen/patch validace a dependency cache, žádná další instalace ani runtime změna. | Vybráno. |

Funkční oprava nemění balíčky, lockfile, allowBuilds, assety ani NODE_OPTIONS. Docker cache frozen instalační vrstvy závisí na skutečném obsahu manifests/lock/workspace/patches; při jejich změně se tato vrstva přestaví. Odstraní se redundantní pre-run freshness heuristika jediného build příkazu, ne samotná zamčená instalace.

## Zbývající přejímka

Opakovat skutečný Docker build, node-owned volume + HTTP202/persisted report, compiled frontend přes CUA, SDK integraci, SIGTERM a restart/replay a bezpečný cleanup vlastního disposable projektu. Do těchto výsledků zůstává project-acceptance nevydaný. Herní klient/server/shared zdroje se touto opravou nemění; již ověřené snímky a jejich clientBuildId zůstávají stejné. Nový PR head bude mít nové celé CI.

Nezávislý čtecí review aktuálního Docker/test diffu vrátil [] (bez spouštění Dockeru). Cílená TypeScript kontrola deployment testu prošla.

## Skutečný konečný výsledek

Image s vybraným scoped příkazem byl postaven a spuštěn. User node, healthy, jeden zapisovatelný namedvolume; skutečný feedback POST202 a soukromý diskový obsah přesně odpovídají. CUA ověřila compiled frontend network admission. HTTP/SDK scénáře, SIGTERM/exit0/noOOM, restart, zachovaná stejná příjemka/report/replay202 a odmítnutí staré session prošly. Cleanup odstranil pouze kontrolovaný jedinečný projekt a jeho volume. Důkazy a původní selhání jsou v docs/verification-evidence/feedback-20261020/.

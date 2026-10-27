# Zapnutí a provoz Crazy Typky

AI je volitelná serverová funkce. Hra, úvod a veřejný souhrnný počet musí fungovat i bez OpenAI konfigurace. Nepřipojený AI chat nesmí předstírat odpovědi modelu.

## Serverové nastavení

Na serveru nastav `CRAZY_TYPKA_ENABLED=1`, `OPENAI_API_KEY` a `OPENAI_MODEL`. Model musí být dostupný v daném OpenAI projektu a podporovat Responses API se strukturovaným výstupem. Před nasazením ověř jeho živé odpovědi a limity konkrétního účtu.

Pro první místní ověření byl zvolen `gpt-6-luna` a `OPENAI_REASONING_EFFORT=none`: model podporuje strukturovaný výstup i tento režim a je určený pro úzké, úsporné úlohy. [Oficiální specifikace](https://developers.openai.com/api/docs/models/gpt-6-luna), ověřena 27. 10. 2026. Parametr effort je volitelný a jeho podpora závisí na modelu; bez nastavení se do API neposílá. Změna modelu vyžaduje opakování eval sady.

Klíč patří do správy tajných údajů nasazení nebo necommitovaného `.env`, nikdy do `VITE_*`, klientského bundle, URL, chatu, screenshotu nebo Gitu. Uživateli se před prvním odesláním zobrazí, že zprávu zpracuje OpenAI. Ostatní hráči AI konverzaci nedostávají.

Pro místní práci je vhodnější uložit skutečný soubor s klíčem úplně mimo Git checkout a předat jeho cestu přes `--env-file`. Šablony a názvy proměnných lze verzovat; skutečný soubor ani hodnotu klíče nikdy nekopíruj do repozitáře nebo issue.

`compose.ai.yaml` je samostatný override základního kontejneru. Po vyplnění místních serverových proměnných použij `docker compose -f compose.yaml -f compose.ai.yaml up -d --build`. Toto je návod; příkaz zde nespouští ani nemění existující testovací server.

Při místním běhu bez Dockeru server `.env` automaticky nenačítá. Proměnné předej procesu, nebo z kořene projektu použij `node --env-file=.env --import tsx server/index.ts`; přepínač byl ověřen v nainstalovaném Node 24. Klientský dev server může běžet samostatně přes `pnpm dev:client` se stávající proxy na port 2567.

Při HTTPS reverzní proxy nastav přesný veřejný origin do `CRAZY_TYPKA_ALLOWED_ORIGINS`. Povolují se celé origins, nikoli wildcard nebo uživatelské URL. Server nedůvěřuje libovolnému X-Forwarded-For; za proxy tedy mohou uživatelé sdílet IP limit. Spravované proxy/IP limity řeš na hranici nasazení, ne přijetím podvrhnutelných hlaviček.

## Rozpočet a soukromí

Provozní limity jsou poslední ochrana, ne autentizace veřejného uživatele. Origin lze mimo prohlížeč podvrhnout. U OpenAI projektu nastav samostatné rozpočtové sledování; konzervativní strop generování aplikace platí pro jeden běh procesu a restart jej obnoví. Nesmí být popisován jako trvalý denní finanční limit.

Výchozí strop je 500 pokusů generování na proces; `CRAZY_TYPKA_GENERATIONS_PER_PROCESS` jej může snížit. Počítají se i neúspěšné upstream pokusy, žádný automatický placený retry. Další výchozí hranice: 4 aktivní requesty, 1 generování na relaci, 6 zpráv/min na relaci, 30 requestů/min na IP, 120 requestů/min globálně, 1 500 znaků ve zprávě a 600 výstupních tokenů. Vhodnost modelu pro tento krátký výstup je nutné ověřit živým evalem; model s velkou potřebou reasoning tokenů může vrátit neúplnou odpověď, která se bezpečně odmítne.

AI tokeny a historie jsou dočasné. Restart serveru nebo vypršení relace konverzaci ukončí. „Nový chat“ smaže serverovou historii daného tokenu a zneplatní její rozpracovanou odpověď. Nezapisují se vlastní logy dotazů ani celé upstream chyby. OpenAI `store:false` vypíná ukládání response state v tomto použití, ale není zárukou nulové retence poskytovatele; viz [aktuální data controls](https://developers.openai.com/api/docs/guides/your-data).

## Obnova podkladů

Corpus v `server/data/silicon-hill-knowledge.json` je malý kontrolovaný výběr. Není úplnou znalostí všech dokumentů SH. Nejprve otevři [oficiální rozcestník](https://www.siliconhill.cz/pages/dokumenty), ověř konkrétní odkaz/verzi/účinnost a teprve potom uprav krátké parafráze. Stará URL nebo search snippet není důkaz platného předpisu.

Zachovej autora, licenci, URL, datum kontroly, platnost a hash uloženého textu. U wiki odvozeného obsahu zachovej CC BY-SA atribuci a označení úpravy. Nepřenášej wiki licenci automaticky na PDF na jiném hostu. Nezařazuj soukromé zápisy, údaje studentů, přístupové údaje nebo celý nejasně licencovaný dokument.

Po změně korpusu spusť retrieval testy včetně dotazů mimo jeho pokrytí. Před veřejným zapnutím proveď eval sadu v [definici postavy](personality.md) na zvoleném modelu a zaznamenej jeho skutečnou kvalitu, latency a usage. Automatický crawler ani runtime fetch uživatelských URL se nepoužívá.

Současný corpus má `reviewAfter=2026-11-27`. Od `2026-11-27T00:00:00Z` se věcné podklady vypnou a AI smí přiznat mezeru nebo vést obecnou konverzaci. Termín neposouvej bez nové kontroly zdrojů; při úpravě parafrází přepočítej jejich SHA-256. Datum kontroly neznamená datum účinnosti předpisu.

## Přijetí

Jednotkové testy s fake providerem ověřují smlouvu, limity a lifecycle. Nedokazují faktickou správnost skutečného modelu nebo jeho odolnost vůči všem prompt-injection útokům. UI a server musí čitelně zvládnout chybějící klíč/model, vyčerpaný limit, nedostupnou moderaci, timeout, reset a neznámou citaci. Aktuální skutečné výsledky patří do příslušného předání a integrační evidence, nikoli do předpokladů tohoto návodu.

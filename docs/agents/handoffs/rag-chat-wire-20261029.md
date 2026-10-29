# Napojení chatu na dokumentové RAG

Autor `rag-chat-wire-01a17e9d`, příjemce `/root`, cwd `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Přímé implementační zadání v odlehčeném postupu; bez dalšího BMAD nebo samostatných review vrstev. Vlastní claim získán před zápisem. Žádný staging ani commit.

## Změny

- Backend používá `captureSearch/searchSnapshot/assertSnapshot`, `EvidenceKnowledgeChunk`, composite dependencies a společný provider/model/dimensions embedding space. V1 a v2 dokumentové profily neplatí druhý query embedding. Current je výchozí, chybějící archive vrátí prázdné podklady bez embeddingu; vznik nového archive headu invaliduje tento výsledek.
- HTTP request má volitelné `knowledgeScope:{kind:"current"}|{kind:"archive",asOf?:canonicalISO}`. Vynechané pole znamená current. Scope/asOf jsou v přesné requestSeq identitě a anti-spam klíči. Změna scope oddělí předchozí USER i assistant kontext; explicitní replay nikdy nový scope nepřevezme.
- Finální synchronní clock guard rozlišuje aktuální platnost a archive/asOf, přičemž administrativní freshness vždy hodnotí aktuálním časem. Původní abort/reset/shutdown, privacy, moderace, limity a replay zůstávají.
- Provider dostane důvěryhodné serverové `nowUtc`, `Europe/Prague` a scope. Instrukce rozlišují provozovatele místních služeb, archiv a ilustrační screenshoty. Původní AI osobnost i Jantar onboarding zachované.
- Jediná společná serializace evidence hlídá celkový limit16384UTF-8 bajtů v backendu i provideru. Backend vybírá pouze celé chunky; provider odmítne nadlimitní injektovanou evidence před generation admission. Celý request má cap65536 bajtů; při nutnosti se odeberou nejstarší páry historie, ne fakta/chunky nebo aktuální dotaz.
- Chat má malý rozbalovací ovladač current/archive a volitelný UTC okamžik. Pending retry zachová původní volbu; reset vrátí current. V3 citace ukazují metodu, archiv, účinnost a locatory, dvě verze se neslévají. Přepnutí podkladů označí nové téma, ale ponechá viditelný přehled zpráv.

Decisions modul/otázky a complexity policy se neměnily; kontrola diffu modulu je prázdná. Žádná nová automatická historická klasifikace, změna SQL/katalogu, UI shellu, viewportu nebo loaderu.

## Ověření

Přímý Node/tsx nad pěti dotčenými testovými soubory a stávajícím Decisions testem: **152 PASS,0FAIL,0SKIP**, přibližně1,63s, exit0. Scoped strict TypeScript a diff check prošly. Přesně vlastněné TS/CSS soubory byly formátované lokálním Prettier, bez instalace/package-manager synchronizace.

Regrese pokrývají skutečnou serializaci scope/server time, neplatné scope bez placených kroků, context/replay hranici, dvě archivní verze, archive/asOf a current zákaz historické evidence, chybějící archiv bez embeddingu, kompatibilní v1/v2 heads, UTF-8 evidence/request cap, celé zdroje, UI recovery/reset/citace a dosavadní privacy/Decisions/lifecycle chování.

Historické první běhy zachytily fixture typy, compact test vybírající první label místo composer labelu, nesprávné označení optional asOf v novém guardu a neplatnou prázdnou moderation fixture. Vše opravené; logy nebyly přepsané. Finální logy: `.cache/rag-chat-wire-20261029/tests-final.log`, `types-final.log`. Manifest jedenácti zdrojů/testů je `.cache/rag-chat-wire-20261029/manifest.json`.

Žádné vlastní servery/listenery, API, klíče, DB, GPU, build nebo instalace. Všechny testovací procesy skončily. Skutečný PostgreSQL+OpenAI E2E, společné review, plné CI a integrace jsou kroky root; tato fake/unit přejímka je nenahrazuje. Po předání skutečný release claimu.

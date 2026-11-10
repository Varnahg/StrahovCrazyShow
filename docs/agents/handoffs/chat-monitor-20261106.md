---
title: 'Správcovský monitoring Crazy Typky'
type: 'feature'
created: '2026-11-06'
status: 'done'
route: 'dispatch'
baseline_commit: '20fb1d104f0fcc2860e6ea88d868b4c96ad3d303'
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval>

## Záměr

Úplný text dotazu a finální odpovědi z nových informovaných relací bude dostupný správci na `/admin` stejné domény. Přepis bez vazby na IP, herní účet či token zanikne za tři kalendářní měsíce od první uložené výměny. Hráč vidí informaci v existujícím ⓘ před záznamem. V produkci je sběr vypnutý do potvrzení podmínek, přístupu a právního titulu.

</frozen-after-approval>

## Plán ověření

1. **Problém.** Crazy Typka má dočasné relace v paměti a dokumentace uvádí provoz bez logování dotazů. Projekt nemá správcovskou autentizaci.
2. **Mechanismus.** `server/crazy-typka.ts` má jedinou terminální větev pro přijatý nový požadavek. Replay vrací samostatný výsledek. Oba chaty sdílejí `CrazyTypkaChatActions` a klientský stav. Express obslouží `/admin` před statickým klientem.
3. **Změna.** Verzovaná informace otevře způsobilost nové relace. Finální výměna přejde do omezené fronty soukromého PostgreSQL. Samostatný serverový HTML router povolí čtení jen GitHub ID z konfigurace.
4. **Metrika.** Jedna uložená výměna na nové pořadí, žádný duplikát po replay, žádný text bez způsobilé relace a žádný přepis po expiraci nebo bez správce. U ztrát je dostupný čítač.
5. **Správnost.** Parametrizované SQL a bez textu v provozních lozích. Vrstvy pro publikování, správu a informaci mají vlastní testy. Nezahrnuje hráčský chat, RAG, identitu nebo produkční data.
6. **Přijetí.** Projdou cílené testy, reálný izolovaný PostgreSQL, produkční build a izolovaná integrace. OAuth ověřit lokálně s řízeným GitHub protějškem. Živý GitHub, HTTPS a právní zapnutí patří k nasazení se skutečnými údaji správce.

## Varianty a hranice

Ukládání v log streamu by zpřístupnilo přepisy širším oprávněním a komplikovalo výmaz, souborový archiv by vyžadoval vlastní dotazování a koordinaci retence. Oddělená PostgreSQL databáze s krátkým timeoutem řeší atomické seskupení, idempotenci a audit. Čekání na databázi před odpovědí by zhoršilo dostupnost chatu, proto má zvolený asynchronní zápis viditelné ztráty. Informační modalita zůstává v ⓘ podle zadání. Přístup na stejné doméně má samostatný router, ověřenou relaci, textové HTML bez cache a obranu před běžným načtením z herní stránky. Přepisy mohou obsahovat osobní údaje i bez účtu.

Použité podklady zahrnují [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [PostgreSQL kalendářní intervaly](https://www.postgresql.org/docs/17/functions-datetime.html), [Fetch Metadata](https://www.w3.org/TR/fetch-metadata/) a [GDPR, čl. 5, 6 a 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).

## Implementační poznámky

Vlastník `chat-monitor-20261106-root`. Práce v kanonickém checkoutu na main. Oddělené rezervace pro úložiště, /admin a ⓘ. Vnější WIP z konsolidace zůstává mimo rozsah. [KEY-75](https://linear.app/gigeconomy/issue/KEY-75/spravcovsky-monitoring-crazy-typky-na-admin)

Úložiště, přihlášení, informace a izolace testovacího prostředí mají vlastní předání. Záznam je best-effort a čítač chyb platí pro jeden proces. Zobrazení informace je jednou v aktuálním okně aplikace. Volba verze je signál kompatibility na novém POST relace. Databázovou inicializaci provádí výslovně správce, přepisy se zpřístupní jen po auditu. [Úložiště](chat-monitor-store-20261106.md) · [Správa](chat-monitor-admin-20261106.md) · [Informace](chat-monitor-notice-20261106.md) · [Izolace](chat-monitor-test-isolation-20261106.md)

## Výsledek nezávislé kontroly

- Střední dopad. Anonymní starty dříve dokázaly naplnit 256 globálních přihlašovacích pozic. Šifrovaná pětiminutová cookie při startu nepřiděluje serverovou pozici. Regrese provedla 300 anonymních startů a poté úspěšné přihlášení.
- Střední dopad. Jeden platný OAuth stav dříve spouštěl opakované odchozí žádosti i s chybným kódem. Před prvním síťovým voláním je nyní kontrola opakování a limit čtyř současných výměn. Cílený test potvrdil uvolnění slotu i po chybě.
- Nízký dopad. Neplatný base64url kurzor vypadal jako porucha databáze. Přesně rozpoznané odmítnutí kurzoru vrací 400. Závěrečná nezávislá kontrola obou změn nehlásila další doložený problém.

## Praktická přejímka

- Izolovaný PostgreSQL 17 s daty v tmpfs a samostatnými databázemi pro RAG a přepis. Cílená sada včetně skutečného SQL prošla 157/157. Finální úpravy přihlášení ověřila jeho vlastní sada 10/10.
- Vite produkční balíček v neměnném `.cache/chat-monitor-20261106/dist`, klient `sha256-952892f15789002070176ce76fd46fa9929d1e94860b8fc316163f6dbca614df`, vstup `/assets/index-DLFfG2zN.js`. V reálném Edge při 1528×698 se ⓘ automaticky otevřelo na úvodu a po připojení k připravené WebGPU relaci bylo shodné sdělení dostupné v HUD. Ověření používá stejný klientský stav, takže po předchozím zobrazení se bublinka v HUD otevřela na požádání. Nejde o měření FPS.
- Finální HTTP smoke na vlastním serveru `127.0.0.1:4278` s produkčním balíčkem a omezenou databázovou rolí. Health a úvod vrátily 200, bez oprávnění nebo s hráčským tokenem /admin vrátil 401, běžný fetch 403. Syntetický OAuth a povolené ID otevřely detail s 200. SQL vrátilo jednu konverzaci, jednu výměnu po replay a jedno auditované čtení. RAG import využil schválenou cache s nulovým rozpočtem nových embeddingů. Živý GitHub účet, veřejná HTTPS proxy a produkční zapnutí patří samostatné přejímce.
- Plná sada `pnpm --config.verifyDepsBeforeRun=error test` před posledním doplněním chybové stránky měla 3 185 PASS, 5 SKIP a 0 FAIL včetně reálných RAG SQL testů. Archivní PostgreSQL test byl v této sadě vynechaný a prošel v samostatné sadě výše. První úplný TypeScript běh našel rozšířené literálové typy ve dvou nových fixtures. Po jejich zpřesnění a doplnění čítače na autorizované 503 prošlo 148/148 cílených testů, úplný `tsc --noEmit` i opakovaná izolovaná integrace. Úplnou testovací sadu jsme po této poslední cílené úpravě neopakovali.
- Závěrečné nezávislé posouzení 503 potvrdilo, že čítač je dostupný jen aktuální správcovské relaci a nedojde k zobrazení SQL chyby ani přepisu. Finální manifest zdrojů a testů v `.cache/chat-monitor-20261106/final-source-test-manifest.json` má SHA-256 `745c42b49f9fc953c585f00d20e65fa4e0f8b66d26eac079ffd8553898d4b8d2`. Logy a kódy běhů jsou ve stejném adresáři.
- Testovací karta, vlastní HTTP server a PostgreSQL kontejner jsou ukončené. Na rezervovaných portech 4278, 5548 a 2568 nezůstal posluchač. Převzaty byly jen doložené soubory pěti tasků KEY-75. Produkční zapnutí zůstává otevřené v Linear.

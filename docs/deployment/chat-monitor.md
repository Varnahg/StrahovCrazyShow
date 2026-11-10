# Monitoring Crazy Typky

Přehled je na `/admin` stejné HTTPS domény jako hra. Slouží ke zlepšování podpory. Přepis obsahuje přesné znění přijatého dotazu, finální odpověď a citace. Výměny spojuje náhodné ID relace. Přepis může obsahovat osobní údaje v textu. Herní profil, IP adresu a token relace přehled nesbírá.

Sběr má výchozí hodnotu `CHAT_MONITOR_CAPTURE=0`. Správce může používat přehled a údržbu existujícího archivu i s vypnutým sběrem. Produkční zapnutí vyžaduje potvrzený právní titul a přiměřenost tříměsíční retence, zveřejněné podmínky a ověřené přihlášení správce. Podmínky mají uvést správce a kontakt, účel, právní titul, příjemce, retenci a postup pro uplatnění práv. [Informování uživatelů podle EDPB](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en)

## Soukromá databáze

Vytvoř samostatnou PostgreSQL databázi `strahov_chat_monitor` na neveřejné síti. Při sdílené PostgreSQL instanci drž databázi, přihlašovací údaje a přístupy samostatně od RAG. Pod vlastníkem databáze aplikuj [schéma](../../server/chat-monitor-schema.sql) přes `psql -v ON_ERROR_STOP=1 -f server/chat-monitor-schema.sql`. Následující SQL předpokládá vytvořenou přihlašovací roli `strahov_chat_monitor_app` s heslem ze správce tajných údajů.

```sql
ALTER DATABASE strahov_chat_monitor SET log_parameter_max_length = 0;
ALTER DATABASE strahov_chat_monitor SET log_parameter_max_length_on_error = 0;
ALTER DATABASE strahov_chat_monitor SET log_error_verbosity = terse;
ALTER DATABASE strahov_chat_monitor SET log_statement = none;
REVOKE CONNECT ON DATABASE strahov_chat_monitor FROM PUBLIC;
GRANT CONNECT ON DATABASE strahov_chat_monitor TO strahov_chat_monitor_app;
GRANT USAGE ON SCHEMA chat_monitor TO strahov_chat_monitor_app;
GRANT SELECT, INSERT, DELETE ON chat_monitor.conversations TO strahov_chat_monitor_app;
GRANT UPDATE (first_seen_at) ON chat_monitor.conversations TO strahov_chat_monitor_app;
GRANT SELECT, INSERT ON chat_monitor.exchanges TO strahov_chat_monitor_app;
GRANT INSERT, SELECT (conversation_id) ON chat_monitor.reads TO strahov_chat_monitor_app;
```

Databázový klient před zápisem ověřuje délku logování parametrů, stručnost chyb a vypnuté parametry `pgaudit`. Spravuj databázi bez logování obsahu, s omezeným přístupem k zálohám a se stejnou hranicí retence po obnově. Výmaz konkrétní konverzace řeší správce databáze odstraněním přesného řádku `chat_monitor.conversations.id`, odvozené výměny a audit se odstraní kaskádou.

## Konfigurace aplikace

| Proměnná | Hodnota |
| --- | --- |
| `CHAT_MONITOR_CAPTURE` | `0` pro samotné čtení, `1` pro sběr |
| `CHAT_MONITOR_DATABASE_URL` | Privátní PostgreSQL URL s názvem databáze v cestě, případně s `sslmode` |
| `CHAT_MONITOR_ORIGIN` | Kanonický origin bez koncového lomítka, například `https://strahov.bandportal.cz` |
| `CHAT_MONITOR_GITHUB_CLIENT_ID` | ID samostatné GitHub OAuth aplikace |
| `CHAT_MONITOR_GITHUB_CLIENT_SECRET` | Secret aplikace, pouze na serveru |
| `CHAT_MONITOR_GITHUB_IDS` | Číselné GitHub ID oprávněných správců, oddělené čárkou |
| `CHAT_MONITOR_PRIVACY_URL` | Veřejná HTTPS stránka s podmínkami a kontaktem, povinná pro sběr |

V GitHub OAuth aplikaci nastav přesný callback `https://strahov.bandportal.cz/admin/oauth/callback`. Stávající reverzní proxy musí zachovat veřejnou hlavičku `Host` a předat `/admin` stejnému serveru jako hru. Pro `/admin` vypni proxy cache a záznam hodnot cookies i parametrů OAuth callbacku v přístupových lozích. Přehled funguje při běžné navigaci v hlavním okně aktuálního prohlížeče. Přihlášení vyprší po 15 minutách. [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

Přepisy zmizí z přehledu přesně po třech kalendářních měsících v UTC od první uložené výměny. Spuštěný server odstraní prošlé řádky při startu a poté jednou za minutu. Při delší odstávce použij správcovský výmaz prošlých řádků `WHERE expires_at <= statement_timestamp()` nebo obnov údržbu před zpřístupněním dat. Zápis je asynchronní. Čítač nezapsaných výměn platí pro aktuální běh procesu a přihlášený správce ho uvidí i při výpadku databáze. Pád před zápisem může ztratit čekající výměny. Obnovení chatu a starší klienti používají přechodové chování popsané ve [specifikaci](../agents/handoffs/chat-monitor-20261106.md).

Před zapnutím sběru ověř anonymní odmítnutí, oprávněné přihlášení, HTTPS a čtení syntetického přepisu v odděleném prostředí. Při zastavení sběru nastav `CHAT_MONITOR_CAPTURE=0` a ponech dostupnou databázovou údržbu.

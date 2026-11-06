# Přehled monitoringu na `/admin`

Vlastník `chat-monitor-20261106-admin`, příjemce `chat-monitor-20261106-root`. Kanonická kopie `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, výchozí commit `20fb1d104f0fcc2860e6ea88d868b4c96ad3d303`. Tři nesouvisející nesledované soubory z konsolidace zůstávají mimo rozsah.

## Plán ověření před změnou

1. Problém. Na stejné doméně hry zpřístupnit přepisy jen schváleným správcům.
2. Doložený mechanismus. Express obsluhuje `server/index.ts` před statickým klientem. Hráčský token slouží jiné službě. Cookie s omezenou cestou omezuje její odesílání, ale skript ze stejného originu může vytvořit požadavek na `/admin`.
3. Jediná změna v tomto tasku. Přidat serverově vykreslený modul `/admin` s odděleným GitHub přihlášením a injektovaným čtením a auditem. Zapojení do serveru patří koordinátorovi.
4. Hlavní metrika. Počet zpřístupněných přepisů a vyvolaných čtení u testovaných neoprávněných požadavků, očekáváno nula.
5. Podmínky správnosti. Přihlášení přes OAuth code s jednorázovým stavem a PKCE S256, pevné HTTPS callback URL, číselná ID, host-only krátkodobá cookie pro `/admin`, ochrana před skripty a vložením do rámce, čtení jen při navigaci dokumentu, audit před zobrazením detailu a zobrazení vloženého HTML jako textu.
6. Kritérium přijetí. Cílené testy prokazují oprávněné přihlášení, seznam a audit detailu, odmítnutí cizího číselného ID, herních tokenů, podvržené relace, opakování OAuth callbacku a přímého fetch čtení.

## Volba provedení

- Express modul pod stávajícím originem zachovává nasazení a přání uživatele. Serverové HTML s pevnými styly nemá klientský JS bundle ani aplikační cache a čtení nesdílí tok hry. Prohlížečová navigace chrání čtení před běžným skriptovým `fetch`; ochrana rámců a oddělený kontext okna omezují další způsoby přístupu z herní stránky.
- Samostatná doména by poskytla silnější hranici originu, ale vyžadovala by další DNS, TLS a proxy konfiguraci proti zvolenému `/admin`. Proxy autentizace by dávala smysl při existující centrální správě, která zde není doložená.
- Podepsaná cookie by odstranila procesní stav, ale odhlášení a jednorázovost OAuth by přesto potřebovaly serverový stav. Krátké omezené mapy se čistí při požadavcích, po restartu přihlášení vyprší. Uložené přepisy se spravují odděleně v PostgreSQL.

Primární podklady ověřené 6. 11. 2026. [GitHub OAuth web flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub ověřený uživatel](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), [Fetch Metadata](https://www.w3.org/TR/fetch-metadata/), [HTML Cross-Origin-Opener-Policy](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-opener-policies).

## Předání 7. 11. 2026

- `server/chat-monitor-admin.ts` přidává serverový seznam, stránkování a detail s datem, dotazem, odpovědí a citacemi. Čtení vyžaduje aktivní správcovskou relaci a navigaci hlavního dokumentu. Po asynchronním čtení kontroluje relaci ještě před odesláním. Detail vrací úložiště až po auditu. Vlastní HTML nespouští skripty, uniká dynamický text, zakazuje framing, odděluje opener a nastavuje `no-store` a `no-referrer`. Zdrojové URL zobrazuje jako text.
- Přihlášení směruje na GitHub s přesným callbackem `${origin}/admin/oauth/callback`. Po ověření stavu a PKCE si server ověří číselné GitHub ID a vytvoří vlastní krátkodobou relaci. GitHub token použije pouze při ověření identity. Čtecí konfigurace může zůstat aktivní i při vypnutém sběru. Proxy musí předat kanonický `Host`. Proces drží šifrovací klíč pro rozpracované přihlášení a omezený stav dokončených přihlášení.
- Modul předává nesouvisející cesty dál a odebírá přijaté hlavičky `Access-Control-*`. Colyseus zachytává `OPTIONS` před Expressem. Koordinátor může v již existujícím HTTP dispatcheru použít `isChatMonitorAdminPath` k odmítnutí tohoto preflightu. Skutečné administrační odpovědi používají samostatnou navigační bránu.
- `tests/chat-monitor-admin.test.ts` obsahuje syntetické testy OAuth a úložiště. Po první implementaci prošlo 8/8 a cílený typecheck po opravě testovacího mocku. Finální výsledek po review je níže. Testy nevytvářely poslouchající porty ani pomocné procesy.
- Soubory tasku jsou výše uvedený modul, testy a toto předání. Pro společný commit a ověření běžné HTTP cesty, živého PostgreSQL a HTTPS callbacku přebírá koordinátor.
- Živý GitHub OAuth s produkčními údaji a skutečný prohlížeč zde nebyly ověřeny. Rezervace se po předání uvolní, zápis a integraci přebírá koordinátor.

## Oprava po nezávislé kontrole

1. Problém. Anonymní start OAuth může zaplnit globální mapu 256 rozpracovaných přihlášení a vyřadit přihlášení správce na pět minut.
2. Mechanismus. `GET /admin/login` alokoval serverovou položku před ověřením GitHub identity. Rozsah byl doložený přímo kódem a navržená regrese zkouší víc než 256 startů.
3. Změna. Pětiminutový stav a PKCE verifier udržet v autentizované šifrované cookie s procesním klíčem AES-256-GCM. Jednorázovost vydané relace zajistí omezená mapa použitého stavu vytvořená až po ověření schváleného GitHub ID.
4. Metrika. Přihlášení správce skončí úspěšnou relací i po 300 anonymních startech ve stejném časovém okně.
5. Správnost. Vázat stav k cookie prohlížeče, přesnému callbacku a expiraci. Změněná cookie nesmí vyvolat požadavek na GitHub. Jeden použitý stav smí vydat nejvýše jednu relaci.
6. Přijetí. Regrese dostupnosti, manipulace s cookie, expirace, PKCE a replay procházejí společně s existujícími testy administrace.

Limit podle IP by vyžadoval důvěryhodný proxy identifikátor a cizí návštěvnost za stejnou adresou by dále mohla blokovat správce. Vytlačování nejstaršího stavu by dovolilo průběžně rušit rozpracované legitimní přihlášení. Šifrovaná cookie přidává krátký kryptografický výpočet k existujícímu redirectu a nealokuje mapovou položku před ověřením. Po restartu se rozpracované přihlášení zahájí znovu, stejně jako u předchozí procesní mapy. [Node.js AES-GCM a autentizační tag](https://nodejs.org/docs/latest-v24.x/api/crypto.html#deciphersetauthtagbuffer-encoding) · [GitHub OAuth callback](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#2-users-are-redirected-back-to-your-site-by-github)

Výsledek po review. `node --import tsx --test tests/chat-monitor-admin.test.ts` prošel 9/9. Nová regrese po 300 anonymních startech úspěšně vydala oprávněnou relaci. Poškozený šifrovaný stav, nesoulad cookie a OAuth stavu, expirace a opakované použití oprávněného callbacku byly odmítnuty. Neplatný kurzor z úložiště má HTTP 400. Cílený striktní TypeScript a Prettier skončily kódem 0. SHA-256 zdroje `f6698be7cd89c7d52f9dc46ad0f7f4f7ec896ec1e8cd280e048680efbbe31da3` a testů `debeb67c6a4ce49a0f5b27e6ca9425704a5b1581f0bd097f47d9f369c2a7285b`. Testy pracovaly se syntetickým účtem a náhradou GitHub HTTP API.

## Omezení OAuth callbacku před voláním GitHubu

1. Problém. Jeden platný stav mohl opakovaně vyvolat síťovou výměnu s chybným kódem.
2. Mechanismus. Proces si původně pamatoval až úspěšné callbacky. Při odmítnutí poskytovatele nevznikla položka.
3. Změna. Před `fetch` rezervovat jednu ze čtyř aktivních výměn a zaznamenat pokus do krátkodobé omezené mapy. Rozpracovaná výměna drží vlastní ochranu proti souběžnému replay i při vytlačení její položky. Uvolnění aktivní výměny patří do `finally`.
4. Metrika. Se zablokovaným poskytovatelem vzniknou nejvýše čtyři volání pro různé stavy a nejvýše jedno pro všechny kopie stejného stavu.
5. Správnost. Odmítnutý pokus spotřebuje stav. Přetížený callback, který se k poskytovateli nedostal, zachová cookie pro opakování. Start přihlášení stále nepřiděluje serverovou položku.
6. Přijetí. Cílený test souběhu dokládá odmítnutí duplikátu, HTTP 503 při obsazení všech slotů a úspěch dalšího stavu po uvolnění slotu chybou poskytovatele.

Pevný limit všech pokusů v jednom okně by znovu umožnil pětiminutové globální zablokování. TTL a vytlačení nejstarších ukončených pokusů drží velikost evidence a přijímají čerstvé stavy po uvolnění aktivního slotu. Současný limit chrání souběh odchozích požadavků. Rozpočet každého kroku u poskytovatele zůstává osm sekund.

Finální ověření po změně callbacku. `node --import tsx --test tests/chat-monitor-admin.test.ts` prošel 10/10. Test odložil GitHub odpovědi, u čtyř různých stavů prokázal čtyři odchozí výměny a u pátého HTTP 503 bez spotřebování cookie. Duplikát odmítl před `fetch` za běhu i po simulované chybě timeoutu. Uvolněný slot následně přijal pátý stav. Cílený striktní TypeScript a Prettier prošly. SHA-256 zdroje `78c21e28ed185cb2f77d4af1aa4263c16f44ddf8f743a6ea6e2a73da9fdf1754` a testů `f40ccfff3cb4f92951fa4927967684aa72c274ef13a55eb3532a6d03c6bb7e33`. Živá služba GitHubu nebyla použita. Žádný proces ani port po testu nezůstal.

## Čítač při výpadku databáze

1. Problém. Správce při úplném výpadku databáze neviděl čítač nezapsaných výměn.
2. Mechanismus. Čítač žije v procesu, ale chyba načtení seznamu přeskočila vykreslení jeho odstavce a zobrazila obecné HTTP 503.
3. Změna. Stejný odstavec zobrazit na stránce seznamu i při nedostupnosti databáze.
4. Metrika. Na autorizované stránce 503 je vidět stejný procesní čítač jako na úspěšné stránce seznamu.
5. Správnost. Před chybovou odpovědí znovu ověřit relaci. Nezpřístupnit interní chybu, přepis ani čítač návštěvníkovi bez aktivní správcovské relace. Ponechat HTTP 400 pro neplatný kurzor.
6. Přijetí. Syntetická chyba úložiště vrátí správci 503 s čítačem a návštěvníkovi 401 bez dotazu do databáze a bez čítače.

Počkali jsme na marker dokončené sekvenční kontroly. Chybová stránka využije existující autorizovanou cestu a procesní čítač. Nepřidává endpoint ani databázový dotaz.

Ověření konečného modulu. `node --import tsx --test tests/chat-monitor-admin.test.ts` prošel 11/11. Výpadek byl simulovaný chybou čtecího úložiště. Správce obdržel HTTP 503 s čítačem 8 a `no-store`, návštěvník HTTP 401 bez čítače a bez čtení úložiště. Interní chyba a text přepisu se nezobrazily. Striktní cílený TypeScript a Prettier skončily kódem 0. SHA-256 zdroje `763993b8f8897f1c91ad90d72195aa628540c7b51123214892775c429b6fa5ea` a testů `11ec7c7ccb683f0a4d13a916f0ee051a0f2d422ac2cee88d032b37e8c7602211`.

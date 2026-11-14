# Předání serverové části KEY-78

- Vlastník `key78-live-20261114-server`, příjemce koordinátor `key78-live-20261114-root`. Kanonický checkout na `main`, výchozí commit `b7c476c7`.
- Problém a mechanismus. Zprávy mají ID, ale server dnes zná pouze publikum právě odesílané zprávy. Zúčastnění hráči se mohou mezi odesláními změnit. `Community.chat` provádí stávající autorizaci a místnost zná stav a identitu socketů. Pinned Colyseus 0.18.9 posílá přes `Client.send` bez návratového potvrzení a před dokončením join handshake data jen řadí do fronty.
- Zkoušená změna. Omezený volatilní index originálů v `Community` a adresné doručování. Stávající kontrola stavu místnosti předchází zápisu. Index zachová pouze příjemce, jejichž spojením mohla projít původní zpráva. Ruční textové citace by neověřily autorství. Trvalé úložiště by prodloužilo životnost dat a přidalo provozní závislost. Nový index je časově, počtem zpráv i počtem vazeb na příjemce omezený.
- Hlavní metrika. Přesný obsah adresných zpráv a potvrzení při změnách zóny, publika a blokací.
- Podmínky a přijetí. Běžná zpráva zachová původní tvar. Plná citace pouze pro původního oprávněného příjemce v téže konverzaci. Ostatní obdrží nový text s neutrálním příznakem. Historii nesmí prozrazovat chyby. Potvrzení koreluje jen odesílateli a potvrzuje přijetí pro transport.
- Soubory k integraci. `shared/types.ts`, `server/community.ts`, `server/index.ts`, `tests/player-chat-replies.test.ts` a toto předání. Žádné cizí soubory jsem nepřevzal. Při přenosu na GitHub zachovat jeho vlastní verzi `server/index.ts` a převzít jen chatové části diffu.
- Výsledek. Odesílatel s platným `requestId` dostane po vlastní ozvěně `chat-result`. Ostatním se identifikátor požadavku neposílá. Původní klient bez identifikátoru dostává při odmítnutí stávající `notice`. Plný úryvek má maximálně 140 jednotek UTF-16 plus výpustku a nikdy neobsahuje citaci předchozí odpovědi. Nesprávný odkaz má jednu neutrální chybu. Oprávnění v rámci referencí zahrnuje aktuální blokace a obě strany původního soukromého chatu.
- Refaktoring. Stávající autorizaci kanálů používá `Community.chat`. `deliverChat` jí předřazuje jen původní vstup do logiky přijetí zprávy a sdílí pro příjemce nejvýše dva předpočítané tvary paketu. Určení konverzace používá aktuální prostor, účastníky nebo událost. Opakovanou ukázkovou událost identifikuje i její začátek. Monotónní TTL je 10 minut, limit 512 originálů a 8 192 vazeb na příjemce. Prune používá existující třicetisekundový interval bez počítání v simulačních snímcích. Zánik místnosti index vyčistí.
- Ověření 14. 11. 2026 UTC. `node --import tsx --test tests/player-chat-replies.test.ts tests/community-lifecycle.test.ts tests/core.test.ts tests/i18n.test.ts` skončilo kódem 0, **38/38 PASS**. `git diff --check` pro změněný sledovaný kód a `node scripts/agent-tasks.mjs validate` prošly. Runtime import exportů `WebSocketClient` a `ClientState.JOINED` ověřen přímo z nainstalovaných balíčků.
- SHA-256 tohoto předávaného kódu:

  | Cesta | SHA-256 |
  | --- | --- |
  | `server/community.ts` | `ac1e9e76b7b4da65bceee88951bca69462e5f0d51f378ed718805b42bbd75521` |
  | `server/index.ts` | `7cd2038c89355b7752d05799f33a3e2fa71c04702725f04038ddae8d582d2bf3` |
  | `shared/types.ts` | `25a229ff4e29e748cb04c2582470e476aabc7cdbc91c2bde8cacfdeb829f9f4e` |
  | `tests/player-chat-replies.test.ts` | `096c347cba29f0ce98c1eefa3b69afa2108b803a183c03babd7be1f85ee29827` |

- Omezení. Synchronous send značí přijetí do transportu na aktivním socketu. Nejde o potvrzení příjmu aplikací protistrany. Přímý serverový smoke, TypeScript a build patří integrátorovi pod jeho rezervaci.
- Procesy a rezervace. Všechny vlastní cílené příkazy skončily. Vlastní server, port, build ani další checkout jsem nezaložil. Rezervaci uvolňuji po odeslání tohoto předání koordinátorovi. Stav tasku a commit řeší integrátor.

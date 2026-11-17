# Předání rohového chatu

Vlastník `chat-redesign-20261117-surface`, task `chat-redesign-surface-20261117`, příjemce `chat-redesign-20261117-root`. Kanonická pracovní kopie na main. Zápisy patří pouze souborům `client/player-chat.tsx`, `client/player-chat.css`, `client/player-chat-model.ts`, `tests/player-chat-model.test.ts` a tomuto předání.

Komponenta `PlayerChat` nahrazuje oddělený náhled a dialog. Jeden zachovaný DOM obsahuje lidskou a AI prezentaci a přepíná stav idle/composing/expanded. Rohový výpis drží posledních pět zpráv, v úzkém režimu dvě, psaní celý omezený výpis a zvětšení vybranou konverzaci. Příjemce je konkrétní volba jediného selectu. Odpověď vyřeší opačný směr příchozího DM, zachová koncept cílového kanálu, přidá originál a zaostří editor.

Původní `usePlayerChat` dál vlastní omezenou historii, koncepty, timeout a korelované výsledky. Prezentace nepřidává transport. Zanikl osmivteřinový časovač výpisu. Čistý model zpracovává migraci preferencí a výběr historie. Volba skrytí soukromých textů maskuje DM v pasivním či jiném kanálu, ale explicitně vybraná DM konverzace při psaní a zvětšení text zpřístupní.

Viditelné a odhalené řádky se označí přečtené pouze při aktivní interakci. Pro různé pohledy se drží pozice posuvu. Změna velikosti nepřemountuje editor ani AI obsah. Parent vlastní zachycení Escape, spotřebování prvního kliknutí do světa a synchronní blokaci herních vstupů. CSS očekává společný `data-chat-mode` v game-shell, ukotvení uvnitř minimapy a `.chat-map-toggle` od parentu.

Ověření 17. 11. 2026. `node --import tsx --test tests/player-chat-model.test.ts` prošlo 4/4. Případy pokrývají explicitní uložené preference, obousměrné DM adresování, stálé zprávy bez časové expirace a soukromé maskování. Scoped strict TypeScript pro komponentu/model/testy prošel. Prettier na čtyřech vlastních souborech a `git diff --check` prošly. Praktický React/browser/GPU průchod spouští koordinátor.

Žádný vlastní server nebo pomocný proces nezůstává. Soubory předávám koordinátorovi k integraci, commit jsem nevytvářel. Rezervaci uvolňuji po tomto zápisu.

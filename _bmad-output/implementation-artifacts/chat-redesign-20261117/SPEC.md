---
title: 'KEY-78: Přímá komunikace při hraní a jednotný Jantar'
type: 'feature'
created: '2026-11-17'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'c5289bd46921b702fa7ec6b3d3800bae9c97c468'
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md', '{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Uživatel výslovně schválil předchozí plán a požádal o implementaci">

## Intent

Chat musí být vidět při hraní a umožnit napsat nebo odpovědět jedním kliknutím v rohu. T zůstává nenápadnou nápovědou. Po Enter se odešle zpráva a pokračuje psaní. Esc nebo první kliknutí do světa vrátí hru se zachovaným konceptem. Společný výpis ukazuje také text DM a událostí. Crazy Typka je konkrétní položka výběru adresáta a běží ve stejné ploše.

Střídmý Jantar pokrývá HUD i obsah všech oken v menu a ve hře. Manrope, 16 px čtený text a zprávy, 14 px ovladače, 12 px metadata, 22 px titulky. Váhy 400/600/700, rohy 8/12 px, rytmus 4 px. Teplé plochy a krémový text s jantarovým fokusem a aktivní volbou.

## Boundaries & Constraints

Výchozí trvalý výpis má posledních pět hráčských zpráv a na úzkém displeji dvě. Text nemizí časovačem. Zvětšení je sekundární pro historii. Příjemce editoru je vždy jasný a nové zprávy jej nepřepínají. Odpověď nastaví přesnou konverzaci a citaci rovnou v rohu. Při psaní v úzkém režimu se mapa sbalí do tlačítka.

Soukromé texty jsou ve výchozím stavu viditelné podle volby uživatele, lze je skrýt. Původní explicitní badge/hidden a vypnutí T respektovat. Zachovat stávající serverová oprávnění, potvrzení, omezenou paměť, odmítnutí po ztrátě připojení a oddělený AI store včetně citací/consentu. Při změně velikosti se žádný store neobnovuje.

## I/O & Edge-Case Matrix

| Situace | Výsledek |
| --- | --- |
| Pole nebo T | Fokus rovnou v editoru, hra vyčistí držené klávesy. T neopustí zvolenou AI konverzaci. |
| Odpověď na příchozí DM | Cíl skutečný odesílatel, citace, fokus. Další příjem DM nepřesměruje koncept. |
| Enter / IME | Enter odešle a zachová fokus. IME potvrzení textu nevytvoří odeslání. |
| Esc / kliknutí do hry | Zachovat koncept a citaci, spotřebovat návratové gesto, obnovit ovládání. |
| Zvětšení a zmenšení | Zachovat konverzaci, koncept, citaci a čtenou pozici. |
| Odpojení a chyba | Zachovat dostupnou historii a koncept, odeslání vypnout, návrat podle stejné identity. |

</frozen-after-approval>

## Code Map

`usePlayerChat` vlastní 200 zpráv, 32 konceptů a pending korelaci. `ui.tsx` vlastní relaci a jediný AI store. `Game.setUiModal` synchronně maže vstupy. `game.keyDown` má M/J/G/Esc před obecnou modal kontrolou, vyžaduje guard celé aktivní plochy. Stávající tematický kořen nepokrývá sourozenecké dialogy menu a specializované styly obsahují vlastní písma/barvy.

## Tasks & Acceptance

- [x] Komponenta PlayerChat se stavy idle/composing/expanded, přímá odpověď, soukromé texty, migrace preferencí a modelové testy.
- [x] App integrace, ochrana vstupu, AI prezentace a callback testy.
- [x] Jantar na společném kořenu i specializovaných površích.
- [ ] Interaktivní fixture z produkčních komponent, browserové rozměry/kontrast, skutečný multiplayer a build.

## Design Notes

1. Problém je opakované otevření modalu, následný fokus a skryté zprávy.
2. Mechanismus doložen v CSS breakpointech, osmivteřinovém časovači, title focus a různých fontových zkratkách.
3. Jedna komunikační plocha mění režim, historie a transport zůstávají společné. Samostatné rohové a modální kopie by duplikovaly scroll a AI lifecycle. Pouhé přebarvení neopraví počet kroků.
4. Metrika je jeden krok do psaní/odpovědi, počet dostupných zpráv, shodné computed styly.
5. Správnost je správný adresát, nepřenesené koncepty, potlačené herní vstupy při psaní a čitelný text.
6. Přijetí vyžaduje cílené regrese, praktický průchod při 390 px, noc/den, dva hráče a nezávislou kontrolu.

## Implementation Notes

Změny probíhají v kanonickém main po předání původního vlastníka c5289bd4. Stránky s reálnou hrou a velké buildy mají fyzické výstupy na D:. Serverový kontrakt zůstává stávající.

## Spec Change Log

## Review Triage Log

- Soukromý koncept a citace při idle zůstávaly viditelné i po vypnutí náhledu DM. Opraveno maskováním editoru i citace a ověřeno prohlížečem.
- Skrytý AI log mohl ztratit návaznost posuvu po dokončení odpovědi. Viditelnost a velikost jsou nyní explicitní vstupy obnovy posuvu.
- Odhalení vybraného DM neaktualizovalo přečtené zprávy. Přepnutí adresáta a nastavení obnovují kontrolu skutečně viditelných řádků.
- Světlé ilustrace ukázkových akcí měly nedostatečný kontrast popisku. Artwork i ukončené stavy převedeny na čitelnou paletu.
- Obecný mobilní selector natahoval nové ikony uvnitř minimapy. Zúžen na vlastní SVG mapy.
- Obecný styl chatových tlačítek přebíjel AI odeslání. Vlastní tlačítka AI jsou ze selectoru vyřazena, browser ověřil jantarovou výplň i inkoust.
- Samostatný feedback neměl tokeny bez úvodní stránky. Jeho stylesheet explicitně importuje společné téma.
- Rohy panelů přebíjela hodnota pro malé ovladače. HUD používá příslušný panelový token.
- Samostatná fixture neověřovala skutečný návrat do světa. Doplněny testy extrahovaných produkčních canvas handlerů a Game.keyDown, navíc bude následovat živý průchod.

## Verification

Cílené modelové, callback, HUD/i18n/AI testy. Skutečná React browser fixture slouží také jako klikací návrh všech stavů. Kontrola fontů všech hlavních ploch, 200% text, úzké/nízké okno, Enter/IME/Esc/Tab, příchod DM při čtení, zrušení reference, expirovaná reference, disconnect, přenos veřejné i soukromé citace mezi dvěma identitami.

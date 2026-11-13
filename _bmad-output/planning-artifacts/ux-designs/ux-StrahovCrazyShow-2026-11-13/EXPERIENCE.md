---
name: Strahov Crazy Show · herní chat
status: draft
updated: 2026-11-13
---

# Herní chat — návrh chování

## Foundation

Desktopová hra s klávesnicí/myší a dotykové rozložení. [DESIGN.md](DESIGN.md) vlastní vzhled; [offline maketa](mockups/chat-hud.html) ilustruje návrh s fiktivními zprávami. Výchozí otevření při hraní, časy mizení a preference níže jsou návrhy k ověření. Aktuální zadání končí návrhem; herní runtime se v této etapě nemění.

## Information Architecture

| Povrch | Co hráč najde |
| --- | --- |
| Hra | Náhled nejvýše 3 doručených globálních/místních zpráv, spouštěč Chat i v liště. Soukromé a událostní zprávy pouze jako počty. |
| Středové okno | Lidské kanály Celý Strahov, V okolí, Soukromé a Akce. Aktivní publikum vždy u pole. V soukromém/událostním kanálu se vybírá konkrétní dostupná konverzace či událost. Vstupy z karty hráče a události cílí přímo tam. |
| Crazy Typka · AI | Samostatný pohled se stávajícím App stavem a zachovanými podmínkami soukromí. Přepnutí pohledu nerozesílá nic hráčům a nepoužívá lidské reference. |
| Nastavení → Chat | „Poslední zprávy“ (výchozí), „Jen odznak“, „Skrýt náhled“. I při skrytí zůstane dostupný vstup z lišty; skrývá se i odznak. |

## Voice and Tone

Krátce a konkrétně. „Píšeš do: V okolí · stejné patro / venkovní zóna, méně než 40 m“; „Odpovídáš Mie“; „Původní zpráva není dostupná“; „Nepodařilo se odeslat. Text zůstal v poli.“ Czech/English se stejným významem. Status neslibuje doručení před potvrzením.

## Component Patterns

| Prvek | Pravidlo |
| --- | --- |
| Pasivní náhled | Aktualizace nesmí brát fokus ani zachytávat herní vstupy mimo samotný launcher. Držet krátký výpis přibližně 8 s od každé nové zprávy, pak jej skrýt a nechat launcher. Zvuk ve výchozím stavu vypnutý. Mutované/blokované zprávy se nezobrazí ani nepřičtou. |
| Otevřené okno | Jeden zdroj historie pro náhled a okno. Do nových zpráv automaticky posunout pouze při čtení u konce; při čtení historie zobrazit „N nových zpráv“ s návratem dolů. Nečtené označit přečtené až při zobrazení konce konkrétní konverzace. |
| Odpovědět | Akce dostupná myší, klávesnicí i dotykem; vybere právě jednu doručenou zprávu v tomto kanálu. Nad editorem se ukáže odnímatelná reference. Po odeslání zůstane odpověď v chronologii, s autorem/úryvkem, pokud má příjemce oprávnění. Kliknutí na reference přejde na původní zprávu, jen když je ve viditelné historii. Bez vnořování a automatického pingu. |
| Editor | Text a reference se vážou na přesný kanál/konverzaci. Při přepnutí se nikdy nepřenášejí do cílového kanálu; návrat obnoví původní rozpracovanou zprávu během téže relace. Odpojení vypne odeslání a drží rozepsaný text pouze v paměti téže identity; změna identity nebo odchod do úvodu stav vyčistí. |

## State Patterns

| Situace | Chování |
| --- | --- |
| Není co číst / není konverzace | Lokální prázdný stav a instrukce; u DM/akce bez dostupného cíle nevytvářet editor pro jiné publikum. |
| Reference mezitím vypršela nebo je nedostupná | Při pokusu o odeslání zachovat text, vysvětlit stav a umožnit explicitně odebrat reference a odeslat bez ní. V historii nedostupná citace ukazuje neutrální popisek bez jména/textu a bez dalšího dotazu. |
| Ztráta spojení nebo oprávnění | Neprovést automatický retry ani změnu kanálu. Zachovat návrh podle relace, označit konkrétní příčinu a povolit odeslání až po obnově. |
| Samostatná prohlídka | Bez multiplayerových textů, identity, kanálových odznaků či dotazů na historii; samostatná dostupnost AI zůstává. |

## Interaction Primitives

- `T` při aktivním ovládání světa otevře poslední lidský kanál a zaostří editor. Zkratka funguje mimo textové pole a jiné dialogy a dá se vypnout. Kliknutí na náhled, lištu nebo vstup z karty otevře chat. Při dotyku může nejprve zaostřit hlavičku, aby se při čtení nevyvolala systémová klávesnice. `Enter` odešle při platném vstupu mimo IME kompozici. `Esc` a pojmenovaný křížek zavírají.
- Při otevření synchronně uvolnit zachycení myši a držené klávesy, potlačit pohyb, kameru, kliknutí do světa i herní zkratky. Autoritativní svět pokračuje. Po zavření vrátit fokus na spouštěč nebo herní plátno podle vstupu, bez automatického zamknutí myši nebo obnovy držených akcí. Ověřit přechody s mapou, nastavením, vozidlem a obnovením spojení.

## Accessibility Floor

Modální dialog se jménem a viditelným fokusem; klávesnice zůstává v dialogu do zavření, pak se fokus vrátí. Vlastní `Esc` nesmí spolknout globální obsluha herního vstupu. Obsah chatu lze vybrat, navigovat a rolovat klávesnicí. Přírůstky aktivního logu oznamovat šetrně (např. `role="log"` po kontrole se čtečkou); pasivní výpis nevytváří druhý živý region. Zkontrolovat kontrast, zvětšení, reduced motion a dotyková tlačítka včetně odeslání, odpovědi a zavření. [WAI APG – modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Responsive & Platform

Desktop má prostor nad minimapou. V úzkém režimu zbývá odznak u tlačítka a otevřený chat zabírá téměř celou obrazovku. Při nedostatku výšky se posouvá i okno, aby se historie nesbalila a editor i zavření zůstaly dosažitelné. Ověřit skutečný dotyk i landscape, zvlášť překryvy joysticku, gest kamery a akcí.

## Inspiration & Anti-patterns

[Facepunch: Rust chat](https://wiki.facepunch.com/rust/global_text_chat) je podklad pro rychlý vstup `T` a jasné oddělení kanálů. `Tab` necháváme pro navigaci. [Discord Replies FAQ](https://support.discord.com/hc/en-us/articles/360057382374-Replies-FAQ) je podklad pro odpověď v kontextu; Strahov přidá viditelnou akci i mimo hover a nevnucuje ping. Průhlednost a středové okno vycházejí z požadavku uživatele.

## Key Flows

1. **Mia míjí blok 6.** V náhledu zahlédne „V okolí · Kuba: Kudy do čajovny?“, stiskne `T`, přepne na V okolí a vybere **Odpovědět**. Vidí, komu a kam odpovídá, napíše „Vchod je z druhé strany.“ a odešle. `Esc` vrátí ovládání do hry.
2. **Nela se vrací ke starší otázce.** Při čtení přichází nové zprávy, ale historie drží pozici. Klikne na citaci, zvýrazní se dostupný originál; „N nových zpráv“ ji pak vrátí dolů.
3. **Mia dostane soukromou zprávu při chůzi.** Vidí jen počet; z detailu kontaktu se otevře přesná konverzace. Přepnutí na Celý Strahov neukáže ani nepřenese její soukromý rozepsaný text.

## Přejímka návrhu a další etapa

Porovnání variant, bezpečný tok reference a budoucí praktické ověření jsou v [podkladech](research.md). Otevřené návrhové volby: zda mají náhledy mizet po 8 s a jaké mají být výsledné hranice pro dotykové rozložení. Maketa má sloužit k posouzení obou stavů a nezavádí trvalý chat ani nové kanály.

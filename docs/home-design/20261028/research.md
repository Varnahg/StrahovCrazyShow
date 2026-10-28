# Jantar: průzkum před implementací

Datum 28. 10. 2026. Zadání je [KEY-66](https://linear.app/gigeconomy/issue/KEY-66), schválený návrh v chatu `01a17fd8-017a-7852-87f9-cd1538e1bde2`. Přijatý základ je `de6f87a2efbf8596bb03efae863e8d6763e22774`. Samostatné definice práce přidal koordinátor commitem `e09d60fa24419a93b26f15e21c862e95e44aff2f`. Nová pracovní kopie je oddělená, původní primary WIP se nepřebírá.

## Doložený řetězec

`client/ui.tsx` drží profil a jediný `useCrazyTypka()` nad větvením menu/hra. `enter("multi")` nejdříve dokončí připojení a teprve potom přepne režim. Failed join zůstává v menu s chybou. UI welcome slot nyní obsahuje interaktivní MapView a podrobný editor otevíraný explicitně.

`AvatarEditor` importuje a vytváří preview při mountu, ruší přípravu přes AbortController a uklízí získané či opožděné controllery. Obsahuje vlastní pole přezdívky, šest předloh, volby vzhledu i renderer fallback. Lze jej přesunout kompozicí a lokálním CSS bez zásahu do jeho aktuálně odděleně vlastněných souborů. Pouhé CSS schování by jeho lifecycle neukončilo.

Presence poller v WelcomeScreen má jeden request, timeout, hidden-page pause a cleanup; odmítá neplatné počty a chybu neinterpretuje jako nulu. Má zůstat jediný nad oběma lokálními obrazovkami.

AI transport je samostatný od lidského chatu. App store zachovává draft, pending operaci a recovery i při odmountování samotného pohledu. Zavření nového popupu nesmí volat reset/dispose. Default pohled se používá také ve hře a musí zachovat původní markup/ochrany. Nový compact test se záměrně odděluje od RAG-vlastněného `tests/crazy-typka-ui.test.ts`.

Mapová data jsou původní projektové map/street/catalog JSON. B6 má dominantní hranu `[1.47, 49.8]`; společné otočení o přibližně 1,69077° vyrovná tuto osu bez změny tvarů a vzdáleností. Není potřeba interaktivní MapView, další canvas nebo mapa z vymyšlené fotografie. Zdroj obsahuje 143 budov a čtyři materiálové skupiny komunikací.

## Primární podklady

- [React: stav je vázaný na render tree](https://react.dev/learn/preserving-and-resetting-state) podporuje oddělení App store od dočasného pohledu a podmíněné připojení editoru.
- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) popisuje průsvitnost a hranici backdrop root; celé panely se proto nestmívají rodičovskou opacity.
- [MDN: reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) je základ pro vypnutí dekorativního posunu.
- [MDN: dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) a existující `client/feedback.tsx` poskytují vzor pro přístupné modal information/controls okno.
- [Oficiální Manrope](https://github.com/google/fonts/tree/main/ofl/manrope), jeho OFL a FONTLOG: lokální variable TTF má ověřenou dostupnost, přibližně 165 kB a latin-ext. Konkrétní stažený hash a licence zaznamená vlastník assets.

Podklady byly otevřené 28. 10. 2026. Nejde o tvrzení, že dostupnost CSS funkce dokazuje výkon na konkrétním GPU.

## Reprodukční evidence a mezery

Read-only audit potvrdil čistý main a současné sloty v kódu; dva oddělení agenti ověřili chat/editor chain a map/font podklady. Prototyp prošel cílenými DOM kontrolami, ale nenahrazuje produkční browserovou/3D přejímku. Aktuální chráněná URL 4182 vrací produkční `index-DSBPccIM.js`; server PID60528 a jeho zdroje se nemění. Inventář dostupných browserů před touto etapou neukazoval otevřenou loopback herní kartu; před GPU spuštěním se ověří znovu.

Nová managed pracovní kopie má při vstupu všech 609 LFS souborů jako pointery. Žádný asset se nehydratuje pod UI/setup claimem. Koordinátor původních modelů přebírá přesný materializační I/O krok nad stabilním HEAD a místním LFS store s kontrolou OID/velikosti/hashů, bez regenerace a bez cizích inode. Fyzické frozen dependencies jsou samostatný setup. Výsledky jejich následné kontroly patří do handoffu/verification.

Chybí skutečné renderové ověření finální kompozice, mobilního přetečení a fokusového toku, startup editoru i celé hry a finální plná pipeline. Výkon, cache hit-rate a FPS zatím nebyly měřené. Živé AI generování nemá v této etapě nový testovací rozpočet; testy nebudou používat placený endpoint ani posílat feedback hlášení.

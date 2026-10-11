# Strahovský deník

Samostatný herní panel obsahuje 36 hesel v šesti kapitolách: Strahov, komunita, kolejní život, projekty, místa a archiv. Zdroje byly zkontrolovány 10. 10. 2026. Nevyžaduje registraci, nevolá multiplayer, nevytváří skutečný profil a nikoho nekontaktuje. Obsah a fotografie jsou součástí lokálního klienta; odkazy na skutečné služby se otevřou až po kliknutí.

## Integrace

```tsx
import { Journal } from './journal';
import { entryForPlace, PROJECT_PLACES } from '../shared/journal';

<Journal
  open={journalOpen}
  onClose={() => setJournalOpen(false)}
  initialEntryId={journalEntryId}
  onPlace={id => { selectMapPlace(id); setJournalOpen(false); openMap(); }}
/>
```

Kořenové GUI spravuje klávesu J, odemčení kurzoru a přerušení herního ovládání. Deník sám řeší Escape, uzavření kliknutím mimo knihu a zachycení Tab uvnitř dialogu. `initialEntryId` umožňuje otevřít článek z mapy. `entryForPlace(id)` vrací první příslušné heslo; úplný seznam je v `PROJECT_PLACES[i].journalEntryIds`.

`PROJECT_PLACES` je čistý datový export bez importu `shared/world`. Obsahuje 17 bodů s popisem skutečného umístění, proveniencí, přibližnou přesností a případným patrem. `worldLabel:false` brání zaplavení 3D scény všemi názvy projektů. Body převážně označují budovu nebo oblast, nikoli zaměřené vstupní dveře; více služeb v jedné budově má mapa seskupit. Tyto body nevytvářejí fyzické interiéry ani rezervační oprávnění.

## Obsah a zásadní ověření

- Všech 13 současných položek hlavního adresáře projektů SH: 3D tisk, AVC, Fotbálek, Fotokomora, GameDev, Hudebny, MacGyver, SH liga ve stolním tenise, SHerna, SHOW, Taneční, Včely a Zahrádky. Slovo „otevřeno“ v adresáři není živou otevírací dobou.
- Fotoateliér je podle adresáře zrušen od 1. 7. 2026; přístup k místnosti řeší Fotokomora. Modelland je v archivu jako ukončený v roce 2026. Archiv zahrnuje také MonSilicu a Výtvarný kroužek.
- Současné praní se řídí službou na B4 otevřenou 1. 4. 2025. Od 1. 5. 2025 byly běžné staré blokové prádelny uzavřeny. Zkušební cena z dubna 2025 není vydávána za současný ceník. Návod zmiňuje kartu evidovanou v ISKAM a aplikaci Vyprano; žádná taková identita se nepřidává do hry.
- Kniha závad: oficiální ubytovací účet SÚZ → Ubytování → Kniha závad. Herní panel je průvodce a odkaz, nikoli nefunkční kopie formuláře.
- Role zástupce bloku, celoklubových zástupců, předsedy a centrály vycházejí ze stanov a současných oficiálních kontaktů. Profesní jména vedení mají datum kontroly. Osobní čísla pokojů studentů, soukromé profily a kontaktní importy se neukládají.
- Rozpočet 2026 v1.2 je uveden jako konkrétní schválený základ usnesení 2025-0074. Rozlišuje plán příjmů 6 970 700 Kč od příjmů s financováním 10 408 989 Kč. Nejde o poslední změnový rozpočet ani skutečný stav čerpání.
- SÚZ: současný ředitel ověřen jak na webu ČVUT, tak v profesním adresáři ČVUT; hospodářky přes oficiální adresář SÚZ. Historická kapitola popisuje doložené proměny kolejí, nepřisuzuje SÚZ nezjištěné datum založení.

Při průzkumu se objevily rozpory mezi oficiálními stránkami v počtu bloků a roku dokončení B1, mezi staršími a novými kontakty a v číslování mezipatra fotbálku B8. Sporné údaje nejsou vydány za změřenou skutečnost; deník používá bezpečnější obecný popis a aktuální kontaktní odkazy. Podrobnosti jsou v `source-audit.json`.

## Fotografie a licence

V `public/journal/` jsou původní soubory bez projektových úprav, celkem 2 078 397 bajtů. Zobrazení zachovává poměr stran. Datum, autor, licence, původ a informace o úpravách jsou přímo pod každým snímkem; SHA-256 je v datech a testech.

| Soubor | Původ / autor | Datum | Licence |
| --- | --- | --- | --- |
| `campus-2012.jpg` | [Koleje Strahov – ŠJů, Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Koleje_Strahov.jpg) | 17. 10. 2012 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `stadium-2005.jpg` | [Praha Strahovsky stadion – che, upravená publikovaná verze Miraceti](https://commons.wikimedia.org/wiki/File:Praha_Strahovsky_stadion.jpg) | pořízení 27. 8. 2005; verze 15. 11. 2005 | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) |
| `b6-plan.jpg` | [Orientační plán B6 – přispěvatelé SH Wiki](https://wiki.sh.cvut.cz/kolej/bloky/blok_6), kopie již ověřeného atlasu projektu | datum vyhotovení neuvedeno | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

Historické fotografie nejsou podkladem pro tvrzení o současném stavebním stavu. Z Google Street View ani Mapy.com nebyly převzaty obrazové soubory. Textová shrnutí odvozená z SH Wiki jsou uváděna pod CC BY-SA 4.0 s odkazem na jednotlivé prameny; autorské krátké souhrny jiných oficiálních stránek zachovávají přímé odkazy.

## Ověření

`pnpm exec tsx --test tests/journal.test.ts`: 7/7 PASS. Testy kontrolují úplnost současného seznamu projektů, archivní stavy, platnost vazeb článek ↔ mapový bod, vyhledávání s českou diakritikou, poškozené lokální úložiště, aktuální praní, hash a licence fotografií a absenci síťové/účtové implementace v panelu. `pnpm exec tsc --noEmit` následně PASS v celém aktuálním workspace.

Samostatná kontrola v reálném in-app prohlížeči na `/docs/journal/preview.html` ověřila hledání „pracky“, otevření návodu B4, uložení záložky, předání správného mapového ID, Escape, znovuotevření, přetrvání záložky po reloadu a načtení obou skutečných fotografií bez konzolových chyb. Desktop měl 1280 × 720. Mobilní iframe na `/docs/journal/preview-mobile.html` měl skutečný vnitřní viewport 390 × 780, bez vodorovného přesahu dokumentu ani článku. Pro tento test nebylo přenastavováno globální okno prohlížeče.

Snímky: `qa-laundry-desktop.png`, `qa-history-desktop.png`, `qa-laundry-mobile.png`. Výsledky jsou také v `browser-qa.json`. Tato kontrola je důkazem panelu; herní propojení J/mapa musí být navíc ověřeno po integraci kořenového GUI. Sama neověřuje multiplayer ani FPS.

HTTP dostupnost zdrojů lze znovu prověřit příkazem `node docs/journal/audit-sources.mjs`. Audit ukládá status, přesměrování, čas a hash do `link-audit.json`, nekopíruje cizí stránky. Tři projektové subdomény měly neúspěšné HTTPS spojení; příslušné odkazy v deníku proto vedou na jejich dostupné oficiální wiki stránky. Úspěšné HTTP načtení není samo o sobě potvrzením správnosti obsahu.

## Známé hranice

Jde o zdrojově podložené první vydání, nikoli automaticky aktualizovaný adresář. Čerstvost je potřeba znovu ověřit při dalším vydání. Skutečné kontakty, provozní doby, členství, rezervace a rozpočtové změny se vyřizují u organizací. Body uvnitř budov nejsou zaměřením konkrétních pokojů; stolní tenis nemá v adresáři stálou místnost, proto mu žádnou nevymýšlíme. Včelnice a Zahrádky zůstávají přibližnými oblastmi.

# Předání chat-monitor-notice-20261106

Vlastník `chat-monitor-20261106-notice`, příjemce `/root`. Kanonický checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, výchozí commit `20fb1d10`.

## Plán ověření

- Problém. Přepis smí vzniknout až u nové relace klienta, kterému se zobrazila aktuální informace o monitoringu.
- Mechanismus. Úvod i HUD používají `CrazyTypkaChatActions` nad jediným stavem App. Jejich ⓘ se připojí jen při otevřeném AI chatu. Server vydává token relace až při odeslání dotazu.
- Změna. Existující ⓘ dostane lokalizovanou informaci z verzované schopnosti serveru. Po jeho skutečném otevření si klient zapamatuje verzi v paměti jedné stránky a připojí ji při zakládání další relace.
- Metrika. Počet a tělo požadavků na založení relace před zobrazením a po zobrazení informace.
- Správnost. Chybějící nebo neplatná schopnost dál povoluje chat. Link používá absolutní HTTPS bez přihlašovacích údajů. Klient sdílí stav mezi úvodem a HUD.
- Přijetí. Obě lokalizace obsahují 3 měsíce, upozornění a odkaz. Po skutečném zobrazení odejde značka podporované verze jen při vytvoření relace. Legacy žádost zůstane `{}`. Reset vyčistí relaci, která je právě otevřená.

Jednotlivé relace nejsou vhodným místem pro zobrazování informace, protože po resetu by se zobrazovala znovu. Perzistence v `localStorage` by označila za informovaného také dalšího člověka ve stejném profilu prohlížeče. Sdílený store v paměti App umožňuje zachovat jedno zobrazení při přepínání vstupních bodů a po novém načtení zobrazí informaci znovu. Pro otevření před první interakcí využijeme krátký React layout effect nad již připojeným `details` s nativním zavíráním. [React `useLayoutEffect`](https://react.dev/reference/react/useLayoutEffect), [HTML `details`](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-details-element), [HTML web storage](https://html.spec.whatwg.org/multipage/webstorage.html).

## Výsledek a ověření

- Sdílený kontrakt přijímá `noticeVersion: 1` a absolutní HTTPS `privacyUrl` bez přihlašovacích údajů. Neznámá nebo chybná schopnost se chová stejně jako původní status. Bublinka používá jeden společný kód pro úvod a HUD. Po automatickém otevření v již připojené komponentě udrží viděnou verzi v App paměti. Obě lokalizace obsahují dobu uchování, přístup správce, upozornění a odkaz na podmínky a kontakt pro výmaz. Text koše rozlišuje nový chat od uchování přepisu.
- Označení se posílá jen při založení nové relace. Zobrazení u již vydané relace nemění její způsobilost. Při doložené odpovědi HTTP 400 `invalid-request` na označenou žádost klient jednou zkusí původní `{}`. Potvrzený provozní stav a přesný chat replay zůstávají oddělené od této kompatibility.
- Změněné soubory jsou `client/crazy-typka.tsx`, `shared/crazy-typka.ts`, `tests/crazy-typka-ui.test.ts` a toto předání. Cizí WIP nebyl převzat. Jeden stav pro oba widgety zachovává jejich dosavadní lifecycle a nepřidává perzistenci ani nové závislosti.
- Dne 6. 11. 2026 v 22:59 UTC `node --import tsx --test tests/crazy-typka-ui.test.ts tests/crazy-typka-compact.test.ts tests/crazy-typka-contract.test.ts` skončil s kódem 0, 64 z 64 prošlo. Pokryta je verze a bezpečný odkaz, označení budoucí relace, původní tělo požadavku, rollback, lokalizovaný statický výstup a původní chování widgetu. `git diff --check` pro tři změněné soubory prošel. Nebyly spuštěny pomocné služby ani vyhrazené porty.
- Statický výstup a simulované HTTP nenahrazují skutečné otevření v prohlížeči. Společný produkční build a případné ověření úvodu a HUD řídí koordinátor. Změny nejsou samostatně commitnuté.

Identita vstupů při ověření nad `20fb1d104f0fcc2860e6ea88d868b4c96ad3d303` podle SHA-256.

| Soubor | SHA-256 |
| --- | --- |
| `client/crazy-typka.tsx` | `47cca4d75b375c68d0625993bf9ca66196de2e2e96c134f67a9a6496058912bf` |
| `shared/crazy-typka.ts` | `e124c5c50d34b9cb67e23cd9d109c46e2d8a2bedc8daf861f7058caf8530a465` |
| `tests/crazy-typka-ui.test.ts` | `1b6dea26592f673000cffdc2990968855411b51d130c03c576a06f59806ddb8a` |

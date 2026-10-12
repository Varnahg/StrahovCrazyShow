# Neměnný záznam dokončeného měření — 12. října 2026

Dokončený benchmark držel odkazy na živé statistiky rendererových controllerů. V později otevřeném UI záznamu tak mohl zůstat vrchní počet trávy 582, zatímco vnořený `photographicGrass` již po zrušení scény ukazoval `ready=false` a `draws=0`. `PhotographicGrass.dispose()` tyto hodnoty správně vynuluje v původním objektu; chybou bylo sdílení tohoto objektu se starším výsledkem měření.

`Game.frame` nyní při dokončení desetisekundového měření jednou volá `snapshotBenchmarkDiagnostics`. `structuredClone` oddělí pouze malé diagnostické záznamy: renderer, ambient, reality pack včetně B6 errors, render cost controllerů, adaptive rendering, GPU metadata a presentation rate. Některé z nich již vracejí nové či zmrazené objekty; společná hranice vlastnictví pokrývá také jejich vnořené hodnoty. Délka měření se odečte před kopírováním.

Nově vytvořený `modelReview`, render inventory a ukončené frame samples se předávají přímo bez další kopie. V běžných snímcích nic nepřibývá. Odstranilo se oddělené ruční kopírování B6 errors, které nyní pokrývá společný snapshot. Živé controllery zůstávají měnitelné; „neměnný“ zde znamená, že pozdější změny hry nepřepisují uložený záznam, nikoli zákaz záměrné editace výsledku jeho příjemcem.

Regrese používá skutečný `PhotographicGrass`, jeho zdrojový pack, Babylon NullEngine a skutečný adaptive controller. Zachytí připravenou trávu, posune kameru, změní medium na low, aktualizuje statistiky a provede `dispose`. JSON původního výsledku zůstane přesně shodný, zatímco původní tráva skutečně přejde na low limit a při zrušení na `ready=false`/`draws=0`. Další snapshot zachytí novější stav; inventáře a samples zachovají identitu bez duplikace.

- Negativní kontrola s pomocnou funkcí vracející živý objekt místo kopie: **0/1**, očekávané selhání „later updates must not rewrite the completed export“. [Původní log](verification-evidence/benchmark-snapshot-20261012/negative-alias-control.log).
- Finální nový lifecycle test a devět existujících presentation/download regresí: **10/10 PASS**. [Log](verification-evidence/benchmark-snapshot-20261012/targeted-tests.log).
- Scoped TypeScript včetně `client/game.ts` a nového testu: **exit 0**. [Konfigurace v původním relativním umístění](verification-evidence/benchmark-snapshot-20261012/tsconfig.json.txt), [prázdný log](verification-evidence/benchmark-snapshot-20261012/typecheck.log). Archivní `.txt` není přemístěnou spustitelnou konfigurací.
- Diff/whitespace kontrola dotčeného kódu: **exit 0**. [Výsledky a SHA](verification-evidence/benchmark-snapshot-20261012/results.json).

Tyto testy jsou CPU regresí životního cyklu záznamu, nikoli potvrzením FPS nebo úplnou herní přejímkou.

## Praktické UI a export celé hry

Root následně dokončil skutečné měření tlačítkem v Nastavení na medium, rozbalil kompaktní podrobnosti a stáhl úplný JSON. V běžící hře přepnul detail na high: již zobrazené podrobnosti zůstaly stejné a druhé stažení bylo byte-identické. Nakonec obnovil medium. [Protokol této kontroly](verification-evidence/benchmark-snapshot-20261012/whole-game-export-20261012.json), [high kvalita se zachovaným záznamem](verification-evidence/benchmark-snapshot-20261012/quality-changed-record-retained.png).

Oba soubory měly **2 133 242 bajtů**, inventář **2795 meshů**, **371 intervalů snímků** a SHA-256 `ee2e670c60b8369d9f3eb2f9056377e38cfba4b4dace425f6414e4dedbe4fa9d`. Protokol uvádí Intel UHD 630, CSS i interní rozlišení **1280×720**, render/asset chyby **0/0**. Počty a shodné bajty jsou výsledkem rootovy kontroly stažení; archivní snímek dokládá stav rozhraní, nikoli sám obsah obou souborů.

Na tomto startovním místě měla připravená fotografická tráva **0 odeslaných dávek**. Praktický browser scénář ověřil změnu kvality, nikoli vynucené zrušení scény s aktivními trávníkovými dlaždicemi; to dál dokládá samostatná výše uvedená CPU regrese. Šlo o vývojovou hru s možným předchozím HMR a `sourceSnapshotId=null`, proto výsledné FPS ani číslo v HUD nejsou přejímkou produkčního checkpointu či GeForce. Celá produkční pipeline zůstává samostatným následným krokem.

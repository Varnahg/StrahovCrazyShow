# Kamera uvnitř vlastní postavy — 11. října 2026

## Doložená závada

Ve větvi `codex/visual-quality-jump`, nová hra na portu 5190, start a držení S přibližně 4,5 s zatlačí kameru k postavě před zaparkovaným autem. Root zaznamenal polohu postavy x=110.071907, z=13.786036 a [obraz vyplněný trupem/hlavou](verification-evidence/camera-obstruction-20261011/torso-near-parked-car.png).

Nezávislá CPU reprodukce používá skutečný `Simulation`, `Actor.step`, `stepRigidWorld`, stejné vstupy z `movementFromKeys` a původní camera follow. Po 45 klidových a 270 pohybových krocích při 60 Hz skončila na x=110.070114, z=13.786052, rameno kamery měřilo 0.210835 m a vzdálenost čočky od hrudního cíle 0.210851 m. Původní Game v této situaci ponechal vlastní model viditelný. Pozice k vykreslení je předchozí fyzikální pozice při interpolačním alpha=0, stejně jako v Game; nejde o teleportační zkoušku.

## Integrovaná oprava

`Game.updateCameraFollow` obsahuje původní kolizní řešení beze změny. Lokální LOD a animace se vyhodnotí jednou až po jeho konečné poloze. Ostatní avatary zachovávají původní pořadí aktualizace. Společný `updateAvatarPresentation` obsluhuje animaci, LOD a kontaktní stín; vzdálenost již nepočítá dvakrát.

`LocalAvatarPresentation` skrývá místní model, když čočka vstoupí do konzervativního tělesného obalu. Jde o herní prezentační mez: svislá úsečka od chodidel+0.25 m po výšku postavy−0.25 m, poloměr 0.55 m krát šířka buildu plus near plane kamery; návrat má 0.25 m hysterézi. Obal není nová fyzická kolize ani zaměření. Výška a šířka vycházejí z aktuálního rigu. Stav je malý znovupoužívaný objekt bez observerů či GPU zdrojů.

Uživatelská volba first person, yaw, ovládání myší, fyzika a zaparkované auto se nemění. Skrytá postava používá existující kamerové umístění svítilny; po obnovení se svítilna vrací do ruky. Kontaktová animace se při návratu resetuje právě jednou, protože skrytý LOD ji neaktualizuje. Nevzniká cyklus zapnout před kolizí / vypnout po kolizi v každém snímku.

## Ověření

Nový `tests/local-avatar-presentation.test.ts`: **4/4 PASS** v závěrečném samostatném běhu (5.788 s celkový test runner; jednotlivá skutečná KCC regrese 1.051 s). Testy dokládají:

- KCC cesta S do auta a W zpět, celkem 555 kroků: konečná kamera proti původnímu řešení shodná do 1e−10 m; stejné actor/car state před a po řešení kamery; kolizní rezerva zachována. Viditelnost má právě dvě změny, skrytí a návrat.
- Obal ze čtyř směrů, near plane a hystereze; pohled shora mimo tělo zůstává viditelný.
- Všech šest skutečných presetů s Babylon NullEngine, `AvatarLodController` a animátorem: 120 ustálených skrytých snímků bez opakovaných změn enabled state či odebírání/přidávání meshů; při návratu stejné původní části a právě jeden reset animátoru.
- Skrytý model s existující svítilnou: světlo z kamery, skrytá rekvizita, následný návrat do ruky; first person a vehicle zůstávají samostatné volby.

Při prvním společném běhu prošlo **17/17 existujících** testů `avatar-lod`, `flashlight` a `vehicle-camera`. Nová KCC regrese tehdy selhala pouze na porovnání prototypu Rapier vektoru s prostým objektem; opraveno kopírování vektoru v assertion, bez změny hodnot/tolerance a bez runtime změny. Poté prošly všechny čtyři nové testy. Scoped TypeScript nad novým testem a jeho skutečnými runtime importy: **exit 0**; `git diff --check`: **exit 0**.

Tyto testové výsledky ověřují fyziku a životní cyklus na CPU. Nejsou GPU ani FPS důkazem. Celá pipeline patří společnému stabilnímu checkpointu.

## Praktická GPU kontrola celé hry

Root následně provedl nativní vstupy v celé vývojové hře na `http://127.0.0.1:5190/`, s HUD a multiplayerovou relací. Použitý adaptér podle jeho záznamu byl Intel UHD 630. Archivované snímky mají 1280×720 pixelů a zobrazují denní náhled; samostatný záznam CSS a interního render rozlišení této sekvence není k dispozici.

| Vstup a doložená poloha X/Z | Pozorovaný výsledek |
| --- | --- |
| Ze startu S přibližně 4,5 s; 110,0703735 / 13,7860689 | [Model se u auta skryje](verification-evidence/camera-obstruction-20261011/hidden-at-parked-car.png); svět ani HUD již nejsou zakryté trupem. |
| F zapnout a opět vypnout při překážce | Root zaznamenal `data-flashlight=true` po zapnutí a následné vypnutí. Samostatný snímek kuželu ani raw DOM dump se neuložil. |
| W přibližně 1,4 s; 110,0947876 / 7,888464 | [Postava se po ústupu znovu zobrazí](verification-evidence/camera-obstruction-20261011/restored-after-step-away.png). |

[Archivní protokol](verification-evidence/camera-obstruction-20261011/review.json) rozlišuje skutečné obrazové soubory od rootem hlášených vstupů, poloh a DOM příznaku. Obsahuje SHA všech sedmi převzatých artefaktů a jejich původní cesty. Snímky mají původní příponu `.png`, ale obsahují JPEG; názvy i bajty zůstaly zachované, rozměry se ověřily z JPEG hlaviček. Časy změny souborů jsou označené jako metadata souborového systému, nikoli přesné časy instrumentovaného snímání. Chybějící konzolový log či vzorky render/asset chyb nejsou vydávané za nulový počet chyb.

Jde o funkční vizuální kontrolu pracovní verze, nikoli interval FPS, GeForce přejímku nebo úplný produkční snapshot. Okamžitá čísla FPS v HUD se nevyhodnocují. Samostatná GPU sekvence V a režimu řízení v tomto archivu není; jejich CPU regrese jsou uvedené výše.

## Zdroje původní kontroly 11. října 2026

| Soubor | SHA-256 |
| --- | --- |
| `client/game.ts` | `c05c507c6bd3fa6eae393643fd394f3e05bc0bb46a8af18dc9962c1659cdf89e` |
| `client/local-avatar-presentation.ts` | `24aac859c3e268661afe8dfa03cac53b4c173380c0e9536a25cdaed9b1907673` |
| `tests/local-avatar-presentation.test.ts` | `7fb2ffdc01df96b255127b816f74c2fe4e8414f9f241ebce07931efa938ef198` |

Všechny tři otisky se při zahájení archivace 12. října znovu shodovaly se skutečnými soubory. Během archivace root integroval síťový základ `a242ff9`: `client/game.ts` pak měl SHA `0bdaa2bfd1ab1784ba17c5f171cf5a429a6bee60db33dab4521c161cf36fb977`. Podle předání rootu zůstaly kamerové změny zachované a přibyly oddělené opravy `reconcile`; helper a test zůstaly byte-identické. Tabulka uchovává původní skutečně kontrolované zdroje. Pozdější integrovaná verze ještě čeká praktické GPU ověření a její otisk se nevydává za zdroj těchto snímků. Ani jeden seznam není otiskem celé tehdejší vývojové hry.

[Původní CPU výsledek](verification-evidence/camera-obstruction-20261011/cpu-before.json), [reprodukce](verification-evidence/camera-obstruction-20261011/reproduce.ts.txt), [scoped konfigurace](verification-evidence/camera-obstruction-20261011/tsconfig.json.txt) a [prázdný log typechecku](verification-evidence/camera-obstruction-20261011/typecheck.log) jsou byte-identické archivní kopie z `.cache/camera-obstruction-independent`. Textové kopie zachovávají původní relativní cesty; nejsou přemístěnými spustitelnými skripty. Prázdný log sám neobsahuje exit kód; výsledek typechecku výše pochází z dřívějšího předání implementace. Produkční main a port 4179 byly při této opravě beze zásahu.

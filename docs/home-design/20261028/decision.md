# Jantar: rozhodnutí a dopady

Uživatel schválil Jantar po vizuálním porovnání. Vstup, editor a menší Crazy Typka jsou jeden společný onboarding do existujícího světa; nejde o druhou hru ani změnu transportu.

| Oblast | Rozumné varianty | Zvolená varianta a důvod |
| --- | --- | --- |
| Úvodní tok | Pouhé CSS; lokální home/profile; celý wizard v App | Lokální WelcomeScreen. CSS nestačí pro odložený editor; App wizard by zbytečně propojil síť/renderer s prezentačním stavem. |
| Postava | Bitmapa; stále připojený skrytý editor; mount stávajícího editoru na druhé obrazovce | Skutečný podmíněně připojený editor. Zachová profil a fallback, nealokuje preview na úvodu a dovoluje jeho stávající cleanup při návratu. |
| Mapové pozadí | Interaktivní MapView pod overlayem; rastrový screenshot; nové cached SVG z původních dat | SVG se společným rigidním otočením. Žádné handlery, focus targets nebo další engine; podklady se nemění. Cache path strings je lokální v modulu, nikoli nová síťová cache nebo nová geometrická pravda světa. |
| Chat | Přepsat store; nový store pro popup; opt-in compact prezentace původního store | Compact prop s původním defaultem. Zachová pending/seq/recovery/expiry a herní pohled. Zavření pouze uklidí view, ne konverzaci. |
| Informace a fokus | Vlastní globální modal trap; native dialog; přepsání feedbacku | Native dialog pro controls/about, původní feedback jako pasivní slot. Popup chatu je ne-modal, fokus se mění jen při explicitním otevření/zavření, nikoli při odpovědi. |
| Font | Runtime Google CSS; vlastní subset/konverze; lokální původní variable TTF | Lokální oficiální TTF a licence. Jeden malý soubor bez runtime CDN a nové build pipeline; WOFF2 lze později posoudit podle měření, zde není nutný nový nástroj. |
| Glass a pohyb | Opaque card; globální opacity; omezené průsvitné panely a transform | Jantar panely se stabilním kontrastem a backdrop-filter; čitelný fallback při nepodpoře. Jemný CSS posun pouze pozadí, reduced-motion jej vypne. Cena compositingu/blur se ověří ve skutečném browseru; zlepšení FPS se netvrdí. |
| Validace a spuštění | HMR v hrané kartě; jeden dirty checkout; oddělený stabilní produkční checkpoint | Vlastní větev, přesné claims, testy ve snapshotu, full pipeline a oddělený server4276. Chráněný4182 se nepřepisuje. |

## Integrační kontrakt

`WelcomeMap()` nemá props, vlastní pouze dekorativní SVG; rodič dodá barvy, velikost, blur a motion. Třídy jsou `home-map-art`, `roads`, `buildings`, `dormitories`, `stadium`. Font bude `/fonts/manrope/Manrope-Variable.ttf`, portrait `/ui/crazy-typka.svg`.

`CrazyTypkaChat` přijme `variant?: "default" | "compact"`; store/hook ani jeho chybové/zdrojové kontrakty se nemění. Compact view ponechá vpravo místo pro vnější close tlačítko rodiče. Dědí Jantar CSS proměnné `--home-text`, `--home-muted`, `--home-accent`, `--home-button-ink`, `--home-tint`, `--home-panel`. Původní herní pohled používá default.

`WelcomeScreen` ponechá vlastnictví presence polleru a získaný `editor`, `assistant`, language a feedback z App. Interaktivní mapový slot přestane UI vytvářet. Nativní přezdívka editoru je na druhé obrazovce jediným polem; rodič si nevytváří další kopii profilu. Failed join ponechá tuto obrazovku a skutečnou chybu. Anglická verze odpovídá stejným akcím. Počet označuje herní přítomnost, nikoli ověřený studentský profil.

## Rozhodnutí a přijetí

Nejsou otevřené produktové otázky ani nevratná migrace. Uživatel výslovně zadal implementaci přijaté kompozice, takže se nezavádí další běžné schvalování. Dosavadní prototype/UI audit je vstup, nikoli důkaz hotové integrace. Konečné přijetí vyžaduje konkrétní výsledky a čisté vlastní commity; centrální evidenci a main okno koordinuje původní správce katalogu.

## Kombinace s přijatým RAG main

Přijatý main `86e4dd603ca1b91e3eaa5f84573f9481be410a29` se bez konfliktu spojil s Jantarem do `62ba8c870082b1a3897d8f580d81dbd4005ca481`. Čtecí audit potvrdil zachovaný klientský transport/store a našel jedinou navazující obsahovou chybu: provider stále nabízel odstraněný sólo vstup. Pouhé skrytí tlačítka tuto radu AI neřeší; změna serverového guest kontraktu by byla zbytečná. Volba je upravit jen onboarding instrukci a ověřit skutečně odeslaný prompt ve fake provider regresi. Původní vlastník předal oba soubory, uvolnil claims a koordinátor přidělil task `jantar-home-20261028-provider-onboarding`. Nemění se moderace, relace, citace, SQL ani placené volání.

Nový shared validátor přidává SÚZ/SHerna citace; nový backend proto patří ke společně přestavěnému klientovi. Starý immutable bundle se k němu nepřipojuje. Nový lockfile přidává pg; původní node_modules zatím zásobuje junction starého hraného snapshotu. Místo změny tohoto adresáře dostane kombinovaný snapshot vlastní fyzickou frozen instalaci a samostatný build. Tím se zachovají původní bajty, závislosti a lifecycle serveru4276; nový celek bude mít odlišenou URL a identitu.

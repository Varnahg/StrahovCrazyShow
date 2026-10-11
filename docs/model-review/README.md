# Kontrola samostatných modelů a podloží

Stav 11. 10. 2026. Hlavní hra používá `Simulation()` a nativní terén DMR 5G. Surový historický IPR mesh a jeho kolize zůstávají pouze referencí v samostatném náhledu. Tím se z herního podloží odstraňuje celá třída rozteklých aut, spojených korun, stínů zapečených do atlasu a nerozpoznaných úlomků skenu.

## Rozpoznané vrstvy

| Co je v předloze | Herní reprezentace | Původ a hranice |
|---|---|---|
| Zaparkovaná auta | 24 samostatných vozů se stabilními ID a vlastními transformacemi | Místa odvozená z ortofota; obecný model a obsazenost jsou simulované |
| Budovy, vstupy a střechy | 121 samostatných zdrojových identit, vlastní pivoty a editovatelné soubory | OSM půdorysy, fotografické typologie; nezaměřené rozměry zůstávají odhadem |
| Koruny a kmeny | 109 čistých stromů, vlastní větve a koruna pro každé ID | 110 kandidátů; jeden neprošel výlukou, přesné druhy ani dnešní stav nejsou vždy známé |
| Šest sportovních ploch | Samostatné povrchy a značení; původních pět má sítě/ploty/brány | Šestý severní kurt u B6 má opravený společný TIN. Nedoložená brána ani překážky se k němu nevymýšlejí |
| Asfalt, dlažba, beton, štěrk | Čisté materiálové rodiny na površích navazujících na DMR | CC0 povrchové kanály; žádná fotografie celého parkoviště jako herní textura |
| Spáry, zrno, praskliny, listí v trávě | Drobné prvky povrchové textury | Vizuálně prověřený asfalt, dlaždice a tráva; nejedná se o auta nebo stavební objekty |
| Parkovací čáry a Silicon Hill | Samostatná malba nad asfaltem, s řízeným depth bias | Poloha podle IPR 2024, autorská interpretace písma a symbolu |
| Stíny stromů a budov | Dynamické osvětlení a stínová mapa | Snímek historického stínu neurčuje geometrii |
| Lampy a vybavení B6 | Samostatné zdrojové objekty, modelové kolizní obálky | Mapované lampy nejsou úplný současný inventář; interiér B6 je orientační |

Nejasné drobné objekty neměníme odhadem na lavičky, odpadkové koše nebo nové budovy. Místo, datum, souřadnice a míra jistoty musí být dohledatelné, než vznikne konkrétní náhrada. Toto není tvrzení, že je každý reálný detail Strahova již identifikovaný.

## Provedené kontroly a opravy

- [Audit všech GLB](authored-glb-audit.json): konečné atributy, platné indexy, délky bufferů, dostupné obrázky, lokální bounds a SHA každého souboru. Spouští se `node scripts/audit-authored-models.mjs`. Je to strukturální kontrola, nikoli vizuální schválení každého detailu skutečnosti.
- Kontrola normál nyní navíc hlásí trojúhelníky, jejichž průměrná vrcholová normála výrazně nesouhlasí s geometrickou normálou. Nejde o test uzavřeného objemu ani automatický důkaz obrácené plochy; zejména decimované švy a zakřivené malé díly vyžadují jednotlivé porovnání. Žádný z121 archivů budov tento nesoulad nehlásí. Zdrojové soubory se při auditu neopravují naslepo.
- [121 exportů budov](../reality-pack/separate-assets/README.md): všechny Blender soubory znovu otevřené, identita, lokální souřadnice, UV, rodiče a obrazové kanály ověřené. Odstraněná duplicitní střecha Marketu a nulové střešní trojúhelníky.
- [Oprava umyvadla a autobusů](derived-geometry-repairs.md): nulové trojúhelníky odstraněné z odvozených herních souborů. Originální CC0 autobus je ponechaný beze změny a jeho vady zůstávají přiznané v auditu.
- [Stromy a WebGL náhledy](../vegetation/realistic-pack.md): vlastní geometrie každého ID, nativní usazení kořene, alpha hrany, PBR kanály, holý strom a jehličnan. Kmenové kolize používají stejný poloměr jako model.
- [Souvislý fyzikální průchod](authored-walks-native-20261011-a.md): skutečný start (110; 12), obě nástupiště 191, veřejný přístup u R-ka a schody/reception B6. Normální kapsle a kolize, žádné teleporty nebo odstraněné překážky.
- Kamera auta ověřená v prohlížeči i po vstupu z první osoby: [otáčení](evidence/car-camera-orbit.png), [bezpečné vystoupení](evidence/car-stopped-safe-exit.png). W rozjelo vůz, E za pohybu bylo odmítnuté, ruční brzda umožnila zastavit a vystoupit.

Desetisekundový benchmark nově obsahuje `modelReview`: skutečné názvy, zdrojové identity, viditelnost, materiály a world bounds načtených meshů. Slouží k identifikaci konkrétní vady přímo v renderované scéně; není součástí běžného per-frame vykreslování. [První diagnostický záznam](evidence/native-scene-diagnostic.json) vznikl před finální optimalizací v dev režimu a není produkčním výkonovým předáním.

Modelové pivoty umožňují upravit objekt nezávisle na sousedech. Při změně umístění v editoru je nutné změnu přenést do jeho shared plánu a znovu sestavit kolize; samotné ruční posunutí Babylon uzlu není synchronizovaná změna fyziky serveru.

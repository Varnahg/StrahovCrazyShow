# Oprava odrazu, letu a doskoku — 11. 10. 2026

Fyzická postava vyskočila správně, ale při některých fázích běhu se její vykreslená pánev připnula ke staré podlaze. Nohy se pak řešily nad kyčlemi a převracely. Oprava je pouze v `client/animation.ts`; nemění impulz skoku, gravitaci, KCC, vstupy, kameru, síťový protokol ani zdrojové modely a váhy.

## Reprodukce a skutečná příčina

`swingTo` a `landingPelvisMax` patřily poslednímu pozemnímu kroku. Anticipace nižšího schodu je však používala i za letu, kdy už postava vystoupala téměř metr. [Sladěný CPU audit](../../verification-evidence/jump-animation-20261011/aligned-cpu-audit.json) přehrává jedinou skutečnou trajektorii `Actor.step` + `stepRigidWorld` do P3 i opravy. V apexu při shodném rootu má P3 lokální pánev **−0,11140 m**, oprava **+0,88938 m**. Kotníky P3 zůstaly na +0,277/+0,216 m, tedy nad pánví. Tento anatomický rozpad byl následně vidět i ve skutečném GPU A/B náhledu.

Předběžný audit v `.cache/jump-repair` měl pozici před fyzikálním krokem a `grounded/vertical` po něm. Odpovídal části Game prezentačního zpoždění, ale nebyl čistým fyzikálním vzorkem. Je zachovaný jako výslovně předběžný; **není základem finálních čísel**. Nový [browser-compatible fixture](../../../tests/helpers/jump-animation-fixture.ts) zachytí všechny veličiny až po stejném fyzikálním kroku. Při interpolaci se vzorek považuje za airborne až do přesného uzemněného endpointu. Samostatná regrese navíc ověřuje existující Game smlouvu „předchozí/interpolovaná pozice + aktuální grounded“.

Archivovaná O2 animace ukázala při předběžném shodném skoku stejnou příčinu. Nelze tedy tvrdit, že chyba vznikla až v P3. Původní unit test pouze přepnul `grounded=false` při stále stejné výšce rootu; vyletění kapsle ani doskok netestoval.

## Integrované chování

- Při odrazu se jednou přečte skutečná FK poloha obou kotníků do root-local souřadnic. Blend letu tak nezačíná z dávno opuštěného světového bodu a snese i otočení těla za letu.
- Airborne stav okamžitě zruší oporu a předpověď starého pozemního kroku. Vizuální pánev se pohybuje s fyzikálním rootem; její bezpečný dolní limit odpovídá již používanému rozsahu dosažitelnosti −0,3 m od klidové kyčle.
- Při skutečném sestupu s explicitním `grounded=false` se jedním dotazem zjistí podklad pod rootem. Od výšky 0,55 m se nohy plynule připravují na dotyk. Tato vzdálenost je nastavení herní animace, nikoli změřená lidská biomechanika.
- První uzemněný vzorek vytvoří nové kontakty na aktuální podlaze. Nezůstává v něm residual vzdušné skrčení ani starý odval ze špičky. Základní mezivýsledek měl při dopadu viditelný hover; po GPU nálezu byl opraven anticipovanou extenzí, nikoli pouze skrytím příznaku `planted`.
- Remote snapshot dnes nemá `grounded` ani floor callback. Bez vymýšlení skoku ze schodů se jeho kontakty/pánev přenesou s renderovanou výškou a nesmí je ovládat domnělý nižší nášlap. **Přesný jump fold vzdáleného hráče stále vyžaduje chybějící síťovou informaci**; tato oprava ji nepředstírá.

Refaktoring sjednotil reset kontaktů. Matice a pomocný vektor pro jednorázový take-off FK se znovu používají. Za letu odpadají pozemní dotazy každého chodidla; přidaný dotaz sestupu je jeden pod rootem. Jde o popis práce kódu, nikoli měření FPS.

## Regrese a praktické ověření

Použito pět místních scénářů a jeden remote fallback, bez velké matice všech kombinací: Alex z klidu 60 Hz; Alex běh/problémová fáze 60 Hz; Sam běh s otočením při odrazu 144 Hz; Eli sprint, opakovaný skok a medium 30 Hz; skutečný B6 schod/odraz/doskok 60 Hz; remote trajektorie bez `grounded` a bez floor callbacku.

Kontroly běží od prvního odrazového snímku. Ověřují root-local délky obou kostních segmentů, správné znaménko kolenního ohybu, kotník pod kyčlí, konečné normované quaterniony, nezměněný root, neexistující oporu během letu a obnovenou podporu. **V prvním grounded snímku** musí nejnižší skutečný vertex viditelné boty ležet mezi −3 a +20 mm od podkladu; střední LOD vynechává jemnou podrážku, proto se měří skutečně enabled geometrie. Následný kotník dosahuje svého podporovaného cíle nejhůře s odchylkou **9,42 µm**. To jsou dvě odlišné kontroly, nikoli vzájemně zaměněné tolerance.

Pět místních klipů má během prvního odrazu až doskoku +0,2 s maximum lokální rychlosti kotníku 3,75 / 8,83 / 6,24 / 9,81 / 12,12 m/s. Testovací mez 16 m/s zachycuje nespojitost, není normou lidského pohybu. Celý klip s 90° rozběhovým otočením má i starší pozemní 61,09m/s špičku na t=1,25694 s, **před odrazem t=1,81667 s**. Je to známý samostatný limit pozemního plánování kroku, nikoli opravený skok; nebyl z evidence odstraněn ani prohlášen za vyřešený.

`node --import tsx --test tests/jump-animation.test.ts tests/animation.test.ts tests/locomotion-quality.test.ts tests/skinned-avatar.test.ts`: **27/27 PASS**, exit 0, 7,194 s. Po přidání přísnějšího prvního dotyku boty a Game-interpolation podmínek prošel jump soubor znovu **2/2 PASS**, exit 0, 6,353 s. Původních 25 animačních/skinningových testů ani jejich tolerance se neměnily. Úzká sémantická TypeScript kontrola runtime, nových testů, fixture a preview: **0 diagnostik**, exit 0. [Úplný cílený log](../../verification-evidence/jump-animation-20261011/targeted-tests.log), [první grounded regrese](../../verification-evidence/jump-animation-20261011/first-grounded-tests.log).

Root provedl GPU kontrolu Alex/run odrazu, apexu a dopadu a Eli/medium standing odrazu, apexu a dopadu. Finální první grounded vzorek t=2,23333 s má kotníky přibližně **0,0623 / 0,0645 m** nad fyzikálním feet rootem a boty leží na podkladu. Scene ready, bez hlášených console warning/error. [Finální GPU protokol](../../verification-evidence/jump-animation-20261011/final-component-gpu.json), [první doskok](../../verification-evidence/jump-animation-20261011/final-landing.png). Mezilehlá kontrola s hoverem zůstává označená `interim/nonfinal`.

Runtime freeze SHA256: `b5657e4d1f340eacfde504a05c6738c0d5c8718f3520713d4c24cbbbc9500349`. Celou pipeline a výsledný checkpoint vlastní hlavní úkol. Samostatný náhled ani NullEngine nejsou dokladem výkonu produkční hry nebo 60 FPS.

## Náhled pro opakování

[preview.html](preview.html) → **Skok z běhu** nebo **Skok z klidu** → **Odraz / Vrchol / Doskok**. Časový posuvník, Jeden snímek a 25/50% přehrávání používají zaznamenaný skutečný Rapier klip; zpětné hledání resetuje a přehraje animaci deterministicky. Zobrazené FK veličiny jsou root-local a odpovídají aktuálnímu času. Checkbox přidá archivované P3. Modely, barvy ani fyzika se nefalšují posouváním nohou v náhledu.

Výchozí skok ukazuje jedinou opravenou postavu bez zobrazovacího offsetu na kanonickém vzorkovaném podkladu. A/B rozestup je pouze vizuální porovnání pózy. Po root QA byly popisky úhlů opravné volby Profil/Čelně navázány na skutečný yaw klipu; stojící a běžící postava už nepoužívají jeden pevný kamerový offset. `pagehide` uvolní i zaznamenaný Rapier world a případný pozdě doručený klip.

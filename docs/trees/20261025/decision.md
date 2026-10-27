# Rozhodnutí pro první výrobní celek

25.10.2026, po skutečném prohlédnutí referencí a označeném konceptu. **Realističnost je přednostní; per-tree přesná fotokopie není požadavek.**

1. Fotografické mapy LeafSet024 a FirTree01 twig, původní PNG maska, přednostně2K pro blízký pilot. Ověřit hlavičky, licence, hash a UV komponenty. LeafSet022/027 slouží pouze jasně oddělené variantě, ne náhodnému míchání sezón. Kůru je možné zachovat z doloženého Bark012, pokud pilot nezjistí konkrétní nedostatek měřítka.
2. Porovnat vlastní novou hierarchii větví a připnutý MTree na malém listnatém pilotu; následně ověřit jehličnan. Nejprve holá kostra a napojení listových komponent. Nepřebírat původní80% objemový scatter ani obří daleké karty. Celoplošný export až po volbě skutečně zobrazeného pilotu; případný technický neúspěch MTree uchovat jako výsledek, ne obcházet globální instalací.
3. Oddělený čistý regionální sezónní model běží z UTC data hry. Náhledy jsou označené DEMO a skládají se se stávajícím osvětlením. Žádné údajně aktuální botanické pozorování ze SiliconHill teploty.
4. Modely mají oddělené wood/foliage a třiLOD. Stabilní celé listové komponenty dostanou společný deterministický drop rank. Preferovaný runtime opad řídí skutečný prefix/subset indexů (případně indexCount submeshe), nikoli material.alpha; tím se viditelný a shadow průchod shodují a zimní foliage lze vypnout i po pozdním streamování. Před final exportem zmrazit společný kontrakt s runtime autorem.
5. Uvolnit materiálové zdroje z těžkého vloženého far balíku, sdílet prototypovou geometrii, ale zachovat samostatné sourceID, root a rozměry. Změnu cache/lifecycle dokončit s validací celého chunku a cleanup částečného loadu. Žádná frame-by-frame generace korun nebo neomezená alokace.
6. Opad na zemi bude omezený, deterministický a navázaný na skutečné koruny, výšky a výluky; oddělená sezónní retence. Navazující tráva/květiny používají stejný stav, evergreen se nechová jako listnáč. Není důvod automaticky přidat sníh v kalendářní zimě.

Pilotní průběžná přejímka není tvrzení hotového modelového katalogu ani naměřeného zrychlení. Každá změna výkonového rozpočtu se doloží statickou plnou hrou v Edge/GTX1060 s identitou zdrojů a srovnatelnými podmínkami. Oba připravené user servery zůstanou nedotčené; nová QA používá jiný rezervovaný port a přímé UI benchmark záznamy, takže není nutné rozšiřovat bezpečnostní whitelist stávajícího collector API.

## Závěr pilotní výroby R4 před GPU

Root prohlédl skutečné letní a holé rendery R1–R4. Vlastní R4 listnáč i jehličnan jsou přijaty pro první herní A/B; MTree zůstává srovnávací varianta, nikoli automaticky zvolený finál. Listnáč má skutečné krátké vnitřní výhony a 82 100 listů ve 16 019 malých opadových skupinách. Detailní source/hash/GLB důkazy jsou v `model-pilot.md` a předání pilotu.

Čtecí audit R4 potvrdil, že sdílení geometrie samo neřeší vykreslené trojúhelníky. Near wood 281 530 / 304 594 tri a far foliage 32 766 / 43 572 tri nelze bez dalšího přenést na 110 stromů. Far wood 2 690 / 1 992 tri již prošlo velkou redukcí; další práce má zkoumat především listí a streamování oddělených LOD. Odhad payloadu aktuálních runtime polí a sezonních plánů není VRAM měření a část polí sdílí ArrayBuffer, proto se jejich hodnoty nesčítají s celým GLB jako nezávislé kopie.

Po skutečném A/B připravit oddělený výrobní checkpoint: nejprve Fir obal stejné fyzické fotografické větévky (hull / konzervativní polygon / alfaquad) a jeden prostorově odvozený listnatý výhon. Jediný quad zachovávající dnešní počet a velikost far Fir větévek by znamenal 7 262 foliage tri; má však odhadovaně 13–30 % neprůhledného bbox pokrytí a vyžaduje skutečné měření alpha fill a šikmých pohledů. Leafy twig bake musí pocházet z konkrétního vlastního 3D podmodelu, mít oddělenou neosvětlenou barvu/opacity/normal/roughness a zachované ranky. Dřevěná zimní kostra zůstává samostatná. Originální fotografie se nepřepisují.

Celý katalog zachová každé source ID, root a kolizní radius. Prosté škálování celého stromu není přijato: změnilo by fyzickou velikost listů. Vhodný prototypový pool musí respektovat kotvy částí a rozdílné výškové proporce. Rozšíření v2 kontraktu pro samostatné LOD soubory, streamování a případné sdílení bufferů je navazující konkrétní rozhodnutí po pilotu, ne hotová funkcionalita této verze.

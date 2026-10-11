# Integrované krátké účesy pro pilot — 11. 10. 2026

Alex používá krátký vrstvený MakeHuman `short02`, Sam uhlazený `short04`. Hra, editor i simulovaní cestující je vytvářejí přímo přes společnou produkční `createAvatarRig` a `AvatarPrimitivePool`. Původní pevné čepice se u těchto dvou presetů už nevytvářejí. Robin/Eli/Mia/Niki zachovávají své dosavadní rozdílné střihy. Nejsou integrovány dlouhé vlasové prototypy s prokázaným průnikem ramen/oděvů.

## Podklady a odvození

Primární [MakeHuman seznam system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) uvádí oba zdroje jednotlivě jako CC0. Původní OBJ/MHCLO/MHMAT mají výslovné licenční hlavičky. Předchozí geometrická studie a nové přípravné čtení vycházely z tohoto seznamu, licenční stránky vydavatele, původního balíku a skutečného lokálního Babylon PBR/ray kódu.

`assets/sources/characters/student-hair/source.json` zachovává datum získání, oficiální URL, byte SHA původních souborů i přesný hash převzatého prototypu `3926fac7b3819c00e4d16d29d6d2a1d73ce90d7d0dbe157b9881c50d610a5e7c`. Původní zdroje, nezměněné diffuse/normal PNG, editovatelný Blender master, omezení uší/straniček a geometrický audit jsou zachovány ve stejné zdrojové složce. Master obsahuje historicky všechny čtyři studované účesy; runtime pouze dva krátké. Manifest navíc fixuje SHA runtime JSON, každé jednotlivé varianty a masteru. Geometrie, UV a alpha jsou převzaté z opravené studie bez nového fitu nebo resamplování textur. Původní anatomie je nezměněná.

Krátké střihy už mají vyříznuté celé části polygonů v prostoru skutečné aurikuly, nikoli pouze centroidový posun. Při brýlích se použije samostatná geometrie s průchodem pro skutečné zdrojové straničky. Zdrojové vůle 2,5 mm u ucha a 2,9 mm obalu rámu jsou interpretační modelovací parametry ze studie, nikoli nové zaměření.

## Runtime a barvení

Každá postava má jednu aktivní instanci vlasů v near nebo medium. Short02 plain má 3 534/1 942 tri, glasses 3 585/1 993. Short04 po níže doložené opravě přední aurikuly má plain 1 293/1 293, glasses 1 449/1 449; shodný near/medium u něj sdílí i tentýž source mesh. Pro oba účesy a obě varianty brýlí je celkem šest sdílených geometrií. Rigidní krátký účes zůstává na původním pivotu hlavy a používá tutéž šířkovou transformaci jako hlava/brýle. Near i medium používají sjednocené geometrické bounds pro stabilní výšku far siluety. Výška kamery se nemění.

PBR materiál zachovává alpha test 0,42, depth write, oboustranné světlo a vypnutý backface culling. Nepoužívá alpha blend ani průhledné třídění. `short02` má původní normal mapu; pro `short04` se normála nevymýšlí. Textury jsou tři pevné sdílené zdroje na pool, uvolněné při dispose. Barvení nenahrává nové bitmapy a neprovádí žádný per-frame mesh výpočet.

Uživatelská barva `config.hair` zůstává albedo barvou v lineárním prostoru. Malý PBR plugin neutralizuje pouze zdrojový RGB odstín a zachovává relativní světlost pramenů. Medián Rec709 luminance texelů s původní alpha≥0,42 je `short02=0,0492790112`, `short04=0,0168078126`; odpovídající texture-level scale je 20,2926 a 59,4961. Relativní kontrast je výtvarně omezen na 0,45–1,55. Obě varianty používají shodný shader kód s existujícím uniformem, takže se nekříží odlišné konstanty pod stejným effect cache key. Alpha, původní UV ani obrázky se nemění. Zdroj obsahuje část baked shadingu; nejde o neutrální změřenou PBR sadu.

## Ověřené strukturální výsledky

Po přípravě se kontrolovaly původní SHA dotčených produkčních souborů a `git apply --check`; integrace následovala až po zmrazení M2, aby neovlivnila jeho snapshot. Žádný Blender, GPU renderer ani další server tento agent nespouštěl.

- `node --import tsx --test tests/student-hair.test.ts tests/student-eyes.test.ts`: **9/9 PASS** nad skutečně integrovanými soubory (4,24 s shell).
- `node --import tsx --test tests/animation.test.ts tests/avatar-lod.test.ts tests/skinned-avatar.test.ts`: **25/25 PASS** (4,03 s shell).
- Dodatečný cílený SHA test runtime dat, všech osmi variant a zachovaného masteru: **1/1 PASS**.

Nové testy ověřují celé trojúhelníkové plochy v uších a obalech brýlí (<1e-8 m²), konečnou geometrii, původní soubory, oba šířkové extrémy obličeje, skutečné pivots/transforms, near/medium/far návraty, absenci starých čepic, čtyři rebuild/prune cykly, vyprázdnění posledních vlastníků a bounded tři atlasové textury. Průhled na zornice zkouší oba účesy s/bez brýlí v obou LOD při 0/±0,65 rad; UV z hitu používá skutečnou Babylon konvenci `bu=vertex0`, `bv=vertex1`. Zdrojová alpha se čte bilineárně z původního PNG. Oční a vlasové testy sdílejí jeden testový PNG decoder; dosavadní oční UV/atlas a 216 geometrických eye ray kontrol zůstávají funkční.

| Celá postava | Near části / tri | Medium části / tri | Far části / tri |
| --- | ---: | ---: | ---: |
| Alex | 12 / 27 348 | 8 / 11 170 | 1 / 192 |
| Sam | 14 / 25 697 | 10 / 14 699 | 1 / 204 |

Proti checkpointu pouze s opravenýma očima přidává Alex 1 694 near / 102 medium tri, Sam po opravě přední aurikuly ubírá 547 tri v obou LOD. Počet aktivních částí ani cena far proxy se nemění. Strukturální test 100 avatarů stále reprezentuje všech 100 identit; uvedené počty **nejsou FPS, GPU draw calls ani důkaz 60 FPS**.

## Zbývající GPU kontrola

Root ověří po uživatelském měřicím okně skutečné shader/texture readiness, tmavou i blond paletu, čelní/profilový/zadní pohled, uši a brýle, otočení a medium přechod. Po importu nových public atlasů je nutný čerstvý dev server; dlouho běžící Vite může vracet SPA HTML místo nového PNG (dřívější doložená příčina černých očí). Runtime diagnostika a oděvní náhled umí hlásit chyby textur.

Základní GPU kontrola rootu už potvrdila u Alex/short02 skutečně připravený shader, nulové chyby textur/shaderu a viditelnou pramennou texturu místo původní hladké čepice. To není kompletní paletový/LOD audit ani FPS měření. Existující oděvní náhled je pro další kontrolu rozšířen o Tmavé/Blond/Barva předvolby, brýle zapnout/vypnout/předvolby a blízké pohledy ¾/profil/zezadu. Rebuild zachovává vybranou barvu, brýle, LOD i kameru; head-framing se při změně výšky presetu posune o příslušný rozdíl výšky očí. Sdílená diagnostika vypisuje atlas/normal readiness, source, fit, paletu a alpha cutoff pro oči i vlasy. Syntaktická kontrola modulu náhledu prošla bez spouštění další GPU scény.

Hard alpha test může při mipování ztrácet jemné okraje. Zachované 2048² atlasy mají vlastní upload/paměťovou cenu. GPU profil celé produkční hry s HUD a reálnými relacemi na GTX 1060 musí před přijetím určit skutečnou rezervu vůči cíli 60 FPS. Fitted karty nejsou simulace jednotlivých pramenů a dva nové účesy neřeší zbývající čtyři stylizované vlasy ani společnou obecnou anatomii tváří. TypeScript/build/kompletní testy/integrace patří do následujícího stabilního checkpointu hlavního agenta.

## Zachování brýlí při změně LOD

Navazující skutečné GPU review rootu odhalilo starší chybu identity: původní metadata `avatarDetail:"micro"` vypínala celé brýle při přechodu na medium. Stejný již sdílený 720tri obroučkový mesh nyní nese `avatarDetail:"identity"` a zůstává v near i medium. Explicitní `avatarFarProxy:false` ho vyřazuje při sestavování pevné far siluety, takže nevzniká žádný nový hranol přes oči. Near source, geometrie, UV, materiál ani vlastnictví se nemění.

Nová regrese nejprve se starým kódem selhala na počtu medium částí (8 místo požadovaných 9), potom ověřila všech šest presetů v 0→20→100→20→0 m, sdílení stejného zdroje s další postavou, registraci v `scene.meshes`, posledního vlastníka a nezměněný far rozpočet 192/204 tri. Vlasový test navíc kontroluje skutečnou přítomnost rámu vedle geometrie fitované pro brýle v medium. `node --import tsx --test tests/avatar-lod.test.ts tests/student-hair.test.ts`: **14/14 PASS**, shell 4,54 s.

Cena opravy je jedna aktivní instance a 720 tri navíc pouze u brýlové medium postavy. Výchozí Robin má medium 9 částí / 11 788 tri, Mia 9 / 12 032; Alex/Sam tabulka výše zůstává platná pro jejich výchozí varianty bez brýlí. Jde o opravu vzhledu identity, nikoli naměřené zvýšení FPS. Root znovu ověří stejný GPU profil; tento agent další GPU scénu nespouštěl.

## Oprava doloženého pramene před conchou/tragusem

Root GPU snímky `docs/verification-evidence/pilot-hair-20261011/sam-dark-glasses-profile-near.png`, `sam-dark-no-glasses-profile-near.png` a `sam-blond-no-glasses-profile-near.png` prokázaly tenký vlasový klín v předním uchu. Přetrval bez brýlí a při změně barvy zežloutl. CPU sonda stejné profilové kamery dohledala původní short04 trojúhelníky 159/162 a okolní 108/110/111. Část byla zhruba 9 mm před skutečnou kožní plochou. Nešlo o vnitřní průnik tkáně; proto starý head-intersection audit mohl správně hlásit nulu, ale viditelný pramen zůstal.

Původní ear maska vybírala jen vrcholy s bočním x>80 mm. Její přední YZ obrys končil přibližně na z=33,15 mm. Přímý read-only CPU export původního Zstd `.blend` přes SDNA nyní zachovává kompletní párové source face-sety 4/5, každý 225 polygonů a 236 vrcholů. Numerická označení byla jako boltce identifikována z úplné topologie a polohy; source neobsahuje anatomické textové názvy těchto setů. Všech 472 bodů souhlasí s nezměněnou runtime hlavou, maximum chyby 1,665×10⁻⁸ m. Starý výběr vynechal 86 skutečných ušních vrcholů. Úplný přední okraj dosahuje na pravé straně z=42,71 mm, o 9,56 mm dále; levá strana měla obdobné opomenutí 9,33 mm.

`ear-source-audit.json` zachovává source SHA, objekt, face-sety, původní vertex/polygon IDs, úplné body a transform `[x, z−1.565, −y−0.012]`. `extract-ear-source.mjs` jej reprodukuje čistě CPU za 1,22 s, bez spuštění Blenderu, změny masteru nebo GPU. Zdroj `.blend` zůstává SHA `3c121505651140ceb4d69fd1d8923f7788ffadd81672f5be14845a5f2c75c137`; runtime anatomie zůstává `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`.

Odvozená oprava používá úplný zdrojový YZ hull a původní vůli 2,5 mm i původní boční rovinu x≥55 mm. Ořízne pouze short04 plain/glasses, vždy shodně v near/medium. Předchozí fit je zachovaný v `short04-before-ear-contour.json`; `short04-ear-repair.json` obsahuje přesné roviny, původ každého nového trojúhelníku, dotčené původní IDs, SHA a plochy. `repair-short04-ear-contour.mjs` je deterministický offline derivátor bez runtime práce. Všechny původní atributy zůstávají jako shodný prefix; nové vrcholy leží na původních trojúhelnících a UV jsou přesně interpolovaná. Test potvrzuje zachování všech trojúhelníků mimo výřez a interpolace nových hran. Mění se méně než 2 % původní plochy vlasových kartiček; nejde o podíl pixelů obrazovky. Původní OBJ/MHCLO/PNG, hlava, brýle, celkový vnější rozsah účesu ani short02 se nemění.

Zachovaná stará geometrie vykazuje vůči novému úplnému uchu nenulový plošný překryv >1e-5 m²; opravená má <1e-8 m² i při započítání transparentních částí karet. Přesná kamera ze screenshotu (canvas 980×635, offset y85, alpha0, beta1.5, radius1, targety1.6786444) a její zrcadlený protějšek kontrolují osm míst v doloženém tragusu, oba LOD a oba fity. **Před opravou 36/64 paprsků zasáhlo neprůhledný vlas před kůží; po opravě 0/64.** To je geometrický/atlasový důkaz, nikoli nově vyrenderovaný snímek. Skutečná GPU kontrola je uvedena samostatně níže.

Následná root GPU kontrola **PASS** zopakovala stejný profil: přední černý/blond klín zmizel a aurikula zůstala odkrytá. Bylo ověřeno dark/plain/near i blond/glasses/medium; brýle zůstaly viditelné. Shadery a textury byly ready bez chyb. Důkazy `sam-ear-fixed-*.png/.json` jsou v `docs/verification-evidence/pilot-hair-20261011`, spolu se zadními pohledy Sama/Alex. Tento vizuální výsledek nenahrazuje pending celé-game FPS profil GTX 1060 a nepřekrývá přiznaný baked-shading limit atlasů.

Po cíleném refaktoringu sdílejí původní i nový audit jeden nezávislý testový full-polygon helper. `node --import tsx --test tests/student-hair-ear-fit.test.ts tests/student-hair.test.ts tests/avatar-lod.test.ts`: **17/17 PASS**, shell 4,63 s. Short04 nyní stojí 1 293 tri plain / 1 449 s brýlemi (oba LOD), ostatní účesy a far 192/204 tri se nemění. Nový runtime hair JSON má SHA `1ea53714fc6cffca8b8d91be890551e5744797a54235352763172de7144e93f3`.

Oděvní QA náhled navíc při `pagehide` idempotentně zastaví render loop, odpojí resize a kameru, uvolní LOD před rigem, diagnostiku textur, pool, scénu a engine. Rebuild také explicitně uvolní starý LOD; jeho root-dispose pojistka je idempotentní. Při návratu přes browser back/forward cache se stránka znovu načte, aby neobnovila již uvolněnou GPU scénu. Vlastnictví využívá skutečná dostupná dispose API; žádný nový obecný framework ani další renderer nevznikl.

# Řízení a kamera auta

Ovládání bylo porovnáno s [oficiálním popisem PC nastavení GTA V od Rockstaru](https://www.rockstargames.com/newswire/article/51974aa3a724o2/rockstar-game-tips-tailoring-your-settings-and-controls-in), který odděluje klávesové řízení od kamery myši, a s [oficiální dokumentací řadiče vozidla Rapier](https://rapier.rs/docs/user_guides/python/vehicle_controller/). Konkrétní instalované JavaScript API 0.21 bylo ověřeno v jeho deklaracích a proti [primární implementaci raycast vozidla](https://github.com/dimforge/rapier/blob/master/src/control/ray_cast_vehicle_controller.rs). Jde o vlastní lehké arkádové chování, nikoli o kopii fyziky GTA.

W přidává plyn. S při jízdě vpřed brzdí, po téměř úplném zastavení plynule couvá. W při couvání postup obrátí. I slabý opačný analogový vstup nejprve brzdí; dřívější součin síly pedálu a rychlosti dovoloval slabému vstupu zařadit protisměr příliš brzy. Bezstavový přechod používá práh 0,2 m/s, takže nepřidává nesynchronizovaný časovač převodovky do multiplayeru.

Volant je citlivý při parkování, jeho maximální úhel s rychlostí klesá podle cílového bočního zrychlení 7,5 m/s² a rozvoru. Uvolněný volant se vrací do středu. Mezerník brzdí zadní kola a snižuje jejich boční přilnavost; běžná brzda má 9 000 N pro 850kg model. Vozidlo stále řeší fyzikální síly, zavěšení, CCD a kontakty; řízení neposouvá ani neotáčí jeho transform skriptem.

Kamera rozlišuje uložený pěší pohled od skutečně aktivního pohledu v první osobě. Zapnutá pěší první osoba již nevypíná tažení kamery po nastoupení. Nastoupení uvolní případný pěší pointer lock, žádný nový nevyžaduje. LMB/RMB tažení a kolečko fungují jako vnější kamera auta. V střídá vzdálenosti 5,5 / 8 / 11 m a zachovává preference pěšího pohledu.

Automatická kamera se nevrací, pokud stojíš, stále držíš gesto, máš otevřenou mapu či jinou modální nabídku nebo od ručního pohledu neuplynulo 3,5 s. Za pohybu se potom plynule přiblíží směru auta po kratším úhlovém oblouku. Původní kolizní sweep kamery zůstal zachován. E za volantem má přednost před hledací značkou u silnice. Vystoupení vyžaduje rychlost nejvýše 1 m/s a bezpečnou volnou polohu; stejný guard zapojil root do sdílené simulace a serveru.

## Ověření

`pnpm exec tsx --test tests/vehicle.test.ts tests/controls.test.ts tests/interaction.test.ts tests/vehicle-camera.test.ts`: **31/31 prošlo**. Zahrnuje skutečné Rapier otáčení a Babylon projekci A/D vpřed i při couvání ve čtyřech směrech, brzdu a přechod zpátečky, plný volant ve vysoké rychlosti, návrat volantu, CCD stěny, obrubník, rampu, slalom, osmičku, obnovu stavu a shodný průběh při různých renderovacích frekvencích. Test osmičky nyní začíná ustálenou cestovní rychlostí: při zrychlování by se u nového řízení poloměr mezi oběma kruhy oprávněně lišil. Tolerance návratu ke křížení zůstala 5 m.

Reprodukovatelný [fyzikální průchod](driving-physics.ts) a jeho [naměřené hodnoty](driving-physics.json):

- Z 14,36 m/s zabrzdil na téměř nulu za 1,25 s; zpátečka začala v 1,317 s.
- Největší fyzikální krok během brzdění byl 0,236 m při 60 Hz, bez skoku transformu.
- Plný volant za rychlé jízdy dosáhl maximálního bočního zrychlení 7,137 m/s²; minimální svislá složka up vektoru byla 0,99998.
- Po půlsekundě uvolnění byl úhel volantu 0 rad.

[Izolovaný skutečný SDK/server test](driving-sdk.ts) prošel na 2574: nastoupení, W/A/D, odmítnutí vystoupení za jízdy, ruční brzda, zpátečka, W zbrzdí couvání a rozjede vpřed, bezpečné vystoupení a opětovné nastoupení do přemístěného auta. [Konkrétní autoritativní polohy a rychlosti](driving-sdk.json) jsou uložené. Skript vlastní izolovaný server i relaci a v `finally` je ukončí.

Tyto údaje jsou důkaz fyziky a síťového chování. Nejde o GPU měření ani o nové browserové video jízdy. Browserové nástroje v tomto novém subagentovém tahu nevrátily žádný dostupný prohlížeč; praktický viditelný průchod autem a kamerou převzal root. Před finálním předáním je nutné tento průchod spojit s aktuální společnou verzí světa. Předchozí důkazy pěšího tažení a dvou hráčů v tomto adresáři se nevydávají za nové ověření řízení auta.

# Artikulované postavy

**Historická první iterace. Aktuální anatomie, PBR materiály, Blender podklady, editor a ověření jsou v [reality-pack.md](reality-pack.md).** Níže uvedený popis zachycuje předchozí jednodušší geometrii a osm původních animačních testů.

Aktualizace 10. 10. 2026. Hra i editor používají stejný synchronně vytvářený `AvatarRig`. Původní root/left/right/arm/rightArm API zůstává zachované; rig navíc obsahuje kyčle, páteř, hlavu, kolena, lokty a kotníky a délky segmentů. Babylon geometrie a materiály se nadále sdílejí instancemi.

## Skutečně zapojené změny

- Hlavy mají přibližně sedminu celkové výšky místo původních velkých oválných hlav. Uzavřené profilové meshe vytvářejí bradu, čelist, hrudník, pas, stehna, lýtka a zaoblené boty. Obličej má drobné oči, nosní hřbet, nos, obočí a rty.
- Oblečení má zúžený pas a rukávy, límec, lem, manžety a podle předlohy kapuci/kapsu/zip. Zachované jsou všechny šestice předloh, odstíny, vousy, brýle i odznaky.
- Fáze chůze vzniká z renderovaného posunu. Dvousegmentové IK ohýbá kolena; plantovaná noha drží světový bod, dokud nezačne švih. Kotník vyrovnává natočení stehna a kolena, takže podrážka při opoře leží vodorovně.
- Švih nohy má výšku a koncové tečny, které tlumí světovou rychlost chodidla při dopadu. První snímek opory započítává posun za hranicí fáze nula, aby bota nepřeskočila o jeden renderový krok dopředu.
- Lokty se přirozeně ohýbají více při běhu a sprintu. Gesta používají ramena i lokty. Skok plynule překládá nohy; po zastavení se nohy usadí krátkým střídavým krokem.
- Kořen, kamera a kapsle zůstávají bez houpání. Mírný náklon hrudníku a změna výšky kyčlí patří pouze uvnitř postavy.

`AvatarAnimator.update(state, dt)` nemění svůj dosavadní způsob volání. Volitelný `groundHeight(x,z)` dovoluje přesný dotaz na výšku pod každým chodidlem; bez něj se používá aktuální rovina spodku postavy. První testy opory proto prokazují rovný podklad. Individuální kontakt chodidla se schodem či nerovným terénem vyžaduje dodat tento dotaz a znovu ověřit scénu; nelze jej tvrdit pouze z testu roviny.

## Ověření

`pnpm exec tsx --test tests/animation.test.ts` ověřuje osm scénářů nad skutečným Babylon rigem: 30/60/144 FPS, zastavení, otočení přes ±π, gesta, teleport/uspání/vozidlo, hierarchii a uzavřenost hlavy/lidské proporce, oporu při chůzi/běhu/sprintu a skok/dopad. Oporový test porovnává výslednou světovou polohu kotníků s jejich uloženými světovými anchory během pohybu; tolerance je 1,2 cm. `pnpm exec tsc --noEmit` prošlo po doplnění rigů.

Aktuální komponentové CPU měření se reprodukuje pomocí `pnpm exec tsx docs/stability/audit-animation.ts`; starší výsledky z rigidního rigu nejsou důkazem výkonu této verze. NullEngine neměří GPU ani herní FPS. Hlavní browser audit musí zvlášť ověřit blízký přední/boční pohled, chůzi, běh, schody, dav a editor.

Výsledek je artikulovaný stylizovaný člověk s vlastními procedurálními tvary a IK. Není to fotogrammetrie ani hotová realistická skinned postava s autorskými animačními klipy. V této iteraci nebyl přidán nepoužívaný externí GLB; změna je přímo v aktuálním renderu hry a editoru.

# Volba prvního praktického ověření

21Oct2026, po převzetí všech tří r1/r2 výzkumů. Cíl: ověřit konkrétní uživatelskou možnost napsat neexistující objekt a jeho animaci textem a získat editovatelný Blender výsledek. Pilot **nevybírá vítěze kvality Meshy/Tripo/Rodin** a nemění produkci.

| Varianta | Přínos | Cena a omezení | Rozhodnutí |
| --- | --- | --- | --- |
| Cloud Meshy/Tripo/Rodin + následná animace | Doložené generování detailních sítí/PBR; vhodné pro samostatné kvalitativní srovnání stejných konceptů. | Účet/kredity, nejistá míra úspěchu, ruční topologie/rig a rozhraní/licence. Bez placeného pilotu nelze potvrdit vizuální prvenství. | Zachovat jako doporučené kandidáty, nyní nic nenakupovat/nahrávat. |
| Text→humanoid motion generátor | SayMotion dokumentuje nový pohyb a export. | Připravená lidská kostra; neodpovídá konstrukci mechanického objektu. Smluvní podmínky veřejného GLB zůstávají nevyjasněné. | Není první pilot objektu. |
| LLM↔live MCP↔Blender | Interaktivní textové editace a zpětná vazba. | Nová instalace/socket/konfigurace, změny živé scény, další lifecycle; pro jeden důkaz není nezbytné. | Pilotní základ bez MCP, ten až podle potřeby po ověření základu. |
| **Text→uložený bpy skript→pojmenované díly/klíče→.blend→GLB** | Nejmenší doložený řetězec pro vlastní pevné/kloubové objekty; parametry, materiály a klíče zůstávají editovatelné. API a glTF kontrakt v Blender r1/r2. | Procedurální estetika závisí na designu; není univerzálním organickým generátorem. Skutečnou verzi/exportmode a roundtrip je nutné zjistit a otestovat. | **Vybráno pro levné místní ověření.** |

Textové zadání: původní kinetická „hvězdná lucerna“ — tmavě modrá keramika a měď, svítící jádro, šest samostatných okvětních panelů na pojmenovaných pantech, dekorativní prstence. Čtyřsekundová smyčka30FPS: panely se otevřou, celek se lehce vznese/otočí a vrátí přesně do začátku. Čitelná stylizovaná silueta, matný tmavý podstavec a světlo vhodné pro náhled. Jde o fikční design bez předlohy.

Zaznamenat skutečný executable/build a export RNA. Pracovat pouze v novém vlastním factory-startup background Blenderu, explicitní CyclesCPU a omezený počet vláken; žádné síťové služby ani generační API. Uchovat zdrojový prompt, kód, parametry, editovatelný `.blend` před exportem, GLB, kontrolní nový import a několik vzorků pohybu/obrazů. Porovnat statickou geometrii, matice pojmenovaných uzlů v několika časech, rozsah/počet klipů a smyčku. Je-li model upraven textovou revizí, ověřit zachování nezměněné geometrie a původního klipu. Selhání zůstane zdokumentované; neprohlásit pouhý návrat export operátoru za úspěšný přenos animace.

Hodnotit zvlášť vzhled a technickou přenositelnost. Ani úspěšný tento pilot nebude měřením runtime FPS, uměleckou přejímkou všech objektů nebo srovnáním generátorů. Po skončení ukončit vlastní helpery a uvolnit rezervaci heavy/GPU před finální KEY-53 A/B.

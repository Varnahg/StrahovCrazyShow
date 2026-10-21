# Nezávislý čtecí spot-check při převzetí

Verifier ai3d_claim_verifier,21Oct2026; čerstvý kontext, osm skutečně čtených primárních URL, žádné zápisy ani runtime testy. Výsledek uložen koordinátorem bez změny věcného verdiktu.

| Tvrzení | Verdikt / zdroj | Neověřeno |
| --- | --- | --- |
| SayMotion vlastní upload vyžaduje humanoidní rig | Potvrzená deklarace [Custom Characters](https://www.deepmotion.com/article/custom-characters-saymotion). Služba nabízí i default postavy, proto není správné tvrdit, že každý uživatel musí vždy nejdřív sám vytvořit rig. | Prompt adherence, retarget kvalita, import. |
| Veřejný herní GLB ze SayMotion je povolený | Nevyřešená publikační podmínka; [Terms30Mar2025](https://www.deepmotion.com/terms-of-use) dovolují paid creative works a současně omezují standalone/extrakci. | Nepotvrzeno ani neprohlášeno za zakázané bez produktové výjimky/posouzení podmínek. |
| Meshy generuje libovolnou novou animaci | Rozpor: [manuál](https://docs.meshy.ai/en/webapp/guides/animate) presety/custom mimo službu; [library marketing](https://www.meshy.ai/animation-library) nový motion z textu. | Skutečný přístup k funkci, anatomie, výsledek, export. |
| Text/LLM→Blender klíče je reálný mechanismus | [Blender5.2 keyframe_insert](https://docs.blender.org/api/5.2/bpy.types.bpy_struct.html#bpy.types.bpy_struct.keyframe_insert), nezávisle [Khronos glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) podporují klíče a TRS/morph/skin kontrakt. | API není důkaz estetiky/exportu; native save verifier v tomto limitu znovu neotevřel. |
| Blender FBX neumí animované shape keys | Paušální tvrzení vyvráceno [oficiálním5.2 exporterem](https://raw.githubusercontent.com/blender/blender/blender-v5.2-release/scripts/addons_core/io_scene_fbx/export_fbx_bin.py): relativní shape geometry a vzorkované váhové křivky implementuje; absolutní key animaci přeskakuje. | Konkrétní AnimateAnyMesh roundtrip/interpolace/klipy neotestované. |
| Meshy paid/private znamená no-training | Vyvráceno [Terms19Sep2026](https://www.meshy.ai/terms-of-use) §2.9/3.2; oddělené osy, případný Order může mít vlastní pravidla. | Account-specific smlouvy; Tripo terms verifier znovu neotevřel. |
| Licence kódu/modelu automaticky určuje licenci GLB | Nepodložená inference, geometry digest tyto věci správně odděluje. | TRELLIS závislosti verifier v osmizdrojovém limitu znovu neotevřel; nejsou zde independently verified. |

Vendor schopnosti jsou medium pro skutečnou úspěšnost. Žádný srovnatelný pilot nepotvrzuje univerzálního vítěze vizuální kvality. Důležité procesní potvrzení: při selhání webopen402 se verifierovi podařilo oficiální API načíst přímým Invoke-WebRequest; nemožnost jednoho fetch nástroje není důkazem neexistující dokumentace.

# Dílčí kontrola nativního WebGPU editoru

18.10.2026, Edge na vlastní4194, čistý native snapshot `eb061b9eb34a0cdf8a94560ad7803ef9235ab1447e9b4d986c7cb640e2f0b7b3`. Query `renderBackend=webgpu`, bez podrobného výkonového profilu. Veřejná konzolová zpráva potvrzuje Babylon9.30 **WebGPU1 engine**; hash servírovaného Babylon bundle je v [záznamu](verification.json). Jde o nativní vendor-only build ověřený v [hitches-v12](../hitches-v12/README.md).

Přechody Alex → Robin → Eli → Sam → Mia → Niki dosáhly `data-preview-state=ready`; každá postava byla skutečně vidět ve screenshotu. Následně Alex s brýlemi a vousy, detail tváře a otočení doleva. Nakonec obnoven Alex a DOM potvrzuje nezaškrtnuté doplňky. Seznam zachycených browser warnings/errors je prázdný. Interní preview canvas361×244; CSS rozměr se samostatně neměřil.

[Alex](alex.png), [Robin](robin.png), [Eli](eli.png), [Sam](sam.png), [Mia](mia.png), [Niki](niki.png), [detail doplňků](alex-glasses-beard-face.png), [otočení](alex-glasses-beard-left.png). Snímky jsou původní beze změny pixelů. [Manifest14souborů](manifest.json) ověřuje screenshoty, UI stavy, DOM a konzolový výřez pouze z tohoto běhu; starší zprávy z měřicí karty se do výřezu nezahrnují.

**Toto není FPS měření, WebGL2 pixel parity, herní LOD/multiplayer test ani úplná lifecycle/resource-count přejímka.** Souběžně běžel nezávislý CPU avatar-view proof, proto se výkon editoru nevyhodnocuje. Po testu vlastní karta přešla na about:blank a vlastní API/preview byly ukončené. Hrané4193/4192/4188 beze změny. KEY-29/33 ani celková migrace tím nejsou označené hotové.

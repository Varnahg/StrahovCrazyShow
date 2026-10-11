# Herní modely

`strahov-compact.glb` je původní model vytvořený pro tento projekt, nikoli převzatý model automobilové značky. Zdroj: `assets/blender/strahov-compact.blend`. Obnovit lze pomocí `scripts/create-car.py` v Blenderu.

Jednotky: metry. Po exportu glTF: osa Y nahoru, přední část ve směru +Z. Přibližná šířka 1,9 m včetně zrcátek, délka 3,5 m, výška 1,56 m. Pohyb používá konzervativní samostatný kolizní kvádr; kola a jemné hrany nejsou kolizní geometrie.

Budovy se zatím generují z OSM a orientačního plánu B6. Modely pro jejich nahrazení musí zachovat místní osy hry (X východ, Z jih), měřítko 1 m a nezávislé kolizní tvary. Referenční atlas je v `docs/references/`.

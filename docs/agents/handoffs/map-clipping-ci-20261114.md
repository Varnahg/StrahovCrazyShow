# CI PR #52

První `verify` selhal na odvozených archivech stadionu a výšce nášlapu B4 v integračním testu. [Původní běh](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/43632529044)

Problém je rozdíl mezi stejnou geometrií používanou hrou, archivem a testem. Příčinou jsou staré GLB a očekávání výšky před přidáním 2 cm. Změna spočívá v novém exportu dotčených modulů a v očekávané výšce prvního nášlapu B3 a B4. Metrikou je shoda exportovaných počtů a hashů a odchylka výšky NPC od zásahu skutečné kolize. Podmínkou je zachování identity GLB, barev, průchodů a nedotčeného modulu B1. Přijetí vyžaduje cílené regrese a zelený CI na aktuálním head PR.

Selektivní export je vhodnější než změna očekávaného počtu nebo odstranění testu. Geometrie hry a kolize používají hotovou opravu z PR. Test stále počítá očekávanou výšku nezávisle na analytickém helperu.

Blender 5.2.2 vygeneroval oba modely stadionu a společný vstup na D:. Zkontrolované SHA a počty jsou v manifestu. Stadion má 11 139 trojúhelníků v blízké a 9 431 ve vzdálené variantě. Společný vstup má 560 trojúhelníků. Položka archivu B1 je bitově shodná. Cílená sada pokrývající oba původní pády prošla 11/11 včetně devíti skutečných výstupů kapsle po schodech. Tato oprava mění odvozené archivy a test na základě už ověřené herní geometrie PR.

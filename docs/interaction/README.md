# Ovládání, výběr cíle, mapa a deník

Princip ovládání byl před změnou porovnán s oficiálními příručkami Blizzardu:

- [Basic Movement and Combat](https://worldofwarcraft.blizzard.com/en-us/news/20151231) – držení pravého tlačítka pro kameru.
- [Orc Starting Zone](https://worldofwarcraft.blizzard.com/en-us/news/20165399/new-player-guide-orc-starting-zone-valley-of-trials-1-5) – výběr cíle levým tlačítkem a samostatný panel cíle.
- [Oficiální WoW Classic manuál](https://assets.blz-contentstack.com/v3/assets/blt3452e3b114fab0cd/blt2e9295db02a222fc/6025bcbb6968b53d529edb2a/media_manual_classic_enUS.pdf) – tažení levým tlačítkem pro orbit kamery.

Jde o převzetí ovládacího principu pro komunitní hru, nikoli implementaci bojového systému WoW. Nečinná postava se při otáčení kamery neotáčí; směr postavy určuje synchronizovaný pohyb. Nevzniká lokální přepis autoritativního natočení a následné chvění.

Třetí osoba má volný kurzor. Krátké levé kliknutí vybírá avatar, místo nebo hledací značku. Tažení levým tlačítkem po překročení 5 pixelů i tažení pravým tlačítkem otáčí kameru; kolečko mění vzdálenost. V první osobě (`V`) kliknutí zachytí myš pro rozhlížení a `Esc` ji uvolní. A/D nadále používají společný ověřený pravotočivý transform a v autě řízení.

`M` přepíná mapu, `J` deník, `G` nabídku čtyř gest. Gesta 1–4 odpovídají existujícím serverovým animacím 👋, ❤️, 🎉, 👍 a zachovávají limit serveru. Zadávání do chatu, vyhledávání, formulářů a otevřené modální nabídky neovládá svět. Mapové šipky a kolečko ovládají mapu. Zavření okna maže držené klávesy, takže postava nepokračuje v chůzi po přechodu do UI.

Výběr avatarů je paprsek ze skutečné renderovací kamery přepočítaný z CSS do interního rozlišení, proti kapsli v aktuální vykreslené poloze. Není závislý na počtu částí ani LOD postavy. Fyzikální kontrola viditelnosti brání výběru přes neprůhlednou překážku. Vybraná postava má zlatý kruh a kartu se sdílenými zájmy. Výběr samotný neodesílá žádost ani zprávu. Kontakt, přijetí, soukromá zpráva, ztlumení a blokace používají existující serverový souhlas.

Projekty blízko sebe mají společnou mapovou značku s počtem a rozbalitelným seznamem skutečných míst. Není nutné posouvat jejich publikované polohy, aby byly klikatelné. Z deníku lze otevřít místo na mapě a z místa jeho příslušný článek. Deník funguje v samostatné prohlídce.

## Ověření

`pnpm exec tsx --test tests/interaction.test.ts`: 5/5, skutečná Babylon RH projekce v 16 natočeních při třech rozlišeních; nejbližší viditelný cíl, překážka, limit vzdálenosti; ochrana vstupu; rozlišení kliknutí od tažení; dostupnost všech projektů v clusteru. Také `tests/controls.test.ts` 3/3. NullEngine je zde matematický test, nikoli důkaz GPU výkonu. `pnpm exec tsc --noEmit` prošel po integraci rozhraní výšky očí z avatar rendereru.

Skutečné dva prohlížečové klienty A/B: vzájemná přítomnost, mapový výběr, levé kliknutí přímo na avatar ve 3D bez pointer locku, žádost o kontakt, přijetí, doručení soukromé zprávy a blokování s odebráním DM kanálu prošly. G + 1 se zobrazilo jako 👋 GUI A ve vzdáleném klientu. Psaní `wasd jmg` v chatu nepřepnulo žádné okno a XZ drift zůstal pod 0,001 m. D během 1,2 s posunulo X z 23,800 na 28,704, A zpět na 24,425 při severním pohledu kamery. Klávesa J otevřela deník; hledání prádelny a přechod deník → mapový cíl prošly. Snímky a konkrétní hodnoty jsou v `evidence/browser-results.json`.

Browserové zkoušky používají testovací Vite bez HMR na 5180 a skutečný server 2567. Dlouhá inicializace dvou scén vedla před dokončením startu k odpojení jednoho klienta; po dokončení načítání a připojení oba prošli interakcí. Oprava souběžného zaplavování logu přes `InstancedMesh.visibility` byla integrována root agentem následně. Skryté subagentové okno není výkonnostní měření. Kompletní finální GPU a ovládací průchod musí proběhnout nad společným stabilním snapshotem.

Po rozšíření ovládání bylo skutečné levé tažení kamery ověřeno na sólo klientu; změnil se pohled kolem stojící postavy a kurzor se nezachytil. Volný orbit používá `pointermove` a rozdíl absolutních klientských souřadnic; `mousemove` a `movementX/Y` slouží pouze zachycené myši v první osobě. Tím se nepředpokládá dostupnost relativních hodnot mimo pointer lock. Tažení minimapy změnilo její střed z (22,05; −13,96) na (−17,01; −37,40), zatímco světová kamera zachovala pohled; viz `orbit-before.png`, `orbit-after.png`, `map-drag-isolated.png`. M z fokusu SVG otevřelo velkou mapu, Enter rozbalil tři skutečná místa B4 do dostupného seznamu (`map-project-cluster.png`). Přímé pravé tažení nástroj neumí parametrizovat; jeho shodná cesta je pokrytá testem tlačítek a zbývá finální ruční průchod.

Přesné znění a stav zdrojových hesel deníku spravuje samostatný modul `shared/journal.ts`; ovládací vrstva jeho obsah nepřepisuje.

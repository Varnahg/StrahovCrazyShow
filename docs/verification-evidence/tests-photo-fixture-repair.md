# Audit sedmi regresí po přechodu na IPR

Výchozí celý běh v `.cache/tests-photo-live-20261010.log` skončil 218 PASS / 7 FAIL z 225 testů. Tento zásah upravil výhradně `tests/campus-expansion.test.ts`, `tests/streets.test.ts`, `tests/vegetation.test.ts` a tento audit. Runtime, sdílená fyzika, geometrie, renderer ani zdrojové mapové soubory se neměnily.

Finální cílený příkaz:

```text
pnpm exec tsx --test tests/campus-expansion.test.ts tests/streets.test.ts tests/vegetation.test.ts
```

**Výsledek: 14 PASS / 1 FAIL z 15 testů, exit 1.** Záznam je v `.cache/tests-photo-fixture-repair-final.log`. Celý soubor 225 testů ani produkční build se v tomto zásahu znovu nespouštěl. Zbývající PID chyba není přeskočená, označená TODO ani změněná na očekávaný úspěch.

## Tři campus regrese: historická DMR komponenta

Tyto testy vytvářejí `new Simulation()` bez IPR kolizního podkladu. Použití nového produkčního spawnu (110; 12) přestalo dávat smysl: leží uvnitř skutečného soukromého parkoviště, mimo přísný graf veřejných OSM pěších cest. Graf správně nevymýšlí neexistující spojení.

Fixture nyní výslovně používá historický chodníkový start (22; −14), Y odvozené z DMR, a názvy i výstup uvádějí `legacy procedural baseline` / `legacy-procedural-dmr`. Test také kontroluje, že simulace opravdu nemá IPR geometrii. Nejde o prohlášení, že nynější produkční spawn dojde ke 191; to ověřuje oddělený audit skutečné fotogrammetrie včetně místních spojek a skutečných zaparkovaných aut.

Původní prahy průchodnosti zůstaly stejné, včetně zákazu teleportu/fall recovery, nejvýše 0,15 m na krok, podpory skutečným Rapier terénem, omezení výšky kapsle, cílové přesnosti 0,2 m a více než 95 % grounded vzorků.

| Cíl | OSM trasa | Ušlá délka | Tiky | Největší krok | Grounded |
|---|---:|---:|---:|---:|---:|
| 191 A | 503,142 m | 502,742 m | 6678 | 0,077032 m | 6672 |
| 191 B | 641,847 m | 641,171 m | 8485 | 0,077077 m | 8479 |

Mezera středu kapsle od DMR terénu byla 0,819894 až 0,995000 m. Hash ulic z obou průchodů: `af968dd412bc1fcb6c2a3dc6e81a046ae4176c5bb5364d288a9079888292eeef`; hash DMR: `5f4b45cf22507bbafdba96c17e4fb19e5c5e5188b85b2e55ec666b03109a7e03`.

## Dvě streets regrese: přesnost exportu a explicitní maska

Materiálový test prověřil 166 157 skutečně sestavených fallback trojúhelníků. Jediný nesoulad priority `streetSurfaceAt` byl štěrk / dlažební kostky u (384,020; −89,124016), plocha 0,0000401994 m², šířka 0,00110468 m. `fetch-streets.py` odečítá materiálové oblasti před exportem, ale zaokrouhluje jejich souřadnice na 0,001 m. Samostatné zaokrouhlení společných hran proto může vytvořit numerický hraniční proužek.

Test nyní vždy kontroluje obsah ve vlastním původním polygonu včetně děr, kladné Y normál a původní winding. Rozdílnou materiálovou prioritu dovolí **pouze** když šířka celého trojúhelníku i vzdálenost těžiště od vlastní hranice nepřesáhnou odvozenou chybu `sqrt(2) × 0,001 = 0,001414214 m`. Chybějící povrch, významný překryv, průnik do díry nebo budovy nadále selže. Není přidaná centimetrová či metrová tolerance k chybné geometrii.

Dva chybějící junction vzorky (−459,184; 178,813) a (−449,926; 171,689) leží 2,926 mm a 0,922 mm od budovy OSM 49379059. Jde o napojení krytých servisních úseků Zátopkovy. Generátor výslovně odečítá 25mm stavební apron; test dříve vynechával pouze přesný půdorys. `fetch-map.mjs` navíc zaokrouhluje budovy na 0,01 m, ulice na 0,001 m. Nová kontrola masky používá odvozený limit `0,025 + sqrt(2) × (0,01 + 0,001) / 2 = 0,032778175 m`.

Maska se dovolí pouze tam, kde povrch chybí a bod leží v tomto dokumentovaném apronu. Všech 432 ostatních společných junction bodů se stále kontroluje na existenci povrchu. Žádné obecné vynechání krytých ulic nebo náhodných mezer se nepřidalo.

## Tráva: plošný bank není aktivní renderovací rozpočet

Rozšířený areál má 940 × 610 m, tedy 573 400 m². V 16m mřížce může existovat 2340 buněk. Ve skutečnosti je obsazeno 599 buněk a 80 736 trsů, jejichž původní 16floatové transformační matice představují 5 167 104 bajtů. To je pouze vypočtená velikost matrix banku, nikoli GPU nebo celkový paměťový profil.

Pevné historické `tiles.length < 400` nahradilo omezení odvozené z plochy: nejvýše jedna dlaždice na platnou buňku, jednoznačná ID, správné polohy, nejvýše 256 původních trsů na buňku a jediná sdílená geometrie. Celý vzdálený bank musí při startu zůstat vypnutý.

Aktivní omezení se **nezvýšila**: low nejvýše 16 dlaždic / 1536 trsů, high nejvýše 32 dlaždic / 8192 trsů. Test je ověřuje na původním stanovišti, novém parkovacím spawnu, západním stadionu, jižních zastávkách i mimo areál. Aktivní počet skutečných meshů a thin instances musí odpovídat hlášeným statistikám; mimo areál se bank celý deaktivuje. Uklizení stále odstraní všechny meshe.

## Ponechaný skutečný FAIL: PID a fallback Vaníčkova

První neúspěšný bod je `L149V1` v (−135,0624; 221,3264), vzdálený 3,528273 m od osy OSM úseku 124071290, zatímco odvozená šířka fallback silnice je 7 m. Bod tak nepatří do sestaveného asfaltu. Podrobný read-only průchod stejným vzorkováním našel 163 chybějících asfaltových vzorků z 803 a 105 vzorků i mimo původní koridor `width/2 + 0,5 m`.

Největší rozdíl od modelované hrany je 1,123848 m u (−166,629; 231,7016) v `L143V2`, `L149V2` a `L149V5`: osa je 4,623848 m daleko, modelovaný poloměr 3,5 m. Diagnostické pomocné výstupy jsou v `.cache/test-fixture-probe2.jsonl`.

Šířka 7 m má provenienci `class-inferred-not-measured`. Tato evidence tedy prokazuje nesoulad **odvozeného fallback asfaltu a PID geometrie**, nikoli bez dalšího fotoauditu chybnou skutečnou jízdu na IPR snímku. Oprava vyžaduje zdrojový audit šířky / průběhu zatáčky proti skutečnému podkladu. Test zachoval oba původní požadavky a dostal pouze přesnější diagnostiku se souřadnicemi, shape ID, OSM ID, vzdáleností a proveniencí šířky. Runtime oprava během zmrazeného KCC auditu nebyla provedena.

Žádný výsledek tohoto souboru není důkaz GPU výkonu, produkční fotogrammetrické chůze z nového spawnu ani úplného průchodu všech 225 testů.

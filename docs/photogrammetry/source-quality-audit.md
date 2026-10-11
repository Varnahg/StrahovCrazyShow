# Audit původních dílů IPR fotogrammetrie

Kontrola 10. 10. 2026, pouze čtení originálů. Audit pokrývá **všech 3 518 stažených uzlů, 7 036 souborů geometrie/JPEG a všech 2 588 nejpodrobnějších listů s 3 955 667 trojúhelníky**. Zdroj je skutečná fotogrammetrie IPR z **léta 2023**, CC BY. Není to aktuální zaměření roku 2026. Originální soubory ani runtime nejsou tímto auditem upravené.

## Integrita celého staženého zdroje

Všechna geometrická i texturová data souhlasí s deklarovaným SHA-256 a délkou. Každá geometrie byla dekódována; vrcholy, transformované pozice a UV jsou konečné, počty souhlasí s manifestem, UV nepřekračují jednotkový rozsah. Každý JPEG má validní SOI/EOI a hlavičku s nenulovými rozměry. Rozměry: 197 × 1024², 1 670 × 1024×512, 1 601 × 512², 50 × 512×256. Samostatné dekódování entropických pixelů JPEG se neprovádělo; kontrola shody originálních bajtů a hlaviček se za něj nevydává.

Nejpodrobnější zdroj obsahuje **23 přesně degenerovaných trojúhelníků** a dalších **808 s plochou pod 0.000001 m²**. Nativní i herní Float32 kontrola potvrdila shodný počet 23 degenerací. Je to velmi malý podíl zdroje; není důvod zahazovat celé uzly. Případné odfiltrování nulových trojúhelníků patří pouze do odvozené zobrazovací/kolizní vrstvy.

Winding je měřen pravotočivým křížovým součinem. V pásmu ±1.5 m od DMR má 385 646 přibližně vodorovných trojúhelníků normálu +Y a 48 077 −Y. Záporná normála může být spodní strana auta, vegetace nebo konstrukce; sama o sobě není důkaz obrácené celé dlaždice. Zdrojový materiál je oboustranný. Automatické přetočení všech záporných ploch by poškodilo konstrukci.

Podrobnosti pro **každý jednotlivý uzel**, včetně skutečného světového bounding boxu, UV, rozměrů textury, geometrických statistik a chyb, jsou v `source-quality-resources.json`. Agregace a hash vstupního manifestu jsou v `source-quality-summary.json`.

## Podpůrný povrch a návaznost u chodců

Audit indexuje pouze originální nejpodrobnější listy, takže nezaměňuje chybějící zem za dočasně nenačtené LOD. Svislé průniky trojúhelníky vzorkují obě propojené pěší OSM trasy ke 191 po **0.5 m**, propojený východní přístup k R-ku, B6 a všech devět severních vstupů. Záznam zachovává všechny zásahy, jejich výšky/normály, node ID a okolní source ID. Podpora se hledá v pásmu ±3 m od DMR s dostatečně vodorovnou normálou; tento filtr je pouze diagnostika, nikoli finální návrh fyziky. Celkem je na trasách **2 810 vzorků**. Navíc je **16 734 hustých 0.5m plošných sond** u spawnu, B6, centrálního asfaltu, skutečných vnějších hran Potravin/R-ka a obou zastávek. V těchto plošných sondách není žádný úplně prázdný svislý paprsek; některé ovšem protínají jen příliš strmé či vyšší objekty a neposkytují vhodnou zem pro chodce.

Na trase A chybí blízký podpůrný scan zásah v 25 z 1 007 vzorků, na B v 72 z 1 284. **To nejsou automaticky díry ve všech těchto místech**: častou příčinou je strom nebo stříška nad zakrytou zemí. Trasy se částečně překrývají a počty nelze sčítat na počet unikátních vad. Výškové rozdíly >0.45 m a skoky >0.22 m na 0.5 m jsou samostatně uvedené; mohou být skutečnými obrubami, schody, auty či šumem.

Rozdíl vůči DMR není automaticky chyba fotogrammetrie. DMR má jinou dobu pořízení a u B6 explicitní herní základovou adaptaci. Proto každý vzorek obsahuje jak herní `dmrY`, tak původní `sourceDmrY`. Stav u střechy nelze vyhodnocovat jako zem. Bod R-ko `[103.08, −57.81]` leží v půdorysu Potravin: jeho scan zásah na střeše Y0.173 je očekávaný, není to veřejný chodník nebo určené dveře.

Východní přístup k R-ku `[145, −58]` má propojenou trasu dlouhou 160.854 m a všech 322 vzorků má blízký podpůrný zásah. Přesto je v ní 18 rozdílů vůči DMR přes 0.45 m a 17 výškových skoků přes 0.22 m. Požadavky na propojené grafové trasy ke dvěma bodům uprostřed parkoviště při přípustném spojníku ≤10 m souvislou pěší trasu nevytvořily. Audit ji nevymýšlí; místo ní dodává husté plošné sondy. To je omezení/topologická neúplnost mapového navigátoru, nikoli samo o sobě závada IPR geometrie.

## Priority oprav a pohledy pro kořenový WebGL průchod

| Priorita | Světové místo [X, Z] m                                                   | Source ID            | Nález a doporučená kontrola                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | B6 severní práh `[−4.85, −77.67]`, přístup kolem `[−4.85, −80]`          | `1127463`, `1127471` | V zásazích je stříška Y4.432–4.464 a střecha Y19.057/19.400, nikoli zem nebo čisté stupně. Zachovat přesnou oblast průchozího interiéru a sdílené schody; nepoužít nejvyšší scan zásah jako podlahu. Neodstraňovat celou dlaždici se střechou bloku. |
| P1       | Pěší cesta při Vaníčkově `[−114.91, 88.26]`                              | `1125553`, `1127377` | Zem je v některých paprscích zakryta vegetací; zásahy jsou kolem Y12–14. Zkontrolovat pohled ve výšce očí a lokální podpůrnou kolizní vrstvu, nikoli posun celé dlaždice.                                                                            |
| P1       | Jižní chodník k 191 B, `[−244.47, 230.51]` až `[−248.47, 230.64]`        | `1125759`, `1125760` | Zachován scan vyšších objektů/vegetace, lokálně chybí podpůrný ground zásah. Projít celý úsek z obou směrů.                                                                                                                                          |
| P1       | Pokračování stejného chodníku `[−300.45, 232.30]` až `[−304.44, 232.43]` | `1125823`, `1125824` | Zásahy Y14–21 místo dostupné země; source listy jsou přítomné, nejde o selhané stažení.                                                                                                                                                              |
| P2       | Spawn `[22, −14]`                                                        | `1127320`            | Scan Y−1.08090 proti DMR Y−0.89700: rozdíl −0.18390 m. Kontrolovat dotyk nohou a výběr jedné společné podpory; neprovádět globální posun fotogrammetrie.                                                                                             |
| P2       | Centrální asfalt `[130, 12]`                                             | `1123631`, `1123633` | Zde čistá podpora: scan Y−3.59110, DMR Y−3.69150. Okolní body bez vhodné blízké podpory nebo se šumem jsou v `source-quality-areas.json`; nejdřív rozlišit skutečné statické auto/objekt od chybné země.                                             |
| P2       | Nástupiště A `[−241.879, 254.4]`                                         | `1125641`            | Scan Y3.31443, DMR Y3.12128. V celé sondované ploše A je blízká podpora přítomná; ověřit návaznost přes obrubu.                                                                                                                                      |
| P2       | Nástupiště B `[−281.968, 273.747]`                                       | `1125693`            | Samotný označníkový bod má podporu Y2.29034 vs DMR Y2.10963; severní okolí má zakryté části. Stanici nelze prohlásit za kompletně čistou podle jediného bodu.                                                                                        |

Přesné vzorky, všechny výškové průniky a source ID jsou v `source-quality-routes.json` a `source-quality-areas.json`. Tyto soubory dovolují cílenou čistící vrstvu: omezený polygon/objem, pravidlo pro podporu chodců a zachované původní nejpodrobnější soubory. Není vhodné zahazovat celý leaf kvůli stromu, autu či několika nulovým trojúhelníkům.

## Opakování a hranice auditu

```powershell
pnpm exec tsx scripts/audit-photogrammetry-quality.ts
```

Skript nemění originály ani herní runtime. Nebyla spuštěna stará `Simulation` bez fotogrammetrie a takový test se nevydává za průchod po novém zdroji. Nebyl spuštěn full build/suite ani GPU benchmark. Atlasové JPEG samy o sobě nepředstavují čitelný pohled na místo; vizuální závěry je nutné dělat na skutečně namapovaném WebGL modelu ve výše uvedených souřadnicích. Baked stíny, historická auta a statická vegetace jsou vlastnost zdroje z roku 2023, ne důkaz současného počasí nebo provozu.

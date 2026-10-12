# Předání: atmosphere-cloud-refinement

- Vlastník: `weather-01a12fcb-atmosphere` (podagent `/root/atmosphere`); příjemce: root počasí `01a12fcb-4233-70c0-bc2d-95fc261f870c` a koordinátor katalogu.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`; výchozí commit `918a59ce63d7ba7c3a97c209a739cd59a4e00475`.
- Výsledek: připraveno k integrátorově GPU přejímce. Oblaka mají jemnější prostorové měřítko, zaoblené členité obrysy, kalibrované pokrytí a směrové prosvětlení. Hvězdy mají užší jádro, stabilní subpixelovou energii a vyšší čitelnost při zachované katalogové poloze a pořadí jasností.
- Změněné soubory: `client/atmosphere-sky.ts`, `tests/atmosphere-sky.test.ts`, `docs/weather/atmosphere-sources.md`, tento handoff. Žádný jiný soubor ani katalog hvězd nebyl při této refinaci změněn.
- Převzatý WIP: první tři soubory jsou výslovně doložená předchozí práce téhož podagenta a rootu počasí. Claim s `--adopt-dirty` schválil koordinovaný task; cizí změny ve společném checkoutu zůstaly nedotčené. Read-only podagent `cloud_review` pouze nezávisle změřil chybu pokrytí a doporučil korekci; žádné soubory neupravoval.

## Podklady a změna chování

Integrátor dodal skutečný full-game snímek `docs/weather/atmosphere-evidence/broken-initial.jpg`. Jeho prohlédnutí potvrdilo příliš velké rozmazané skvrny. CPU vzorek původního generátoru vysvětlil řídkou oblohu: při zadání 50 % měl původní shader jen přibližně 18,3 % průměrné opacity, při 25 % prakticky nic. Po empirické CDF kalibraci jednotlivých kanálů je výsledek pro 50 % **50,002 % v centrech texelů / 49,970 % při bilineárním vzorkování**. Testované požadavky 10–90 % ve všech třech kanálech odpovídají do 0,3 procentního bodu.

Podklady katalogu, licence, USNO/IERS astronomie a výtvarné aproximace zůstávají v `docs/weather/atmosphere-sources.md`. Celulární lobes, prostorová měřítka a PSF jsou výtvarné odhady, nikoli pozorované tvary mraků. Nominální výšky 1,4 / 3,51 / 8,512 km i meteorologický směr ODKUD zůstaly zachované; menší texturní měřítko současně upravilo projekci, pohyb kamery a drift větru.

## Refaktoring a náklady

- Společná funkce `atmosphereCloudField` vrací pokrytí i netresholdovanou výšku. Obloha a oba kotouče stále používají totožnou masku; vnitřek neprůhledného mraku proto neztrácí plastické stínování.
- Lattice hash se sdílí při jednorázové tvorbě atlasu; empirická CDF se nepočítá za běhu. Nevznikla další textura ani per-frame alokace.
- Maximum zůstává tři texturní vzorky pro masku. Medium/high má pouze **jeden další vzorek**, jen ve viditelném nízkém mraku, pro směrové osvětlení. Low a kotouče mají stále tři vzorky.
- Hvězdná stopa používá užší základ 0,41 texelu a omezenou fotografickou odezvu s 1,6× integrovanou energií původního zobrazení. Normalizace probíhá pouze při vytvoření atlasu a zamezuje mizení slabých hvězd mezi texely.
- Existující cache siderické matice, dvě vlastněné textury, časové vyhlazení a idempotentní disposal zůstaly zachované.

## Ověření

`pnpm exec tsx --test tests/atmosphere-sky.test.ts`, **2026-10-12 11:43:25 UTC**, exit **0**, **9/9 PASS**:

1. Siderická epocha a osy východ/sever.
2. Nezávislá referenční precesní matice ERFA.
3. Katalogové polohy v atlasu včetně Polárky.
4. Soumrak, lunární vzdálenost a potlačení hvězd.
5. Deterministické periodické přechody atlasu.
6. CDF pokrytí i bilineární vzorky, krajní hodnoty, monotónnost.
7. Subpixelová energie hvězd a pořadí jasností.
8. Stabilní identita obou textur a idempotentní disposal.
9. Vyhlazení vrstev, modelový vítr ODKUD, pohyb mraků při zmrazené astronomii a shoda metrového posunu kamery s driftující vrstvou.

Původní cílený běh po změně generátoru v **11:40:29 UTC** měl 6/7 PASS, exit 1: starý test `seam / size < 16` selhal. Tato pevná mez byla určena pro původní silně komprimovaný rozsah a řídký 64² testovací atlas. Nový test používá skutečný 256² atlas a porovnává přeshraniční sousedy s běžnými sousedními texely; naměřená průměrná změna je 6,867 přes šev proti 5,904 uvnitř. Následné oba běhy 9/9 prošly. Jeden pomocný inline numerický příkaz nejprve selhal na ztracených uvozovkách PowerShellu; opakování přes doslovný stdin proběhlo úspěšně. Chybné běhy nejsou prezentované jako průchod.

`pnpm exec prettier --write` nad třemi vlastněnými soubory uspělo. `git diff --check -- <tři soubory>` exit 0; soubory jsou untracked, takže tento příkaz sám nekontroluje jejich obsah. Testové výstupy jsou výše a v historii tohoto tasku; žádný další logový soubor nebyl mimo rezervaci založen.

## Identita předávaných zdrojů

Manifest je UTF-8 bez BOM: následující tři řádky ve stejném pořadí, oddělené LF včetně posledního LF. SHA-256 manifestu: **`40fdbd1b0b465f8327df210e939c6c0d919dd9429d62a4192a843e137d7244bf`**.

```text
client/atmosphere-sky.ts a2dbd3a73e6143dc3748d6b3a728af97cf7115d94531e12335fa24cac65c5db3
tests/atmosphere-sky.test.ts 4b7aeadac42004394fabd7e54460e8b2b76b38acf30a0286560b633e13594252
docs/weather/atmosphere-sources.md 05c4dc747bec3782387e24798cfec1a2a4a6b39aea03c611623e1f465d0acb05
```

## Procesy, limity a předání

Žádný server, prohlížeč, GPU scéna ani dlouhožijící pomocný proces nebyl spuštěn. Všechny vlastní jednorázové CPU příkazy skončily. Nebyl spuštěn build, plná sada, integrace ani GPU; ty patří následnému rezervovanému `weather-integration-20261012`. NullEngine ověřuje pouze vlastnictví zdrojů, nikoli výkon či vzhled.

Rezervace se po tomto handoffu uvolní příkazem `release`. Po uvolnění jsou soubory zmrazené pro rootovu praktickou kontrolu; status `done` a začlenění do `docs/verification.md` provede koordinátor/integrátor po převzetí. GPU vizuální přijetí nové varianty zůstává otevřené, včetně hustoty mraků a čitelnosti hvězd ve skutečné produkční hře.

# Adaptivní vykreslování

Automatický režim řídí skutečně naměřená doba snímků. Jméno grafické karty se nepoužívá k odhadu její rychlosti. Výchozí cíl je 60 FPS; volitelné cíle 120 a 144 FPS ovlivňují kvalitu, ale **neomezují render loop**. Dostatečně rychlý prohlížeč může vykreslovat přes 60 FPS i při cíli 60. Frekvence RAF obvykle odpovídá obnovování displeje a v pozadí se mění, proto adaptace ignoruje skrytou záložku. [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

## Výchozí stav a měření

- Auto začíná střední kvalitou a backbufferem o velikosti CSS canvasu. Interní rozlišení se nezvyšuje automaticky podle devicePixelRatio.
- Prvních 8 sekund po spuštění a 3 sekundy po návratu z pozadí se nevyhodnocují. Delší mezera než 500 ms také znovu spustí zahřátí.
- Každé dvousekundové okno ukládá průměrné FPS, medián, p95, p99 a podíl pomalých snímků. Používá se původní interval snímku, nikoli omezené dt fyziky. Kruhový buffer má nejvýše 2048 hodnot; průměr počítá všechny intervaly.
- Běžný pokles vyžaduje dvě pomalá okna. Při propadu pod 65 % cíle stačí jedno. Zásahy mají nejméně čtyřsekundový odstup. Jediný dlouhý snímek ani malé kolísání kolem 60 FPS kvalitu nesnižují.
- Zlepšování vyžaduje 12 sekund zdravých oken. Neúspěšné zvýšení se vrátí a další pokus odloží o 60, 120, nejvýše 180 sekund. Tím se omezuje přepínání při limitu VSync, kde samotných 60 FPS nedokazuje rezervu GPU.
- Ruční nízká/střední/vysoká kvalita je pevná. Měří dál, ale automaticky ji nepřepíše. Pevné benchmarky musí předat `suspended: true`.

`measurePresentationRate()` měří asi 1,55 sekundy **před render loopem světa a po zastavení náhledu avatara**. Vrací jen pozorovaný rytmus prohlížeče, ne certifikované maximum monitoru. Při jitteru, skryté záložce, málo vzorcích nebo timeoutu vrací nepoužitelný výsledek. Nezávisle zjištěná stabilní frekvence může být dočasným stropem adaptačního cíle; z FPS zatíženého světa se frekvence monitoru neodvozuje. Přesun okna na jiný monitor vyžaduje nové měření nebo znovunačtení hry.

## Rozlišení a vzdálenosti

Babylon již nabízí frustum culling, instance, LOD a změnu interního rozlišení. Vyšší `hardwareScalingLevel` snižuje počet pixelů a pomáhá hlavně při limitu GPU. Snížení počtu aktivních meshů a draw calls řeší jiný druh nákladů. [Babylon: optimalizace scény](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene), [Babylon: SceneOptimizer](https://doc.babylonjs.com/features/featuresDeepDive/scene/sceneOptimizer).

Controller používá kroky scale 1 / 1,1 / 1,2 / 1,3 / 1,45 / 1,65 / 2, tedy nejméně 50 % CSS šířky a výšky. Bez spolehlivých GPU timerů nejprve zkusí malé snížení pixelů, poté detail vzdálených objektů. Pokud skutečné CPU i GPU časy ukazují převahu CPU práce, sníží rovnou scénový preset. Doba mezi RAF callbacky se nevydává za čas GPU. Ani měření celého JS frame přes `performance.now()` není izolovaným důkazem příčiny: může obsahovat čekání ovladače.

| Rozpočet | Nízká | Střední | Vysoká |
|---|---:|---:|---:|
| Detail fasád od obálky budovy | 55 m | 76 m | 100 m |
| Plně animovaný blízký avatar | 10 m | 15 m | 22 m |
| Avatar se středním detailem | 36 m | 60 m | 90 m |
| Dosah trsů trávy | 35 m | 45 m | 60 m |
| Maximum travních dlaždic | 16 | 24 | 32 |
| Hustota trsů | 37,5 % | 65 % | 100 % |
| Detail vybavení B6 | 13 m | 18 m | 24 m |
| Mapa stínů | 512² | 1024² | 2048² |

Tabulka odpovídá existujícím LOD controllerům; `shared/render-quality.ts` je jejich společný rozpočtový kontrakt. Fasády mají stále vzdálenou reprezentaci a avataři vzdálenou siluetu. Lokální postava zůstává plně artikulovaná. Stávající hystereze fasád a avatarů se zachovává, B6 odpojuje vybavení nepoužívaných pater ze scény a tráva používá thin instances. Výkonnostní řízení nemění fyziku, kolize, synchronizaci, online přítomnost, chat ani počet hráčů společného světa.

## Zapojení

```ts
const adaptive = new AdaptiveQualityController({ mode: "auto", targetFps: 60 });
// Jednou při inicializaci aplikovat také adaptive.state (revision začíná 0).
const cadence = await measurePresentationRate(); // svět ještě nevykresluje
adaptive.setPresentationHz(cadence.reliable ? cadence.observedBrowserHz : null);

const state = adaptive.update({
  nowMs: performance.now(),
  frameMs: rawFrameMs,
  visible: !document.hidden,
  suspended: !!benchmark,
  cpuFrameMs: measuredPreviousCpuWorkMs,
  gpuFrameMs: gpuTimerSupported ? measuredPreviousGpuMs : undefined,
});
// Při změně revision předat state.quality všem LOD/render controllerům.
// engine.setHardwareScalingLevel volat pouze při skutečné změně scale.
```

`setMode()`, `setTargetFps()` a `setPresentationHz()` vracejí okamžitý nový stav. `state.statistics` a aktuální rozlišení mají být součástí diagnostiky a uloženého benchmarku. Babylonův GPU timer má jednotky nanosekund, takže integrace jej převádí na milisekundy; nepodporovaná query zůstává `undefined`.

## Výběr GPU

`powerPreference: "high-performance"` je požadavek prohlížeči, nikoli přepnutí adaptéru. Instalovaný Babylon 9.30 už tento hint sám doplňuje v `thinEngine.pure.js`; dřívější použití Intel UHD 630 proto nelze vysvětlit pouze chybějícím explicitním flagem. Prohlížeč a Windows rozhodují, co skutečně použijí. UI musí zobrazit skutečný `engine.getGlInfo().renderer` a zjištěný výsledek; pouhá přítomnost GTX 1060 v inventáři nedokazuje použití pro hru. [MDN: WebGL context attributes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext).

## Ověření a hranice důkazu

Samostatných 14 testů pokrývá warmup, časová okna, dosažení pevného minima, ruční override, rozlišení měřeného CPU/GPU, izolaci skrytých záložek a benchmarků, chyby hodin, návrat kvality a neúspěšné sondy, volbu cílů a nezávislé měření rytmu RAF. Jde o ověření rozhodovací logiky; neposkytuje důkaz FPS v GPU hře.

Historický [audit D](integrated-20261010-d.md) prokazuje pouze tehdejší pevný low výhled na UHD 630. Nový Reality Pack má jiné náklady; shader warmup za souběžných testů není platné stabilní měření ani identifikovaný bottleneck. Po integraci musí vzniknout nový source hash a GPU audit celé produkční hry s HUD, skutečnými relacemi, různými avatary, zaznamenaným rozlišením, stavem adaptace a p95/p99. 144 FPS zde není naměřený výsledek. Cíl 60 FPS nezaručuje, že jej každý hardware zvládne na nejnižším rozpočtu.

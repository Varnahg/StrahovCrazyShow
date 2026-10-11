# Podklady studie optimalizace Strahov Crazy Show

Tyto soubory doprovázejí [hlavní studii](../STUDIE.md). Měření vznikla 10. října 2026. Zdroj se během auditu měnil další souběžnou prací, proto mají hlavní výsledky společný zmrazený podklad. Novější změny jsou odděleně uvedené na začátku studie.

## Co je v přílohách

| Soubor | Obsah |
|---|---|
| [source-snapshot.zip](source-snapshot.zip) | Zdroj klienta, serveru, sdílené simulace, testů, skriptů, HTML vstupu a konfigurace; bez node_modules a build výstupů |
| [source-manifest.json](source-manifest.json) | SHA-256 archivovaných zdrojů, relativní cesty |
| [concurrent-changes.json](concurrent-changes.json) | Časově označený přehled odlišností pracovního kódu oproti snapshotu |
| [browser-measurements.json](browser-measurements.json) | Souhrny odečtené z browserového harnessu; obsahuje i vyloučené běhy se souběžným sestavováním |
| [browser-audit.html](browser-audit.html) | Samostatná Game scéna, CPU/kamerové časování, veřejný draw counter a syntetický dav |
| [physics-diagnostics.json](physics-diagnostics.json) | Podklad, rotační průnik auta, skok, rychlost u zdi, rozdíl vstupů, 1/16/32/100 aktérů |
| [physics-diagnostics.mts](physics-diagnostics.mts) | Reprodukce fyzikálních diagnostik |
| [render-inventory.json](render-inventory.json) | Topologie světa, počty objektů, materiálů a geometrie; nikoliv GPU benchmark |
| [render-inventory.mjs](render-inventory.mjs) | NullEngine rekonstrukce buildWorld s náhradou canvasových cedulí |
| [network-benchmark.json](network-benchmark.json) | 1/8/16 připojených botů na samostatném loopback serveru |
| [network-server-timers.json](network-server-timers.json) | Skutečné intervaly serverového timeru a trvání celého callbacku |
| [network-methodology.md](network-methodology.md) | Síťová metodika, omezení, výpočty a podrobnější reprodukce |
| [network-benchmark.mts](network-benchmark.mts) | Připojení botů, přenos vstupů a sběr síťových souhrnů |
| [network-server-probe.mts](network-server-probe.mts) | Vlastní server s instrumentací intervalů a automatickým ukončením |
| [vite-build.log](vite-build.log) | Úspěšná diagnostika samotného bundleru; nikoliv potvrzení TypeScript build gate |

## Verze a omezení

Hlavní knihovny ve snapshotu: Babylon.js 9.30.0, Rapier 0.21.0, Colyseus core 0.18.9 a SDK 0.18.5. Serverové diagnostiky použily Node 24.19.0 na Windows a Core i7-8750H. Browser renderer nahlásil Intel UHD 630, nikoliv přítomnou dedikovanou kartu.

Browserové výsledky jsou souhrnné statistiky z 12sekundových běhů, ne archiv každého jednotlivého snímku. Hodnoty v JSON jsou místy zaokrouhlené. CPU interval kolem Game.frame neobsahuje úplný GPU čas. Sto renderových postav není sto připojených klientů a serverová fyzika bez grafiky není FPS test. Dva běhy, které se překryly s buildem, jsou výslovně oddělené od hlavní interpretace.

V původním browserovém čítači draw calls byla kumulace; hodnoty 91 031 a 181 675 se proto nesmějí používat jako počet volání na snímek. Korektní instrumentované hodnoty jsou v dalších bězích: 43 a 934. Samotný NullEngine inventář počet skutečných draw calls nedokazuje.

## Obnovení zdrojů

V aktuální pracovní složce už existuje `.cache/optimization-study-snapshot`. Pokud existuje, nepřepisovat ji při reprodukci. Pokud byla cache odstraněna, lze ji obnovit z kořene projektu:

~~~powershell
$studySnapshot = Join-Path (Get-Location) '.cache\optimization-study-snapshot'
if (Test-Path -LiteralPath $studySnapshot) {
  throw 'Snapshot již existuje; nejprve ověřte jeho hashe.'
}
Expand-Archive -LiteralPath 'docs\optimization-study\evidence\source-snapshot.zip' -DestinationPath $studySnapshot
~~~

Běh předpokládá nainstalované závislosti projektu odpovídající archivovanému lockfile. Automatická instalace jiné sady `latest` závislostí by nebyla stejný experiment. Archiv obsahuje také původní `source-hashes.json`, který používá síťová instrumentace; úplnější relativní manifest je vedle archivu.

## Fyzika a inventář

Z kořene projektu:

~~~powershell
node --import tsx docs/optimization-study/evidence/physics-diagnostics.mts .cache/physics-rerun.json
node --import tsx docs/optimization-study/evidence/render-inventory.mjs
~~~

Druhý příkaz vypíše inventář do terminálu. Pro výsledky dalšího měření používat nové soubory; uchovat původní naměřené JSON jako historickou baseline.

## Browserový harness

Z kořene projektu zkopírovat harness do snapshotu a spustit samostatný server na volném portu:

~~~powershell
Copy-Item -LiteralPath 'docs\optimization-study\evidence\browser-audit.html' -Destination '.cache\optimization-study-snapshot\audit.html'
node node_modules/vite/bin/vite.js .cache/optimization-study-snapshot --host 127.0.0.1 --port 5174 --strictPort
~~~

Otevřít `http://127.0.0.1:5174/audit.html`, nechat scénu zahřát nejméně pět sekund a spustit měření původní kamery. Výsledek se objeví pod canvasem. Potom změřit variantu bez kamerového dotazu; tlačítko pro přidání 99 avatarů připraví renderový dav. Obnovení stránky vrátí jednoho hráče.

Scéna má CSS canvas 1280 × 720 a původní low scaling 1,3. Při jiné konfiguraci se má ověřit skutečné interní rozlišení v JSON. Pro hodnocení celého obrazu otevřít dostatečně velké okno; zaznamenané původní okno bylo menší a zobrazovalo jen část canvasu.

Harness používá původní buildWorld a původní kamerový dotaz ze snapshotu. Nevypovídá o souběžně přidané Rapier kameře a instancovaných avatarech v novějším pracovním kódu. No-ray varianta odstraňuje ochranu kamery a slouží pouze k izolaci výkonové ceny.

## Síťové opakování

V prvním terminálu:

~~~powershell
node --import tsx docs/optimization-study/evidence/network-server-probe.mts .cache/optimization-study-snapshot 2568 .cache/network-timers-rerun.json 90
~~~

Po oznámení připraveného serveru ve druhém:

~~~powershell
node --import tsx docs/optimization-study/evidence/network-benchmark.mts http://127.0.0.1:2568 .cache/network-rerun.json
~~~

Použít samostatný prázdný server. Boti se odpojí a server skončí po zadané době; skripty odmítají běžný port 2567. Při měření nesmí souběžně běžet build nebo jiný benchmark. Pro přesné srovnání stanovit opakování a stejný napájecí/teplotní režim. Kompletní detaily jsou v [síťové metodice](network-methodology.md).

## Rozsah ověření

Snapshot: jednotkové testy 9/9 úspěšné; plný `pnpm build` selhal na třech TS7006 v serverovém middleware; samotný Vite bundler prošel. Vývojový integrační test prošel na tehdy běžícím serveru. Novější pracovní kód již obsahoval opravu explicitních typů middleware; stav snapshotu nelze zaměnit za výsledek nové verze.

Diagnostické procesy tohoto auditu byly ukončeny. Původní vývojové procesy projektu nebyly ukončovány.


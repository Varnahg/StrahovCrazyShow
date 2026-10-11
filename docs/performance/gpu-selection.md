# Výběr grafiky a vyšší obnovovací frekvence

Průzkum a kontrola počítače: 10. 10. 2026. Nastavení Windows, registry, ovladače ani běžící aplikace tento průzkum nezměnil.

## Co bylo ověřeno

- Dosavadní GPU benchmark hry hlásil `ANGLE (Intel, Intel(R) UHD Graphics 630 … Direct3D11 …)`; renderoval tedy kontext na Intelu. Přítomnost druhé karty sama nedokazuje její použití.
- `Win32_VideoController` potvrzuje Intel UHD Graphics 630, ovladač `31.0.101.2140`, a NVIDIA GeForce GTX 1060, ovladač `32.0.15.8228`.
- Počítač používá Windows 11 Home, build 26200. Při kontrole oficiálními čtecími Win32 API byl k ploše připojen jediný displej `\\.\DISPLAY1`: Intel UHD 630, 1920 × 1080, 60 Hz. Výčet režimů ovladače nabízel nejvýše 60 Hz i při jiném rozlišení. Nejde o důkaz maximální fyzické schopnosti monitoru po změně kabelu či zapojení. API jsou [EnumDisplayDevicesW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaydevicesw) a [EnumDisplaySettingsW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaysettingsw).
- CIM současně uváděl u NVIDIA 2560 × 1440 a 59 Hz. Tento údaj neodpovídal aktivní ploše podle Win32; nelze jej používat jako důkaz druhého aktivního displeje.
- GPU proces vestavěného prohlížeče byl `ChatGPT.exe`, PID 13340, rodič hlavní `ChatGPT.exe`, PID 14732. Oba používaly `C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe`. `codex.exe` je zde podřízený backend, nikoli tento Chromium GPU proces. Cesta i PID se při aktualizaci/spuštění mění.
- U hlavního procesu a GPU procesu nebyl nalezen přepínač `--disable-gpu`, `--force_high_performance_gpu`, `--use-angle` ani `--use-gl`. To nevylučuje další nastavení Chromium nebo ovladače.
- V `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` nebyl profil Codex/ChatGPT ani Edge; pouze nesouvisející profil Fusion. Absence profilu neznamená, že by prohlížeč musel automaticky vybrat NVIDIA.

## Co může nastavit hra

`client/gpu-diagnostics.ts` poskytuje `readGpuDiagnostics(engine)` a konstantu `PREFERRED_GPU_POWER = "high-performance"`. Diagnostika čte aktuální `engine.getGlInfo()` a požadavek z `getCreationOptions()`. Výsledek obsahuje původní renderer/vendor/verzi, odhad typu grafiky a samostatně požadovanou preferenci. Obecný nebo skrytý název zůstává `unknown`; instalovaná NVIDIA se nikdy nevydává za použitou kartu.

V nainstalovaném Babylon.js 9.30.0 již `node_modules/@babylonjs/core/Engines/thinEngine.pure.js:196` doplňuje výchozí `options.powerPreference = options.powerPreference || "high-performance"`. Explicitní nastavení v konstruktoru vyjadřuje záměr, samo neopraví výběr adaptéru. WebGL preference je pouze požadavek prohlížeči a opakované získání kontextu na stejném canvasu nevytvoří jiný kontext. [MDN: getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)

Webová hra nemá API pro přepnutí na konkrétní GTX 1060. Diagnostika adaptér nevybírá, nemění registry a nezapíná experimentální GPU přepínače. Klasifikace typu podle názvu je konzervativní pomůcka, nikoli měření výkonu. O kvalitě rozhodují i skutečné časy snímků.

## Praktický postup pro NVIDIA ve Windows

1. Otevřít **Nastavení → Systém → Obrazovka → Grafika**.
2. Vybrat aplikaci, která hru opravdu vykresluje. Pro vestavěný prohlížeč tohoto počítače jde o aplikaci **Codex** z Microsoft Store, nikoli backend `codex.exe`. Pro samostatný Edge jde o `msedge.exe`.
3. V možnostech aplikace zvolit **Vysoký výkon** a zkontrolovat, že Windows uvádí **NVIDIA GeForce GTX 1060**. Uložit.
4. Po uložení rozpracované práce aplikaci úplně ukončit a znovu spustit. Pouhé obnovení herní stránky nemusí znovu vytvořit již běžící GPU proces.
5. Ve hře zkontrolovat skutečný renderer a zopakovat benchmark. Úspěch znamená renderer NVIDIA a lepší naměřený výsledek; samotná preference není potvrzení.

Postup výběru výkonové preference a restartu vychází z [Microsoft Support](https://support.microsoft.com/en-us/windows/hardware/display-graphics/optimizations-for-windowed-games-in-windows-11). Pokud NVIDIA ani potom není použita, další diagnostika patří hostitelské aplikaci/ovladači. Electron má pro hostitelskou aplikaci `getGPUInfo()` a `getGPUFeatureStatus()`, ale běžná stránka je nemá. [Electron: app](https://www.electronjs.org/docs/latest/api/app)

## 60, 120 a 144 FPS

Hra může mít cíl 60 FPS nebo vyšší cíl a nesmí mít pevný vykreslovací interval 1/60 s. Prohlížeč však obvykle spouští `requestAnimationFrame` podle obnovovací frekvence displeje. 60Hz obrazovka není vhodná k potvrzení 144 zobrazených snímků za sekundu. Animace a pohyb používají uplynulý čas; pevná fyzika 60 Hz může běžet nezávisle na frekvenci vykreslování. [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

Na podporovaném monitoru zkontrolovat **Nastavení → Systém → Obrazovka → Upřesnit zobrazení → Zvolit obnovovací frekvenci**, vybrat správný monitor a dostupných 120/144 Hz. Nabídka závisí na displeji a jeho připojení. Při této kontrole aktivní displej vystavoval pouze 60 Hz; 144 FPS nebylo změřeno. [Microsoft: obnovovací frekvence](https://support.microsoft.com/en-us/windows/hardware/display-graphics/change-the-refresh-rate-on-your-monitor-in-windows)

## Ověření implementace

`pnpm exec tsx --test tests/gpu-diagnostics.test.ts`: **3/3 testů prošlo**. Pokrývají skutečný Intel renderer navzdory požadavku high-performance, rozpoznání GTX 1060, softwarový renderer, nejednoznačné názvy, skrytá data a nedostupný kontext. Tyto testy nejsou GPU benchmark. Ověření integrované hry a nové FPS výsledky musí uvádět aktuální snapshot, rozlišení a skutečný renderer.

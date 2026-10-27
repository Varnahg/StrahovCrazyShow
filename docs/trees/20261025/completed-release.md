# Dokončené části vydání stromů · 27. října2026

Na výslovný požadavek uživatele se do main předává hotový **pasivní katalog110modelů** a samostatná oprava PCF přípravy stínů. Úplný katalog se tím ještě neaktivuje v produkční Game. Herní zapojení110, nový výchozí backend a experimentální NCM zůstávají rozpracované, dokud neprojdou praktickou přejímkou.

## Modely

Přesné přijaté soubory a závislosti jsou v [release seznamu](catalog-release.json). Runtime v4 manifest má215400B a SHA-256 `2d108559f64f6596d995ab5d8796d90aa9e94ed850144abc38e836826bcaeae7`. Všech110 zdrojových identit zachovává polohu, kolizní poloměr a označenou nejistotu společných dat. Zastoupení107listnáčů/2jehličnanů/1holého stromu je rekonstrukce s generickou anatomií, nikoli botanické zaměření.

Všech110 modelů prošlo produkčními dekodéry; native byly znovu otevřené a porovnané s exportem. 108native používá ověřenou relativní knihovnu `//../materials.blend`, B5 a severní jehličnan mají materiály zabalené lokálně. Release obsahuje potřebné fotografie a jejich provenienci. Původní soukromá CAD složka se do tohoto vydání nekopíruje. Úplná regenerace z čistého klonu není přijatá: výrobní pipeline má další připnuté cache receipts.

Skutečný release test ověřuje všech588 unikátních souborů proudovým SHA/bytes, všechny runtime/mapové závislosti,110 různých native modelů a knihovny. V13 měl produkční build a izolovanou integraci PASS; celá sada2345testů dala2337PASS/5FAIL/3SKIP. Pět ENOENT ve snapshot fixture bylo následně opraveno dvěma statickými vstupy a celý dotčený soubor prošel5/5. Tyto výsledky nejsou prohlášené za GPU přijetí celého katalogu.

## PCF

Readiness kontrola používá pro PCF stejný dočasný color-write stav jako skutečný shadow průchod a vždy obnoví stav volajícího. Tím přestává přepínat PBR DEPTHPREPASS a opakovaně vytvářet stejné depth efekty. PCSS, světla, materiálové barvy a časové limity se nemění. Testy používají skutečný PBR/shadow lifecycle; pasivní seasonal plugin dodává stejný materiál jako původní reprodukce, bez zapojení do Game.

Mechanismus má32cílených regresí a skutečné CM WebGPU ověření ve v9–v12: zmizela opakovaná kompilace; v12 měření mělo nulový přírůstek kompilací. Nejde o dokončení NCM ani60FPS přejímku. Přesný oddělený publikační commit dostane vlastní cílené kontroly, build/integraci a povinné CI před sloučením.

## Zachování rozpracované práce

Produkční entrypointy Game/UI/Vegetation a renderer factory nejsou součástí tohoto částečného vydání. Neměnný testovací v13 pro další GPU kontrolu zůstává zachovaný. Starý dirty místní main se zachová pod pojmenovanou WIP větví; sjednocení canonical main nesmí přepsat jeho index ani pracovní soubory.

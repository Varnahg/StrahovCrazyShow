# Přijetí úzké CPU opravy KEY-41

- Root threading-01a15535-validation a threading-01a15535-material-integration, cwd9b78. Převzaté pouze tři explicitní podagentovy cesty; původní široký WIP nedotčený.
- Runtime `client/character-materials.ts` SHA9746cccbc7590abd15735f19a1a441aaa56daaa6bbd35d2078b77e2ea0727fa3; nový test SHA36afc651072b5db61139c6ddfd9868e6c1329a79e80a7d72be4f74f28d6f2230. Veřejný atomic wrapper před cache publish, konstanta cached/new, žádná jiná runtime změna.
- Independent review[]; actual Babylon RED128–352→GREEN32foreignreads/32wrappers,13surfaces,34targetedPASS. Neslibuje FPS.
- Clean ced7586d…97c0: první default1489/1491 (dvě4sWGSLreadinesstimeout), nezměněný focused7/7 a následný bounded full1491/1491PASS; build/TS+isolatedintegrationPASS. Combined1fbc05af…5752:1524/1524,build/TS,integrationPASS. Přesné příkazy a oba failure/successlogy v docs/performance/evidence/client-threading-character-materials-20261019/.
- ActualEdge:6editorpresetů,face/eyes/glasses/beard/hairrecolor,wholeworldMedium/day/chůze,editorrecreation,2ready+2dispose,1333souvislýchrecords,0errorrecords. Benchmarkhealthvalid/error0/pending0. JednaGPUrealMulti; ne3sessions/FPSA/B. Druhýgameimage není důkaz změnyMPpresetu; tento kontrakt nezahrnovat do přijetí.
- Plain vlastní4205/2600 (bezshaderinventory) servíroval17codeSHA a správnýembeddedsource. API9160/start18:17:10.7028035Z a preview14812/start18:17:10.7276549Z byly ověřeně ukončené; karta2070823371/okno2070823372zavřené. Porty4205/2600/2568volné. Původní4203/menu astaršíbezezměny.
- Následuje samostatný commit/runtime integrace main a aktualizaceKEY-41. KEY-40/KEY-5 a širšícíl zůstávají aktivní: nevznikl worker, funkčníatribucezbývajícíchtransit/rendererhitchesneníhotová. Původnímigračnívláknojeaktuálněpozastavené a nesmísezačít automatickyresumovat.
- Tatoevidence nahrazuje přímýzásah do cizího docs/verification.md. Jeho vlastníkintegrátormůže přidatodkazpřipozdějšíkoordinovanéevidenci.

## Dokončená integrace

Runtime, test a evidence: WT `226b2be960d063174267b7d2ebeb0df2e042ad41` → lokální main `cb2bed4209337fdd278951502b605af5be89edfb`. 53 vlastních souborů, žádný cizí staged/dirty obsah. Po cherry-pick ověřeny přesné runtime/test SHA proti testovanému checkpointu; vlastní cesty v main čisté. Nezávislé závěrečné evidence review ověřilo45/45hashů,1333rawrecords,počtytestů/health/lifecycle a limity; nálezy[]. Research dříve WT0a25422b9c28829168723be8bc106aa1a27cf667 → main9f1127f49291aca9784fd19f6f8ef50928653827.

KEY-41 lze uzavřít jen pro tuto CPU opravu. KEY-40/KEY-5 a cíl zůstávají aktivní, bez tvrzení o dokončeném multithreadingu či FPS. Všechny vlastní měřicí procesy už skončily; po metadata publikaci se uvolní admin, runtime a validační rezervace. Žádný push na remote nebyl v tomto kole proveden.

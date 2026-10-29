# První stín po změně avatara při vypnuté baterce

Čtecí výzkum 24. 10. 2026, root + nezávislý `webgpu_editor_audit`; žádná produktová změna ani nové GPU měření. [Přímé srovnání původních záznamů](robin-shadow-recipe-comparison.json) dokládá přesnou shodu všech čtyř primitive input SHA mezi Robin source13 a source12/V16. V16 bylo fixed Medium/pass15, source13 Auto/Low/pass21; jiné číslo passu samo není jiná shaderová receptura. Source13 nepřiřazený Mia record4 se od Robin liší ve všech čtyřech SHA.

Zdrojový řetězec UI profile → Game.setProfile → updatePlayers zruší starý rig a vytvoří nový. Nevolá celou přípravu světel. Při F off PlayerFlashlight předá neaktivní světlo do VehicleLighting; updateBeam skončí před aktualizací caster listu a shadow readiness. Nový avatar proto nemá výslovně zajištěnou přípravu pro budoucí torch shadow pass. Skin/cloth/denim používají PBR bez ShadowDepthWrapper, takže jdou native ShadowGenerator `shadowMap` větví; Fresh/canonical wrapper oprava vegetace se na tento případ automaticky nevztahuje.

Ve source13 už před editací proběhlo Mia F → off při Low. Pouhá nová velikost mapy tedy nemusí vysvětlovat následný Robin požadavek. Zrušení starého rigu může legitimně uvolnit Effect přes SubMesh draw cache/DrawWrapper/reference count; bez konkrétní startup→edit→F historie nelze eviction potvrdit ani vyloučit. Stejně tak nelze jeden preparation call přejmenovat na jeden nově vytvořený Effect.

| Varianta | Náklady a meze | Závěr před implementací |
| --- | --- | --- |
| Zachovat současnou lazy cestu | Bez práce při editaci; první F požadavek zůstává | Referenční chování |
| Cíleně volat původní ShadowGenerator.isReady pro skutečný nový vlastní avatar | Po base readiness, pod přesným existujícím torch pass; vyžaduje latest-rig/generation/map-pass guard, abort a finally restore. Nevyžaduje rozsvítit baterku ani měnit world shading. Readiness však není úplný draw/pipeline důkaz. | Nejmenší kandidát pro navazující oddělený kontrakt/test |
| Native forceCompilationAsync | Bere celý současný renderList, bez per-avatar filtru, abort/error/timeout. Vlastní 16ms polling, nepřepíná currentRenderPassId. Při F off může být renderList po zrušeném rigu zastaralý. | Není bezpečné slepé řešení |
| Držet cache reference či opakovat 76 etap | Paměť/vlastnictví nebo rozsáhlá práce bez doložené příčiny | Nezvoleno |

Podklad: současný Game/flashlight/vehicle-lighting a pinovaný Babylon9.30 `shadowGenerator.js:1049–1107,1133`, PBR a DrawWrapper/Effect disposal. Neprovádí se nový shadow API zásah současně s opravou receiver reselection. Nejdřív samostatný ověřený celek receiverů, potom skutečný reprodukční kontrakt nového rigu. Převzatý čtecí výzkum nezavírá KEY22, obraz ani výkon.

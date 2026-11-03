# Aktuální práce: plynulost hry

- Research je commitnutý na maincdb3b8f7. Uživatel výslovně zadal pokračovat implementací nejlepšího zásahu; samotný research ani diagnostika neuzavírá výkonový cíl.
- První úzký celek je ověřený: export21/21, callback50/50, společně s nezávislým lifecycle QA73/73 a celýTypeScript PASS. [Specifikace](../../../_bmad-output/implementation-artifacts/gameplay-frame-cost-20261103/DIAGNOSTICS.md). Root převzal oběfrozen delegace podlehandoff a drží jejichclaims; nezávisléreview [] bezminima. Původnípříjemci užnepíší. DiagnostikaneníFPSzisk.
- Root drží render-next-validation-20261103 (heavy/GPU/workspacebuild/2568/4179). Žádný vlastní server/GPU/build nyní neběží; následuje nový immutableC10 a [kontrolní plán](../../performance/evidence/gameplay-frame-cost-20261103/plan.md). C10/C11/C12 jsou rezervované výstupy, nikoli kopieprojektu. Během jeho runtimefreeze neměnit zdroje/testy/assets/deps ani harness.
- Další rozhodnutí: podle doplněného původního měření a krátkého cíleného profilu zvolit jedinou příčinnou renderovací opravu. Neopakovat další ASTcache, plošnýworkerrefaktor nebo již přítomnéLOD/EnabledMeshCandidates. C9shadercachezůstávádefaultOFF.
- Cizí tři konsolidační soubory stále nedotčené. Jenmain, přesnýstaging, průběžnéověřenécommity aLinear. OtevřenéPDFtestovéomezení nezakrývat.

Aktualizace poC10: diagnostickýcheckpointcommit1a69df41; C10source053ff289e1f5e029785b9672b980d2f33b368f6efefd7011dfe1776e9bca2dec. CMrun1timeoutLowrestore30028,7ms; NCMrun2ready a3benchmarky, jejich frameIntervals mají přesně208/257/313prvků podleframes a GPUmainpassscope je zachovaný (hodnotanull). Oba experimenty i NCMpeers skončily, cleanup/inputrevalidationPASS; vlastní karta jeabout:blank.

Uživatel výslovně změnil původnítimeoutovýpožadavek: zvýšitlimit a zprovoznitWebGPU. Rozpočet60/180implementován v samostatnérezervaci,78/78+scopedTS+review[]; nyní novýC11build a skutečnýCMstart. Širšívýkonovýcíl je stáleotevřený, NCMbezpárovéhotestu se neprohlašuje zaoptimum.

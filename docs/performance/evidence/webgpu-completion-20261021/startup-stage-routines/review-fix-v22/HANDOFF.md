# V22 foreign-scene regression — úzké předání

Task webgpu-completion-startup-stage-routines-20261024, owner webgpu-completion-01a15a3e-startup-effect-v22-fix; příjemce root. Cwd C:\Users\rezac\Documents\GitHub\StrahovCrazyShow\.cache\player-feedback-20261020. Adopt-dirty dle coordinator HDF24Oct10:05.

Změněn jen startup-stage-effects.test.mjs v nové kopii helper/v22. Native test provádí stejné warmup kroky, porovnává exported own routine rows/calls/return counters a syntetická profileNow čtení s/bez vloženého foreign Scene.render. Samostatně dokládá own/foreign native frame progress a foreign material bind; původní abort/rejoin cleanup assertions zůstaly. Neodečítá skutečný nested wall time a netvrdí jeho absenci v outer own span.

Runtime/API i dalších40helperinputs včetně README jsou byteexact V21; původnív21/41inputs/82c0be75 a oběpublicseals, starý author HDF a V18–V20 se nemění. Ověřeno 274 chráněných souborů,0změn. Nový helper SHA256 a6294c4b303b7c63f7d8a3f0d261184a7447873522a276624332541056c5590a. Přesný diff test.patch a úplný helper map verification.json; sources gzip zachovává41vstupů/testy, obnovovat na původní depth5 .cache/webgpu-completion-20261021/startup-stage-routines/helper/v22.

Testy pouze tohoto upraveného native případu: normal PASS1/FAIL0/total1 exit0. Mutation loader bez změn diskových runtime files odstraní prototype receiver predicate: starýV21 test PASS1/FAIL0/total1 exit0 (mezera), novýV22 PASS0/FAIL1/total1 exit1 (správná detekce22vs12clockreads). Exact příkazy/TAP/SHA v verification.json. Syntax upraveného testu exit0. Jiné testy neproběhly; full přejímku provádí root.

Žádný whole/build/GPU/server/renderer/subagent/staging/commit ani převzetí resources. Všechny krátkéCPUprocesy skončily. Při sealu držen claim; skutečný release následuje bez dalšího zápisu a jeho výsledek vracím rootovi. Release není Done.

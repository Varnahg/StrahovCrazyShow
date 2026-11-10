# Předání D měřicího vstupu

- Problém: původní CLI povoluje pouze branchmain, nové výslovné zadání vyžaduje přesný D checkout a grafickou větev.
- Mechanismus: guard assertCanonicalMain kontroluje cwd proti modulu a skutečnou Git branch. Buildmetadata dříve nazývala každýcheckpointcanonicalmain.
- Jediná změna: přidat přesnou dvojici D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104 + codex/graphics-smoothness-20261104. Původnímain pravidlo a cwdguard zachované. Metadata inputs.checkout nyní uvádějí skutečnýroot/branch a builddescription používá authorizedcheckout.
- Metrika/správnost: acceptance/rejection checkoutpolicy, původní identity/STOP/lifetime/hash testy a skutečnýDguard. Žádná změna readiness, přípravnýchlimitů, server/portů, GPUtestů ani zachovanýchassetů.
- Výsledek:11/11 existujících+novépolicy regrese PASS, přímýguard vD PASS. Testuje také podobnouvětev, jinýdisk a jinéjménosložky. Log.cache/graphics-smoothness-20261104/harness-tests.log.
- Praktickýbuild/serve/peers používá stávající render-next harness a rootvalidationclaim; výstupy pouze nováDcache. Ckopie a jejístaréimmutablebuildy zůstávají beze změny.

Nezávislé review nalezlo nepřesný canonical-main popis také v parent render-profile build entry. Po rozšíření a obnovení vlastního claimu opraven pouze jeho method text; běhové ochrany beze změny. Ostatní scope bez nálezů.

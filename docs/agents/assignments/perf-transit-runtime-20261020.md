# KEY-53 — úklid poolu NPC pouze po změně vlastněných rigů

Uživatel výslovně požaduje malý performance úkol s přímým dopadem na hru, skutečný průchod řadičem do PR/merge/zelené main CI a srovnatelné před/po měření. Tento úkol je úzký follow-up KEY-5, doložený v docs/agents/handoffs/fps-transit-cost.md:7. Přijetí nadřazeného KEY-5 se tím netvrdí.

## Mechanismus a volba

client/transit-renderer.ts vlastní samostatný AvatarPrimitivePool. Jeho update po každém snímku volá pruneUnused, i když všechny passenger rigy zůstaly stejné. Pool přitom iteruje zdroje a materiály a alokuje pomocná pole/Sets. Původní audit tento follow-up neimplementoval. Čtecí oponentura prověřila creation/disposal, AvatarLodController, synchronní retain/release v avatar-skinned, CharacterMaterials a Babylon9.30InstancedMesh.dispose. LOD/hidden instance pouze deaktivují/odregistrují, neodstraňují vlastní source/material reference; far proxy a garment mají samostatné vlastnictví. Async texture completion nemění členství tohoto poolu.

Porovnáno: single-entry kalendářní cache je širší (DST a navigační provenience); throttle drží nepotřebné zdroje déle; změna globálního AvatarPrimitivePool API zasahuje cizí WIP a ostatní uživatele; zrušení úklidu by způsobilo retenci. Zvolena nejmenší informace o změně ve skutečném vlastníkovi, beze změny pool API.

## Přesný worker rozsah

Pouze client/transit-renderer.ts a tests/transit-pool-pruning.test.ts. Žádné změny avatar-renderer.ts, shared/transit.ts, navigačních katalogů, Game/UI/serveru, kvality, hustoty, materiálových parametrů, tras nebo světel. Žádné nové dependencies. Vlastní controller task vlastní renderer/spec/review/handoff; externí koordinátor vlastní měření/receipt. Před zápisem claim a aktuální AGENTS/policy; původní WIP jiných relací zůstává zachovaný.

## Požadované chování a refaktoring

Udržuj pouze lokální informaci, že pool vyžaduje úklid. Nastav ji před skutečným vytvořením či odebráním passenger rigu; při více změnách proveď jeden sweep na nynějším konci update. Zachovej sweep po první konstrukci a při výměně ID se stejným počtem NPC. Vymaž pending stav teprve po úspěšném sweepu, aby výjimka během dalšího update neztratila požadavek. Stabilní kohorta, pouze posun, animace, LOD či opacity nemají vytvářet další sweep. Plný dispose rendereru nadále uvolní všechny rigy/pool a funguje při opožděném dokončení loaderů. Nezaváděj timer, dlouhodobou cache dalšího obsahu, nový observer nebo druhý mechanismus vlastnictví.

## Regrese

Použij skutečný TransitRenderer update a skutečný Babylon pool/rigy tam, kde se ověřuje lifecycle; test-only fixture smí izolovat feed/loadery a scénář, nikoli nahradit vlastní úklid fake funkcí. Ověř:
- první konstrukci a stabilní snímky;
- near/medium/far/hidden a zachování živých meshů/materiálů;
- odstranění jednoho sdílejícího NPC, posledního, opětovné vytvoření;
- výměnu identity při stejném počtu a více mutací v jednom update;
- přerušený update/prune výjimku a pozdější dokončení pending úklidu;
- dispose a opožděné loadery beze změny záruk.
Cílený refaktoring je součástí tohoto jediného mechanismu; žádné plošné formátování.

## Ověření a externí přijetí

Controller provede cílené testy a nezávislé blind/edge/verification review. Koordinátor před runtime runem zmrazí srovnatelnou baseline a po výsledném commitu provede produkční A/B. Čisté testy nebo snížený počet sweepů nejsou GPU/FPS důkaz.

Externí evidence musí uvádět přesný baseline/candidate source/test/assets/build/overlay hash, identický scénář s plnou hrou/HUD, alespoň3skutečné relace s různými avatary, viditelnou NPC kohortu, GPU/driver, CSS/DPR/interní rozlišení, kvalitu/kameru/čas/počasí, warmup/délku/opakování a původní raw intervaly. CPU profile actual update/prune se měří odděleně od plain FPS/p95/p99. Nepřidávej umělou zátěž pouze do baseline a neodstraňuj obsah z kandidáta. Měřitelný CPU přínos musí překonat běžnou variabilitu srovnatelných sérií; pouze counter nebo negativní/nejasný výsledek nesmí projít jako výkonové přijetí. Rozsah případného FPS tvrzení musí odpovídat naměřeným datům.

External acceptance řadiče zůstane před přijetím/merge zastavená, dokud koordinátor po posouzení měření a parity nevydá validní receipt pro přesný run/base/commit/source a hashované důkazy. Koordinátor to provede autonomně podle již uděleného zadání; nejde o chybějící otázku na uživatele. Po předložení důkazu resume nesmí opakovat implementaci nebo vytvořit další PR. Done až po merge a skutečné zelené main CI.

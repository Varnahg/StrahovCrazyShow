# Koordinace CAD budov — KEY-59

Uživatelské zadání: samostatně dokončit všech 16 budov z lokální složky, včetně exteriérů a interiérů, a potom je implementovat do hry. Budovy postupně, nejprve dokončený Blender model, potom další. Originální CAD/TXT/LOG ani jejich textové či obrazové kopie nepatří do Gitu. Výšky bez řezů musí zůstat označenou interpretací. Uživatel výslovně povolil koordinaci zprávami s chatem „Navrhni hlášení chyb a feedbacku“.

Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/cad-building-models`, baseline `c713c2aedcafdb02358f05e4c9c51b607edeebc4`. Původní main obsahuje cizí WIP a není upravován. Dosavadní vlastní práce ještě není commitnutá ani integrovaná. Linear [KEY-59](https://linear.app/gigeconomy/issue/KEY-59) zůstává rozpracovaný.

## Aktuální stav 24. 10. 2026, 09:00 UTC

B1 R10 je uložený v asset cestách, s interiéry, střechami, 29 rameny a 33 podestami. Native reopen/export, 44/44 schodišťových směrů, 552 lokálních dveřních průchodů, 15 pevných prosklení a 561/563 souvisle dosažených bodů jsou doložené v aktuálním B1 README/auditu. Dva zbývající body jsou zdrojově potvrzený prostor s výhradně vnějším přístupem, čekající na terén. 11 vnějších dveří také čeká na napojení terénu. Žádná z těchto mezí není vydávána za PASS ve hře.

Tři nezávislé review skončily: blind bez nálezů; opraveno načtení neplatných route overrides před alokací světa a doplněna negativní přejímka prosklení přes celý report. 13/13 malých Rapier fixture prošlo. Přípravný agent předal SHA generátoru v receptuře/auditu, strict režim `B01_RECIPE_ACCEPTANCE=1` a 15/15 malých syntetických kontrol. Root převzal jeho uvolněný scope. Nový úplný převod a strict přejímka čekají na skutečné vrácení heavy; stará R10 receptura nebyla dodatečně opatřena novým hashem.

Heavy je od 08:15 UTC předané druhému chatu nejpozději do 09:15 UTC, s nutným skutečným STOP/release. CAD nyní nemá běžící Blender, GPU nebo server; do 09:00 na dodatečnou žádost nepouští ani malé CPU fixture. Vlastnictví souborů určuje živý registr. Úzký publikační task přebírá vrchní výzkumné README/handoff; původní široký výzkumný scope se znovu nerezervuje.

09:10 UTC: na konkrétní žádost druhého chatu potvrzeno poslední prodloužení hard end do09:25UTC pro čerstvý car capture. Následuje skutečný STOP/release; další okno až po konkrétním CAD checkpointu. CAD mezitím pouze čte/dokumentuje podklady, žádný Blender/fullprep/build/GPU. B2 čtecí poznámky jsou ve vlastním BMAD prefixu; výroba B2 nezačala.

Další krok: čerstvá příprava, strict testy, důkaz shodné geometrie s R10, závěrečný modelový handoff a samostatný commit. Druhý chat potvrdil, že nové neimportované CAD cesty nekolidují s jeho zdroji; před main integrací dostane přesný commit. Společný `docs/verification.md` nadále vlastní on. Hra, původní main WIP a immutable source15 se nemění. Ostatních 15 modelů a celá runtime integrace stále zbývají.

## Historický stav 24. 10. 2026, kolem 02:50 UTC

- Inventář: 100 DXF, 16 budov. Prozkoumáno měřítko, vrstvy a stávající runtime. Modeluje se pouze B1; ostatních patnáct ještě nezačalo.
- Poslední uložený kandidát R5: Blender SHA `9196d79b2f24c505c9747a28be87fd1755505bb8d03741aab9b3400aaa29ca46`, GLB `53ec628a3993c366f724eaa8098c7b2f4f5bed694d086cbb52d8927f7d05ac82`. Reopen/export shoda a 58 cílených testů prošly; model není finálně přijat. Podrobnosti jsou v B1 handoffu a README.
- R5 opravil dno dvou vnějších šachet; oba směry obou schodů 4/4 v samostatném Rapieru s navrženou menší kapslí. Hra nebyla změněna. Předchozí vnitřní zkoušky odhalily skutečné nesprávné rameno/podestu i neplatné začátky testu.
- Ručně upravená zkušební kopie masteru prošla `--from-blend` exportem bez CAD a zachovala přesné uložené bajty i upravené vrcholy. Původní model zůstal beze změny.
- Probíhá R6: samostatné půdorysné trasy, skutečné L rameno N02, zkrácené široké příchozí středy, úzké U N03, podesty, místnosti pod schody a jejich dveřní prahy. Měřené hrany a konvence posledního stoupání nahradí obecné kopírování schodišť po patrech.
- Rozhodnutá nová výšková hypotéza: hlavní rozteč 3,2 m, křídla o 1,8 m níže. Všechny Z výšky jsou odhady. R5 uložený model obsahuje předchozí variantu −1,6 m; nový kód a metadata zatím nebyly nativně sestavené.
- Nový čistý `model_geometry.py` má 18 malých analytických testů. U schodů rozlišuje počet hran/stoupání a vodorovných intervalů, u L rozděluje výšku podle počtů stoupání. Ořez podhledem zachovává spodní stěnu. Review odhalilo float32 degeneraci, opraveno před vytvořením face indexů; nativní fixture čeká.

## Vlastnictví a zdroje

Koordinaci drží `cad-buildings-01a16b37-root`, modelové skripty/assety `cad-buildings-01a16b37-model`. Příprava byla po doloženém root R5 předání vrácena podagentovi `cad_b1_geometry_research`, owner `cad-buildings-01a16b37-stair-extraction`; přesné writePaths určuje task JSON a skutečný registr. Root do přípravných souborů nyní nezapisuje. Agent `cad_runtime_research` provedl čistě čtecí geometrický/physics průzkum a je dokončený.

`heavy-validation` byl po ukončení všech Blender procesů úspěšně uvolněn 02:30 UTC a předán WebGPU chatu do přibližně 03:10 UTC. CAD během tohoto okna nesmí spouštět Blender, hromadnou přípravu, build nebo GPU. Povolena je lehká práce s kódem, jednotlivé čtecí dotazy a malé syntetické testy. Před dalším těžkým během je nutné skutečné vrácení a nový claim; časový odhad není sám o sobě uvolnění rezervace.

## Navazující přejímka

Po dokončení půdorysného handoffu a vrácení heavy přepočítat pouze B1, nativní fixture a staged model. Prověřit nové podesty, podpěrné stěny, dveřní prahy, nejnižší místnosti a oba směry celých L/U tras. Zdokumentovat další vnější schody západního křídla, které R5 dosud nemá. Vytvořit nové řezy a obrazovou kontrolu proti jednotlivým plánům. Potom BMAD review, samostatný modelový commit a koordinovaná integrace; teprve po přijetí pokračovat B2.

BMAD běží z vlastního renderu `681c833a8995ff1883f6`; specifikace je `_bmad-output/implementation-artifacts/cad-buildings-20261024/spec-key-59-b01.md`, stále implementace. Step04 byl předběžně přečten, ale finální review se zatím nespustilo. Veškeré review/staging jen přes doložené vlastní soubory, žádný hromadný dirty-tree commit. Herní runtime integrace a produkční GPU měření zůstávají samostatnou následnou etapou.

## Aktuální pokyn uživatele po přijetí B1

Uživatel nyní výslovně požaduje po dokončení commitu B1 na chvíli zastavit další práci na modelech a připravit hru k vyzkoušení. B2 výroba se tedy nespouští. Následuje oddělená testovací verze s novým B1, jeho renderingem, kolizemi a terénem; jde o dříve autorizovanou herní integraci přesunutou před další budovy. Koordinátor oznámil, že B1 ještě nebyl v runtime. Před přípravou snapshotu je nutná koordinace game.ts/landmark-reality.ts rezervací a stabilních vstupů s druhým chatem. Původní požadavek na všech16 budov zůstává evidovaný, pokračování modelů až po uživatelském testu.

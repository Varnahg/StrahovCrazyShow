# Runtime import SH a SÚZ

Implementace tasku `rag-sources-20261028-runtime`, 28. 10. 2026. Kontrakt a podklady určuje [source-contract.json](../source-contract.json), [SH evidence](../sh/source-matrix.md) a [SÚZ evidence](../suz/source-matrix.md). Toto není živé hodnocení modelu.

## Načtení a platnost

Registry se validuje a sestaví až při zapnutí AI uvnitř volitelné serverové služby. Načítá přesně původní `server/data/silicon-hill-knowledge.json` a nové `server/data/rag/silicon-hill.json` a `suz.json`. Archiv se nečte ani neindexuje. JSON, schéma, duplicity, vazby, hash nebo nedovolený host mohou vypnout AI; nevyhodí neodchycenou chybu už při importu herního serveru. Vypnutá funkce podklady vůbec nenačítá.

Původních šest source IDs a jedenáct chunk IDs zůstalo. Členství/kancelář má kontrolu stále z 27. 10. a kratší review do 3. 11.; dnešní doložená kontrola projektového přehledu posunula pouze jeho checkedAt na 28. 10. a reviewAfter na 28. 11. Podle předání koordinátora přibyl aktuální status Fotoateliéru/Modellandu a původní obecné „fotografie“ je zpřesněno na Fotokomoru. Archivní návody ani historické ceny se nepřebírají.

Celkem jsou ve třech current vstupech **45 chunků z 28 zdrojů**. Každý zdroj má interní autoritu, locator/verzi a vlastní review a účinnost. Kontrolní dny jsou UTC; právní datum se přijímá pouze jako doložená česká půlnoc s odpovídajícím ISO offsetem. Validace odmítá rollover neplatného kalendářního dne i nesprávný letní/zimní offset. Začátek je inclusive, konec exclusive. Vypršení jednoho zdroje nevypíná zbývající.

Interní `isSourceUsable` se používá pro retrieval, publikaci po provideru i terminální replay. Operace drží IDs všech skutečně předaných evidence, nikoli jen veřejné citace modelu. Odpověď s prázdnými citacemi proto také nelze replayovat po expiraci její evidence. Lokální pozdrav nemá závislosti; uložená terminální chyba nespouští nový provider.

## Dohledávání a konverzace

Lexikální index se sestaví jednou. Normalizace češtiny a angličtiny, instituce a konkrétní projekt jsou oddělené kroky. Kolejné/ubytování patří k SÚZ, členské příspěvky k SH; neurčitou platbu, registraci či kancelář kód nepřiřadí automaticky klubu. Prompt žádá upřesnění. 3D tisk, Fotokomora a SHerna mají vlastní témata i při krátkém navazujícím dotazu na cenu. Výslovné srovnání členství s kolejným zachová podklady obou institucí. Aktuální záznam o zaniklém projektu může říct, že je uzavřený, ale nevydává archivní návod za platný.

Kotvu nadále tvoří omezené USER pokusy, nikdy fakta z odpovědi bota. Novější nesouvisející či neúspěšné téma nepřeskočí zpět ke starému dialogu. Model dostane také instituci a efektivní interval dokumentu. Veřejný citation tvar zůstává stejný; společný přesný host allowlist nově zahrnuje jen doložené `www.suz.cvut.cz` a `sherna.siliconhill.cz`.

## Cache, lifecycle a ověření

Žádné síťové čtení zdrojů, scheduler, embedding služba nebo odpovědní cache napříč relacemi. Registry i jeho textový index jsou neměnné; zdrojové hranice se předpočítají jednou, každý dotaz pouze filtruje platné položky. **Po změně JSON je potřeba restart serveru.** Automatická invalidace přes filesystem watcher není implementovaná; restart zároveň ruší původní dočasné relace. Nic se nepřegeneruje při replay.

Finální cílená sada čtyř AI testů: **84/84 PASS**, exit 0; scoped strict TypeScript a `git diff --check` PASS. Zahrnuje všech 33 nezávislých SH/SÚZ eval dotazů, nový holdout „Potřebuji při převzetí pokoje občanku?“, source schemas/IDs/URL/hash/archiv, efektivní/review hranice, skutečný fake-provider payload, kompatibilní klientské citace a necitované závislosti replay.

Logy a manifest jsou v `.cache/rag-sources-20261028-runtime/`; přesné výsledky a původní neúspěšné běhy uvádí [handoff](../../../agents/handoffs/rag-sources-20261028-runtime.md). Testové fixtures v `sh/retrieval-cases.json` a `suz/retrieval-cases.json` jsou čtenými vstupy testů a musí být součástí případného ověřovacího snapshotu.

Lehký lexikální index nepředstavuje obecné porozumění češtině. Mimo ověřenou sadu může recall selhat; není tvrzena úplnost 114URL katalogu, živá správnost odpovědí modelu ani měřený výkon. Žádný klíč, placené API, serverový port, hra, GPU, full suite či build nebyly touto dílčí implementací použity. Společnou přejímku a integraci provádí root.

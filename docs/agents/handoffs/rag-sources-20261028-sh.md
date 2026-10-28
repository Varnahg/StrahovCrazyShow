# Předání: rag-sources-20261028-sh

- Vlastník: `rag-sh-01a17e9d` (`/root/audit_rag`); příjemce: `/root` a runtime integrátor `/root/audit_security`.
- Cwd: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`; větev `codex/rag-sources-sh-suz`; baseline `de6f87a2efbf8596bb03efae863e8d6763e22774`.
- Výsledek: připravený a datově ověřený SH import pro v2 source-contract; **8 aktuálních zdrojových URL, 13 nových chunků, 2 archivní metadata záznamy bez archivních chunků**. Runtime propojení a skutečné vyhodnocení retrieval dotazů přebírá integrátor.

## Přesné soubory

1. `server/data/rag/silicon-hill.json`
2. `server/data/rag/silicon-hill-archive.json`
3. `docs/home-ai/20261028/sh/source-matrix.md`
4. `docs/home-ai/20261028/sh/retrieval-cases.json`
5. `docs/home-ai/20261028/sh/validate-data.mjs`
6. Toto předání.

Ignorované pomocné výstupy: `.cache/rag-sources-20261028-sh/create-data.mjs`, `data-validation.log`, `data-validation-final.log`, `manifest.json`. Žádný zápis do původního datasetu, runtime/provider/shared/test souborů, task katalogu, specifikace ani cizích docs. Rootovy počáteční necommitnuté specifikace, katalog a dokumentace nebyly převzaty. Původních šest source IDs a jedenáct chunků se neduplikuje.

## Podklady a zvolený rozsah

Po přečtení AGENTS, BMAD policy, KEY-65 specifikace, společného výzkumu a finálního `source-contract.json` byl získán vlastní claim před zápisem. Primární průzkum předcházel implementaci. Přesné URL, revize, locatory, licence, způsob kontroly a výluky jsou v `source-matrix.md` a datových metadatech; katalog sám nebyl důkazem obsahu.

Přijato: veřejné SH FAQ (jen příprava registrace/stěhování), WiFi (registrace/stabilní MAC), rozlišení síťových MAC, 3D tisk (domluva/dílna), Fotokomora (umístění/první návštěva), SHerna (potvrzení rezervace, školení VR, základní chování). Týmové kontakty zůstaly, osobní kontakty se nekopírují. Wiki obsah má doložené CC BY-SA 4.0 a atribuci; u SHerny zůstává licence null a jen stručná vlastní faktická parafráze.

Sporné údaje byly výslovně vynechány: stará definice členství/částky ve FAQ, rozdílné CA návody WiFi, jméno správce 3D tisku proti novějšímu registru, klíčový versus kartový přístup SHerny a banner versus footer o B6. Rezervační předstih 48 hodin je přímo uvedený ve veřejném postupu, není domyšlená otevírací doba. Každý nový provozní zdroj má kontrolu 2026-10-28 a výlučnou administrativní hranici 2026-11-04 UTC. Právní účinnost se z revize ani kontroly nevymýšlí.

Fotoateliér a Modelland mají pouze archivní metadata s konkrétním důvodem. U Fotoateliéru je konec aktivního projektu doložen od 1. 7. 2026, tedy `effectiveUntil=2026-07-01T00:00:00+02:00`; u Modellandu přesný den neověřen, proto null. Novější předpis o členství neposkytl čitelný obsah (timeout / anti-bot výzva), nebyl importován ani nahrazen starým předpisem 2022. Žádná výzva nebyla obcházena.

## Refaktoring dat a lifecycle

Metadata patří zdroji a nejsou opakována v každém chunku. Každý krátký text má jeden přesný locator, tematickou kategorii, relevantní keywords a vlastní SHA-256. Nové topics photography/printing/game-room zabraňují smíchání jednotlivých služeb pod obecné projects. Archiv je samostatný soubor; nemá výchozí modelový kontext ani kopie historických cen. Registraci SH nelze interpretovat jako žádost o ubytování SÚZ.

Byl porovnán širší import celých stránek s omezenými parafrázemi: zvolen omezený obsah, protože plné stránky nesou rozporuplné footery, staré postupy, osobní údaje a nejednotné licence. Index nadále nemusí provádět runtime síťové požadavky ani sledovat crawler lifecycle. Tento task nepřidává žádný timer, server, cache uživatelských odpovědí nebo modelovou operaci.

## Skutečné ověření

Dne **28. 10. 2026**, finální manifest v **00:28:17 UTC**:

- Scope-only Prettier nad pěti vlastními datovými/docs soubory: exit 0.
- `node docs/home-ai/20261028/sh/validate-data.mjs`: exit 0, PASS. Kontroluje přesná pole v2 contractu, globální IDs proti původnímu základu, skutečné kalendářní dny/pořadí/intervaly, HTTPS URL bez credentials/portu/query, licence/atribuci, výslovné offsety účinnosti, topic enum, 800znakový limit, stručnost parafrází, unikátní keywords, všechny content SHA-256, absenci cen, existenci očekávaných chunků a archivních zakázaných source IDs.
- Výsledek: 8 aktuálních zdrojů / 13 chunků, 2 archivní zdroje / 0 chunků, 13 připravených retrieval případů. Logy `.cache/rag-sources-20261028-sh/data-validation.log` a `data-validation-final.log`.
- **Retrieval dotazy zatím tímto agentem neběžely.** Koordinátor výslovně převzal jejich spuštění s runtime agentem po dokončení společného registru, takže se datový pracovník nemusí blokovat čekáním. Nepovažovat strukturální validaci za důkaz recall, provider citací nebo plného importu do hry.

Případy v `retrieval-cases.json` jsou samostatné reálné české otázky, každá s očekávaným novým chunk ID a zákazem obou archivních source IDs. Doplňkové návaznosti a hranice jsou popsané v source-matrix: Fotokomora→návštěva, 3D tisk→cena bez členského/kolejného substitutu, SHerna→pravidla. Runtime integrátor byl informován až po dokončeném zápisu celých JSON souborů.

## Snapshot, procesy, omezení a převzetí

Manifest pěti datových/docs souborů (včetně validačního skriptu a retrieval fixtures): `.cache/rag-sources-20261028-sh/manifest.json`. Souhrnný SHA-256 nad JSON polem `{path,sha256}`:

`2aa67faf2e110694465c031b410141bcce6d0746db6e97abf81fbefd365c170a`

Žádný vlastní dlouhožijící proces, port, GPU hra/editor, build, full suite ani placený endpoint nebyl spuštěn. Klíč a soukromá konfigurace se nečetly. Webové čtení mohlo vracet indexované veřejné verze, což evidence výslovně rozlišuje od live změny origin serveru. Import je malá ověřená vlna, ne kompletní pokrytí katalogu 114 URL ani živá garance dostupnosti služeb.

Po tomto předání vlastník uvolní task `rag-sources-20261028-sh`. Root přijímá doložený dirty scope, drží integrační odpovědnost a provede vlastní claim/převzetí, review, retrieval/service testy a commit. Release není Done. Tento podagent necommitoval ani neměnil stav katalogu nebo Linear.

## Převzetí integrátorem

Root ověřil původní manifest, získal claim `rag-sh-integrator-01a17e9d` a zopakoval datový validátor PASS. Následné nezávislé obsahové review nenašlo chybu parafrází, ale novější revizi FAQ. Skutečný veřejný origin GET 28. 10. 00:33:18 UTC potvrdil revizi 17. 10. 2026 / lastope2 a shodu použitých sekcí. Opraven author/sourceUpdatedAt a source-matrix; obsahové SHA úryvků se nezměnily. Původní child manifest dokládá předané soubory před tímto doloženým doplňkem, konečnou identitu poskytne integrační commit.

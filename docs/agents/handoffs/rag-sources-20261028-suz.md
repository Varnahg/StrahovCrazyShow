# Předání: rag-sources-20261028-suz

- Vlastník: `rag-suz-01a17e9d`, podagent `/root/final_edges`; příjemci: koordinátor `/root` a runtime integrátor `/root/audit_security`.
- Cwd: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`; větev `codex/rag-sources-sh-suz`; výchozí commit `de6f87a2efbf8596bb03efae863e8d6763e22774`.
- Výsledek: připravený a samostatně validovaný datový import SÚZ podle `source-contract.json`. **14 aktuálních sources, 20 chunků, 5 archivních metadat bez chunků a 20 českých eval dotazů.** Není tím doložena integrace ani úspěch skutečného retrievalu/modelu.
- Před zápisem načteny AGENTS, BMAD policy, architektura, koordinace, current-work, task, specifikace KEY-65 a kontext. Ověřeny Git status/worktrees a registr; následně úspěšný vlastní claim. Administrativní tasky a research/specifikace rootu byly cizí WIP, nepřevzaty ani změněny.

## Předávané soubory

- `server/data/rag/suz.json`
- `server/data/rag/suz-archive.json`
- `docs/home-ai/20261028/suz/retrieval-cases.json`
- `docs/home-ai/20261028/suz/source-matrix.md`
- `docs/home-ai/20261028/suz/validate-data.mjs`
- `docs/agents/handoffs/rag-sources-20261028-suz.md`

Ignorovaná vlastní evidence: `.cache/rag-sources-20261028-suz/prepare-data.mjs`, `data-validation.log` a `manifest.json`. Autorovací helper není runtime ingest a neprovádí síťové požadavky. Čte a zapisuje jen přidělené vlastní výstupy. Žádné změny runtime, shared, SH dat, task katalogu, závislostí ani `docs/verification.md`.

## Podklady a rozhodnutí

Přímé čtení veřejných primárních HTML/PDF SÚZ dne 28. 10. 2026; přesné URL, rodiče, locatory, licence a výluky obsahuje `source-matrix.md`. Nativní PDF text, bez OCR a bez soukromého ISKAM. Web uvádí všechna práva vyhrazena a PDF nedokládají otevřenou licenci: použity krátké vlastní faktické parafráze, nikoli celé texty. Hash označuje uloženou parafrázi, ne nedoložený hash upstream souboru.

Scénář má explicitní účinnost `2026-05-04T00:00:00+02:00`, kolejné `2026-09-01T00:00:00+02:00`. VUP a Postupy nemají vlastní explicitní datum, proto null; akademický rok v názvu není datum právní účinnosti. Kontakty/provoz mají reviewAfter 4. 11., dokumentová PDF 28. 11. 2026, vždy výlučná administrativní hranice UTC.

FAQ není použito pro sankce či vracení jistoty, protože se liší od aktuálních VUP. Ceník poskytuje jednotku Kč/lůžko/den včetně DPH bez neověřených číselných sazeb. Starý balík 2022/2023 a metodika skončené rezervační etapy jsou mimo aktuální index. Archivace metodiky znamená výluku z aktuálního RAG, nikoli tvrzení, že celý dokument právně přestal platit. Bankovní údaje, dnešní jídelníček, provozní hodiny, dostupnost pokojů a sporné podmínky nejsou převzaty.

## Refaktoring a ověření

Společný autorovací helper sjednotil metadata, UTF-8 hashe a podobu eval případů. Výsledné JSON soubory neobsahují generátor ani runtime síťový lifecycle. Validátor je samostatný opakovatelný doklad datových invariantů; index/cache a jejich refaktoring jsou ve vlastnictví runtime integrátora.

- `node docs/home-ai/20261028/suz/validate-data.mjs`: **PASS**, exit 0, 28. 10. 2026. Ověřena úplnost v2 polí, URL/host/public cesta, témata, datumové formáty a offsety, explicitní účinnosti, globální unikátnost v rámci obou SÚZ výstupů, lokální reference source/chunk, přesné SHA-256, délka textů, prázdný archiv a reference všech 20 eval případů. Log `.cache/rag-sources-20261028-suz/data-validation.log`.
- `git diff --check -- server/data/rag/suz.json server/data/rag/suz-archive.json docs/home-ai/20261028/suz/`: exit 0; protože soubory jsou nové a nestagované, hlavní obsahovou kontrolu poskytuje uvedený validátor.
- **Nebylo spuštěno** `validate-data.mjs --retrieval`. Runtime export právě dokončuje jiný agent. Spuštění skutečných 20 dotazů přebírá runtime integrátor a root; nejde o hotové PASS. Připravený příkaz: `node --import tsx docs/home-ai/20261028/suz/validate-data.mjs --retrieval`.
- Neproveden celý TypeScript, build, full suite, SDK integrace, browser, skutečný model ani GPU. Tyto kontroly nejsou nahrazeny data validací.

Manifest `.cache/rag-sources-20261028-suz/manifest.json` zachycuje přesné SHA-256 šesti předávaných souborů, tedy i eval fixture, validátor a toto předání. Výsledný hash manifestu je oznámen při předání koordinátorovi; žádný commit ani staging nebyl proveden.

## Procesy a převzetí

Pouze krátké CLI/Node příkazy skončily. Žádný vlastní server, port, GPU, placené API, crawler, scheduler nebo dlouhožijící proces neběží. Soukromá konfigurace nebyla čtena. Živý produkční snapshot nebyl změněn.

Po tomto předání následuje release `rag-sources-20261028-suz`. Release není přijetí ani Done: root převezme konkrétní dirty scope přes vlastní integrační rezervaci, zkontroluje manifest, skutečné retrieval výsledky a společnou pipeline. Stav tasku, Linear, staging a commit mění až integrátor.

## Převzetí integrátorem

Root ověřil původní manifest šesti souborů, získal claim `rag-suz-integrator-01a17e9d` a zopakoval datovou validaci PASS. Nezávislý obsahový reviewer přečetl hlavní smluvní/provozní podklady; hypotézu chyby inkasa vyvrátil sousední VUP III/4. Doložený obsahový nález nezůstal, ceny z neověřených vazeb tabulky zůstaly vynechané. Konečný runtime/recall/provider výsledek nad společným checkpointem stále přebírá root.

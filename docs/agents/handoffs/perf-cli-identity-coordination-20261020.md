# Předání: perf-cli-identity-coordination-20261020

- Vlastník perfcli-01a155b2-coordinator; vlastní oddělený worktree ci-main-autonomous-pilot/StrahovCrazyShow, větev codex/performance-cli-identity-report, základ ab39b7185d0c9fb5e393c654818f43de82e07886.
- Výsledek: vybraná malá existující diagnostická mezera KEY-2, konkrétní child KEY-50 přidělen uživateli. Připraven průzkum, neměnná syntetická fixture a plain-Node CLI acceptance, manifest a disjunktní tasky. Funkční implementace zatím neproběhla; provede ji nový run řadiče.
- Výzkum, varianty, source hashe a skutečná reprodukce: docs/performance/evidence/diagnostic-identity-20261020/. Původní CLI má0místo2nesouladů, očekávaný red exit1; existující29testů PASS.
- Scope: pouze vlastní assignment/evidence/handoff/cache. Zdrojové2soubory vlastní budoucí worker, BMAD artefakty/renderer budoucí controller. Žádné převzetí cizího WIP;4cizí diary claims zůstávají vlastníkům.
- Cache/alokace/lifecycle: výzkum volí úzkou offline klasifikaci, žádné nové herní zdroje; worker má provést cílený refaktoring s implementací a testy. FPS/GPU zlepšení není tvrzené.
- Procesy: baseline CLI a testy skončily, žádný preview/server/GPU. Koordinátor drží github-ci-validation a svůj claim; admin je samostatný.
- Další krok: integrovat zadání přes chráněný bootstrap PR, poté nový run bez starých checkpointů; přejímka až po CLI/review/PR/main CI. Parent KEY-2 zůstává otevřený.

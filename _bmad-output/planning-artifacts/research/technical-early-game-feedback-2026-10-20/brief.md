# Výzkumné zadání KEY-51 — 20. 10. 2026

Rozhodnutí: jak pro StrahovCrazyShow navrhnout vlastní krátký formulář → server → Linear na základě skutečné praxe her v early access / veřejném testování. Závazný vstup uživatele: automatický snímek BEZ HUD. Neimplementovat, dokud nebude dokončen výzkum a porovnání.

## Autorizace a rozsah
Uživatel výslovně zvolil vlastní formulář a požádal o kompletní výzkum jiných early her dne20Oct2026. Jde o Run zde, nikoli návrh promptu pro externí nástroj. Plán a postup bez nového schvalovacího checkpointu podle projektové policy a již udělené autorizace. Linear KEY-51 sleduje pouze výzkum; KEY-21 vlastní existující media/diary WIP.

## Plán
- Primární případové studie survival/exploration her a builder/indie her; cílit10–12 doložených herních příkladů, upřednostnit přesnost před kvótou.
- Pro každou hru vstup, povinná pole, screenshot auto/manual/HUD, metadata, login, doručení, známé chyby, duplicity, feedback versus bug, vývojářský workflow. Současné podklady oddělit od historických EA precedentů.
- Technické oficiální zdroje HTML/WebGL/WebGPU/Babylon a Linear: capture současného skutečně vykresleného snímku versus nový render, buffer/encode/lifecycle; upload, auth, partial failures, rate limit a nejednoznačný výsledek issueCreate.
- Lokální audit explicitních primárních souborů: client/ui.tsx, game.ts, labels.ts, render-engine.ts, session-diagnostics.ts, render-health.ts, render-incident-profile.ts; server/session-diagnostics.ts, index.ts; shared/session-diagnostics.ts; související tests; read-only media WIP ve worktree playtest-diary po ověření identity (žádné převzetí).
- Syntéza UX flow, varianty ceny/výkonu/vzhledu/cache/lifecycle, doporučení, rizika, chybějící důkazy a konkrétní budoucí praktická přejímka.

## Metoda
Typ technical, doplněný konkrétními herními případovými studiemi. Breadth-first,3 výzkumníci + lead;2kola s cíleným dohledáním rozporů, nejvýše12čtených zdrojů/dimenze/kolo a15webcallů/výzkumník. Odhad20–30min s koordinací a ověřením citací. Vyhledávání web__run, žádný externí orkestrátor. Výstup Markdown dle existujícího projektového research formátu; nevyžaduje HTML briefing. Skill bmad-deep-recon + projektové overrides rozlišeny resolverem.

## Pravidla důkazů
Každé tvrzení zdroj, publisher, datum publikace nebo unknown, accessed2026-10-20 a meze. Historické příklady nepředstírají současný stav. Oficiální dokumentace potvrzuje smlouvu, nikoli skutečně naměřený výkon hry. Pojem automatický screenshot neznamená HUD-free; pokud to zdroj neříká, uvést unknown. Neodvozovat konverzní přínos ani náklady bez dat. Hry zde nebudou nově hrány; reprodukce z veřejných primárních materiálů má explicitní omezení.

## Výstupy a rezervace
Run: _bmad-output/planning-artifacts/research/technical-early-game-feedback-2026-10-20/. Lead vlastní report, brief, memlog, lokální audit, appendix, machine claim/staleness a verification. Tři výzkumníci vlastní disjunktní digest a handoff. Vše pod task claims; cizí Game/UI/diary WIP, frozen buildy, procesy a porty zůstávají nedotčené.

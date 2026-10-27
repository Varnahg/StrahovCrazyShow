# Předání serverové integrace home-ai-20261027

- Vlastník/příjemce: `home-ai-server-entry-01a17e9d`, root téhož uživatelského zadání.
- Worktree: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, `codex/clean-home-crazy-typka`; převzatá feedback dependency `a3c886a7291830415170ea4da7e7906379bf8616`.
- Soubory: `server/index.ts`, `server/public-presence.ts`, `tests/public-presence.test.ts`, `scripts/integration.ts`, `scripts/integration-network.ts`, `scripts/test-integration.mjs`, `tests/feedback-deployment.test.ts`, `compose.ai.yaml`, toto předání.
- Veřejný GET /api/presence vrací výhradně online počet skutečných připojených hráčů. AI ani NPC nejsou hráči; uživatel schválil pouze agregát. SDK integrace kontroluje join/leave/resume a host privacy.
- AI je volitelná služba s vlastním HTTP dispatcherem před pinovaným Colyseus CORS wrapperem. WebSocket upgrade a ostatní HTTP requesty zachovávají původní handler. Chybná AI konfigurace neukončí hru; graceful shutdown uzavře AI službu. Předaný feedback callback zůstal zachován.
- Izolovaná integrace odstraní OPENAI_/CRAZY_TYPKA_/LINEAR_/FEEDBACK_ z inherited env. Testy nikdy nepoužijí skutečný placený provider ani neposílají reálný feedback. compose override obsahuje jen názvy nastavení, žádné hodnoty klíče.
- Ověření: cílené service/provider/retrieval/presence/env a UI testy jsou součástí159/159 PASS. Původní SDK integrace odhalila permissive CORS; log zachován, příčina prozkoumána a po opravě celý harness PASS. Konečný běh nového checkpointu viz [validační předání](home-ai-20261027-validation.md).
- Cizí primary WIP nebyl přebírán. Veřejný produkční host nebyl změněn; nastavení AI vyžaduje jeho provozovatele. Klíč uživatele zůstává mimo všechny Git kořeny.
- Procesy/porty vlastní samostatný validační task. Claim zůstává držen do integračního dokončení.

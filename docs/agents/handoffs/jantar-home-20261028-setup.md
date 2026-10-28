# Předání: jantar-home-20261028-setup

- Vlastník jantar-setup-01a17fd8; příjemce jantar-root-01a17fd8.
- Kopie C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow, codex/jantar-home, baseline e09d60fa24419a93b26f15e21c862e95e44aff2f.
- Fyzická offline frozen hoisted instalace dokončena exit 0, 152 balíčků, 2m54.2s, log hlásí pnpm11.25.0. Aktuální shell wrapper pnpm11.19.0; Node24.19.0. node_modules je obyčejný adresář, nikoli junction.
- Příkaz `pnpm install --frozen-lockfile --offline --config.node-linker=hoisted --config.enable-global-virtual-store=false`; log `.cache/jantar-home-20261028-setup/install.log`.
- Ověřeno `git diff --exit-code -- package.json pnpm-lock.yaml` exit0. Manifest a lock beze změn; nevzniká nový závislostní kontrakt. Žádné cizí WIP převzato.
- Refaktoring není pro instalaci relevantní; vlastní fyzický node_modules neodkazuje na měnitelný adresář jiné kopie.
- Instalační proces ukončen (exec session24683 skončila exit0). Žádný server/GPU/heavy proces spuštěn. LFS nebylo materializováno; je samostatně koordinované.
- Verzovaný výstup je pouze tento handoff; node_modules/cache se necommitují. Rezervace uvolněna po tomto předání.
- Integrátor převzal důkaz instalace; stav tasku katalogu aktualizuje jeho vlastník.

## Opětovná kontrola po pnpm shim

Vlastník assets omylem vyvolal `pnpm exec prettier`; systémový fallback pnpm11.19.0 začal automaticky obnovovat152 balíků. Vlastní exec session33345 zastavil Ctrl+C (exit1); manifest/lock nezměnil. Původní setup vlastník znovu převzal vlastní handoff přes claim `--adopt-dirty`, ověřil ukončení procesu a fyzický node_modules, jeho interní junctiony končí ve stejné pracovní kopii. Přímé Node vstupy tsx/prettier/TypeScript/Vite existují. Následných34 cílených welcome/preview testů proběhlo exit0; k plnému buildu se přejde pouze ve validation okně. Další pnpm exec se nepoužívá; manuální zásah do balíků nebyl nutný. Setup rezervace se po této kontrole opět uvolňuje, cache/procesy se necommitují.

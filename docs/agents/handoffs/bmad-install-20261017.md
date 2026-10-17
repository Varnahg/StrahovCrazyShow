# Předání: bmad-install-20261017

- Vlastník: `bmad-01a14a49-installer`; příjemce: `bmad-01a14a49-root` a autor overrides.
- Pracovní kopie: `codex/bmad-integration`, základ `b10194bb4bc8a433d87f1ce73241277914710cfa`.
- Výsledek: oficiální BMAD 6.12.4, core+BMM, 29 projektových Codex skills, bez shims. Samotná instalace ještě není přijaté projektové zapojení.
- Rozsah: `.agents/skills/`, `_bmad/`, `.gitignore`; instalační logy zůstávají ve vyhrazeném výstupu. Žádný runtime, package.json ani lockfile hry nebyl změněn.
- Instalace: `npx` na PATH nebylo; standardní `pnpm dlx` skončilo s chybějícím `fast-wrap-ansi`. Tentýž oficiální balíček uspěl přes `pnpm --config.enable-global-virtual-store=false --config.node-linker=hoisted dlx bmad-method@6.12.4 install --directory . --modules bmm --tools codex --no-shims --user-name StrahovCrazyShow --communication-language Czech --document-output-language Czech --output-folder _bmad-output --yes` (exit 0).
- Rozlišení příčiny: doloženo selhání resolution v globálním virtuálním store a úspěch izolovaného hoisted layoutu; kořenová chyba pnpm nebyla diagnostikována. Nastavení je pouze pro příkaz, nikoli změna uživatelské konfigurace.
- Runtime předpoklady: Node 24, pnpm 11.25.0, uv 0.12.3; dostupný Python >=3.11.
- Podklady: připnutý upstream tag v6.12.4, jeho instalátor a konfigurace Codexu. MIT licence je přiložena v `_bmad/LICENSE`.
- Refaktoring: upstream soubory se lokálně nerefactorují; projektová pravidla patří do sparse overrides. Renderovaná cache a osobní konfigurace nejsou verzované.
- Převod vlastních výstupů: nově vytvořený `_bmad/custom/.gitignore` předávám autorovi tasku `bmad-overrides-20261017`; pro tento jediný původní výstup je doložené převzetí přes `--adopt-dirty`. Koordinátor přebírá renderer a planning výstupy, všechny pocházejí z této instalace. Cizí WIP se nepřebírá.
- Procesy: instalátor skončil, nebyl spuštěn server ani GPU.
- Další krok: overrides, jejich skutečné rozlišení, reinstall/portability a pilot. Rezervace se uvolní před jejich zápisy.

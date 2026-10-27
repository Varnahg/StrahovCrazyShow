# Předání distribučních pravidel stromů

27. 10. 2026, root `trees-release-packaging-root-01a16b37`, pracovní kopie D. Změny jsou vlastní a dosud necommitované.

- `.gitattributes`: nové seasonal Blender/GLB/bin soubory používají LFS. Původní historie a skutečné asset bajty se nemění.
- `scripts/performance-snapshot.mjs`: přidána verzovaná fixture `docs/trees/20261025/catalog-release.json` pro kontrolu skutečného dodaného katalogu. Stejný vstup má lokální závěrečný freeze helper v již vlastněném bootstrap scope.
- `git check-attr` potvrdil LFS pro konkrétní native, GLB a placements cesty. Nové řádky jsou bez whitespace chyb; celkový `git diff --check` zatím upozornil na starší vlastní řádky v `docs/verification.md`, které se opraví při závěrečné aktualizaci evidence.

Staging, LFS upload, build, GPU a integrace ještě neproběhly. Rezervace zůstává rootovi do začlenění ověřeného celku.

# Předání distribučních pravidel stromů

27. 10. 2026, root `trees-release-packaging-root-01a16b37`, pracovní kopie D. Změny jsou vlastní a dosud necommitované.

- `.gitattributes`: nové seasonal Blender/GLB/bin soubory používají LFS. Původní historie a skutečné asset bajty se nemění.
- `scripts/performance-snapshot.mjs`: přidána verzovaná fixture `docs/trees/20261025/catalog-release.json` pro kontrolu skutečného dodaného katalogu. Stejný vstup má lokální závěrečný freeze helper v již vlastněném bootstrap scope.
- `git check-attr` potvrdil LFS pro konkrétní native, GLB a placements cesty. Nové řádky jsou bez whitespace chyb; celkový `git diff --check` zatím upozornil na starší vlastní řádky v `docs/verification.md`, které se opraví při závěrečné aktualizaci evidence.

Staging, LFS upload, build, GPU a integrace ještě neproběhly. Rezervace zůstává rootovi do začlenění ověřeného celku.

## Doplnění RAG fixtures · 28. 10. 2026

Na výslovnou navazující žádost koordinátora KEY-65 byl v C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow nad HEAD 5b4ff115d1f7060e3a818d45204d83ab18d9d094 upraven pouze scripts/performance-snapshot.mjs (+3 řádky) a tests/performance-snapshot.test.ts (+2 řádky). Snapshot nyní přesně zahrnuje docs/home-ai/20261028/sh/retrieval-cases.json a docs/home-ai/20261028/suz/retrieval-cases.json. Žádný obecný docs prefix se nepřidává. Cílený refaktoring používá stávající prerequisite smyčku místo nového duplicitního testu.

Dva rozšířené regresní případy před opravou selhaly: chybějící kopie/hashy a neměnná identita po změně nového vstupu. Po doplnění entries prošlo všech 5/5 lehkých fixture případů (kopie, hash, identita, ochrana před přepsáním, souběžnou změnou a chybně sdílenou referencí); 0 skip, 4,21 s. Logy .cache/trees-snapshot-fixture-20261027/rag-20261028/red.log a green.log. diff --check PASS. Neproběhl produkční snapshot, full build, herní server, browser, GPU ani placené API; testy pracovaly jen s malými syntetickými dočasnými soubory a dokončily cleanup. Do scope probíhajícího úklidu cache se nezasahovalo.

Výsledné SHA-256: scripts/performance-snapshot.mjs f80e01fecc806bd5e052ffbc58ac06c54cdc7d8cfc94a30d43bbe590ecf2db7f; tests/performance-snapshot.test.ts 22f2d4211f498a381461dc783f0b3cf45d05bde29747cd4b4f6cc941fb4c485a. Oba zdrojové soubory jsou předané koordinátorovi KEY-65 k explicitnímu stagingu/publikaci s celou funkcí. D pracovní runtime se neměnil; samotné toto předání není CI ani main přijetí.

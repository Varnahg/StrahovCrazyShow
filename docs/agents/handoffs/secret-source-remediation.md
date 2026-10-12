# Předání: secret-source-remediation

- Vlastník a integrátor: security-20261012-root.
- Pracovní kopie: C:/Users/rezac/.codex/worktrees/secret-alert-remediation/StrahovCrazyShow, detached HEAD z fbe6ed3dd326a9f6721faa06c41e85f70423d515. Publikace integračního commitu do hlavního checkoutu přes cílený cherry-pick; žádné přepnutí větve ani převzetí cizího WIP.
- Výsledek: oba cizí Google Maps API klíče odstraněny z aktuálního main. Commit f331a76 v izolované kopii byl publikován jako 15c3c74 v main. Žádná změna herního runtime.
- Soubory: docs/reality-pack/outdoor-artifacts/landmarks-ghmp-source.html, landmarks-pct-source.html, landmarks-source-summary.json, landmarks.md; toto předání.
- Cizí práce: ponechán audit vegetace v hlavním checkoutu; souběžná publikace budov 142ce23 zachována. První push izolovaného commitu správně odmítnut jako non-fast-forward; po načtení a kontrole konkrétního rozdílu byl pouze vlastní čtyřsouborový commit cherry-picknut na aktuální main a běžně pushnut, bez force.
- Podklady: archivované GHMP a Prague City Tourism stránky z 2026-10-12; nezávislé HTTP GET obou veřejných zdrojů v 14:00:51–52 UTC vrátily HTTP 200 a shodné klíče. Porovnání pouze v paměti; klíče nebyly použity k žádnému Google API volání a nejsou uvedeny v tomto předání.
- Ověření: u obou HTML porovnání bajtů s původním Git blobem po jediné náhradě API klíče: PASS. SHA-256 a velikosti všech šesti sourceFiles souhlasí. git diff --check: exit 0. GitHub contents API pro main potvrdilo obě sanitizované SHA a nula kandidátů.
- GitHub: alerty 1 a 2 uzavřeny 2026-10-12T14:06:02Z jako wont_fix s vysvětlením cizího původu a nemožnosti revokace cizího Google projektu. Není tvrzeno revoked ani false_positive. Následný GET otevřených alertů: 0. Původní PATCH s komentářem delším než 280 znaků byl odmítnut HTTP 400 bez změny; kratší komentáře uspěly HTTP 200.
- Limity: historický commit 7dac0a4985bff5503019107ae88c9380d53e025f nebyl přepsán. Platnost, restrikce ani revokace cizích klíčů nejsou ověřené; mohou je spravovat jejich vlastníci. Oprava nevyžaduje změny účtů hry.
- Refaktoring: změna pouze dvou hodnot a explicitní provenance; žádný nový runtime stav, cache, alokace ani lifecycle. Preventivní kontrola a její testy jsou oddělené v source-secret-guard.
- Procesy: pouze krátké CLI/HTTP kontroly; žádný vlastní server, GPU, Blender ani pomocný dlouhožijící proces. Build, plná herní sada a integrace nebyly spuštěny pro čistě dokumentační opravu a samostatný bezpečnostní nástroj; nemění se herní kód. heavy-validation současně drží budovy.
- docs/verification.md: stále rezervováno jiným vlastníkem building-production-verification. Tento soubor nebyl měněn; skutečné důkazy a limity jsou zde a v source-secret-guard.md pro následné převzetí jeho vlastníkem.
- Rezervace: držena do dokončení testů a společného předání; následně uvolněna bez ponechaných procesů.

## Primární postupy

- https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-secret-scanning-alerts/resolving-alerts
- https://docs.github.com/en/rest/secret-scanning/secret-scanning#update-a-secret-scanning-alert
- https://developers.google.com/maps/api-security-best-practices

Samotné odstranění hodnot automaticky neuzavírá alert ani nerevokuje klíč. Uzavření výslovně odlišuje cizí publikované podklady od přihlašovacích údajů této aplikace.

## Převzetí prevence a snapshot

Integrátor přečetl implementaci, workflow i testy a převzal source-secret-guard: Node 24 i tsx 7/7 PASS, skutečný scan 2 030 textových souborů / 0 nálezů. SHA-256 sedmi změněných zdrojových souborů včetně testu a CI: `877df928dfe08e2e8659d84f1fb739b7ac576dc64c73f2f42296fdea332ecc29` (SHA-256 nad JSON.stringify následujícího objektu v tomto pořadí).

```json
{
  "docs/reality-pack/outdoor-artifacts/landmarks-ghmp-source.html": "cc1d192a4e2eaf5f499cf92855e83460529262f66fd57e05caa04fcf40b65cec",
  "docs/reality-pack/outdoor-artifacts/landmarks-pct-source.html": "920324946e770f2d6fb76d286c68ac251c0cf9b0b3da0a9513b3bba81f736798",
  "docs/reality-pack/outdoor-artifacts/landmarks-source-summary.json": "14cc6654c43f192b6afe290f2b3d036523e2eb3babfef43fa4d42ae599c81403",
  "docs/reality-pack/outdoor-artifacts/landmarks.md": "b101ee550dd4d2ed9bd395620ab637dfbf9fea80264c0a015c85350c9a90a793",
  "scripts/check-source-secrets.mjs": "73f593b41816560292cccddc1b57996b9b14d29c41b676455b04b68a2d0d8bc3",
  "tests/source-secret-hygiene.test.ts": "87131f3d8576f2e19ad6471c777b36432d6aab1ad6cc8428e8b22a53f04c3daa",
  ".github/workflows/source-secrets.yml": "5c052826082d2732700ad5dfe1aaa57484cf098d1c98dc1900b45350c3080fbe"
}
```

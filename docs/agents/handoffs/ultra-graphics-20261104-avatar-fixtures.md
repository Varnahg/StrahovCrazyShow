# Avatarové fixture — grafický stav

Vlastník `ultra-20261104-avatars`, task `ultra-graphics-20261104-avatar-fixtures`; checkout `D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104`, větev `codex/graphics-smoothness-20261104`, baseline `4ad9725d7901b37f0dd68a828003958850081325`.

Před změnou: problém je pět selhávajících avatarových testů po zapojení explicitního přepínače stínů. Mechanismus je doložen CI logem `.cache/ultra-graphics-20261104/ci-4ad9725d-verify.log` a lokální reprodukcí: `Object.create(Game.prototype)` obchází konstruktor, takže `getEffectiveVisualSettings()` při kontrole kontaktních stínů nenajde `adaptive.preferences`. Jediná změna: doplnit skutečný `AdaptiveQualityController` do čtyř dotčených fixture podle jejich existujícího Low/Medium detailu. Hlavní metrika: všech jedenáct původních testů projde bez změny asercí. Správnost: stejné LOD, animace, IK, dotyky, kontaktní stíny a bez produkčního fallbacku či změny API. Přijetí: cílený běh tří souborů a kontrola diffu PASS.

Varianty: stub `getEffectiveVisualSettings()` by test odpojil od skutečného resolveru; produkční optional fallback by maskoval neúplné fixture. Plný Game konstruktor by zbytečně přidal renderer, DOM a startup do izolovaných CPU testů. Zvolený skutečný controller nechává původní Game getter vyhodnotit skutečný grafický kontrakt. Samostatný helper pro čtyři jednořádkové inicializace není potřebný; nevzniká nový testovací framework ani cache. Primární zdroje: skutečné `Game.getEffectiveVisualSettings`, `Game.updateAvatarPresentation`, `AdaptiveQualityController` a tři původní testovací soubory.

Lokální reprodukce před opravou: `node --import tsx --test tests/local-avatar-presentation.test.ts tests/medium-plant-compensation.test.ts tests/remote-jump-animation.test.ts` — **6 PASS / 5 FAIL**, všech pět přesně `Cannot read properties of undefined (reading 'preferences')` v `Game.getEffectiveVisualSettings:1972 → updateAvatarPresentation:2598`. Odpovídá pěti CI nálezům. Zbývající tři authored-light CI chyby vlastní jiný task.

Finální checkpoint: doplněny tři importy a čtyři inicializace skutečného controlleru (lokální avatar Medium, kompenzace a obě vzdálené jump fixture Low). Skutečný Game getter získává feature flags z controlleru a původního resolveru. Všechny původní aserce zůstaly beze změny; žádný produkční soubor se neměnil.

Stejný cílený příkaz po opravě — **11/11 PASS**, 0 skipped, přibližně 16,8 s. `git diff --check` vymezených souborů — **PASS**. Ruční kontrola diffu potvrzuje pouze sedm přidaných zdrojových řádků. Další TypeScript check nebyl potřebný pro tyto existující typované constructor argumenty; samostatný globální TS/full suite/build/GPU nebyl spuštěn. NullEngine zde ověřuje původní CPU chování, nikoli výkon nebo GPU výsledek.

Vlastní procesy skončily. Žádný staging ani commit. Root přebírá tento integrovatelný celek a zajišťuje následné CI; po předání se rezervace uvolňuje. Úspěch těchto jedenácti testů se nevydává za zelenou celoprojektovou přejímku.

SHA256:

- `tests/local-avatar-presentation.test.ts`: `4db980e8fc5cf508d62c40d467486afe044443cd2258cc9a8bbe605205f2cc69`
- `tests/medium-plant-compensation.test.ts`: `5c618fcb462c6e53cdcdc6179ff27d1ebb9913a729f670cb2d41e98b6fe3d4d6`
- `tests/remote-jump-animation.test.ts`: `699adf6b81eb80f8ee4207b6ae7d8d618b3558384c4c52894c07c55b0c596eee`

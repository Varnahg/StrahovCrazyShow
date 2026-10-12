# Rozpracovaná práce při zavedení koordinace

Průzkum 12. 10. 2026, Git HEAD `918a59ce63d7ba7c3a97c209a739cd59a4e00475`. [Pozorovaný seznam změn](bootstrap-status.json) obsahuje UTC čas a přesné cesty mimo tuto koordinační úpravu. **Je to historický inventář, ne aktuální seznam rezervací ani zmrazený zdrojový checkpoint.** Během průzkumu do stromu přibývaly další změny, tedy nejde o odložený čistý checkout.

## Existující práce bez předaného vlastníka

| Pozorovaná oblast                                 | Příklady dotčených souborů                                                                                                                                                                                                                                            | Pravidlo převzetí                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Počasí, obloha, osvětlení a astronomické podklady | `client/art-lighting.ts`, `client/cinematic.ts`, `client/sky-weather.ts`, `client/weather-particles.ts`, nové `client/atmosphere-*.ts`, `client/lighting-preview.ts`, `shared/astronomy.ts`, `shared/weather.ts`, `server/weather.ts`, `docs/weather/` a jejich testy | Obsazené nepředaným WIP; nejprve zjistit vlastníka a jeho přesný diff/testy                        |
| Venkovní objekty a mapa                           | `client/outdoor-artifacts.ts`, `client/map-artifacts.tsx`, `client/minimap.tsx`, `client/minimap.css`, `shared/outdoor-*.ts`, `shared/data/outdoor-artifacts.json`, `scripts/fetch-outdoor-artifacts.mjs`, podklady a testy                                           | Stejné pravidlo; nezahajovat druhou implementaci nad těmito změnami                                |
| Společné integrační body a UI                     | `client/game.ts`, `client/world-renderer.ts`, `shared/simulation.ts`, `client/ui.tsx`, `client/i18n-messages.ts`, `client/hud-status.tsx`, `tests/stability.test.ts`                                                                                                  | Nelze přidělit jen podle názvu oblasti; vlastnictví a následné integrace musí domluvit koordinátor |

Názvy oblastí jsou interpretace diffu, nikoli identita autora nebo tvrzení o dokončení. Nové tasky pro tyto oblasti jsou záměrně `blocked`. Tento dokument nedává nikomu právo použít `--adopt-dirty` na jejich převzetí. Inventář nepokrývá obsah ostatních worktrees; při převzetí je znovu read-only prohlédni.

Během přípravy přibyly také změny `docs/verification.md` k auditu vegetace a povrchů. Přehled relací v aplikaci potvrdil více aktivních úkolů ve stejném checkoutu. Výsledky koordinačního nástroje mají samostatnou evidenci; publikaci odkazu převzal původní vlastník mobiliáře po ověření dokončeného vegetačního auditu. Viz záznam přechodu níže.

## Pozorované procesy

Read-only kontrola naslouchajících portů dne 12. 10. 2026 přibližně v 11:30 UTC:

Naslouchaly adresy `127.0.0.1:2567`, `127.0.0.1:2570`, `127.0.0.1:4179`, `127.0.0.1:5173` a `127.0.0.1:5191`. Provozní PID patří do aktuální rezervace a předání vlastníka; tento historický seznam neslouží k ukončování procesů.

Tato kontrola nepotvrzuje zdrojový hash, funkčnost serveru, identitu agenta ani vlastnictví procesu. Procesy nebyly spuštěné touto úpravou a nebyly ukončené. PID může zaniknout nebo být znovu použitý. Před další prací znovu ověř `Get-NetTCPConnection -State Listen` a skutečného vlastníka. Nerezervovaný port v novém registru nemusí být volný.

`git worktree list` při průzkumu uváděl hlavní checkout a worktrees `network-state-hud` a `visual-quality-jump`. Jejich názvy nejsou pověření měnit tyto kopie. Před souběhem musí používat stejnou verzi pravidel a katalogu; hlavní dirty změny se do nich automaticky nekopírují.

## První převzetí do nového systému

Koordinátor zjistí aktivní relace a nechá je přečíst nový `AGENTS.md`. Každá relace předá svůj rozsah, diff, testy a pomocné procesy. Teprve pak koordinátor rozdělí překryvy, upraví příslušné tasky a jejich vlastníci získají rezervace. Existující vlastní změny převezmou přes `--adopt-dirty` s odkazem na předání. Nepřístupná relace se řeší zachováním změn a doloženým převzetím, nikoli odhadem podle stáří.

Do dokončení tohoto přechodu lze bezpečně přidělovat oddělené nové výstupy a read-only průzkum. Nový registr neumí zpětně objevit ani zastavit všechny už běžící agenty. Aktuální stav ověřuj přes `status` a Git, nikdy jen podle tohoto seznamu.

## Skutečné přijetí pravidel v tomto zadání

Ještě 12. 10. 2026 původní vlastník počasí přinesl výslovný souhlas uživatele s technickou koordinací. Původní lidské „ano, koordinuj“ bylo ověřeno čtením jeho relace. Následná komunikace s počasím, mobiliářem a budovami potvrdila vlastníky a rozsahy; koordinační agent sám jejich herní soubory neupravoval.

- `atmosphere-cloud-refinement` převzal původní autor oblohy; jde o úzké editace a cílené CPU testy.
- `weather-preview-5191` registruje původní vývojový server počasí. GPU karta byla při předání zavřená.
- `outdoor-artifacts-verification` drží těžké ověření mobiliáře a GPU; počasí čeká na jeho ukončení a předání společných souborů. Dříve spuštěná pipeline se eviduje jako bootstrap existující práce.
- `weather-integration-20261012` je samostatný navazující checkpoint. Nesouvisí s budoucími opravami sprintu a trávy.
- Čtyři `building-*` tasky oddělují původní autory v jiné worktree; jejich editace nezískávají automaticky čas Blenderu ani GPU. Pro tyto procesy se přidělí samostatná rezervace po aktuálním ověřovacím okně.

Původní obecné `weather-wip-handoff` a `outdoor-wip-handoff` zůstávají blokované historické návrhy, nahrazené konkrétními živými tasky. Nejsou to další paralelní implementace. Hotový audit vegetace předal finální výsledek, jeho zápis do `docs/verification.md` má být při dalších doplněních zachovaný. Tento záznam popisuje přechod, **aktuální vlastníky a procesy vždy ukazuje registr**.

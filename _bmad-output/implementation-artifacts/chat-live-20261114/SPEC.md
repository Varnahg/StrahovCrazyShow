---
title: 'KEY-78: Herní chat a HUD Jantar'
type: 'feature'
created: '2026-11-14'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'b7c476c7492f9987a3244f3bcd0509b052c3b374'
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md', '{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Uživatel zadal implementaci sloučené makety a živou přejímku na Pi">

## Intent

Převést návrh z PR #49 do skutečné hry. Při hraní zobrazit krátký náhled nad minimapou. Po otevření použít středový chat s konverzacemi, odkazy na zprávy a vzhledem Jantar na hlavních prvcích HUD.

## Boundaries & Constraints

Společný multiplayer, dosavadní kanály a omezení zůstávají. Host nedostává hráčské zprávy ani odznaky a Crazy Typka zůstává samostatná. Pasivně ukázat veřejný text a pouze počty soukromých a událostních zpráv. Udržet CZ/EN, čitelnost, obsluhu dotykem, vypnutelnou zkratku T a klávesnicový fokus. Bez trvalého archivu a bez rozostřování 3D plátna.

| Situace | Očekávaný výsledek |
| --- | --- |
| Náhled a otevření | Nejvýše tři správně označené nové zprávy, přibližně osm sekund. Úzký HUD používá odznak. Dialog zastaví hráčský vstup, po zavření jej obnoví. |
| Odpověď | V konverzaci vybrat originál, zobrazit a zrušit rozepsanou citaci, odeslat. Je-li originál dostupný, přejít na něj bez opuštění okna. |
| Chyba | Výsledek přísluší přesnému odeslání. Odmítnutí či odpojení zachová koncept pro stejnou identitu, bez automatického opakování. |
| Jiná zóna, akce nebo příjemce | Text nové zprávy doručit podle stávajících pravidel. Citaci dostane jen povolený původní příjemce se stejnou konverzací. Nedostupná citace nepřenáší žádná metadata. |

</frozen-after-approval>

## Code Map

- `client/ui.tsx` vlastní připojení, modal a Crazy Typku. `client/game.ts` již neutralizuje vstupy při modalu. `client/player-chat.tsx` vlastní prezentaci, fokus, koncepty a přehled. CSS Jantar sdílí tokeny s úvodem.
- `server/community.ts` určuje publikum podle stejné zóny a vzdálenosti, účasti nebo kontaktů. `server/index.ts` zná skutečné příjemce a může doručit variantu zprávy pro každý socket. `shared/types.ts` definuje zprávu, referenci a potvrzení.

## Tasks & Acceptance

- [x] Serverová reference a testy publika.
- [x] Chat, HUD, otevření a zavření, přepínání, čitelnost, návrat hry.
- [ ] Produkční build a integrační kontrola, živá výměna na ARM64, úzký PR pouze z vlastních změn.

## Design Notes

1. **Problém:** při hraní zprávy schované, bez vazby na originál.
2. **Mechanismus:** jedna klientská historie a panel; server má autoritativní publikum, dynamické dle zóny, blokací a účasti.
3. **Změna:** sdílený klientský stav a nativní dialog, omezený serverový index. Prosté přebarvení nedá náhled. Dva logy by duplikovaly životní cyklus. Ruční citace neověří autorství. Trvalý archiv není pro odpověď potřeba.
4. **Metrika:** průchod hráče a přesné doručené tvary zpráv; náhled maximálně tři položky a jeden časovač, bez per-frame logiky.
5. **Správnost:** cizí autor ani citace nepronikne mimo původní publikum. Text čitelný proti světlé i tmavé scéně. Koncept neopustí konverzaci.
6. **Přijetí:** cílené testy, GitHub CI, ARM64 živý server a skutečný klient nebo přesně popsaná hranice zkoušky.

## Implementation Notes

Server drží originály deset minut, nejvýše 512 zpráv a 8 192 vazeb na příjemce. Klient drží 200 doručených zpráv a nejvýše 32 konceptů pouze v paměti. Odesílá identifikátor originálu a identifikátor pokusu. Úspěšné potvrzení vyprázdní právě odeslaný koncept. Zrušení nebo přerušení připojení ponechá koncept po dobu stejné identity. Rozhraní používá nativní dialog, sdílený font a barvy Jantaru a prostor nad aktuálním rámem minimapy.

## Spec Change Log

## Review Triage Log

- Server: nový klient po rollbacku nesmí odeslat potvrzovanou zprávu starému serveru. Opraveno vyjednáním `playerChatVersion` ve welcome. Při připojování klienta se běžná zpráva nadále řadí do fronty, bez přidělení oprávnění na původní citaci.
- Klient: obecné CSS přebíjelo barvy chatu, do odpojené konverzace zkratka zkoušela zaostřit zakázaný vstup a akce AI potřebovala vlastní kotvu. Opraveno a určeno k browser přejímce.
- Při živém testu prohlížeč krátce zobrazil tmavý text Odeslat na ještě tmavém pozadí během animace. Ovládací prvky chatu nyní přepínají barvy společně.

## Verification

Cílené testy kontraktu, TypeScript, produkční build, izolovaná integrace, test dvou příjemců a třetího bez původního oprávnění. Praktická zkouška v Edge nad skutečnou hrou a skutečným serverem na Pi.

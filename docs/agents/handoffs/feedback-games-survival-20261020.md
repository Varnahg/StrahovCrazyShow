# Předání: feedback-games-survival-20261020

- Vlastník: `feedback-01a15a3e-survival`; příjemce: koordinátor `feedback-01a15a3e-root` (KEY-51).
- Pracovní kopie a větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí commit `22de9054f8151227efab12b807f4d9c3ade079d3`.
- Výsledek: dokončený český zdrojovaný digest survival/exploration her; cca1331 whitespace slov bez samostatných oddělovačů tabulek. Připraven k syntéze koordinátorem; žádná implementace hry ani commit.
- Změněné soubory: `_bmad-output/planning-artifacts/research/technical-early-game-feedback-2026-10-20/digests/games-survival.md` a toto předání.
- Cizí rozpracované změny: sdílený checkout obsahoval rozsáhlé tracked i untracked WIP. Nic nebylo převzato, upraveno, stagingováno ani čištěno. Průzkum nečetl věcný projektový kód/dokumentaci jako důkaz; načtena pravidla, policy, koordinace, šablona a vlastní task.
- Podklady: 18 citovaných primárních zdrojů od Unknown Worlds, Subnautica2 Help Center, Obsidian, Keen Games a Iron Gate; URL, publisher, pub_date/update, accessed=2026-10-20, confidence a claim class jsou v digestu. Dvě kola:12/10 otevřených zdrojů;9 web calls. Jeden nedostupný GDC PDF nevyužit. Planet Crafter vynechán po pokrytí alternativy Valheim.
- Hlavní zjištění: historická Subnautica2014–2016 má F8, pause, kategorizaci, anonymizované veřejné reporty a automatické pořízení snímku s volitelným odesláním. Současné SN2 má F8 pro Experimental, helpdesk a samostatný Nolt pro nápady. Grounded2 dokládá known issues/upvote a podrobný support ticket; Enshrouded herní vstup, fallback pro nefunkční start, přílohy a veřejné třídění návrhů. Valheim odděluje bug/feedback/known issues; obsah Monday formuláře zůstal nepřístupný.
- Refaktoring: nepoužitelné na zdrojový výzkum; text sjednocuje terminologii capture vs přiložení vs HUD-free a odděluje historické tvrzení, současné oficiální instrukce a návrh.
- Ověření: otevření a čtení citovaných primárních URL proběhlo v tomto běhu; cílený `git diff --check -- <digest>` exit0. Kontrola slov:1331. Žádný report nebyl odeslán; hra, build, integrace ani GPU nebyly spuštěny. `independently-verified` praktické chování se neprohlašuje.
- Snapshot/diff: SHA-256 digestu `02664316272103D761F4BF307F999A0E52934B9395BCA50CB31DBE3C6C9BD35D`. Nový dokument je untracked; kontrola diffu sama nevaliduje jeho text, proto byl zvlášť zkontrolován počet slov, zdroje a vymezení tvrzení. Herní testy nejsou pro tento dokument relevantní.
- Procesy a zdroje: pouze krátké CLI a web reads; žádný vlastní pomocný server, port, GPU ani heavy-validation.
- Omezení a další krok: žádný primární zdroj nepotvrdil screenshot bez HUD; neznámé potvrzení doručení, retry, deduplikace a interní tracker/API. Není doloženo automatické odesílání snímku u běžného SN2 reportu. Koordinátor má použít digest jako externí důkazy a navržené inference samostatně zhodnotit; Linear serverový protokol je mimo tento scope.
- Rezervace: claim získán před prvním zápisem, heartbeat obnoven před vytvořením digestu; release následuje po předání, žádné procesy nezůstávají.
- Integrátor: task stav, přijetí, společnou evidenci a případný commit provede koordinátor.

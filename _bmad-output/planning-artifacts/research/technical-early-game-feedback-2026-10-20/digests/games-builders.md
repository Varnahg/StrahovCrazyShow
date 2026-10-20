# KEY-51: feedback v budovatelských a dalších raných hrách

Přístup ke zdrojům: **2026-10-20**. Výzkum tvoří dvě kola: srovnání kanálů a doplnění historického kontextu; 12 webových volání, nejvýše 12 vybraných podkladů v každém kole. Následovala obsahová kontrola S18 jedním dalším webovým voláním. Jde o šest konkrétních precedentů, nikoli reprezentativní vzorek trhu. Nebyla spuštěna žádná z her ani odesláno zkušební hlášení. `primary-confirmed` znamená doložené sdělení vývojáře nebo obsah jeho služby; **independent verification: none** znamená, že nebylo nezávisle ověřeno chování klienta, doručení ani interní triage. Datum článku není datum posledního praktického ověření.

Epistemická pravidla zadání, doslova:

1. Never conclude from training data alone. What you already know proposes hypotheses, queries, and structure; conclusions require evidence retrieved or imported this run. A claim you cannot evidence is stated as an unverified belief or not at all.
2. The research firewall. Project context — briefs, PRDs, code, memory — shapes what to ask, never what is true. It is inadmissible as evidence: every claim in a research artifact traces to a digest or import file with a source. Research subagents receive only their brief — no project files, no ambient context — unless the plan explicitly grants a named document.

## Srovnání doložených cest

`unknown` neznamená, že funkce neexistuje. Znamená, že vybrané primární zdroje danou vlastnost nedokládají. Všech šest her již podle uvedených podkladů vydalo 1.0; jejich rané postupy jsou proto **historické precedenty**, nikoli seznam her aktuálně v Early Access.

| Hra / časové zařazení | Vstup a rozlišení obsahu | Snímek, diagnostika, kontakt | Veřejný přehled a náhradní cesta |
| --- | --- | --- | --- |
| **Satisfactory**; EA postup 2020–2021, 1.0 dne 2024-09-10 [S1–S3] | Oficiální doporučení vede na externí QA web pro chyby i feedback. Konzolový support žádá správnou verzi a kategorii. Shortcut a přesná pole: unknown. | Automatický snímek, odstranění HUD, automatické logy/save a požadavek přihlášení: unknown; QA web se nepodařilo obsahově načíst. | Studio zdůvodňuje jednotné místo sledovatelností. Steam ponechává komunitním řešením. Vyhledávání, hlasování a stavové štítky v aktuálním QA: unknown. Externí cesta nepotřebuje běžící klient; funkčnost QA v tomto běhu: unknown. |
| **Factorio**; EA mechanismus 2018, 1.0 dne 2020-08-14 [S4–S7] | Aktuální kontaktní stránka stále směruje chyby i návrhy na oficiální fórum. Pokyny žádají jednu chybu, verzi, skutečný a očekávaný výsledek, četnost a reprodukci. | Ručně log pro každý report, save při závislosti na stavu, případně obraz/video. Historicky automatický crash upload s možností vypnutí; samostatná cesta od formulace problému. HUD: unknown. | Hledat známé chyby a přispět do existujícího tématu. Automatická historická agregace podle stack trace; hlasování: unknown. Fórum a podpůrný email fungují jako cesta mimo klienta. |
| **Timberborn**; reporting doložen 2021, 1.0 dne 2026-03-12 [S8–S10] | Webový bug/suggestion tracker podle vývojáře nevyžaduje registraci. Běžný herní shortcut: unknown. | Crash obrazovka nabízí odeslání ZIP s logy a savem. Manuálně obrázky, save, Player.log a kroky; automatický screenshot/HUD: unknown. Současný board popisuje post-crash report jako anonymní. | Search, upvote, komentáře, tagy Bug/Suggestion a veřejné stavy včetně Done, On it!, Unlikely to happen. Při nefunkční hře či bez crash obrazovky web a email s odkazem na návrh. |
| **Against the Storm**; konkrétní EA FAQ 2022, následná 1.0 [S11–S12] | F11 otevírá herní reporter. Odděleně veřejný feature board s hlasováním, bug tracker a helpdesk. Přesná pole reporteru: unknown. | FAQ výslovně uvádí anonymizaci a nemožnost odpovědi. Pro kontakt žádá celý save adresář, popis, četnost, obraz/video a specifikace; automatické přílohy F11 a HUD: unknown. | Nejdříve znalostní báze a podobná témata; alternativně helpdesk. Existence nástrojů doložena historicky, jejich dnešní provoz a stavové workflow: unknown. |
| **Slime Rancher 2**; 1.0 doložena 2025-09-23 [S13–S16] | Současné patch notes odkazují na známé problémy a poté ticket. Formulář má email, předmět, popis, Issue Type a platformu; jméno a přílohy jsou volitelné. In-game vstup/F2: unknown. | Při pádu po menu Player.log; před menu nebo při systémovém pádu DxDiag. Automatický snímek, HUD a automatický save: unknown. Viditelný formulář bez přihlášení nedokazuje dokončitelné anonymní odeslání. | Známé problémy slouží před novým ticketem. Veřejné hlasování, slučování a individuální veřejný stav: unknown. Externí support pokrývá i nemožnost spustit hru. |
| **Hades II**; F10 doloženo od EA 2024, 1.0 dne 2025-09-25 [S17–S19] | Samostatný vývojářský pokyn S17 potvrzuje F10 pro Windows PC. Návrhový feedback, přesná pole a chování reportovacího okna: unknown. | FAQ S18 popisuje automatický crash report, je-li zapnuto Transmit Data. Automatický screenshot, kreslení do něj, HUD a přiložený save u F10: unknown z těchto primárních podkladů. | Podpůrné FAQ a email s logem a systémovými údaji jsou fallback. Veřejné vyhledávání/votes/status ani login pro F10 nejsou doloženy. |

## Claims a síla důkazu

- **GB-01 — primary-confirmed, vysoká:** Satisfactory používá centralizovaný externí kanál pro chyby i feedback. Kombinace historického pokynu a současného supportu dokládá kontinuitu doporučení, ne aktuální podobu QA formuláře. [S1, S2]
- **GB-02 — primary-confirmed, vysoká pro historii:** Factorio odděluje automatické crash signály od ručních reprodukčních reportů. Vývojář popisuje seskupení stejných stacků a současně nemožnost kontaktovat autora uploadu. Výslovně dál žádá fórum se savem a kroky. Automatická telemetrie tedy v tomto doloženém postupu neposkytuje všechen potřebný kontext. Přesná dnešní implementace uploaderu: unknown. [S5, S6]
- **GB-03 — primary-confirmed, vysoká:** Timberborn spojuje nízkou vstupní bariéru s veřejným tříděním. Bezregistraci dokládá vývojářský příspěvek; search, hlasy, tagy a stavy současný oficiálně odkazovaný board. Netvrdíme, že vyšší počet hlasů automaticky určuje prioritu. [S8, S9]
- **GB-04 — primary-confirmed, vysoká pro rok 2022:** Against the Storm explicitně odděluje anonymní F11 od kontaktovatelného supportu a veřejných návrhů. Anonymita sama nedokládá absenci všech technických identifikátorů. [S11]
- **GB-05 — primary-confirmed, vysoká:** Slime Rancher 2 rozlišuje diagnostické přílohy podle místa selhání a nabízí strukturovaný support. F2 se nepodařilo doložit; zkušenost s jiným dílem není důkazem vlastnosti pokračování. [S13–S15]
- **GB-06 — primary-confirmed, vysoká:** Samostatný oficiální pokyn z roku 2024 omezuje F10 v Hades II na Windows. Z pouhé existence zkratky nelze odvodit capture pipeline, podporu všech platforem ani dnešní dostupnost. [S17]

Pro **GB-01 až GB-06 platí independent verification: none**. Neproběhlo hraní, profilování ani kontrola skutečně vytvořených ticketů. Primární sdělení je důkaz toho, co studio nabízí nebo popisuje; není měřením úspěšnosti, konverze či doby opravy.

## Přenos do rozhodnutí KEY-51

Následující body jsou **návrhová inference**, nikoli vlastnosti některé hry. Zkoumané precedenty podporují jednoduchý vstup v místě problému, strukturovaný technický kontext a cestu mimo nefunkční klient. Neposkytují srovnávací experiment pro volbu vlastního formuláře proti SDK ani důkaz výkonu implementace server → Linear.

Pro zadaný vlastní formulář doporučuji viditelné tlačítko a klávesovou zkratku, volbu „chyba / nápad“ a krátký povinný popis. U chyby lze nabídnout doplňující očekávané chování a kroky bez dlouhého povinného dotazníku. Factorio poskytuje obsahový precedent těchto otázek [S5]; není dokladem optimálního počtu polí. Technickou verzi, scénu a čas je vhodné připojit strojově jako explicitní návrh k následnému ověření.

Automatický screenshot **bez HUD** je specifický požadavek tohoto zadání; žádný použitý primární podklad nedokládá úplně stejnou funkci v reportovacím toku. Před odesláním proto navrhuji náhled a možnost snímek odebrat. U chyb UI může čistý snímek odstranit právě předmět hlášení; případná druhá příloha s UI vyžaduje samostatné produktové rozhodnutí. Nelze bez testu tvrdit, že snímek nahradí logy nebo reprodukci.

Kontakt má být volitelný a jeho účel jasný: anonymní report umožňuje hlášení, ale omezuje dodatečné otázky, jak popisují ATS a Factorio [S11, S6]. Veřejný board může být pozdější doplněk; provozní náklady moderace a zpřístupňování příloh nejsou v tomto průzkumu změřeny. První soukromé triage v Linear proto nemá automaticky zveřejňovat screenshoty. Pro duplicity je možné uchovat vazbu na společný problém a jednotlivé výskyty; konkrétní algoritmus je otevřený.

Fallback má fungovat z úvodní stránky bez spuštěné 3D hry: stejný formulář nebo odkaz na support, s ručním popisem a přílohami. Precedenty Timberbornu a SR2 výslovně počítají s nefunkčním startem [S8, S15]. Cena, chybovost uploadu, zacházení s cache, pamětí a retence reportů zůstávají k technickému výzkumu a praktické přejímce; z těchto studií je nelze číselně odvodit.

## Registr primárních zdrojů

Všechny položky: **accessed 2026-10-20**, class `primary`; confidence vysoká pro citované sdělení, kromě výslovně označených omezení. Žádná položka není nezávislý herní test. `n.d.` = stránka neuvádí doložené datum publikace; nelze ho nahradit datem crawlu.

| ID | Publisher, pub_date; zdroj a provenience |
| --- | --- |
| S1 | Coffee Stain / Snutt, 2020-06-09, edit 2021-04-12; [How to report Bugs and Issues](https://steamcommunity.com/app/526870/discussions/1/2299597907737911529/), oficiální připnutý pokyn. |
| S2 | Coffee Stain, n.d.; [Support](https://update4.satisfactorygame.com/support/), oficiální web, obecné i konzolové doporučení. |
| S3 | Coffee Stain, 2024-09-10; [Satisfactory 1.0 out now!](https://store.steampowered.com/news/posts/?appids=526870&enddate=1726766891&feed=steam_community_announcements), vlastní Steam oznámení v archivu. |
| S4 | Wube Software, n.d.; [Contact](https://www.factorio.com/support/contact), současné kontaktní pokyny. |
| S5 | Wube / slpwnd, 2014-05-16, dnešní editace nedatována; [How to report a bug](https://forums.factorio.com/viewtopic.php?t=3638), oficiální fórum. Text dostupný v indexu tohoto běhu, opakované přímé načtení kolísalo; confidence střední pro aktuálnost. |
| S6 | Wube / Twinsen a kovarex, 2018-02-23; [FFF #231](https://www.factorio.com/blog/post/fff-231), technický popis autora. |
| S7 | Wube, 2020-08-14; [FFF #360 — 1.0 is here!](https://www.factorio.com/blog/post/fff-360), skutečný odchod z EA. |
| S8 | Mechanistry / Miami_Mechanistry, 2021-02-22, edit 2021-05-13; [How to report bugs/crashes?](https://steamcommunity.com/app/1062090/discussions/2/3110269213859735252/), autor označen developer. |
| S9 | Mechanistry, n.d.; [Timberborn Bugs and Suggestions](https://timberborn.featureupvote.com/?tag=Feedback), pravidla a skutečně zobrazené stavy boardu; komunitní tvrzení v jednotlivých kartách nepoužita jako fakta. |
| S10 | Mechanistry, 2026-03-12; [Timberborn 1.0 is live!](https://store.steampowered.com/news/posts/?appids=1062090&enddate=1773395865&feed=steam_community_announcements), vlastní Steam oznámení. |
| S11 | Eremite Games, 2022-11-08; [FAQ & Livestream](https://eremitegames.com/faq-and-livestream/), historické EA FAQ. |
| S12 | Hooded Horse / Eremite Games, 2023-12-08; [Against the Storm 1.0 out now](https://gamespress.westeu-v2.propressroom.com/pt/Against-the-Storm-1-0-out-now), tisková zpráva vydavatele, obsah v indexu; přímé načtení nedostupné, confidence střední. |
| S13 | Monomi Park, n.d.; [Submit a request](https://slimerancher2.zendesk.com/hc/en-us/requests/new), skutečně načtený formulář druhého dílu. |
| S14 | Monomi Park, 2026-05-11; [Patch 1.2.2 Notes](https://www.slimerancher.com/news/slime-rancher-2-patch-1-2-2-notes/), instrukce known issues → ticket. |
| S15 | Monomi Park / Watros, update 2026-03-17; [Crash Troubleshooting — PC](https://slimerancher2.zendesk.com/hc/en-us/articles/8430266043155-Crash-Troubleshooting-PC), oficiální support. |
| S16 | Monomi Park / Watros, update 2025-09-23; [1.0 Release — Known Issues, japonská verze](https://slimerancher2.zendesk.com/hc/ja/articles/11050503220115-%E6%97%A9%E6%9C%9F%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E3%81%AE%E6%97%A2%E7%9F%A5%E3%81%AE%E5%95%8F%E9%A1%8C-v-0-5-2), oficiální potvrzení plného vydání. |
| S17 | Supergiant / kid_zomb, 2024-05-10; [Press F10 to Report It](https://steamcommunity.com/app/1145350/discussions/1/4358998952355052872/?l=english), vývojářský EA pokyn. |
| S18 | Supergiant / kid_zomb, 2024-04-18; poslední editace zobrazena jako „24 Aug @ 8:57am“, rok unknown; [Technical Support FAQ](https://steamcommunity.com/app/1145350/discussions/1/4361248648383659778/?l=english), automatická crash data pod Transmit Data a email fallback. Aktuálně načtený text neobsahuje pokyn F10. |
| S19 | Supergiant, 2022-12-09, update 2026-04-14; [Hades II FAQ](https://www.supergiantgames.com/blog/hades2-faq/), skutečné datum 1.0. |

Nedostupné QA stránky Satisfactory, neúplný Steam redirect SR2 a fanouškovská tvrzení o F2 či screenshotu Hades II nebyly použity k potvrzení těchto funkcí. Kritické neznámé tak zůstávají viditelné, místo aby se zaplnily odhadem.

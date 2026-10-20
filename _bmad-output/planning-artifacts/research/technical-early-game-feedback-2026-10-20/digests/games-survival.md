# Survival/exploration hry: sběr chyb a obecného feedbacku

Stav rešerše: 2026-10-20. Zadání KEY-51; pouze externí důkazy, bez použití projektového kódu jako důkazu. Dvě kola, 9 webových volání; první kolo 12 různých otevřených zdrojů, druhé 10 včetně jednoho nedostupného PDF. Vyhledávací výsledky sloužily navigaci; závěry níže vycházejí z otevřených primárních stránek. Planet Crafter nebyl po pokrytí alternativy Valheim dále zkoumán.

**Nejdůležitější výsledek:** historická Subnautica doložila automatické **pořízení** screenshotu s volitelným **odesláním**; současné hry doložily kombinaci herního vstupu, externí podpory a samostatného kanálu pro návrhy. Žádný přečtený primární zdroj nedoložil automatický snímek **bez HUD**. To musí vlastní návrh specifikovat a ověřit samostatně.

## Srovnání doloženého chování

| Hra a období | Vstup a obsah | Obrazová/technická evidence | Třídění, účet a náhradní kanál |
|---|---|---|---|
| Subnautica, EA guide 2014–2016 | F8 pozastaví hru; kategorie bug, výkon, gameplay aj. | Snímek vzniká při F8; přiložení checkboxem. | Anonymizované veřejné reporty; delší feedback přes fórum. Ne každý report vytváří úkol. S1–S3 |
| Subnautica 2, podpora 2026 | Herní report; pro Experimental výslovně F8. | Screenshot lze zachytit; automatika běžného reportu neupřesněna. Xbox Insider má automatický snímek a posledních 30 s videa. | Helpdesk pro technické problémy; Nolt pro návrhy, vyhledávání a hlasování. S4–S8 |
| Grounded 2, 2025–2026 | Webový kontakt, souhrn, platforma, reprodukce. In-game shortcut nedoložen. | Manuálně připravované screenshot/clip, save či gamertag, DxDiag. | Known Issues, upvote s Obsidian účtem; feedback fórum a Public Test kanály. S9–S12 |
| Enshrouded, návody 2024–2025 a aktuální board | Escape → Report a Bug; board uvádí též F1 → Report an issue. | Screenshot/video doporučené; manuální logy, DxDiag, saves. Automatický capture nedoložen. | Externí formulář i pro nefunkční start; návrhy přes Feature Upvote, veřejné stavy a slučování. S13–S16 |
| Valheim, aktuální podpůrný web | Samostatná tlačítka Bug, Feedback, Known Issues, Translation Errors. | Obsah Monday formuláře nebyl čitelný; capture/log automatika neověřena. | FAQ odkazuje na support a Discord #suggestions. Jde o současný support hry s historií EA, nikoli důkaz dnešního EA. S17–S18 |

## Jednotlivé claims a jejich meze

**C1 — Subnautica, historický vzor.** S1 vznikl 15.12.2014 a byl aktualizován 5.2.2016. Jeho provenienci potvrzuje přímý odkaz studia z 13.3.2015 na stejný guide S2. Popisuje F8, pause, kategorie, anonymizaci a veřejnost reportů. Screenshot se pořizuje okamžitě, hráč ale jeho odeslání zapíná. Guide upozorňuje na pomalý upload a vysvětluje, že report automaticky nevytváří vývojářský úkol; tým vybírá, čemu se věnuje. Delší rozbory patří na fórum, kde je nutný účet. Toto je historický deklarovaný proces, nikoli ověření dnešního klienta. **Class: primary-confirmed; confidence: high.** [S1](https://steamcommunity.com/sharedfiles/filedetails/?id=356376081), [S2](https://unknownworlds.com/en/news/subnautica-seabases-released).

**C2 — Subnautica, viditelný backend.** Veřejné HTML S3 nabízí filtry platformy, kategorie, screenshotu, changesetu, FPS, emocí, textu a prostorového radiusu; tabulka má datum, popis a permalink. To dokládá existenci těchto polí v publikovaném rozhraní. Nedokládá spolehlivost telemetrie, její dnešní automatické přiložení ani mapování do interního trackeru. HTML při otevření obsahovalo i šablonové placeholdery, proto nelze všechny výsledky považovat za živě načtené reporty. **Class: primary-confirmed, observed-web; confidence: high pro schéma, neověřeno pro runtime.** [S3](https://subnautica.unknownworlds.com/feedback/tickets).

**C3 — Subnautica 2.** S4 výslovně nabízí report přímo ve hře se screenshotem a alternativní helpdesk. S5 pro Experimental uvádí F8 na všech platformách; automatický snímek a třicetisekundové video výslovně připisuje **Xbox Insider Report a problem**, nikoli všem herním reportům. Doporučuje popis situace, opakovatelnost a kroky. S6 odkazuje na Nolt pro návrhy a hlasování; S7 žádá nejprve vyhledat existující nápad a zakazuje bugy/technické problémy. S8 pro potíže při startu žádá Windows build, specifikaci PC a dostupné crash logy či screenshoty. Políčka, limit textu, login a anonymitu herního formuláře tyto zdroje neupřesňují. **Class: primary-confirmed; confidence: high.** [S4](https://support.subnautica.com/hc/en-us/articles/57020447556121-Where-can-I-report-bugs-or-errors), [S5](https://support.subnautica.com/hc/en-us/articles/60750147889305-Where-do-I-report-bugs-I-find-on-the-Experimental-branch), [S6](https://unknownworlds.com/en/news/subnautica-2-early-access-roadmap), [S7](https://subnautica2.nolt.io/), [S8](https://support.subnautica.com/hc/en-us/articles/57927498056729-DirectX-12-DX12-Launch-Issues).

**C4 — Grounded 2.** S9 žádá nejprve Known Issues, podporuje upvote s Obsidian účtem a teprve potom nový ticket. Vyjmenovává platformu, stručný souhrn, screenshot/video, reprodukci, save nebo gamertag pro sdílení světa a DxDiag. Chybějící přílohy nemají zabránit kontaktu; podpora pomůže doplnit detaily. Upozorňuje také na jméno počítače/uživatele v diagnostice. S10 má kontakt s volitelným jménem, e-mailem, platformou, connectivity, release version, důvodem, zprávou, souhlasem s následným kontaktem a uploadem 25 MB. S9 přitom udává jinému kontaktnímu toku 10 MB na soubor a tři soubory: limity nelze sloučit do jednoho univerzálního kontraktu. S11 nabízí detail, workaround a stav známé chyby; S12 směruje účastníky Public Test také na Discord. **Class: primary-confirmed; confidence: high.** [S9](https://support.obsidian.net/article/179-report-an-issue), [S10](https://grounded2.obsidian.net/community), [S11](https://grounded2.obsidian.net/issues/information/kiN7eeHT-grounded-2-issue-tracker), [S12](https://grounded2.obsidian.net/news/grounded-2/publictest-0-3).

**C5 — Enshrouded.** S13 dává vstup v Escape menu a explicitní externí formulář při nefunkčním startu. Žádá reprodukci, DxDiag, klientský log s backupy, relevantní cloud/local saves a případně logy/saves dedicated serveru. Obrázky a video jsou pomoc, ne doložená automatická příloha. Ve formuláři S14 jsou topic, e-mail, Bug Type, Subject, Description, Platform, volitelné Discord jméno pro kontakt, privacy consent a volitelné attachments. Viditelné Sign in samo nedokazuje povinnost účtu; úspěšné odeslání bez loginu nebylo testováno. **Class: primary-confirmed; confidence: high.** [S13](https://enshrouded.zendesk.com/hc/en-us/articles/9767167725853-Reporting-Bugs), [S14](https://enshrouded.zendesk.com/hc/en-us/requests/new?ticket_form_id=13781260232861).

**C6 — Enshrouded, obecný feedback.** S15 vysvětluje přechod od Discordu, anket a ticketů k Feature Upvote při růstu objemu. S16 vyžaduje jednu realizovatelnou myšlenku, hledání duplicity, hlasování a angličtinu. Obsahuje stavy Planned, Not planned, Ongoing, Implemented i přesměrování na bug report; konkrétní záznam uvádí slučování a editaci ticketů. Prioritou mají být závažné chyby, vysoké hlasování není závazek implementace. To je doložené veřejné třídění, nikoli známá interní automatizace. **Class: primary-confirmed; confidence: high.** [S15](https://enshrouded.zendesk.com/hc/en-us/articles/16183409811741-Feedback-Suggestions), [S16](https://enshrouded.featureupvote.com/).

**C7 — Valheim.** S17 odděluje bugy, obecný feedback, known issues a překlady; iframe vede na forms.monday.com. S18 navíc určuje Discord #suggestions. Text FAQ již mluví o EA v minulosti; nástroj proto není označen jako současná EA vlastnost. Pole, nutnost účtu, přílohy, automatický capture, potvrzení a interní prioritizace zůstávají neznámé, protože formulář neposkytl extrahovatelný obsah. **Class: primary-confirmed; confidence: high pro kanály, unknown pro formulář.** [S17](https://www.valheimgame.com/support/), [S18](https://www.valheimgame.com/faq/).

## Registr zdrojů a datování

Pro **všechny** řádky: accessed=2026-10-20; class=primary-confirmed; confidence=high pro uvedený text. `pub_date=unknown` znamená, že datum vydání nebylo zjištěno; update není vydáván za původní publikaci. Číselné S odkazy výše identifikují přesnou URL.

| ID | Publisher / artefakt | pub_date; update, pokud uveden |
|---|---|---|
| S1 | Unknown Worlds, Strayan/Obraxis; Steam Development Feedback | 2014-12-15; updated 2016-02-05 |
| S2 | Unknown Worlds; Seabases Released | 2015-03-13 |
| S3 | Unknown Worlds; veřejný Feedback Backend v2 | unknown |
| S4 | Subnautica 2 Help Center; bugy | unknown; updated 2026-04-16 |
| S5 | Subnautica 2 Help Center; Experimental reporty | unknown; updated 2026-08-12 |
| S6 | Unknown Worlds; EA Roadmap | 2026-05-15 |
| S7 | Unknown Worlds; oficiálně propojený Nolt board | unknown |
| S8 | Subnautica 2 Help Center; DX12 Launch Issues | unknown; updated 2026-05-16 |
| S9 | Obsidian Entertainment Support; Report an Issue | unknown; updated 2025-07-30 |
| S10 | Obsidian Entertainment; Community + kontaktní formulář | unknown |
| S11 | Obsidian Entertainment; Grounded 2 Issue Tracker | unknown |
| S12 | Obsidian Entertainment; Public Test 0.3.0 | 2026-01-12 |
| S13 | Keen Games / Enshrouded support; Reporting Bugs | unknown; updated 2025-03-21 |
| S14 | Keen Games / Enshrouded; bug formulář Zendesk | unknown |
| S15 | Keen Games / Enshrouded; Feedback & Suggestions | unknown; updated 2024-01-19 |
| S16 | Keen Games / Enshrouded; Feature Upvote board | unknown |
| S17 | Iron Gate; Support | unknown |
| S18 | Iron Gate; FAQ | unknown |

**Nezávislé ověření:** žádný claim není `independently-verified` ve smyslu praktického spuštění hry, vyvolání UI a úspěšného doručení reportu. Čtení oficiálních instrukcí a formulářů je potvrzení primárním zdrojem. Nebyl odeslán testovací ticket. GDC2019 Subnautica postmortem PDF na media.gdcvault.com bylo nalezeno, ale otevření selhalo; není důkazem žádného závěru. Generický HTML výstup Subnautica helpdesk formuláře obsahoval nesouvisející inZOI texty; nebyl použit k odvozování skutečných polí SN2.

## Důsledky pro vlastní krátký formulář — návrh, nikoli zjištěná vlastnost her

Podklady podporují nízké vstupní tření, ale nevyžadují jedinou složitou obrazovku. Vhodný kandidát je dostupné tlačítko v menu i shortcut, typ **Chyba / Nápad / Jiný feedback**, krátký text a náhled automaticky pořízeného snímku. U chyby lze nabídnout nepovinné kroky a očekávaný výsledek; verzi, čas, klientské prostředí a polohu doplnit strojově, pokud je vlastní implementace spolehlivě zná. Jde o syntézu C1–C6, ne důkaz optimální konverze nebo výkonu.

Automatické pořízení bez HUD a náhled k odebrání/potvrzení snímku jsou samostatné produktové volby. HUD-free může odstranit důležitý text chyby; doplňující text nebo volitelná příloha má tuto mezeru pokrýt. Odesílání přes server do Linear, deduplikační klíč, retry, ochrana před duplicitou a potvrzení přijetí nebyly u uvedených her technicky doloženy. Vlastní systém musí rozlišit přijetí serverem od skutečného vytvoření issue a hráči neslibovat opravu. Externí cesta dostupná bez spuštěné hry je silně podpořena C3 a C5. Veřejné hlasování a známé chyby mohou být pozdější rozšíření; nejsou podmínkou první krátké verze. Prakticky je nutné ověřit zachycený okamžik, vrácení HUD, selhání uploadu i následný stav ticketu.

# KEY-7: krátké potvrzení překročení latency budgetu

Rozhodnutí před implementací, 14. 10. 2026; základ main `7cc5a596a2c00ad497873e196bd0b16de1e4a245`. Koordinátor převzal read-only průzkum a nezávislé review. Tento celek řeší mechanismus A z [původní reprodukce](network-latency-recovery.md), nikoli příčinu původního zdržení callbacku nebo všechny síťové a grafické problémy.

## Důkaz a hranice znalostí

Skutečná probe měří celý monotónní request/reply interval včetně plánování úloh. Nepřítomnost longtask není důkaz čisté síťové latence. Nekontaminovaný jediný vzorek přes233,333ms dnes ihned zastaví výrobu ovládání až do dalšího vzorku. Původní reprodukce má87 waiting frames po533,6ms, i když skutečná queue dál přijímá authority. Již integrovaný fix B brání použití nepodporovaného RTT ke kalibraci epochy; dočasné čekání A zůstalo.

Primární podklady: [RFC5905 §10](https://www.rfc-editor.org/rfc/rfc5905.html#section-10) odděluje měření, výběr a stáří vzorků; [High Resolution Time](https://www.w3.org/TR/hr-time-3/#monotonic-clock) odlišuje monotónní elapsed čas od upravitelného wall clock. Ověřeno14.10.2026. Nejde o implementaci NTP a zdroje nepředepisují herní2500ms interval.

## Porovnané varianty

| Varianta | Dopad a rozhodnutí |
| --- | --- |
| Clamp RTT / vyšší future či replay limit | Skryje skutečně nepodporovanou síť nebo rozšíří serverový časový kontrakt; zamítnuto. |
| Medián/EWMA všech vzorků | Mění i podporované0–200ms a bez expirace může držet starou baseline; zbytečně široký první zásah. |
| Odečíst longtask / prohlásit RTT/2 za změřenou jednosměrnou latenci | Nedoložená kauzalita; zamítnuto. |
| Častější probe poll | Zkrátí timerový ocas, ne zabrání okamžitému stopu; mimo tento celek. |
| Potvrzení queue delivery feedbackem | Může dříve rozpoznat skutečné zhoršení, ale rozšiřuje authority kontrakt; další možnost, není nutná pro bounded první opravu. |
| Krátká hysterese pouze při prvním překročení delivery budgetu | Zvoleno. Podporované vzorky nemění, druhý high nebo pevná expirace ukončí nejistotu. |
| Hysterese v Probe | Přirozený connection lifetime, ale potřebuje novou propagaci expirace do planneru a sdílení budget hranice. |
| Hysterese v NetworkTimeline | Zvoleno: budget i expirace při skutečné práci na jednom místě. UI předá původní measurement timestamp a explicitně resetuje confidence při změně spojení. |

## Přesný kontrakt zvolené změny

- Pouze timestamped, přijatá podporovaná baseline mladá nejvýše3000ms dovoluje první high odložit o pevně2500ms od jeho measurement timestampu. Freshness se posuzuje při zahájení; baseline může během grace zestárnout až na5500ms. Je to omezený tradeoff, nikoli důkaz aktuální latency.
- Druhý strictly newer nekontaminovaný high se použije ihned; low se použije ihned. Duplicita/starší timestamp a invalidní argumenty stav nemění. Legacy volání bez timestampu se použije ihned a zruší confidence historii.
- Expirace se provede v advance, při platné přijaté authority a před zpracováním nového platného vzorku. Žádný timer a žádné prodlužování deadline. Snapshot je read-only.
- Lead i nová epochová clock kotva používají během grace tentýž effective baseline, nikdy nepotvrzené raw high. Bez této konzistence by supported symetrické200ms po nové epoše vyrobilo pouze pozdní inputy. Po potvrzení/expiraci high zůstává původní B guard a pending kalibrace.
- Reset výběru RTT při bind/leave/resetu probe zachová clock a command frontiers. Pending high se při resetu konzervativně použije a confidence se zruší; stejné id v novém spojení nesmí zdědit grace.
- Raw probe, contamination, nonce, cooldown1050ms, timeout, guest isolation, sender, protocol11, future16, lead12, replay32 a fixed60Hz se nemění. SDK adaptér předá vlastní monotónní now.

Skutečné skokové zhoršení300/500ms může během grace způsobit více late inputů/korekcí; z jediného vzorku jej nelze odlišit. Druhý vzorek nebo expirace toto riziko omezuje. Žádný slib FPS, pixelové kvality nebo podpory300/500ms.

## Ověření naplánované před změnou

Nejdříve red přes skutečné Probe/Timeline/Queue/Sender: warm34 a warm200, izolovaný533,6ms sample, nová epocha, následný low;15/60/144FPS. Potom cold/sustained300/500ms, expirace bez reply, timestamp hranice, legacy/lifecycle, skutečné UI callbacky a původní B testy beze změny. Cílené physics/replay/phase a typy. Plnou sadu/build/izolovanou SDK integraci provede koordinátor nad stabilním checkpointem.

### Upřesnění freshness po cadence review, před dokončením implementace

Koordinátor ověřil1s UI polling: low1ms přijde vt1; poll1000 ještě nemůže odeslat (cooldown1051); sendt2000 a raw533,6ms replyt2533,6 má baseline age2532,6ms. Původně navržených2500ms by neřešilo právě tento podporovaný rychlý transport. Freshness se proto mění na3000ms; grace zůstává2500ms. Odvození1050ms cooldown + až1000ms timer fáze + pozorovaný534ms spike potřebuje rezervu. Nejde o wire záruku. Přidáváme skutečný probe poll1s pro0/1/34ms a hranici freshness3000 inclusive/3000+epsilon.

## Výsledek cílené implementace

První skutečný red měl6/6 očekávaných assertion failures po samotném spike, stabilní kontroly uspěly. Finální stejné scénáře byly znovu spuštěny proti přesnému nezměněnému main planneru: opět6/6 red. V opravené variantě jsou6/6 green: raw533,6ms zachován,0 waiting,40–52 inputů přijatých během grace,0 ahead,0 late po epochovém zahřátí a přesně stejná kompletní queue/sender statistika jako bez spike. Jump se uplatní jednou v každé epoše.

Skutečné symetrické zhoršení300/500ms potvrzuje přiznaný náklad:86/98 late během přechodu, po druhé high odpovědi0 nových inputů; max depth6,0 ahead/overflow. Nejde o podporu takové latence. Původní B testy zůstaly beze změny. Cílená sada11 souborů včetně skutečné Rapier simulace, senderu, UI a phase:106/106 PASS. Narrow TypeScript0 diagnostik, diff check0. Nezávislý read-only security review bez blockeru. Původní logy, finální reprodukční source a manifest jsou v `.cache/key7-transient-latency/`; plná pipeline a skutečná SDK/server přejímka patří koordinátorovi.

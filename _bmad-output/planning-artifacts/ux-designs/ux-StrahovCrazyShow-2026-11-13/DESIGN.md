---
name: Strahov Crazy Show · Jantar ve hře
description: Vizuální návrh herního HUD a lidského multiplayerového chatu.
status: draft
updated: 2026-11-13
colors:
  ink: '#FFF3E4'
  muted: '#CFBFB2'
  amber: '#FFCF92'
  button-ink: '#49301D'
  panel: '#251B1A'
  recess: '#1A1414'
  line: '#A18370'
typography:
  title: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 24px, fontWeight: 800, lineHeight: 1.25 }
  message: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 15px, fontWeight: 500, lineHeight: 1.5 }
  author: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 15px, fontWeight: 800, lineHeight: 1.5 }
  metadata: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 12px, fontWeight: 700, lineHeight: 1.4 }
rounded: { sm: 8px, md: 14px, lg: 20px }
spacing: { inset: 24px, narrow-inset: 12px, gap: 12px }
components:
  chat-window: { backgroundColor: '{colors.panel}', textColor: '{colors.ink}', rounded: '{rounded.lg}' }
  chat-preview: { backgroundColor: '{colors.panel}', textColor: '{colors.ink}', rounded: '{rounded.md}' }
  send-button: { backgroundColor: '{colors.amber}', textColor: '{colors.button-ink}', rounded: '{rounded.sm}' }
---

# Jantar ve hře — návrh vzhledu

## Brand & Style

Úvodní stránka Jantar je vizuální předloha: krémová typografie, jantarový akcent, hnědé tmavé plochy a jemná světlá hrana. Zdroj barev, písma a charakteru povrchů: [welcome-screen.css](../../../../client/welcome-screen.css). Herní okna budou působit jako součást stejné hry. Původní herní mapa, ikony a význam stavů zůstávají rozpoznatelné. [Chování a stavy](EXPERIENCE.md) a tento návrh mají přednost před ilustrační [maketou](mockups/chat-hud.html).

[Náhled při hraní](mockups/desktop-closed.jpg) · [Odpověď na desktopu](mockups/desktop-reply.jpg) · [Odpověď na úzkém displeji](mockups/touch-reply.jpg)

## Colors

- `{colors.ink}` je text zpráv; `{colors.muted}` je čas, popis publika a kontext citace. Obojí musí zůstat čitelné. `{colors.amber}` vyznačuje aktivní kanál, ovládací fokus a hlavní akci. Aktivita a typ kanálu mají i textový štítek nebo tvar.
- Panel je na `{colors.panel}`; kompozice a citace se mohou zanořit do `{colors.recess}`. Náhled má vlastní teplé podložení, návrhově 88 % krytí barvy panelu, dialog 96 %. Průhlednost patří pod text. Obrysy ovládacích prvků mají v potřebných stavech kontrast nejméně 3:1; běžný text nejméně 4,5:1 proti skutečně složenému pozadí. [WCAG 2.2: minimální kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Typography

Stávající lokální Manrope, se systémovým fallbackem, bez nového externího fontu. Zprávy v `{typography.message}`, autoři tučně, časy menší a s tabulkovými číslicemi. Vlastní zpráva má štítek „Ty“, odkaz na odpověď má znak ↪ a odsazení. V seznamu přirozeně zalamovat jména, dlouhá slova i emoji. Ořez patří do krátkého náhledu, plný text do historie.

## Layout & Spacing

Vlevo nad minimapou je kotva náhledu, ne další pevný roh nad ovládáním. Desktop: cca 330–360 px, nejvýše tři nové řádky. V maketě při šířce do 760 px nebo výšce do 540 px přechází na odznak u launcheru; breakpoint ověřit se skutečným HUD a herními gesty. Dialog je uprostřed, max. cca 720 px, s pevnou hlavičkou a editorem a samostatně posuvným logem. Na úzkém displeji skoro celá obrazovka s bezpečnými okraji a s prostorem pro systémovou klávesnici. Rozměry jsou pracovní, platí až po kontrole se skutečnou scénou.

## Elevation & Depth

Při hraní jen stín a tónované pozadí. Otevřené okno může scénu lehce ztlumit. Neopakovat živý `backdrop-filter` z landing page nad pohyblivým 3D plátnem; na světlé scéně čitelnost řeší barva pod textem. Neanimovat výšku celého HUD při příchodu zpráv.

## Shapes

Menší ovladače mají `{rounded.sm}`, skupiny HUD `{rounded.md}`, dialog `{rounded.lg}`. Fokus má souvislou viditelnou hranu, aktivní kanál také viditelnou výplň a popisek.

## Components

| Prvek | Podoba |
| --- | --- |
| Přehled zpráv | „Chat · T“ a krátké řádky s označením kanálu, autorem a úryvkem. Celý náhled lze otevřít. Soukromé a událostní zprávy jen počtem u launcheru. |
| Otevřené okno | Hlavička „Chat na Strahově“, přepínače Celý Strahov / V okolí / Soukromé / Akce, pod nimi popis aktuálního publika. Crazy Typka je samostatně označený AI pohled. |
| Zpráva a odpověď | Autor a čas, vlastní text, dostupné „Odpovědět“. Jednořádková citace s autorem je vnořená nad textem odpovědi. Stejný princip v rozepsaném editoru s tlačítkem pro zrušení reference. |
| Zbytek HUD | Stejný tón ploch, Manrope, jantarové aktivní ovládání a jemná hrana nejprve na liště, horních stavových kartách a rámu minimapy; později mapa, nastavení a další okna. Zachovat mapovou kresbu, varování, herní ovladače a hierarchii údajů. |

## Do's and Don'ts

- Vyrenderovat den i noc, běžný provoz i nápor zpráv. Neschovávat čas, fokus a typ kanálu pouze průhledností nebo barvou.
- Znovu použít společné tokeny Jantaru. Přesnou paletu mapy a diagnostických stavů neměnit plošným přebarvením.

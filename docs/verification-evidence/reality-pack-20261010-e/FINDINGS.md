# Snapshot E: zachovaný neúspěšný validační běh

SHA `9111bbb2a4a8e40da075ce957601aa7d239ba82aa7b4277ca3187126208d1365`, 163 souborů. Testy skutečně běžely: **119 celkem, 118 PASS, 1 FAIL**. Neúspěšný test kontroloval přítomnost editovatelných Blender zdrojů B6. Zmrazovací skript kopíroval herní exporty `public`, ale vynechal `assets` se soubory `.blend`; v hlavním projektu byly přítomné. Tento běh není vydávaný za kompletní PASS. Wrapper po chybě správně zastavil build a integraci.

Fyzikální kontroly v tomto běhu zahrnuly 1 026 venkovních bodů, opravené dveřní přístupy, skutečný výškový terén a stabilitu; jejich jednotlivé výsledky zůstávají v `tests.log`. Následující snapshot F obsahuje také celou složku `assets`, novou automatickou kvalitu a GPU diagnostiku. Má vlastní hash a musí projít vlastním celkovým během. E se dodatečně neupravuje ani nepřejmenovává na pozdější verzi.

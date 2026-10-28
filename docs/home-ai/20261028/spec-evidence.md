# Přejímací matice KEY-65

Výchozí kód/testy: `de6f87a2efbf8596bb03efae863e8d6763e22774`. Tento plán není tvrzením, že testy už prošly.

| Kontrakt | Důkaz před přijetím |
| --- | --- |
| Nové SH/SÚZ skutečně používá model | Provider capture obsahuje konkrétní nový chunk, instituci/verzi/locator; skutečný service vrátí povolenou citaci přijatelnou pro klienta |
| Aktuální proti archivu | Registry explicitně načítá jen current soubory; archived sentinel/ID se nikdy nedostane do evidence ani zdrojů odpovědi |
| Různé kontrolní termíny | Vypršení jednoho zdroje nevyřadí platné zdroje jiné instituce; future/invalid/review hranice se odmítnou |
| Právní účinnost | Hraniční okamžiky s +01:00 a +02:00, inclusive začátek/exclusive konec; neplatné dny nebo offsety nevzniknou rolováním Date.parse |
| Ochrana replay | Každý podklad předaný modelu tvoří interní závislost; i necitovaná expirovaná evidence zneplatní cached úspěch bez další platby |
| Ambiguity a návaznost | Kolejné × SH příspěvek, kancelář SH × SÚZ, konkrétní projekt → cena, novější USER téma, obecná neurčená platba |
| Vadná importovaná data | JSON/schema/hash/ID/host chyby uvnitř optional AI init, ne při top-level importu, hra zůstává funkční |
| Zachované veřejné rozhraní | Původní response/session/requestSeq validátory, explicitní nové source hosty, žádný přístup k lidským zprávám nebo profilům |

Data pracovníci přidávají 33 konkrétních source-grounded dotazů do sh/retrieval-cases.json a suz/retrieval-cases.json. Root navíc použije jiné formulace než implementační fixture, aby se neověřovalo pouze přesné znění přizpůsobené indexu. Při neúspěchu zachová vstup/výsledek a opraví příčinu, ne očekávání faktu.

## Nezávislé koordinační dotazy

- Kde si na Strahově vyvolám černobílý film?
- Jde použít 3D tiskárnu bez správce?
- Na mobilu se mi mění MAC adresa a Wi-Fi mě nepustí.
- Můžu jít do SHerny hned po odeslání rezervace?
- Potřebuji při převzetí pokoje občanku?
- Z pokoje teče voda, kam s havárií?
- Platí se kolejné za celý pokoj nebo za lůžko a den?
- Jak dlouho před odchodem z koleje podat výpověď?
- Jak se zaregistruju do Fotoateliéru? (současná informace o zrušení, žádné staré podmínky)
- Jak se platí? (bez instituce/služby upřesnit)
- Které kryptoměny koupit? (žádný vymyšlený SH/SÚZ podklad)

## Praktická kontrola

Po stabilním checkpointu nejvýše tři syntetická generování, serverový strop 3. Konverzace má ověřit první návštěvu Fotokomory, SÚZ kolejné a navazující cenu bez vymyšlené sazby. HTTP/klientské zdroje musí být skutečně použité. Kontrola po resetu nezpřístupní původní historii. Pouze vlastní rezervovaný proces, bez připojení do 3D hry; klíč načíst soukromě mimo Git bez výpisu.

Konečný záznam oddělí modelový výsledek, deterministic retrieval, celý build/SDK a CI. Všechny původní limity soukromí, moderace a absence runtime crawleru platí.

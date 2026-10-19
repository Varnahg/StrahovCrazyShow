# Administrativní příprava KEY-44

19. 10. 2026, vlastník `ci-01a155b2-admin`, samostatná worktree `ci-main-autonomous-pilot`, baseline `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`.

Výslovné zadání uživatele: CI, ochrana main, skutečná GitHub přejímka a jeden autonomní pilot s obnovou po selhání. V rezervaci `dev-coordination-maintenance` vznikly pouze tasky `ci-required-gates-20261019` a `ci-lfs-pilot-20261019`; existující tasky a cizí WIP se nepřebírají. Pilot zůstává blocked do přijetí CI. Administrativní rezervace se uvolní po validaci; implementace získá vlastní claim před rendererem.

Linear: https://linear.app/gigeconomy/issue/KEY-44

Následná administrativní příprava: přidán blocked task `ci-pilot-coordination-20261019`. Pilotní source task má oddělené soubory od koordinátora (spec/evidence/renderer); vzdálené ověřování patří koordinátorovi. Oba zůstávají blocked do skutečného přijetí CI. Toto nejsou spuštěné implementační rezervace.

Při pozdějším rozšíření source tasku o review regrese první administrativní claim odmítla nová rezervace `docker-01a155e8-admin`. Složený PowerShell příkaz bohužel nepřenesl nenulový exit do navazující operace; vlastní task JSON v izolované worktree byl rozšířen před opětovným claimem. Cizí soubor ani rezervace nebyly přepsány či odstraněny. Po zjištění se katalogové zápisy zastavily, po uvolnění slotu původním vlastníkem uspěl nový administrativní claim s doloženým převzetím jediné vlastní dirty task definice. Přesný rozsah a katalog byly znovu ověřeny. Navazující závislé rezervační operace se kontrolují jednotlivě, nikoli podle posledního exit code celé skupiny příkazů.

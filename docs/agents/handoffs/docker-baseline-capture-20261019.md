# Předání Docker baseline capture

- Vlastník docker-01a155e8-baseline, příjemce root. Izolovaná Docker worktree.
- Stejný dist z image cedc68a2965e9233c49cc51469505f07042738d19a8e244b7e8ccde351f6eb0e byl zkopírován do .cache/docker-20261019/container-dist a servírován vlastním NodePID21988 na127.0.0.1:8080. Browser dosáhl bootStage ready / lightPreparation complete / renderErrorCount0. Poté zavřen a vlastní server ukončen.
- Výchozí loopback diagnostika nečekaně vytvořila .cache/game-diagnostics/2b56e64a-0177-48be-9ca2-bf1201f56766.jsonl (syntetická testovací relace). Vlastnictví doloženo tímto předáním a samostatným taskem; původní task ji před spuštěním nezahrnoval. Raw log zůstává ignorovaný/lokální, nepublikuje se. Žádné cizí výstupy.
- HTML SHA obou serverů shodně3adf189175431de75442f7b734c73eba86dad8d724a7cbc73072243bc843bb2e. Celý dist byl přímo převzat z image. Následný Docker retry také dosáhl ready bez změny klienta; první cold timeout a souběžné druhé3D timeouty se zachovávají v hlavní evidenci.
- Nejde o výkonový A/B benchmark ani důkaz příčiny timeoutu. Port8080 patří validačnímu tasku, nyní bez tohoto procesu. Tento capture claim se uvolňuje po zápisu.

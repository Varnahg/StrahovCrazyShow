# Garment CPU optimalizace v main

Task `webgpu-garment-init-native-20261019`, owner `webgpu-01a15102-garment-init-native`. Root převzal od helperu a QA přesně2 soubory po dokončeném CPU/fullcheckpoint/Edge ověření.

- WT commit `089964296a6fc677ea41e83db3f6e602d6ca6bf5` → main `145cbe952d6bfa1a5b3d51852e7b637a7fb02ee3`.
- `client/avatar-garments.ts`:40173ae8…→068dc194…; pouze veřejné atomicMaterialsUpdate kolem původní ordered konfigurace nového materialu před vlastním cache/mesh publication. Cachehit/lifecycle/values/geometry beze změny.
- `tests/student-garment-init.test.ts`:a8817fe6…, běžná přenositelná2testová regrese actual Babylon foreignwrapper traversal a shared/lastrelease/renewal. Žádný env/QAloader/absolutní runtimepath.
- Actual CPU6presetů352→32 foreign traversals; konečné A/P data přesné. Clean0671474/1474 a combinedc291534/1534, oba pnpm build/fullTS/4isolatedintegration PASS. Independentreview[]. Actual Edgecombined6editorpresetů, denní postava, noční jízda a návrat do editoru bez errors/pending; přesná evidence v QA handoffu.
- GPU smoke38,4FPS/p9534,5/p99183,4/max303,2ms/6>=100ms/9newprograms. Není matched A/B a není přijetí FPS celé hry. Přínos tohoto commitu je omezení doložené CPU práce při vytváření oblečení; KEY31/32/default/migrace zůstávají otevřené.
- Promotion guard ověřil skutečný native claim, oba původní preimage a absenci testu, prázdné indexy, fullQA receipt a obrazy. Explicit staged allowlist jen2soubory;133 ostatních pracovních cest v rootu i main zachováno po byteSHA, výsledné stromy shodné/indexy prázdné. Root ani main Game/UI/render WIP přibalen nebyl.
- Žádný vlastní server/port tohoto native tasku neběží. Receipt `.cache/webgpu-garment-init-native-20261019/integration-receipt.json`; kopie je součástí QA evidence. Hrané snapshoty neměnné. Po předání lze claim uvolnit.

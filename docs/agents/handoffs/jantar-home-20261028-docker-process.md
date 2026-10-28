# Předání Docker ověření Jantaru

Task jantar-home-20261028-docker-process, owner jantar-docker-process-01a17fd8, port4281. Standardní `scripts/test-docker.mjs` běžel přímým Node, se souběžnou rezervací validation heavy/GPU a bez dalších3Dscén. Chromium je pouze v taskcache/browsers; neinstalovalo se do root node_modules. VeřejnýPlaywright download a jeho dokončení jsou vbrowser-install.log. Pro reprodukci se nastavuje PLAYWRIGHT_BROWSERS_PATH na tento soukromý prefix a STRAHOV_DOCKER_TEST_PORT=4281.

První f570 Docker01 prošel celým buildem, ale export/unpack vyčerpal C: a skončil timeoutem před browserem. Původní log je zachovaný. Obnova odstranila pouze byteově ověřené duplicitní nehrané assety failedcombined01, nikdy běžící4278/4280. Restart Docker Desktop uživatel výslovně schválil; force stop a Docker-only WSL restart obnovily engine. Žádný factory reset, ztráta Docker dat ani globální prune neproběhl.

Druhý f570 Docker02 skutečně otevřel UI a odhalil chybu testu: po otevření launcher visibility:hidden už role lookup nenajde atribut. Oprava0d957a1b zachovala kliknutí i očekávané hodnoty; čtení aria-expanded přes DOM, hidden-node RED→GREEN4/4,49/49UI a scoped tsc PASS. Source review bez nových nálezů.

Třetí celý standardní Docker03 na0d957a1ba0f53baeeef894b13791da857663d6fe PASS/exit0. Log0d957a1b-docker-03.log potvrzuje popup close/Escape/focus/draft/pending/citace s lokálním fakeAI, skutečný profil/nativeeditor/nickname/admission, HTTP/assets/cache/guest/diagnostics/two clients, celou herní SDK integraci, SIGTERM obou klientů a restart identity. Jde o softwarový browser kontrakt, nikoli GTX/FPS důkaz. Žádné placenéAI volání.

Own composeprojekt63464-1793208737045, kontejner, síť a namedvolume jsou odstraněné; dodatečné labeldotazy byly prázdné. Všechny vlastní testovací/install/start helpery skončily a4281 nemá vlastní službu. Docker Desktop zůstává jako uživatelská aplikace v obnoveném stavu. Po předání se portová rezervace uvolní. Celý výsledný runtime/test obsah publikace je po vyřazení diagnostické odbočky opět shodný s0d.

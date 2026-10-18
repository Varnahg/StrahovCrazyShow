# Předání neměnného buildu4199

Vlastník webgpu-image-processing-user-build-01a14497; příjemce uživatel/root.

# Nový neměnný build4199

URL: http://127.0.0.1:4199/?renderBackend=webgpu. Source3d405db9a4430e266bf390f1e029d46c6d71ddc64b77a5118ae146f4adedc82f, vlastní API2594. Obsahuje integrovanou opravu main6a7f7554 a dřívější authored/IBL/FAR opravy. Původní4198 a starší buildy nebyly upravené.

598 zdrojových/testových souborů a17 dist kódových souborů jsou znovu hashově ověřené. Dist a node_modules jsou neměnné readonly odkazy na dokončený combined checkpoint; tento checkpoint se po předání nesmí znovu buildovat. Vlastní server a produkční preview běží skrytě, bez HMR, se skutečným počasím. Provozní PID a start identity zůstávají jen v lokální ignorované runtime evidenci. Claim tasku zůstává aktivní, dokud služby běží.

Předchozí native1446/combined1506 testů, oba buildy a izolované integrace PASS. Samostatná skutečná kontrolní jízda kombinované sestavy na QA4194 měla0 nových programů,0 modulů,2 sync pipeline;48,5FPS,p9527,4,p9934,8,max202,5ms a stále4 intervaly nad100ms. Low77%,CSS1528×650/internal1175×500,1avatar/0ambient,řízené noční podmínky,healthvalid. Tento výsledek se nesčítá s čistým A1/B1/A2 a není přejímka celé migrace.

Přímo na nové4199 proběhl skutečný vstup a obraz, následný zdravý renderer a návrat do menu. Session099d056e-ad58-44a2-8148-837197ca5b9b má1034 souvislých záznamů, ready seq455,dispose1017. Normální počasí/automatická kvalita, žádný profileEnvironment. Okno bylo během prostřední části neaktivní a automatická kvalita klesla; tento úsek není performance důkaz. Závěrečná kontrola po aktivaci okna má health valid/pending0/renderErrors0/assetErrors0, ale render764×325 a stání, takže se z ní nevyvozuje FPS pokrok proti jízdám1175×500. UI zůstává v menu s automatickou kvalitou; nový vstup vlastní nový Game lifecycle. Screenshot dokládá načtený svět a UI, nikoli přesnou pixelovou paritu.

Známé omezení: původní cílová plynulost není splněná, existují čtyři kratší záseky při přepnutí světel a pozdější mezery mimo callback. Následuje oddělení přípravy materiálů od bind/draw přes existující omezený profiler. KEY-31 a celý migrační cíl zůstávají otevřené.

Přesné vlastní soubory: lokální .cache/webgpu-image-processing-user-build-20261018/ včetně snapshotu, čtyř service skriptů, build identity a smoke evidence; tento handoff. Živé PID nejsou verzované. Služby nebyly ukončené a claim se neuvolňuje. Hrané4198 a starší zdroje/dist/deps beze změny.

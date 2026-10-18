# Nativní přenos přípravy fotografické trávy

Task webgpu-grass-preparation-native-20261018, vlastník webgpu-grass-preparation-native-01a14497-child. Přeneseno přesně pět přidělených souborů byte-exact z reviewed candidate-v2, manifest71529a57b2528cd584dce1307406fe822ccf4cd83fa74e515a2fc879fc695034. Tři existující preimages odpovídaly V2; dva soubory byly nové. Preimages uchovány v task cache, SHA uvedeny v manifest.json/transfer.json. Game.ts zůstává výhradně rootovi.

Průzkum/volba/refaktoring jsou stejné jako ve V2: jeden retained disabled FAR owner, unique Geometry před buffer flush, fade0 a vlastní wind; sdílený idempotentní cleanup před resources.release, generační stop callback, žádné per-frame výpočty ani nové cache/refcount zásahy. Native přenos nepřidává jinou funkci, světla, etapy ani timeout. Helper a lifecycle delta znovu přečteny, bez další nutné změny.

Aktuální WT nemá funkční core node_modules. Lehké ověření proto běželo nad91 skutečnými native source/test/asset soubory v izolované validation kopii s readonly dependencies V2: owner7/7 PASS (3,358s), související grass5/5 PASS (1,888s), žádné skipy. Vstupy a dependency realpath jsou v validation-inputs.json; logy/receipts owner a grass-related. Game test pouze přenesen; jeho aktuální Game wiring a full clean/combined TS/build/test/integration ověřuje root. Žádný install/fullTS/build/fullsuite/GPU/server dítěte. NullEngine CPU thin/capability a syntetické TextureIO jsou nadále přiznané limity, nikoli nový GPU důkaz.

Cizí WIP, primary a hrané buildy beze změny. Nebyl proveden staging ani commit. Vlastní procesy skončily; rezervace se po předání uvolní. GPU A/B/A a skutečné přijetí/integrační commit patří rootovi; celek KEY-31 zůstává otevřený.

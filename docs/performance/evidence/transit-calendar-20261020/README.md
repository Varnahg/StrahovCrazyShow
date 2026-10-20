# KEY-53: úklid poolu dopravních NPC

Malý runtime kandidát vychází z [průzkumu](research/selection.md) a [rozhodnutí](research/decision.md). Pracovní název adresáře zůstal z původně zvažované kalendářní cache; implementační scope je pouze dopravní renderer a jeho lifecycle test.

Stav20.10.2026: zadání připravené, runtime dosud nezměněný. Podpůrný KEY-54 zavádí pravdivou externí přejímku řadiče. Před prvním run musí být integrován a zelený. Potom řadič KEY-53 vyžádá úplné před/po důkazy a receipt pro přesné identity kandidáta.

[Měřicí postup](measurement/README.md) používá skutečnou produkční hru, HUD, tři multiplayerové relace a dvanáct NPC. [První preflight](measurement/preflight-20261020.json) ověřil průchod CPU i plain sérií na původním ba91b84c snapshotu; není finální baseline ani tvrzení o zrychlení. Úplné raw soubory jsou zachované v uvedené lokální kampani s hashy. Před ostrým A/B se zmrazí nová společná dvojice zdrojů po souběžné integraci feedbacku a KEY-54.

Finální baseline.json, candidate.json a comparison.json zatím neexistují. Parent KEY-5 zůstává otevřený.

# Předání krátkého CPU OCR/layout okna

Owner `rag-auto-validation-01a17e9d`; task `rag-auto-20261028-extraction-validation`. Okno poskytl Jantar koordinátor a bylo skutečně claimnuto před CPU extras/prefetch. Veškeré zápisy workeru, modelů a venv prováděl jejich jediný vlastník `rag-auto-extractor-01a17e9d` ve svém prefixu. Root zde rezervoval společný prostředek a evidoval výsledek.

Izolovaný CPU profil: torch2.9.1+cpu, torchvision0.24.1+cpu, docling-ibm-models4.0.4, EasyOCR1.7.2. Předstaženo přesně7 modelových souborů,482986627bajtů, manifest s SHA256. Layout revision `8f39ad3c0b4c58e9c2d2c84a38465abf757272d8`; konkrétní úplná manifestová evidence zůstává v extraktorově cache. Žádné implicitní CUDA/GPU, node_modules, DB, server nebo placené API.

Skutečný omezený probe: SÚZ screenshot PDF61.266s cold, smlouva6.547s warm;CPU/model1vlákno a parser1, timeout120s/dokument. Smlouva1/1strana,52bloků7362znaků. Screenshot1/1strana,29 OCR textových potomků pod PictureItem; výchozí průchod bez traverse_pictures by je přehlédl. RawJSON je uchoval.

Podstatné neúspěšné zjištění: OCR vynechal hodnotu21.10.2026 uvnitř červeně zvýrazněné oblasti a některé popisky rozdělil či ochudil. Proto výsledek screenshotu zůstává `review-required`, nikoli věrně dokončená automatická publikace. Obecný parserSUCCESS není dostačující quality gate. Původní logy/JSON/MD jsou zachované; neproběhla další široká modelová sada.

Extraktor po obou probách výslovně ověřil ukončení vlastních PID31876/42880 a absenci Python procesu s jeho cache prefixem. Žádná další inference se před novým oknem nespustí. Root nyní heavy-validation uvolňuje Jantaru; lehký vývoj a testy pokračují ve vlastních komponentových scopes. Tento dílčí probe není potvrzením úplného katalogu ani produkčního výkonu.

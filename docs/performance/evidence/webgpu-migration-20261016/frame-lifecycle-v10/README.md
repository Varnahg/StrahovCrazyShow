# Whole-frame diagnostics and active Edge startup control

Native-v10/ad2b39c (snapshot79d55c7b…) passes1173 tests, production build/TypeScript and isolated integration. Combined-v3 (31d0f023…) preserves30previous working overlays and passes1233 tests, build/TypeScript and integration. Clean native changes integrated separately into main ascd2e60b and8eb183d;544physical source/test files match the reviewed combined checkpoint. Foreign content remains uncommitted working changes. The private-index receipts contain exact source, preimage, output and tree identities; operational process PID records are deliberately excluded.

The first whole-frame measurements rule out a hidden synchronous one-second endFrame/encoder.finish in those runs. They do not identify the cause of host scheduling gaps. Privacy delivery uses the technical `timing` field; profiler Promise semantics are unchanged and async completion is explicitly unobserved.

CUA browser management revealed that the old agent card was inactive even when document telemetry reported visible/focused. A fresh owned card was moved to its own focused Edge window through the documented management API. The active card was independently observed active/selectedtrue and frozenfalse before and after the subsequent runs. Its original source, shader bundle and readiness policy did not change.

| Run | Cover | Raw/engine callbacks | Engine CPU | Preparation wall | Result |
| --- | --- | ---: | ---: | ---: | --- |
| b50a667a… | Opaque A1 | 243 |7502.9ms|30033.1ms|timeout|
| a6340587… | Transparent B |134|5615.4ms|30054.3ms|timeout|
| 4a12fea3… | Opaque A2 |243|8176.7ms|30040.4ms|timeout|

The CSS intervention only changes `.loading` background to transparent. The same loading element still blocks input; readiness, assets and JavaScript are unchanged. The delivery log hashes original HTML, actually served HTML and injected CSS. The transparent scene was verified visually and with DOM computed styles. It did not remedy startup. Natural canvas was1514x644 in A1 and1514x643 in B/A2; asset/material populations were dynamic and idle preflight had insufficient samples. Therefore these are **startup diagnostic controls, not formal gameplay FPS or speedup evidence**. None reached game-ready. Inclusive/nested CPU measurements must not be summed.

Raw sessions and computed same-owner deltas are in `comparisons.json`; artifact-sha256.json records archived bytes. The earlier inactive sessions remain for provenance, not acceptance. Next work targets preparation variant/cache cost after primary-source research. Full visual matrix, successful startup and valid WebGL2/WebGPU comparisons are still required before default migration completion.

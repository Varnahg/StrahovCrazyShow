# Actual query/device-loss recovery

Neměnný source7 `67a5c959…`, build `b2821d01…`, helperv7 `f79bb85d…`, bez query. Samostatný fresh install a38native pinů jsou doložené vedle tohoto adresáře.

Dvě explicitní původní own GPUDevice.destroy akce zastavily skutečnou hru přes původní health/UI. Normální menu/editor/rejoin vytvořily nové zdravé renderer4 a6. Druhá ztráta je doložená skutečným device faultem seq1094 a existujícím canvas stavem restart-required/count4. Původní úplný uzavřený browserový log má2115záznamů a0unhandled-rejection; zdroj6 před opravou měl34. Celá health předchozího selhání ani fyzické odpojení adaptéru se nepředstírá.

První query-first ztráta naplnila pětimístný logovací limit Game; samostatná actual device Promise evidence z prvního pokusu chybí. Druhý pokus tuto mezeru přímo pokrývá. UI zachovává první správnou obecnou hlášku o zastaveném vykreslování.

Snapshoty a receipts se nesmějí zaměnit: call-only receipt má pre-loss state; zdravé snapshoty patří novým rendererům po úplné přípravě. Ve verification.json jsou identity, limity a SHA původních bajtů.

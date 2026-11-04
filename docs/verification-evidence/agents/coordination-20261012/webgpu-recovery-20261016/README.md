# Koordinační obnova pro WebGPU A/B

16. 10. 2026. Nové zadání uživatele: porovnat WebGL2/WebGPU na stejné produkční scéně a zachovat hraný frozen build.

Původní chat „Prozkoumej optimalizace grafiky“ (01a141c7-d77f-72c2-8709-5cb930572b0b) je notLoaded a poslední turn je interrupted, completedAt 1792107420. Read-only process inventory neobsahuje herní Node či Blender, porty 2568/2585/4190 ani 4188/2583 neposlouchají. IAB nemá otevřené karty; nativní inventář ukazuje Edge s PDF, Discord a Spotify, žádnou herní scénu.

Podle pravidla obnovy v docs/agents/README.md koordinátor uvolňuje pouze přerušené integration a validation rezervace. Nejde o převzetí práce podle stáří/PID: je doložený interrupted turn, nepřítomné služby a zachované dirty soubory. recovery.json obsahuje55 SHA256 původních dirty souborů, status a binary diff jsou uchované. Původní worktree, všechny její soubory a ostatní diary rezervace zůstávají beze změny. Úkoly nejsou označené Done.

Nový experiment běží výhradně v samostatné webgpu-comparison pracovní kopii na960cb6f, bez převzatého WIP. Frozen4188 runtimee1b03fe/snapshot4dcb3f6f a jeho serveclaim se nemění. Tento krok nespouští GPU ani netvrdí benchmark výsledek.

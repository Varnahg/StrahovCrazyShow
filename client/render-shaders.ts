// Register the built-in GLSL sources before material/plugin/shadow variants
// are created. A shader name must never fall through to Vite's HTML SPA route.
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";

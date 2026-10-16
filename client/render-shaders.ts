// Register the built-in GLSL sources before material/plugin/shadow variants
// are created. A shader name must never fall through to Vite's HTML SPA route.
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";

// ShadowDepthWrapper keeps the base material's language. A WebGPU generator
// lazily loads WGSL sources even when a wrapped wind/alpha material uses GLSL.
// Register both include sets before any wrapper; no global shader mode changes.
import "@babylonjs/core/Shaders/ShadersInclude/shadowMapVertexExtraDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/shadowMapVertexNormalBias";
import "@babylonjs/core/Shaders/ShadersInclude/shadowMapVertexMetric";
import "@babylonjs/core/Shaders/ShadersInclude/shadowMapFragmentExtraDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/shadowMapFragmentSoftTransparentShadow";
import "@babylonjs/core/Shaders/ShadersInclude/shadowMapFragment";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapVertexExtraDeclaration";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapVertexNormalBias";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapVertexMetric";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapFragmentExtraDeclaration";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapFragmentSoftTransparentShadow";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapFragment";

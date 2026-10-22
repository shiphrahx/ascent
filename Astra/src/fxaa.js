// FXAA expects display-referred color, after OutputPass. MSAA handles geometry
// coverage separately, preserving fine surface detail during camera movement.
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
// These buffers have no mip chain. Explicit LOD avoids undefined derivatives in
// divergent edge-search loops on ANGLE / D3D11 drivers.
// Intermediate alpha carries reactivity and temporal depth, not transparency.
// Three creates an alpha-enabled WebGL context even for alpha:false renderers;
// explicitly make the final canvas opaque so browser compositing cannot tint it.
export const AntiAlias={...FXAAShader,fragmentShader:FXAAShader.fragmentShader.replace('return texture( tex2D, uv );','return textureLod( tex2D, uv, 0.0 );').replace(/if \( ShouldSkipPixel\( luminance \) \) \{[\s\S]*?float pixelBlend =/, 'if ( !ShouldSkipPixel( luminance ) ) {\nfloat pixelBlend =').replace('return Sample( tex2D, uv );\n\n\t\t}', '}\nreturn Sample( tex2D, uv );\n\n\t\t}').replace('gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );','gl_FragColor = vec4( ApplyFXAA( tDiffuse, resolution.xy, vUv ).rgb, 1.0 );')};

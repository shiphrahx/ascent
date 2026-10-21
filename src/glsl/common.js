// Shared GLSL: uniforms, noise, terrain sampling, shadows, lighting and aerial perspective.

export const DECL = /* glsl */`
uniform float uTime, uTAAFrame;
uniform vec3 uSunDir, uMoonDir, uKeyDir;
uniform vec3 uKeyColor, uSunColor, uSkyAmb, uGroundAmb;
uniform float uKeyElev, uKeyIsSun;
uniform sampler2D uSkyLUT, uAmbCube;
uniform float uHaze, uSnow, uFrost, uWet, uStorm, uNight, uCloud;
uniform vec2 uWindDir, uGustOffset;
uniform float uWindStrength;
uniform sampler2D uShadow0, uShadow1, uShadow2;
uniform mat4 uShadowM0, uShadowM1, uShadowM2;
uniform vec2 uShadowTexel;
uniform vec3 uShadowK, uShadowWT;
uniform sampler2D uTerrShadow, uTerrShadowOuter;
uniform highp sampler2D uHeightCore, uHeightOuter;
uniform sampler2D uNormCore, uNormOuter, uAttrCore;
uniform vec4 uCoreBounds, uOuterBounds;
uniform sampler2D uNoise2D;
uniform highp sampler3D uNoise3D;
uniform vec2 uCloudOffset;
uniform float uCloudBase, uCloudTop;
uniform float uGlowComp;
uniform float uClipY, uDipK, uExposure, uPillars, uDiamond, uSunDogs, uMoonVis, uSunVis;
`;

export const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec4 n2(vec2 uv){ return texture(uNoise2D, uv); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z); }
float fbmTex(vec2 p){ return n2(p).r; }
float sat(float x){ return clamp(x, 0., 1.); }
vec3 sat3(vec3 x){ return clamp(x, 0., 1.); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const TERRAIN = /* glsl */`
float bilinearH(highp sampler2D t, vec2 uv){
  ivec2 sz = textureSize(t, 0);
  vec2 p = uv * vec2(sz) - 0.5;
  vec2 f = fract(p);
  ivec2 i = ivec2(floor(p));
  ivec2 mx = sz - 1;
  float a = texelFetch(t, clamp(i, ivec2(0), mx), 0).r;
  float b = texelFetch(t, clamp(i + ivec2(1,0), ivec2(0), mx), 0).r;
  float c = texelFetch(t, clamp(i + ivec2(0,1), ivec2(0), mx), 0).r;
  float d = texelFetch(t, clamp(i + ivec2(1,1), ivec2(0), mx), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec2 coreUV(vec2 xz){ return (xz - uCoreBounds.xy) / uCoreBounds.zw; }
vec2 outerUV(vec2 xz){ return (xz - uOuterBounds.xy) / uOuterBounds.zw; }
float coreMask(vec2 xz){ vec2 uv = coreUV(xz); vec2 e = min(uv, 1. - uv) * uCoreBounds.zw; return sat(min(e.x, e.y) / 40.); }
float heightAt(vec2 xz){
  float m = coreMask(xz);
  float ho = bilinearH(uHeightOuter, outerUV(xz));
  if (m <= 0.) return ho;
  float hc = bilinearH(uHeightCore, coreUV(xz));
  return mix(ho, hc, m);
}
vec3 normalAt(vec2 xz){
  float m = coreMask(xz);
  vec3 no = texture(uNormOuter, outerUV(xz)).xyz * 2. - 1.;
  if (m <= 0.) return normalize(no);
  vec3 nc = texture(uNormCore, coreUV(xz)).xyz * 2. - 1.;
  return normalize(mix(no, nc, m));
}
vec4 attrAt(vec2 xz){ return coreMask(xz) > 0. ? texture(uAttrCore, coreUV(xz)) : vec4(0); }
`;

export const SHADOW = /* glsl */`
float keyHorizon(vec3 P){
  // points higher up see the low sun earlier: horizon dip, exaggerated for the drama
  float dip = uDipK * sqrt(max(P.y + 20., 0.));
  return smoothstep(-0.004, 0.012, uKeyElev + dip);
}
float terrainShadow(vec3 P){
  float m = coreMask(P.xz);
  float hc = texture(uTerrShadow, coreUV(P.xz)).r;
  float ho = texture(uTerrShadowOuter, outerUV(P.xz)).r;
  float r = m > 0.5 ? smoothstep(hc - 3.0, hc + 0.5, P.y) : smoothstep(ho - 90., ho + 10., P.y);
  return r;
}
// cheaper single-tap version for volumetrics and particles
float cascadeShadowFast(vec3 P){
  float r = 1.;
  vec3 c = (uShadowM1 * vec4(P, 1.)).xyz * 0.5 + 0.5;
  if (all(greaterThan(c.xy, vec2(0.003))) && all(lessThan(c.xy, vec2(0.997))) && c.z < 1.) {
    r = step(c.z - uShadowK.y * 1.5, textureLod(uShadow1, c.xy, 0.).r);
  } else {
    c = (uShadowM2 * vec4(P, 1.)).xyz * 0.5 + 0.5;
    if (all(greaterThan(c.xy, vec2(0.003))) && all(lessThan(c.xy, vec2(0.997))) && c.z < 1.) r = step(c.z - uShadowK.z * 4., textureLod(uShadow2, c.xy, 0.).r);
  }
  return r;
}
float cloudDensity2D(vec2 xz){
  vec2 uv = (xz + uCloudOffset) / 12000.;
  float a = textureLod(uNoise2D, uv, 0.).r;
  float b = textureLod(uNoise2D, uv * 3.1 + 0.3, 0.).g;
  float A = (a * 0.7 + b * 0.3 - 0.5) * 2.6;
  return sat(uCloud + A * 0.55);
}
float cloudShadow(vec3 P){
  float t = (uCloudBase + 300. - P.y) / max(uKeyDir.y, 0.08);
  vec2 q = P.xz + uKeyDir.xz * t;
  float d = cloudDensity2D(q);
  return 1. - sat(d * 1.6) * mix(0.75, 0.25, uStorm);
}
`;

export const LIGHT = /* glsl */`
vec3 skyLut(vec3 d){
  float az = atan(d.x, -d.z); if (az < 0.) az += 6.2831853;
  float el = max(d.y, 0.0);
  float v = sqrt(asin(min(el, 1.)) / 1.5707963);
  return texture(uSkyLUT, vec2(az / 6.2831853, v)).rgb;
}
vec3 ambCube(vec3 n){
  vec3 n2 = n * n;
  vec3 x = texelFetch(uAmbCube, ivec2(n.x > 0. ? 0 : 1, 0), 0).rgb;
  vec3 y = texelFetch(uAmbCube, ivec2(n.y > 0. ? 2 : 3, 0), 0).rgb;
  vec3 z = texelFetch(uAmbCube, ivec2(n.z > 0. ? 4 : 5, 0), 0).rgb;
  return x * n2.x + y * n2.y + z * n2.z;
}
float hgPhase(float c, float g){ float g2 = g*g; return (1. - g2) / (12.566 * pow(1. + g2 - 2.*g*c, 1.5)); }

// Aerial perspective: exponential height haze lit by the sky in the view direction.
vec3 applyHaze(vec3 col, vec3 P){
  vec3 C = cameraPosition;
  vec3 dv = P - C;
  float dist = length(dv);
  vec3 dir = dv / max(dist, 1e-3);
  float H = 1500.;
  float rho0 = uHaze / 32000.;
  float k = dv.y / H;
  float f = abs(k) > 1e-3 ? (1. - exp(-k)) / k : 1.;
  float od = rho0 * exp(-(C.y + 40.) / H) * dist * f;
  float T = exp(-od);
  vec3 sky = skyLut(normalize(vec3(dir.x, max(dir.y, 0.015) , dir.z)));
  float mie = hgPhase(dot(dir, uKeyDir), 0.72) * 6.0;
  vec3 ins = sky * 0.95 + uKeyColor * mie * 0.06 * keyHorizon(P);
  ins = mix(ins, vec3(luma(ins)) * vec3(0.94, 0.98, 1.04), uStorm * 0.6);
  return col * T + ins * (1. - T);
}

struct Surf { vec3 albedo; vec3 N; float rough; float spec; float ao; float wrap; float sss; };

vec3 shadeSurf(Surf s, vec3 P, vec3 V, float shadow){
  vec3 L = uKeyDir;
  float ndl = dot(s.N, L);
  float diff = max(0., (ndl + s.wrap) / (1. + s.wrap));
  vec3 key = uKeyColor * diff * shadow;
  // translucency / subsurface through thin things lit from behind
  key += uKeyColor * s.sss * pow(sat(dot(-V, L)), 3.) * (0.35 + 0.65 * shadow) * 0.6;
  vec3 amb = ambCube(s.N);
  vec3 col = s.albedo * (key + amb * s.ao);
  // specular
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(s.N, H), 0.), mix(8., 180., 1. - s.rough)) * (1. - s.rough) * s.spec;
  float fres = pow(1. - max(dot(s.N, V), 0.), 5.);
  col += uKeyColor * sp * shadow * (0.3 + fres);
  // painterly rim light along silhouettes facing the key
  float rim = pow(1. - max(dot(s.N, V), 0.), 4.) * sat(dot(-V, L) * 0.6 + 0.4);
  col += uKeyColor * rim * 0.22 * (0.4 + 0.6 * shadow) * mix(vec3(1), s.albedo * 1.8, 0.5);
  return col;
}
`;

export const SHADOW_F = /* glsl */`
const vec2 POISSON[8] = vec2[8](vec2(-0.613,0.617), vec2(0.170,-0.040), vec2(-0.299,-0.791), vec2(0.645,0.493),
  vec2(-0.651,-0.088), vec2(0.421,-0.665), vec2(-0.069,0.997), vec2(0.962,-0.194));
float sampleCascade(sampler2D map, mat4 m, vec3 P, float bias, float radius, float rot){
  vec4 sc = m * vec4(P, 1.);
  vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
  if (c.x < 0.002 || c.x > 0.998 || c.y < 0.002 || c.y > 0.998 || c.z > 1.) return -1.;
  float s = 0.;
  float cr = cos(rot), sr = sin(rot);
  mat2 R = mat2(cr, sr, -sr, cr);
  for (int i = 0; i < 8; i++) {
    vec2 o = R * POISSON[i] * radius * uShadowTexel;
    float d = texture(map, c.xy + o).r;
    s += step(c.z - bias, d);
  }
  return s / 8.;
}
float cascadeShadow(vec3 P, vec3 N){
  // rotates every frame so the temporal pass averages the pattern away
  float rot = ign(gl_FragCoord.xy + 5.588238 * uTAAFrame) * 6.283;
  float ndl = abs(dot(N, uKeyDir));
  float sb = 1.0 + 2.5 * (1. - ndl);
  float s0 = sampleCascade(uShadow0, uShadowM0, P + N * uShadowWT.x * 1.5, uShadowK.x * uShadowWT.x * sb, 1.8, rot);
  if (s0 >= 0.) return s0;
  float s1 = sampleCascade(uShadow1, uShadowM1, P + N * uShadowWT.y * 1.5, uShadowK.y * uShadowWT.y * sb, 1.4, rot);
  if (s1 >= 0.) return s1;
  float s2 = sampleCascade(uShadow2, uShadowM2, P + N * uShadowWT.z * 1.0, uShadowK.z * uShadowWT.z * sb, 1.2, rot);
  if (s2 >= 0.) return s2;
  return 1.;
}
float keyShadow(vec3 P, vec3 N){
  return keyHorizon(P) * min(terrainShadow(P), cascadeShadow(P, N)) * cloudShadow(P);
}
`;

// Fragment-only surface relief: weathered tuff in metres, triplanar so cliffs and flats both get
// it, stretched up and down so steep faces read as rills. Each octave fades out before it
// shrinks to a few pixels, so the detail never sparkles. px is the world size of one pixel.
export const RELIEF = /* glsl */`
float tuffRelief(vec3 P, vec3 N, float px, out float cav){
  vec3 w = pow(abs(N), vec3(4.)); w /= (w.x + w.y + w.z);
  float h = 0.; cav = 0.;
  const vec4 S = vec4(24., 7.5, 2.3, 0.7);
  for (int i = 0; i < 4; i++) {
    float s = S[i], o = float(i) * 0.37;
    float f = 1. - smoothstep(0.05, 0.22, px / s);
    vec4 a = texture(uNoise2D, vec2(P.z, P.y * 0.45) / s + o) * w.x
           + texture(uNoise2D, P.xz / s + o) * w.y
           + texture(uNoise2D, vec2(P.x, P.y * 0.45) / s + o) * w.z;
    // fbm for the body, worley cells for the pocked surface
    h += (a.r - 0.5 - a.b * a.b * 0.3) * s * 0.07 * f;
    cav += (0.5 - a.b) * f * 0.3;
  }
  return h;
}
// bump from a scalar height via screen derivatives (Mikkelsen's surface gradient)
vec3 bumpNormal(vec3 N, vec3 P, float h){
  vec3 dpdx = dFdx(P), dpdy = dFdy(P);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * N - g);
}
`;

export const VCOMMON = DECL + NOISE + TERRAIN + SHADOW + LIGHT;
export const COMMON = VCOMMON + SHADOW_F + RELIEF;

// Wind field shared with JS (see world/wind.js). Ground layer only in shaders.
export const WIND = /* glsl */`
float gustAt(vec2 xz){
  vec2 uv = (xz - uGustOffset) / 420.;
  float g = texture(uNoise2D, uv).r * 0.7 + texture(uNoise2D, uv * 2.7 + 0.37).g * 0.3;
  return smoothstep(0.38, 0.8, g);
}
vec2 windAt(vec2 xz){
  return uWindDir * uWindStrength * (0.55 + 1.1 * gustAt(xz));
}
`;

export const ROCK = /* glsl */`
// banded volcanic tuff: cream, ochre, rose, rust, with thin dark ash seams
vec3 tuffColor(float y, float rose, vec2 xz, float var){
  float w = y + 6. * texture(uNoise2D, xz / 900.).r + 2.5 * texture(uNoise2D, xz / 140.).g;
  float b = w / 9.5;
  float band = fract(b);
  float id = floor(b);
  float r = hash12(vec2(id, 3.7));
  vec3 cream = vec3(0.76, 0.66, 0.52);
  vec3 ochre = vec3(0.74, 0.52, 0.31);
  vec3 roseC = vec3(0.78, 0.51, 0.44);
  vec3 rust  = vec3(0.60, 0.35, 0.22);
  vec3 c = r < 0.4 ? cream : (r < 0.62 ? ochre : (r < 0.85 ? mix(cream, roseC, 0.6) : rust));
  vec3 nextc = hash12(vec2(id + 1., 3.7)) < 0.5 ? cream : ochre;
  c = mix(c, nextc, smoothstep(0.82, 1.0, band) * 0.5);
  // thin dark ash seams between layers
  c *= 1. - 0.28 * smoothstep(0.035, 0.0, abs(band - 0.06)) * step(0.55, hash12(vec2(id, 9.1)));
  // rose valley: the whole stack shifts to pink and salmon
  vec3 pinkStack = mix(vec3(0.82, 0.53, 0.48), vec3(0.70, 0.38, 0.34), smoothstep(0.3, 0.9, r));
  pinkStack = mix(pinkStack, vec3(0.84, 0.70, 0.60), step(0.8, r));
  c = mix(c, pinkStack, rose);
  c *= 0.9 + 0.2 * var;
  return c;
}
`;

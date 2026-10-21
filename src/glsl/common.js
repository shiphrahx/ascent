// Shared GLSL: uniforms, noise, terrain sampling, shadows, lighting and aerial perspective.

export const DECL = /* glsl */`
uniform float uTime, uTAAFrame;
uniform vec3 uSunDir, uMoonDir, uKeyDir;
uniform vec3 uKeyColor, uSunColor, uSkyAmb, uGroundAmb;
uniform float uKeyElev, uKeyIsSun;
uniform sampler2D uSkyLUT;
uniform vec3 uAmb[6];
uniform float uHaze, uSnow, uFrost, uWet, uStorm, uNight, uCloud;
uniform vec2 uWindDir, uGustOffset;
uniform float uWindStrength;
// uShadow0 holds the basket cascade on its left half and the balloon cascade on its right
uniform sampler2D uShadow0, uShadow1, uShadow2;
uniform mat4 uShadowM0, uShadowM1, uShadowM2, uShadowM3;
uniform vec4 uShadowK, uShadowWT;
uniform vec2 uShadowSplit;
uniform float uShadowHQ;
uniform vec3 uShadowEye;
uniform sampler2D uTerrShadow, uTerrShadowOuter;
uniform float uTerrBlend;
uniform highp sampler2D uHeightCore, uHeightOuter;
uniform sampler2D uNormCore, uNormOuter, uAttrCore, uTerrAO, uBounce;
uniform vec4 uCoreBounds, uOuterBounds;
uniform sampler2D uNoise2D;
uniform highp sampler3D uNoise3D;
uniform vec2 uCloudOffset;
uniform float uCloudBase, uCloudTop;
uniform float uGlowComp, uDbgShadow, uSkyVis, uBounceOn;
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
// lit nudges the edge that many metres toward lit. The penumbra widens with distance to the ridge
// that casts it, about as fast as the sun's disc would spread it.
float terrainShadowAt(vec3 P, float lit){
  // one exit: the D3D compiler warns about the early return otherwise
  vec4 t = texture(uTerrShadow, coreUV(P.xz));
  vec2 s = mix(t.ba, t.rg, uTerrBlend);
  float w = 0.6 + s.y * 0.005;
  float ho = texture(uTerrShadowOuter, outerUV(P.xz)).r;
  return coreMask(P.xz) > 0.5 ? smoothstep(s.x - lit - w, s.x - lit + w, P.y) : smoothstep(ho - 90., ho + 10., P.y);
}
float terrainShadow(vec3 P){ return terrainShadowAt(P, 0.); }
float terrainShadowSoft(vec3 P){ return terrainShadowAt(P, 1.5); }
// cheaper single-tap version for volumetrics and particles: the first slice that holds the point
// atl: x scale and offset of this cascade's square within its texture (the atlas holds two)
float tapCascade(sampler2D map, mat4 m, vec3 P, float bias, vec2 atl, out bool inside){
  vec3 c = (m * vec4(P, 1.)).xyz * 0.5 + 0.5;
  inside = all(greaterThan(c.xy, vec2(0.003))) && all(lessThan(c.xy, vec2(0.997))) && c.z < 1.;
  return inside ? step(c.z - bias, textureLod(map, vec2(c.x * atl.x + atl.y, c.y), 0.).r) : 1.;
}
float cascadeShadowFast(vec3 P){
  bool in1, in2 = false, in3;
  float r = tapCascade(uShadow1, uShadowM1, P, uShadowK.y * 1.5, vec2(1, 0), in1);
  if (!in1 && uShadowSplit.y > 0.) r = tapCascade(uShadow2, uShadowM2, P, uShadowK.z * 2., vec2(1, 0), in2);
  if (!in1 && !in2) r = tapCascade(uShadow0, uShadowM3, P, uShadowK.w * 4., vec2(0.5, 0.5), in3);
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
  vec3 x = n.x > 0. ? uAmb[0] : uAmb[1];
  vec3 y = n.y > 0. ? uAmb[2] : uAmb[3];
  vec3 z = n.z > 0. ? uAmb[4] : uAmb[5];
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

// Physically based shading in the shape UE uses: Lambert diffuse, GGX specular with height-correlated
// Smith visibility and Schlick Fresnel for the key light; the sky as diffuse irradiance plus a
// roughness-blurred reflection weighted by the split-sum Fresnel. uKeyColor is irradiance (pi * L),
// so the 1/pi of Lambert and the pi of the light cancel.
// wrap: only thin, translucent things (leaves, grass, fabric) keep a little wrap-around light.
vec3 envSpecular(vec3 R, float rough){
  // sky above the horizon, a dim ground-tinted bounce below it, blurring toward irradiance as it roughens
  vec3 sky = skyLut(normalize(vec3(R.x, max(R.y, 0.02), R.z)));
  vec3 below = ambCube(vec3(0., -1., 0.)) * 1.2;
  vec3 sharp = mix(below, sky, smoothstep(-0.12, 0.05, R.y));
  return mix(sharp, ambCube(R), smoothstep(0.15, 0.85, rough));
}
// Valley-scale sky visibility (a) and the lean of the bent normal (rgb) from terrain/terrainAO.js.
// It belongs to the ground, so it fades out over the first 40 m above it: a chimney's foot sits in
// the canyon's shade, its cap mostly doesn't.
// gHag is the height above the ground when the material knows it (the ground itself: 0), so the
// lookups can skip the height fetch; below zero means work it out.
float gHag = -1.;
float hagAt(vec3 P){ return gHag >= 0. ? gHag : (uSkyVis + uBounceOn > 0.5 ? P.y - heightAt(P.xz) : 1e4); }
vec4 skyVisAt(vec3 P, float hag){
  vec4 r = vec4(0., 0., 0., 1.);
  if (uSkyVis > 0.5) {
    vec4 a = texture(uTerrAO, coreUV(P.xz));
    float k = coreMask(P.xz) * (1. - sat(hag / 40.));
    r = vec4((a.rgb * 2. - 1.) * k, mix(1., a.a, k));
  }
  return r;
}
// Light bounced off the ground (world/bounce.js), in ambient-cube units. The terrain that hides part
// of the sky sends its own light instead; and a surface facing down sees the ground right below it,
// blurrier the higher it is, in place of the ambient cube's one-size-fits-all ground.
vec3 groundBounce(vec3 P, vec3 n, float hag, float vis){
  vec3 r = vec3(0.);
  float m = coreMask(P.xz);
  if (uBounceOn > 0.5 && m > 0.) {
    vec2 uv = coreUV(P.xz);
    // the walls and floor that hide the sky can be a canyon's width away: half from 40 m, half 160 m
    r = (textureLod(uBounce, uv, 2.).rgb + textureLod(uBounce, uv, 4.).rgb) * 0.5 * (1. - vis);
    float d = max(-n.y, 0.);
    if (d > 0.) r += d * d * (textureLod(uBounce, uv, clamp(log2(max(hag, 4.) / 10.) + 1., 0., 6.)).rgb - uAmb[3]);
    r *= m;
  }
  return r;
}
// How much of a pixel is direct key light, for the screen-space pass that adds contact shadows and
// keeps SSAO off direct light (post/ao.js). Materials that write it put 1 - 0.999 * fraction in
// alpha; alpha 1, the default, means unknown and gets the old treatment.
float gDirect = 0.;
float litAlpha(vec3 c){ return 1. - 0.999 * sat(gDirect / max(luma(c), 1e-5)); }
vec3 shadeSurf(Surf s, vec3 P, vec3 V, float shadow){
  // test hook: shadowview shows only the key light's shadow term, grey on grey; shadowview=flat
  // shows flat grey, the control for everything that isn't the shadows
  if (uDbgShadow > 0.5) return vec3(uDbgShadow > 1.5 ? 0.3 : 0.04 + 0.5 * shadow);
  vec3 L = uKeyDir, N = s.N;
  float ndlRaw = dot(N, L);
  float ndl = max(ndlRaw, 0.);
  float ndv = max(dot(N, V), 1e-3);
  float w = max(0., s.wrap - 0.2);
  float diff = max(0., (ndlRaw + w) / ((1. + w) * (1. + w)));
  vec3 key = uKeyColor * diff * shadow;
  // translucency through thin things lit from behind
  key += uKeyColor * s.sss * pow(sat(dot(-V, L)), 3.) * (0.35 + 0.65 * shadow) * 0.6;
  float rough = clamp(s.rough, 0.04, 1.);
  float a = rough * rough, a2 = a * a;
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.), ldh = max(dot(L, H), 0.);
  float dd = ndh * ndh * (a2 - 1.) + 1.;
  float D = a2 / (3.14159 * dd * dd);
  float vis = 0.5 / (ndl * sqrt(ndv * ndv * (1. - a2) + a2) + ndv * sqrt(ndl * ndl * (1. - a2) + a2) + 1e-5);
  // spec scales reflectance: 0.04 is any common dielectric, wet and icy surfaces push past it
  float F0 = 0.02 + 0.06 * s.spec;
  float F = F0 + (1. - F0) * pow(1. - ldh, 5.);
  float hag = hagAt(P);
  vec4 sv = skyVisAt(P, hag);
  vec3 An = normalize(N + sv.xyz);
  vec3 amb = max(ambCube(An) * sv.w + groundBounce(P, An, hag, sv.w), 0.);
  vec3 col = s.albedo * (key + amb * s.ao) * (1. - F0);
  col += uKeyColor * (D * vis * F * ndl * shadow);
  gDirect = luma(s.albedo * key * (1. - F0) + uKeyColor * (D * vis * F * ndl * shadow));
  // sky reflection, darkened where the surface is occluded (specular occlusion from AO)
  float Fe = F0 + (max(1. - rough, F0) - F0) * pow(1. - ndv, 5.);
  float so = sat(pow(ndv + s.ao, exp2(-16. * a - 1.)) - 1. + s.ao);
  col += envSpecular(reflect(-V, N), rough) * Fe * so * sv.w;
  return col;
}
`;

export const SHADOW_F = /* glsl */`
// Soft shadows the way UE does them on high: a blocker search finds how far the occluder is, and the
// filter widens with that distance, so shadows are sharp where things touch the ground and soften
// away from it (PCSS). Taps lie on a Vogel disc turned by blue noise that steps each frame, which the
// temporal pass averages far better than the white noise it replaced. Filter sizes are in metres,
// with a floor that grows with distance from the camera only, so softness doesn't jump where one
// cascade hands over to the next. Below high: 8 taps at the floor size, no search.
const float PENUMBRA = 0.008;   // filter radius per metre from blocker to receiver: a slightly soft sun
vec2 vogel(int i, int n, float rot){
  float r = sqrt((float(i) + 0.5) / float(n)), a = float(i) * 2.39996 + rot;
  return r * vec2(cos(a), sin(a));
}
// texW: metres per texel, K: 1 / depth range in metres, floorW / searchW: smallest filter and widest
// search radius in metres. -1 when P is outside this map.
// One exit per function throughout: the D3D compiler warns about early returns from these.
float sampleCascade(sampler2D map, mat4 m, vec3 P, vec3 N, float ndl, float texW, float K, float floorW, float searchW, float rot, vec2 atl){
  vec4 sc = m * vec4(P + N * texW * 1.5, 1.);
  vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
  float res = -1.;
  if (c.x > 0.002 && c.x < 0.998 && c.y > 0.002 && c.y < 0.998 && c.z <= 1.) {
    float texel = 1. / float(textureSize(map, 0).y);
    // taps stay inside this cascade's square, so they never read the atlas neighbour
    vec2 lo = vec2(0.5 * texel), hi = vec2(1. - 0.5 * texel);
    float tanT = min(sqrt(max(1. - ndl * ndl, 0.)) / max(ndl, 0.05), 4.);
    float rw = floorW;
    int n = 8;
    bool lit = false;
    if (uShadowHQ > 0.5) {
      n = 16;
      float sw = max(floorW, searchW), bias = K * (texW + sw * tanT * 0.25);
      float sum = 0., cnt = 0.;
      for (int i = 0; i < 8; i++) {
        vec2 uv = clamp(c.xy + vogel(i, 8, rot + 1.3) * (sw / texW * texel), lo, hi);
        float d = textureLod(map, vec2(uv.x * atl.x + atl.y, uv.y), 0.).r;
        if (d < c.z - bias) { sum += d; cnt += 1.; }
      }
      // nothing in the way anywhere it could matter
      lit = cnt < 0.5;
      rw = clamp((c.z - sum / max(cnt, 1.)) / K * PENUMBRA, floorW, sw);
    }
    // slope-scaled: a wider filter on a slope reaches deeper into the surface it sits on
    float bias = K * (texW * (1. + 2.5 * (1. - ndl)) + rw * tanT * 0.25);
    float s = 0., r = rw / texW * texel;
    for (int i = 0; i < 16; i++) {
      if (i >= n || lit) break;
      vec2 uv = clamp(c.xy + vogel(i, n, rot) * r, lo, hi);
      s += step(c.z - bias, textureLod(map, vec2(uv.x * atl.x + atl.y, uv.y), 0.).r);
    }
    res = lit ? 1. : s / float(n);
  }
  return res;
}
// the view slices, picked by distance from the camera rather than by which map holds the point, so
// turning the camera never moves a point from one slice to another
float sliceShadow(vec3 P, vec3 N, float ndl, float d, float rot){
  float s1 = -1., s2 = -1.;
  float k = uShadowSplit.y > 0. ? smoothstep(uShadowSplit.x * 0.85, uShadowSplit.x, d) : 0.;
  float fl = d * 0.002;
  if (k < 1.) s1 = sampleCascade(uShadow1, uShadowM1, P, N, ndl, uShadowWT.y, uShadowK.y, max(fl, uShadowWT.y), 2., rot, vec2(1, 0));
  if (k > 0. && d < uShadowSplit.y) s2 = sampleCascade(uShadow2, uShadowM2, P, N, ndl, uShadowWT.z, uShadowK.z, max(fl, uShadowWT.z), 2., rot, vec2(1, 0));
  // a point outside a map (reflections see past the view) takes the other slice
  if (s1 < 0.) { s1 = s2; k = 1.; }
  if (s2 < 0.) { s2 = s1; k = 0.; }
  return s1 < 0. ? -1. : mix(s1, s2, k);
}
float cascadeShadow(vec3 P, vec3 N){
  float rot = fract(texelFetch(uNoise2D, ivec2(gl_FragCoord.xy) & 255, 0).a + uTAAFrame * 0.618034) * 6.283;
  float ndl = abs(dot(N, uKeyDir));
  float d = distance(P, uShadowEye);
  float s0 = sampleCascade(uShadow0, uShadowM0, P, N, ndl, uShadowWT.x, uShadowK.x, max(d * 0.002, uShadowWT.x * 1.5), 0.5, rot, vec2(0.5, 0));
  // fade from the basket cascade into the slices over its outer edge, so their coarser shadows don't pop in
  vec3 c0 = (uShadowM0 * vec4(P, 1.)).xyz * 0.5 + 0.5;
  vec2 e0 = min(c0.xy, 1. - c0.xy);
  float k = s0 >= 0. ? smoothstep(0.0, 0.12, min(e0.x, e0.y)) : 0.;
  float s = s0;
  if (k < 1.) {
    float s1 = sliceShadow(P, N, ndl, d, rot);
    if (s1 < 0.) s1 = sampleCascade(uShadow0, uShadowM3, P, N, ndl, uShadowWT.w, uShadowK.w, uShadowWT.w * 1.2, 0., rot, vec2(0.5, 0.5));
    s1 = s1 < 0. ? 1. : s1;
    s = s0 >= 0. ? mix(s1, s0, k) : s1;
  }
  return s;
}
// The coarse terrain shadow is always in, even where the cascades cover: ridges outside the shadow
// grid cast nowhere else, and fading it out under the cascade made big ridge shadows come and go as
// the grid moved. It's nudged a metre toward lit so its soft edge sits inside the crisp one.
float keyShadow(vec3 P, vec3 N){
  return keyHorizon(P) * min(terrainShadowSoft(P), cascadeShadow(P, N)) * cloudShadow(P);
}
`;

// Fragment-only surface relief: weathered tuff in metres, triplanar so cliffs and flats both get
// it, stretched up and down so steep faces read as rills. Each octave fades out before it
// shrinks to a few pixels, so the detail never sparkles. px is the world size of one pixel.
export const RELIEF = /* glsl */`
float tuffRelief(vec3 P, vec3 N, float px, int octaves, vec3 dPx, vec3 dPy, out float cav){
  vec3 w = pow(abs(N), vec3(4.)); w /= (w.x + w.y + w.z);
  float h = 0.; cav = 0.;
  const vec4 S = vec4(24., 7.5, 2.3, 0.7);
  // explicit gradients, so planes that barely face us and octaves too fine to see can be skipped
  vec2 gxX = vec2(dPx.z, dPx.y * 0.45), gyX = vec2(dPy.z, dPy.y * 0.45);
  vec2 gxZ = vec2(dPx.x, dPx.y * 0.45), gyZ = vec2(dPy.x, dPy.y * 0.45);
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    float s = S[i], o = float(i) * 0.37;
    float f = 1. - smoothstep(0.05, 0.22, px / s);
    if (f <= 0.) continue;
    vec4 a = vec4(0);
    if (w.x > 0.03) a += textureGrad(uNoise2D, vec2(P.z, P.y * 0.45) / s + o, gxX / s, gyX / s) * w.x;
    if (w.y > 0.03) a += textureGrad(uNoise2D, P.xz / s + o, dPx.xz / s, dPy.xz / s) * w.y;
    if (w.z > 0.03) a += textureGrad(uNoise2D, vec2(P.x, P.y * 0.45) / s + o, gxZ / s, gyZ / s) * w.z;
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

// Photo-scanned materials (see core/surfaces.js). Gradients come in from the caller, so these are
// safe inside branches. dn is a world-space offset to add to the normal before normalising.
export const SURF = /* glsl */`
uniform highp sampler2DArray uSurfAlb, uSurfNH;
#define L_TUFF 0.
#define L_STEPPE 1.
#define L_SOIL 2.
#define L_PLOWED 3.
struct MatS { vec3 alb; vec3 dn; float h; };
MatS matPlanar(float L, vec2 uv, vec2 gx, vec2 gy){
  MatS m;
  m.alb = textureGrad(uSurfAlb, vec3(uv, L), gx, gy).rgb;
  vec3 nh = textureGrad(uSurfNH, vec3(uv, L), gx, gy).rgb;
  m.dn = vec3(nh.xy * 2. - 1., 0.);
  m.h = nh.z;
  return m;
}
// ground layers seen from above, with no visible repeat: two copies at random offsets picked by a
// slow noise and blended where it changes over (iq's texture repetition trick). The noise index is
// shared by every layer so they stay in step.
MatS matTop(float L, vec3 P, float scale, vec3 dPx, vec3 dPy, float k){
  vec2 uv = P.xz / scale, gx = dPx.xz / scale, gy = dPy.xz / scale;
  float l = k * 8., f = fract(l), ia = floor(l);
  vec2 oa = sin(vec2(3., 7.) * ia), ob = sin(vec2(3., 7.) * (ia + 1.));
  vec3 aA = textureGrad(uSurfAlb, vec3(uv + oa, L), gx, gy).rgb, bA = textureGrad(uSurfAlb, vec3(uv + ob, L), gx, gy).rgb;
  vec3 aN = textureGrad(uSurfNH, vec3(uv + oa, L), gx, gy).rgb, bN = textureGrad(uSurfNH, vec3(uv + ob, L), gx, gy).rgb;
  float t = smoothstep(0.2, 0.8, f - 0.1 * (aA.r + aA.g + aA.b - bA.r - bA.g - bA.b));
  MatS m;
  m.alb = mix(aA, bA, t);
  vec3 nh = mix(aN, bN, t);
  m.dn = vec3(nh.x * 2. - 1., 0., nh.y * 2. - 1.);
  m.h = nh.z;
  return m;
}
// biplanar (two dominant axes) for cliffs and chimneys
MatS matBiplanar(float L, vec3 P, vec3 N, float scale, vec3 dPx, vec3 dPy){
  vec3 n = abs(N);
  ivec3 ma = (n.x > n.y && n.x > n.z) ? ivec3(0, 1, 2) : (n.y > n.z) ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
  ivec3 mi = (n.x < n.y && n.x < n.z) ? ivec3(0, 1, 2) : (n.y < n.z) ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
  ivec3 me = ivec3(3) - mi - ma;
  vec3 p = P / scale, gx = dPx / scale, gy = dPy / scale;
  MatS a = matPlanar(L, vec2(p[ma.y], p[ma.z]), vec2(gx[ma.y], gx[ma.z]), vec2(gy[ma.y], gy[ma.z]));
  MatS b = matPlanar(L, vec2(p[me.y], p[me.z]), vec2(gx[me.y], gx[me.z]), vec2(gy[me.y], gy[me.z]));
  vec3 da = vec3(0), db = vec3(0);
  da[ma.y] = a.dn.x; da[ma.z] = a.dn.y;
  db[me.y] = b.dn.x; db[me.z] = b.dn.y;
  vec2 w = clamp((vec2(n[ma.x], n[me.x]) - 0.5773) / (1. - 0.5773), 0., 1.);
  w = pow(w, vec2(1.5)) + vec2(1e-4, 0.);
  float ws = w.x + w.y;
  MatS m;
  m.alb = (a.alb * w.x + b.alb * w.y) / ws;
  m.dn = (da * w.x + db * w.y) / ws;
  m.h = (a.h * w.x + b.h * w.y) / ws;
  return m;
}
`;

export const VCOMMON = DECL + NOISE + TERRAIN + SHADOW + LIGHT;
export const COMMON = VCOMMON + SHADOW_F + RELIEF + SURF;

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

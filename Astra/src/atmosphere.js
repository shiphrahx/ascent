import {THREE,rand,rng,TAU,uniforms,lerp,clamp,smooth,mat,mesh,canvasTexture} from './core.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {SceneRenderPass} from './rendering.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {AntiAlias as FXAAShader} from './fxaa.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {createSunShadows} from './lighting.js';
import {TemporalResolvePass} from './temporal.js';
// Reuse Three's analytic Rayleigh/Mie atmosphere in the cached sky field.
const physicalSky=Sky.SkyShader.fragmentShader.replace('void main() {','vec3 physicalSky(vec3 direction) {').replace('vec3 direction = normalize( vWorldPosition - cameraPosition );','').replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;','').replace('vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );','vec3 retColor = texColor;').replace('gl_FragColor = vec4( retColor, 1.0 );','return retColor;').replace('#include <tonemapping_fragment>','').replace('#include <colorspace_fragment>','');
const nr=rng(341),noiseData=new Uint8Array(256*256*4),noiseBase=Uint8Array.from({length:65536},()=>nr()*255);for(let y=0;y<256;y++)for(let x=0;x<256;x++){let i=(x+y*256)*4;noiseData[i]=noiseBase[x+y*256];noiseData[i+1]=noiseBase[((x+37)%256)+((y+17)%256)*256];noiseData[i+2]=noiseData[i];noiseData[i+3]=255;}const noiseTex=new THREE.DataTexture(noiseData,256,256);noiseTex.wrapS=noiseTex.wrapT=THREE.RepeatWrapping;noiseTex.magFilter=THREE.LinearFilter;noiseTex.minFilter=THREE.LinearMipmapLinearFilter;noiseTex.generateMipmaps=true;noiseTex.needsUpdate=true;const noiseUniform={value:noiseTex};
const noiseGLSL=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
uniform sampler2D uNoise;float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;vec2 rg=texture2DLodEXT(uNoise,(uv+.5)/256.,0.).rg;return mix(rg.r,rg.g,f.z);}
const mat3 noiseRotation=mat3(.00,.80,.60,-.80,.36,-.48,-.60,-.48,.64);
float fbm(vec3 p){float n=noise3(p)*.53;p=noiseRotation*p*2.03+3.;n+=noise3(p)*.28;p=noiseRotation*p*2.01+7.;return n+noise3(p)*.19;}
`;
export function createAtmosphere(scene,renderer,camera){
const tier=renderer.ascentQuality;
const skyU={...THREE.UniformsUtils.clone(Sky.SkyShader.uniforms),uNoise:noiseUniform,uTime:uniforms.time,uSun:uniforms.sun,uNight:uniforms.night,uStorm:uniforms.storm,uDay:uniforms.day,uTop:{value:new THREE.Color()},uHorizon:{value:new THREE.Color()},uWarm:{value:new THREE.Color()},uEye:{value:new THREE.Vector3()}};
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,vertexShader:`varying vec3 vPos;void main(){vPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
varying vec3 vPos;uniform vec3 uEye,uSun,uTop,uHorizon,uWarm;uniform float uTime,uNight,uStorm,uDay;
${noiseGLSL}
${physicalSky}
float density(vec3 p){
 float height=smoothstep(620.,690.,p.y)*(1.-smoothstep(810.,1250.,p.y));
 vec3 q=p*vec3(.0018,.0032,.0018)+vec3(uTime*.002,0.,uTime*.0007);
 float weather=noise3(vec3(q.x*.19,2.,q.z*.19));
 float shape=noise3(q)*.72+noise3(q*2.04+17.)*.28;
 float erosion=noise3(q*6.7+3.)*.12+noise3(q*13.1)*.04;
 // A flat condensation base and eroded, billowing tops. Density remapping
 // gives defined cloud edges without raising ray count or texture resolution.
 float body=shape+weather*.13-erosion-(1.-height)*.38;
 return clamp((body-(.55-uStorm*.24))*5.,0.,1.);
}
void main(){vec3 d=normalize(vPos-uEye);float sy=uSun.y,mu=dot(d,uSun);float elev=max(d.y,0.);vec3 dusk=mix(uHorizon,uTop,1.-exp(-elev*12.));vec3 col=mix(physicalSky(d)*.46,dusk,uNight);
float warm=pow(max(mu,0.),12.)*exp(-elev*4.);col+=uWarm*warm*.6;
// Earth's shadow and the Belt of Venus opposite a low sun.
float twilight=(1.-smoothstep(.02,.22,abs(sy)))*(1.-uNight*.5);float opposite=pow(max(dot(d.xz,-normalize(uSun.xz)),0.),3.);col=mix(col,vec3(.12,.15,.28),exp(-pow((d.y-.018)/.028,2.))*opposite*twilight*.5);col+=vec3(.22,.095,.14)*exp(-pow((d.y-.075)/.038,2.))*opposite*twilight;
float disc=smoothstep(.99993,.99997,mu);float glow=pow(max(mu,0.),300.)*.7+pow(max(mu,0.),30.)*.16;col+=glow*vec3(1.,.71,.39)*(1.-uNight)*(1.-uStorm*.88);
// A cratered, shaded moon on the opposite celestial hemisphere.
float moonDot=dot(d,-uSun);vec3 moonN=normalize(d+uSun*moonDot);float crater=fbm(d*390.)*.5+noise3(d*1100.)*.2;float moon=smoothstep(.99975,.99982,moonDot);col=mix(col,vec3(.72,.79,.92)*(1.-crater)*1.7,moon*uNight);col+=vec3(.14,.2,.35)*pow(max(moonDot,0.),120.)*uNight*.15;
float milky=exp(-pow(dot(d,normalize(vec3(.35,.65,.4)))/.13,2.))*fbm(d*19.);col+=vec3(.11,.13,.19)*milky*uNight;
// Ice-crystal parhelia, 22 degrees either side of the morning sun.
vec3 dogL=vec3(uSun.x*.927-uSun.z*.375,uSun.y,uSun.x*.375+uSun.z*.927);vec3 dogR=vec3(uSun.x*.927+uSun.z*.375,uSun.y,-uSun.x*.375+uSun.z*.927);float dogs=pow(max(dot(d,dogL),0.),4200.)+pow(max(dot(d,dogR),0.),4200.);col+=vec3(.9,.52,.25)*dogs*twilight*(1.-uStorm)*(1.-uNight);
// March a 3-D cloud field and sample optical density toward the sun.
float cloudTransmission=1.;if(d.y>.045){float start=max(0.,(620.-uEye.y)/d.y);float end=min((1250.-uEye.y)/d.y,14000.);float stepSize=max(0.,end-start)/${tier.cloudSteps}.;float trans=1.;vec3 cloud=vec3(0.);float jitter=.5;for(int i=0;i<${tier.cloudSteps};i++){float dist=start+(float(i)+jitter)*stepSize;vec3 p=uEye+d*dist;float den=density(p);if(den>.015){float shade=exp(-density(p+uSun*100.)*1.8-density(p+uSun*220.)*1.1);float forward=pow(max(mu,0.),12.);vec3 lit=mix(uHorizon*.28+vec3(.02),mix(vec3(2.8,3.05,3.4),vec3(3.5,1.85,.8),twilight)*(.22+shade*.85),uDay);lit+=uWarm*forward*shade*.5;lit=mix(lit,vec3(.53,.59,.65),uStorm*.6);float a=1.-exp(-den*stepSize*.007);cloud+=lit*a*trans;trans*=1.-a;if(trans<.025)break;}}float horizonFade=smoothstep(.045,.14,d.y);col=mix(col,col*trans+cloud,horizonFade);cloudTransmission=mix(1.,trans,horizonFade);}
col=mix(col,vec3(.37,.43,.51),uStorm*.28);gl_FragColor=vec4(col,cloudTransmission);}

`});
// Cache the slowly changing cloud field in angular space. Both the main camera
// and the river sample it, avoiding a full ray march for every scene render.
skyMat.vertexShader='varying vec2 vSkyUv;'+Sky.SkyShader.vertexShader.replace('gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );','vSkyUv=uv;gl_Position=vec4(position.xy,0.,1.);');
skyMat.fragmentShader=skyMat.fragmentShader.replace('varying vec3 vPos;', 'varying vec2 vSkyUv;').replace('vec3 d=normalize(vPos-uEye);','float longitude=(vSkyUv.x-.5)*6.2831853,latitude=(vSkyUv.y-.5)*3.14159265;vec3 d=vec3(cos(latitude)*cos(longitude),sin(latitude),cos(latitude)*sin(longitude));');
skyMat.side=THREE.FrontSide;skyMat.depthTest=false;
const skyTarget=new THREE.WebGLRenderTarget(tier.skyWidth,tier.skyWidth/2,{type:THREE.HalfFloatType,depthBuffer:false,wrapS:THREE.RepeatWrapping});
skyTarget.texture.mapping=THREE.EquirectangularReflectionMapping;
const skyQuad=new FullScreenQuad(skyMat),pmrem=new THREE.PMREMGenerator(renderer);
const environmentInput=new THREE.WebGLRenderTarget(1024,512,{type:THREE.HalfFloatType,depthBuffer:false});
environmentInput.texture.mapping=THREE.EquirectangularReflectionMapping;
const environmentCopy=new FullScreenQuad(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{source:{value:skyTarget.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=texture2D(source,vUv);}'}));
let skyUpdated=-Infinity,skyHour=-1,skyStorm=-1,skyTile=-1,environment=null,environmentHour=-1,environmentStorm=-1;
const skyDisplay=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{...skyU,uSky:{value:skyTarget.texture}},
 vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 vDirection;uniform sampler2D uSky;uniform vec3 uSun;uniform float uNight,uStorm,uTime;
 float starHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 void main(){vec3 d=normalize(vDirection);vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5,asin(clamp(d.y,-1.,1.))/3.14159265+.5);vec4 skySample=texture2D(uSky,uv);vec3 col=skySample.rgb;
 float mu=dot(d,uSun);float edge=max(fwidth(mu),.000002);float disc=smoothstep(.99996-edge,.99996+edge,mu);col+=disc*9.*vec3(1.,.76,.48)*(1.-uNight)*(1.-uStorm*.94)*skySample.a;
 vec3 starCell=floor(d*900.);float star=pow(starHash(starCell),320.)*pow(max(d.y,0.),.3);col+=vec3(.65,.78,1.)*star*uNight*(1.-uStorm)*skySample.a*.8;
 gl_FragColor=vec4(col,1.);}`});
const sky=mesh(new THREE.SphereGeometry(18000,32,18),skyDisplay,scene);sky.castShadow=sky.receiveShadow=false;sky.renderOrder=-10;
const fogColor=new THREE.Color('#8e9aa4');scene.fog=new THREE.FogExp2(fogColor,.00065);
const hemi=new THREE.HemisphereLight('#a9c4df','#715c50',.3);scene.add(hemi);
const shadows=createSunShadows(scene,camera,renderer),key=shadows.csm.lights[0];
const sunColor=new THREE.Color();
const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,depthBuffer:false});const composer=new EffectComposer(renderer,target);const scenePass=new SceneRenderPass(scene,camera,renderer);composer.addPass(scenePass);
const fogPass=new ShaderPass({uniforms:{uNoise:noiseUniform,tDiffuse:{value:null},tDepth:{value:null},invProjection:{value:new THREE.Matrix4()},camWorld:{value:new THREE.Matrix4()},uEye:{value:new THREE.Vector3()},uSun:uniforms.sun,uTime:uniforms.time,uNight:uniforms.night,uStorm:uniforms.storm,uFog:{value:1},uProjection:{value:new THREE.Vector2()},uColor:{value:new THREE.Color()},uWarm:skyU.uWarm,uHero:{value:new THREE.Vector3()},uFade:{value:0},uBurn:uniforms.flame},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
varying vec2 vUv;uniform sampler2D tDiffuse,tDepth;uniform mat4 invProjection,camWorld;uniform vec3 uEye,uSun,uColor,uWarm,uHero;uniform float uFog,uTime,uNight,uStorm,uFade,uBurn;uniform vec2 uProjection;
${noiseGLSL}
void main(){float depth=texture2D(tDepth,vUv).x;vec4 v=invProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);v/=v.w;vec3 wp=(camWorld*v).xyz;vec3 ray=wp-uEye;float dist=length(ray);vec3 dir=ray/max(dist,.001);vec2 uv=vUv;
// Local heat refraction in the volume directly above the twin burner.
float along=dot(uHero+vec3(0.,6.,0.)-uEye,dir);float heat=exp(-length(uEye+dir*along-uHero-vec3(0.,6.,0.))*1.7)*step(0.,along)*step(along,dist)*uBurn;uv.x+=sin(vUv.y*160.+uTime*18.)*.002*heat;
vec4 sceneColor=texture2D(tDiffuse,uv);vec3 col=sceneColor.rgb;
// Deterministic, world-scale contact occlusion: no noise texture or frame jitter.
// Depth discontinuities are range-limited to keep distant silhouettes clean.
vec3 surfaceNormal=cross(dFdx(v.xyz),dFdy(v.xyz));surfaceNormal/=max(length(surfaceNormal),.000001);
if(dot(surfaceNormal,-v.xyz)<0.)surfaceNormal=-surfaceNormal;
if(depth<.99999&&-v.z<450.){float occlusion=0.;vec2 radius=uProjection*2.8/max(-v.z,1.);
 for(int i=0;i<8;i++){float angle=float(i)*2.399963;float scale=.35+.65*float(i+1)/8.;vec2 suv=vUv+vec2(cos(angle),sin(angle))*radius*scale;
  float sd=texture2D(tDepth,suv).r;vec4 sv=invProjection*vec4(suv*2.-1.,sd*2.-1.,1.);vec3 delta=sv.xyz/sv.w-v.xyz;float distance=length(delta);
  float horizon=max(0.,dot(surfaceNormal,delta)/max(distance,.001)-.12);occlusion+=horizon*(1.-smoothstep(.4,5.6,distance))*step(.025,distance);
 }col*=1.-clamp(occlusion*.17,0.,.34)*(1.-smoothstep(180.,450.,-v.z));
}
float maxDist=min(dist,2200.);float stepSize=maxDist/10.;float trans=1.;vec3 fog=vec3(0.);float jitter=.5;float mu=dot(dir,uSun);for(int i=0;i<10;i++){vec3 p=uEye+dir*(float(i)+jitter)*stepSize;float n=fbm(p*.012+vec3(uTime*.012,0.,-uTime*.004));float h=(exp(-max(p.y-12.,0.)*.045)+.6*exp(-pow((p.y-38.)/15.,2.)))*smoothstep(-5.,8.,p.y);float den=h*uFog*(.3+n*.9);float a=1.-exp(-den*stepSize*.0055);float sunHeight=smoothstep(35.,70.,p.y+uSun.y*180.);vec3 lit=mix(vec3(.012,.028,.065),uColor*.32+uWarm*vec3(.13,.095,.05),sunHeight);vec3 shadowDelta=p-uHero-vec3(0.,17.,0.);float shadowAlong=dot(shadowDelta,-uSun);float shadowRadius=length(shadowDelta+uSun*shadowAlong);float balloonShadow=(1.-smoothstep(8.,13.,shadowRadius))*smoothstep(0.,20.,shadowAlong);lit*=1.-balloonShadow*.28;lit=mix(lit,vec3(.19,.23,.28),uStorm*.8);lit+=uWarm*pow(max(mu,0.),12.)*.14;fog+=lit*a*trans;trans*=1.-a;}col=col*trans+fog;
// Forward scattering through the frozen valley and a subtle photographic halation.
float rays=pow(max(mu,0.),60.)*(1.-trans)*1.;col+=uWarm*rays*.08;
// Glory centered on the anti-solar point, visible against the fog bank.
float anti=dot(dir,-uSun);float angle=acos(clamp(anti,-1.,1.));vec3 halo=vec3(exp(-pow((angle-.042)/.005,2.)),exp(-pow((angle-.036)/.004,2.)),exp(-pow((angle-.031)/.004,2.)));col+=halo*(1.-trans)*.075*(1.-uNight);
float vign=1.-smoothstep(.23,.9,length((vUv-.5)*vec2(1.,.85)));col*=.94+.06*vign;col=mix(col,uColor,uFade);gl_FragColor=vec4(col,sceneColor.a);}`});// ShaderPass clones uniform objects: explicitly reconnect live weather/burner state.
Object.assign(fogPass.uniforms,{uNoise:noiseUniform,uSun:uniforms.sun,uTime:uniforms.time,uNight:uniforms.night,uStorm:uniforms.storm,uBurn:uniforms.flame,uWarm:skyU.uWarm});
fogPass.textureID='sceneColor';fogPass.uniforms.tDiffuse.value=scenePass.target.texture;fogPass.uniforms.tDepth.value=scenePass.target.depthTexture;composer.addPass(fogPass);
const temporal=new TemporalResolvePass(camera,scenePass.target.depthTexture);composer.addPass(temporal);
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.3,.6,.9);composer.addPass(bloom);const fxaa=new ShaderPass(FXAAShader);composer.addPass(new OutputPass());composer.addPass(fxaa);
return {composer,scenePass,sky,skyU,skyTarget,key,shadows,fogPass,bloom,temporal,render(){
 temporal.beginFrame();fogPass.uniforms.invProjection.value.copy(camera.projectionMatrixInverse);
 try{composer.render();}finally{temporal.endFrame();}
},update(t,hour,hero,storm,fade,quality=1){
temporal.updateState(hour,storm,fade);
const angle=(hour-6)/24*TAU,sun=new THREE.Vector3(Math.cos(angle)*.75,Math.sin(angle),-.55).normalize();uniforms.sun.value.copy(sun);const day=smooth(sun.y,-.12,.2),night=1-smooth(sun.y,-.18,.03),warm=(1-smooth(Math.abs(sun.y),.02,.5))*(1-night*.8);uniforms.day.value=day;uniforms.night.value=night;uniforms.storm.value=storm;uniforms.snow.value=.32+.48*smooth(hour,10,12)*(1-smooth(hour,13,18));uniforms.frost.value=(1-smooth(hour,7,11))*.85;
skyU.sunPosition.value.copy(sun).multiplyScalar(450000);skyU.turbidity.value=2.2+storm*6.;skyU.rayleigh.value=2.;skyU.mieCoefficient.value=.004;skyU.mieDirectionalG.value=.82;
skyU.uTop.value.set('#376e9b').lerp(new THREE.Color(hour<12?'#213963':'#392e64'),warm*.9).lerp(new THREE.Color('#061329'),night);skyU.uHorizon.value.set('#c7bbad').lerp(new THREE.Color(hour<12?'#f5b974':'#f2a485'),warm).lerp(new THREE.Color('#52617b'),night).lerp(new THREE.Color('#8d9aa3'),storm);skyU.uWarm.value.setRGB(1.0,.52,.23).multiplyScalar(warm*(1-storm*.8)*(1-night));skyU.uEye.value.copy(camera.position);sky.position.copy(camera.position);
fogColor.set('#8b9caf').lerp(skyU.uHorizon.value,.18).lerp(new THREE.Color('#344b70'),night*.65);scene.fog.color.copy(fogColor);scene.fog.density=lerp(.0003,.0028,storm)+night*.00014;hemi.intensity=lerp(.1,.14,day)*(1-storm*.23);hemi.color.set(night>.5?'#829fcf':'#b5cbd9');hemi.groundColor.set(night>.5?'#45475b':'#a28a72');const litDir=night>.55?sun.clone().negate():sun.clone();litDir.y=Math.max(litDir.y,.035);litDir.normalize();
sunColor.set(night>.55?'#a4bbdf':'#fff3e3').lerp(new THREE.Color(hour<12?'#ffd09b':'#ffb49a'),night>.55?0:warm*.75);
shadows.update(litDir,sunColor,(night>.55?.65:4.2*smooth(sun.y,-.08,.22))*(1-storm*.86));
renderer.toneMappingExposure=night>.6?1.25:.88-storm*.04;bloom.strength=.1+warm*.07+night*.12;
const fu=fogPass.uniforms;fu.uEye.value.copy(camera.position);fu.camWorld.value.copy(camera.matrixWorld);fu.invProjection.value.copy(camera.projectionMatrixInverse);fu.uProjection.value.set(camera.projectionMatrix.elements[0]*.5,camera.projectionMatrix.elements[5]*.5);fu.uHero.value.copy(hero);fu.uColor.value.copy(fogColor);fu.uFog.value=(.48*(1-smooth(hour,7,10))+.15*night+storm*.55);fu.uFade.value=fade;
const forceSky=!Number.isFinite(skyUpdated)||Math.abs(hour-skyHour)>.15||Math.abs(storm-skyStorm)>.025;
if(forceSky||skyTile>=0||t-skyUpdated>(quality>.6?.5:.9)){
 // Keep the visible sky sharp while spreading normal cloud-cache updates
 // across sixteen small tiles. Time/weather jumps refresh the entire sky immediately.
 const previous=renderer.getRenderTarget();
 skyTarget.scissorTest=!forceSky;
 if(!forceSky){if(skyTile<0)skyTile=0;skyTarget.scissor.set((skyTile%4)*tier.skyWidth/4,Math.floor(skyTile/4)*tier.skyWidth/8,tier.skyWidth/4,tier.skyWidth/8);}
 renderer.setRenderTarget(skyTarget);skyQuad.render(renderer);renderer.setRenderTarget(previous);
 if(forceSky||++skyTile===16){skyUpdated=t;skyHour=hour;skyStorm=storm;skyTile=-1;}
}
if(!environment||Math.abs(hour-environmentHour)>.06||Math.abs(storm-environmentStorm)>.1){
 // Diffuse/rough reflections need far fewer texels than the visible cloud sky.
 const previous=renderer.getRenderTarget();renderer.setRenderTarget(environmentInput);environmentCopy.render(renderer);renderer.setRenderTarget(previous);
 environment=pmrem.fromEquirectangular(environmentInput.texture,environment);scene.environment=environment.texture;environmentHour=hour;environmentStorm=storm;
}
scene.environmentIntensity=.34*day+.22*night;
return {day,night,warm,storm,fog:fu.uFog.value,quality};},resize(w,h){composer.setSize(w,h);const pr=renderer.getPixelRatio();fxaa.uniforms.resolution.value.set(1/(w*pr),1/(h*pr));}};
}
export function createParticles(scene){const count=5600,positions=new Float32Array(count*3),sizes=new Float32Array(count),kinds=new Float32Array(count),r=rng(889);for(let i=0;i<count;i++){positions[i*3]=(r()-.5)*420;positions[i*3+1]=r()*220;positions[i*3+2]=(r()-.5)*420;sizes[i]=1+r()*3;kinds[i]=r();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));g.setAttribute('aKind',new THREE.BufferAttribute(kinds,1));const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:uniforms.time,uStorm:uniforms.storm,uFrost:uniforms.frost,uWind:uniforms.wind,uNight:uniforms.night,uEye:{value:new THREE.Vector3()},uPixel:{value:Math.min(devicePixelRatio,1.5)}},vertexShader:`uniform float uTime,uStorm,uFrost,uPixel,uNight;uniform vec3 uEye,uWind;attribute float aSize,aKind;varying float vAlpha,vKind;void main(){vec3 p=position; p.x=mod(p.x+uTime*uWind.x+210.,420.)-210.;p.z=mod(p.z+uTime*uWind.z+210.,420.)-210.;p.y=mod(p.y-uTime*(2.+aKind*3.)+220.,220.)-70.;p+=uEye;p.x+=sin(uTime*1.6+aKind*40.+p.y*.09)*(1.+uStorm*3.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPixel*90./max(1.,-mv.z),1.,9.);vAlpha=(uStorm*.8+(1.-uStorm)*uFrost*.25*step(.91,aKind))*(1.-smoothstep(120.,220.,-mv.z));vKind=aKind;}`,fragmentShader:`varying float vAlpha,vKind;void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*18.)*vAlpha;gl_FragColor=vec4(mix(vec3(.82,.9,1.),vec3(1.3,1.04,.66),step(.94,vKind)),a);}`});const p=new THREE.Points(g,m);p.frustumCulled=false;scene.add(p);return {update(eye,pixelRatio=1){m.uniforms.uEye.value.copy(eye);m.uniforms.uPixel.value=pixelRatio;}};}
export function makeSmoke(scene,sources,breath=false){const count=sources.length*(breath?4:10),ps=new Float32Array(count*3),a=new Float32Array(count);for(let i=0;i<count;i++)a[i]=rand();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(ps,3));g.setAttribute('aSeed',new THREE.BufferAttribute(a,1));const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:uniforms.time,uNight:uniforms.night,uBreath:{value:breath?1:0}},vertexShader:`attribute float aSeed;uniform float uTime,uBreath;varying float vAlpha;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(110.,(uBreath>.5?55.:360.)/max(1.,-p.z));vAlpha=.14;}`,fragmentShader:`varying float vAlpha;uniform float uNight;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(mix(vec3(.7,.74,.76),vec3(.24,.3,.4),uNight),exp(-d*d*14.)*vAlpha);}`});const pts=new THREE.Points(g,m);pts.frustumCulled=false;scene.add(pts);return {update(t,wind){const per=breath?4:10;for(let i=0;i<count;i++){const src=sources[Math.floor(i/per)],life=(t*(breath?.45:.12)+a[i])%1;ps[i*3]=src.x+wind.x*life*(breath?.5:5);ps[i*3+1]=src.y+life*(breath?1:18);ps[i*3+2]=src.z+wind.z*life*(breath?.5:5);}g.attributes.position.needsUpdate=true;}};}

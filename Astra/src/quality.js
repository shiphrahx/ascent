// Hardware names are a conservative hint, never a benchmark. Unknown or masked
// adapters use medium; a URL override makes every tier reproducible in reviews.
export const QUALITY_TIERS=Object.freeze({
 high:Object.freeze({name:'high',pixelBudget:8300000,maxDpr:2,samples:4,shadowSize:2048,reflectionSize:1024,reflectionHz:30,reflectionFrames:2,skyWidth:4096,cloudSteps:96}),
 medium:Object.freeze({name:'medium',pixelBudget:2800000,maxDpr:2,samples:4,shadowSize:2048,reflectionSize:768,reflectionHz:30,reflectionFrames:2,skyWidth:4096,cloudSteps:96}),
 lite:Object.freeze({name:'lite',pixelBudget:1300000,maxDpr:1,samples:2,shadowSize:1024,reflectionSize:384,reflectionHz:15,reflectionFrames:4,skyWidth:2048,cloudSteps:48})
});

export function classifyGpu(name=''){
 if(/swiftshader|llvmpipe|softpipe|software|basic render|warp\b/i.test(name))return 'lite';
 // Test integrated families first: ANGLE strings also contain the vendor name.
 if(/intel.*arc\s+[ab]\d/i.test(name))return 'high';
 if(/radeon\s+(?:[6789]\d\d\s*m|graphics)|intel|iris|uhd|apple|mali|adreno|powervr/i.test(name))return 'medium';
 if(/geforce|quadro|nvidia|radeon\s+(?:rx|pro|r[579])\b|intel.*arc\s+[ab]\d/i.test(name))return 'high';
 return 'medium';
}

export function selectQuality(renderer,search=location.search){
 const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
 const gpu=String(gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER));
 const requested=new URLSearchParams(search).get('quality');
 const override=Object.hasOwn(QUALITY_TIERS,requested),name=override?requested:classifyGpu(gpu);
 return Object.freeze({...QUALITY_TIERS[name],gpu,source:override?'override':'detected'});
}

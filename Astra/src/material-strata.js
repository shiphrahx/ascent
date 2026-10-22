// Metre-scale geology, independent of mesh UVs and instance scale. Analytic
// footprint filtering averages beds once they become smaller than a pixel.
export const materialStrataGLSL=`
vec3 bedTint(float bed){
 float mineral=rh(vec2(bed,37.));
 if(mineral<.34)return vec3(1.04,1.01,.94);
 if(mineral<.60)return vec3(1.,.86,.69);
 if(mineral<.82)return vec3(1.,.82,.79);
 return vec3(.76,.79,.82);
}
vec3 strataTint(vec3 p){
 float thickness=4.+8.*rn(p.xz*.0018+vec2(7.,-11.));
 float warp=(rn(p.xz*.004)-.5)*5.;
 float bed=(p.y+warp)/thickness,index=floor(bed),fraction=fract(bed);
 float footprint=fwidth(bed),edge=max(.06,footprint);
 vec3 tint=mix(bedTint(index-1.),bedTint(index),smoothstep(-edge,edge,fraction));
 tint=mix(tint,bedTint(index+1.),smoothstep(1.-edge,1.+edge,fraction));
 return mix(tint,vec3(.97,.89,.82),smoothstep(.45,1.5,footprint));
}
vec3 mineralTint(vec3 p){
 float mineralField=rn(p.xz*.007+p.y*.002)*.7+rn(p.xz*.026+19.)*.3;
 return mix(vec3(.78,.74,.71),vec3(1.07,1.03,.96),smoothstep(.2,.78,mineralField));
}
`;

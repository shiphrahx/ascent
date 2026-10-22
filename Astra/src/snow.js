// +Z is the sheltered northern aspect, opposite the midday sun's -Z direction.
// Derivative-sized transitions average subpixel deposits instead of sparkling.
export const snowCoverageGLSL=`
float snowCoverage(vec3 normal,float sky,float amount,float drift,float footprint){
 float slope=smoothstep(.52,.93,normal.y);
 float shelter=clamp(1.-sky,0.,1.);
 float aspect=normal.z*.14;
 float deposit=drift+aspect+shelter*.18-.045*(1.-shelter);
 float edge=max(.12,footprint*1.5);
 return slope*smoothstep(1.-amount*.65-edge,1.-amount*.65+edge,deposit)*smoothstep(0.,.12,amount);
}
`;

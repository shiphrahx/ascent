import {mkdir,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';

// Deterministic, seamless material fields. Build-time work never enters a frame.
const size=1024,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function hash(x,y,seed){let h=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,1442695041);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x,y,n,seed){x*=n;y*=n;const ix=Math.floor(x),iy=Math.floor(y);let u=x-ix,v=y-iy;u=u*u*u*(u*(u*6-15)+10);v=v*v*v*(v*(v*6-15)+10);const h=(a,b)=>hash((a%n+n)%n,(b%n+n)%n,seed);return (h(ix,iy)*(1-u)+h(ix+1,iy)*u)*(1-v)+(h(ix,iy+1)*(1-u)+h(ix+1,iy+1)*u)*v;}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(name,data){const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);let crc=0xffffffff;for(const b of Buffer.concat([type,data]))crc=crcTable[(crc^b)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;}
function png(pixels){const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;const scan=Buffer.alloc((size*3+1)*size);for(let y=0;y<size;y++){scan[y*(size*3+1)]=1;for(let x=0;x<size*3;x++)scan[y*(size*3+1)+x+1]=(pixels[y*size*3+x]-(x<3?0:pixels[y*size*3+x-3])+256)&255;}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
export async function generateMaterials(){
 await mkdir('assets/materials/procedural',{recursive:true});
 for(const kind of ['tuff','soil','masonry']){
  const albedo=Buffer.alloc(size*size*3),surface=Buffer.alloc(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=x/size,v=y/size,q=(x+y*size)*3;
   const broad=noise(u,v,4,71),medium=noise(u,v,16,13),fine=noise(u,v,64,33),grain=noise(u,v,256,91);
   let h,rough,ao=1,r,g,b;
   if(kind==='tuff'){
    // Mineral color is independent of elevation: dark grains are not cavities.
    const bedding=noise(u,v,8,45),pore=clamp((.32-fine)*5),pit=clamp((.24-grain)*5);
    h=.45+(medium-.5)*.28+(fine-.5)*.13-pore*.2-pit*.055;
    const mineral=(broad-.5)*22+(bedding-.5)*12, fleck=(grain-.5)*4;
    r=183+mineral+fleck;g=165+mineral*.92+fleck;b=143+mineral*.84+fleck;
    rough=.84+fine*.09;ao=1-pore*.2-pit*.08;
   }else if(kind==='soil'){
    const cell=128,cx=Math.floor(u*cell),cy=Math.floor(v*cell),fx=u*cell-cx,fy=v*cell-cy;
    let pebble=0,tone=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const px=(cx+dx+cell)%cell,py=(cy+dy+cell)%cell,seed=hash(px,py,31),radius=.12+seed*.23;
     const xx=(fx-dx-.15-hash(px,py,6)*.7)*(.7+seed*.8),yy=fy-dy-.15-hash(px,py,7)*.7;
     const d=Math.hypot(xx,yy)/radius,p=clamp(1-d*d);
     if(p>pebble){pebble=p;tone=seed;}
    }
    h=.25+(medium-.5)*.14+(fine-.5)*.1+(grain-.5)*.035+Math.sqrt(pebble)*.38;
    const earth=(broad-.5)*21+(medium-.5)*13+(grain-.5)*5,stone=clamp(pebble*8);
    r=(133+earth)*(1-stone)+(163+tone*25)*stone;g=(120+earth*.92)*(1-stone)+(149+tone*22)*stone;b=(99+earth*.8)*(1-stone)+(125+tone*18)*stone;
    rough=.94-pebble*.12;ao=.88+.12*clamp(pebble*4+fine);
   }else{
    const row=Math.floor(v*12),xx=u*8+(row%2)*.5,col=Math.floor(xx),fx=xx-col,fy=v*12-row;
    const edge=Math.min(fx/8,(1-fx)/8,fy/12,(1-fy)/12),chip=noise(u,v,128,20)*.003;
    const block=clamp((edge-.0015-chip)/.004),tone=hash(col%8,row,81);
    h=.12+block*(.55+(medium-.5)*.12+(fine-.5)*.07);
    const shade=(tone-.5)*28+(medium-.5)*10+(grain-.5)*3;
    r=(108+(broad-.5)*8)*(1-block)+(179+shade)*block;g=(99+(broad-.5)*8)*(1-block)+(160+shade*.93)*block;b=(84+(broad-.5)*7)*(1-block)+(131+shade*.85)*block;
    rough=.88+fine*.06;ao=.65+.35*block;
   }
   albedo[q]=clamp(r,0,255);albedo[q+1]=clamp(g,0,255);albedo[q+2]=clamp(b,0,255);
   surface[q]=rough*255;surface[q+1]=clamp(h)*255;surface[q+2]=ao*255;
  }
  await writeFile(`assets/materials/procedural/${kind}-albedo.png`,png(albedo));
  await writeFile(`assets/materials/procedural/${kind}-surface.png`,png(surface));
 }
 await writeFile('assets/materials/procedural/provenance.json',JSON.stringify({generator:'tools/generate-materials.mjs',source:'Seeded mathematical fields; no photographs, scans, or generated bitmap artwork.',resolution:[size,size],tileMetres:{tuff:4,soil:3,masonry:4},channels:{albedo:'sRGB base color; no directional lighting',surface:'Linear RGB: roughness, height, ambient cavity visibility'},reliefMetres:{tuff:.10,soil:.035,masonry:.045}},null,2)+'\n');
}

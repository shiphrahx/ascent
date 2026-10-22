export const balloonPatternNames=['Gores','Chevrons','Diamonds','Latitude bands','Sunburst','Stepped panels','Checker weave'];

export function paintBalloonFabric(c,s,palette,design,random){
 const gore=s/24;c.fillStyle=palette[0];c.fillRect(0,0,s,s);
 if(design===0)for(let i=0;i<24;i++){c.fillStyle=palette[i%4];c.fillRect(i*gore,0,gore+1,s);}
 if(design===1)for(let row=-1;row<9;row++)for(let i=0;i<12;i++){
  const x=i*s/12,y=row*s/8;c.fillStyle=palette[(row+9)%4];c.beginPath();c.moveTo(x,y);c.lineTo(x+s/24,y+s/16);c.lineTo(x+s/12,y);c.lineTo(x+s/12,y+s/8);c.lineTo(x+s/24,y+s*3/16);c.lineTo(x,y+s/8);c.closePath();c.fill();
 }
 if(design===2){c.fillStyle=palette[1];c.fillRect(0,0,s,s);for(let j=-1;j<9;j++)for(let i=-1;i<13;i++){
  const x=(i+(j%2)*.5)*s/12,y=j*s/8;c.fillStyle=palette[(i+j+28)%2?0:2];c.beginPath();c.moveTo(x,y-s/16);c.lineTo(x+s/24,y);c.lineTo(x,y+s/16);c.lineTo(x-s/24,y);c.closePath();c.fill();
 }}
 if(design===3)for(let j=0;j<9;j++){c.fillStyle=palette[j%4];c.fillRect(0,j*s/9,s,s/9+1);}
 if(design===4){c.fillStyle=palette[1];c.fillRect(0,0,s,s);for(let i=0;i<24;i++){
  c.fillStyle=palette[i%2?0:2];c.beginPath();c.moveTo(i*gore,0);c.lineTo((i+1)*gore,0);c.lineTo((i+.5)*gore,s*(i%2?.82:.62));c.closePath();c.fill();
  c.fillStyle=palette[3];c.beginPath();c.moveTo(i*gore,s);c.lineTo((i+1)*gore,s);c.lineTo((i+.5)*gore,s*.83);c.closePath();c.fill();
 }}
 if(design===5)for(let i=0;i<24;i++)for(let j=-1;j<5;j++){
  c.fillStyle=palette[(j+Math.floor(i/3)+12)%4];c.fillRect(i*gore,(j+(i%6)/6)*s/4,gore+1,s/4+1);
 }
 if(design===6)for(let i=0;i<24;i++)for(let j=0;j<12;j++){
  c.fillStyle=palette[(Math.floor(i/2)+j)%4];c.fillRect(i*gore,j*s/12,gore+1,s/12+1);
 }
 // Raised gores, panel seams and seeded fabric weave are shared construction.
 for(let i=0;i<24;i++){
  const gradient=c.createLinearGradient(i*gore,0,(i+1)*gore,0);gradient.addColorStop(0,'#0000002c');gradient.addColorStop(.45,'#ffffff13');gradient.addColorStop(1,'#00000025');c.fillStyle=gradient;c.fillRect(i*gore,0,gore+1,s);
  c.fillStyle='#ede0bd77';c.fillRect(i*gore,0,1.3*s/1024,s);c.fillStyle='#2e241a44';c.fillRect(i*gore+2*s/1024,0,s/1024,s);
 }
 for(let j=1;j<12;j++){const y=j*s/12;c.fillStyle='#2b211e33';c.fillRect(0,y,s,2*s/1024);c.strokeStyle='#e5d6af66';c.setLineDash([2*s/1024,3*s/1024]);c.beginPath();c.moveTo(0,y+4*s/1024);c.lineTo(s,y+4*s/1024);c.stroke();}c.setLineDash([]);
 for(let i=0;i<65000;i++){c.fillStyle=random()>.5?'#ffffff09':'#0000000b';c.fillRect(random()*s,random()*s,s/1024,2*s/1024);}
}

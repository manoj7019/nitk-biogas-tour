// Settled piles of solid food waste.
// Chunks are dropped one at a time onto a height field: each one comes to rest on whatever is under
// its footprint (container floor or chunks already there), rolls downhill while the local slope is
// steeper than the angle of repose, and is kept inside the container walls. A wet "mass" surface is
// then built from the same height field so the pile reads as one dense, solid heap with no gaps.
import * as THREE from 'three';
import {merge} from './geom.js';

export const WASTE_COLS=[0x6b4a26,0x8a6230,0x5a6d2a,0xa0521f,0x4d3a22,0xcdbb8a,0x3f5a22,0x8f3a1c,0xb89a5a];

export function makeRng(seed){let s=seed;return()=>{s=(s*16807)%2147483647;return s/2147483647}}

// Smooth, dense chunk (no spiky facets).
export function chunkGeo(r,rnd){const g=new THREE.IcosahedronGeometry(1,2),P=g.attributes.position;
  const a=rnd()*6,b=rnd()*6,c=rnd()*6,fl=.55+rnd()*.25;
  for(let i=0;i<P.count;i++){const x=P.getX(i),y=P.getY(i),z=P.getZ(i);const n=1+.16*Math.sin(3*x+a)*Math.cos(3*z+b)+.1*Math.sin(4*y+c);
    P.setXYZ(i,x*r*n,y*r*n*fl,z*r*n)}
  g.computeVertexNormals();g.rotateY(rnd()*6);return g}

// opts: x0,x1,z0,z1 (grid bounds), floor(x,z) -> y or null (outside), inside(x,z,y,r) -> [x,z] clamped,
//       n chunks, rMin,rMax, pour() -> [x,z] drop position, cap(x,z) -> max surface y (optional),
//       repose (rise per metre), cell
export function settlePile(o,rnd){
  const cell=o.cell||.025,nx=Math.ceil((o.x1-o.x0)/cell)+1,nz=Math.ceil((o.z1-o.z0)/cell)+1;
  const H=new Float32Array(nx*nz),IN=new Uint8Array(nx*nz);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const f=o.floor(o.x0+i*cell,o.z0+j*cell);IN[i*nz+j]=f==null?0:1;H[i*nz+j]=f==null?-1e9:f}
  const idx=(x,z)=>{const i=Math.round((x-o.x0)/cell),j=Math.round((z-o.z0)/cell);return(i<0||j<0||i>=nx||j>=nz)?-1:i*nz+j};
  const hAt=(x,z)=>{const k=idx(x,z);return k<0||!IN[k]?-1e9:H[k]};
  const restY=(x,z,r)=>{let m=-1e9;const s=Math.ceil(r*.8/cell);const ci=Math.round((x-o.x0)/cell),cj=Math.round((z-o.z0)/cell);
    for(let i=ci-s;i<=ci+s;i++)for(let j=cj-s;j<=cj+s;j++){if(i<0||j<0||i>=nx||j>=nz)continue;const k=i*nz+j;if(!IN[k])continue;const dx=(i-ci)*cell,dz=(j-cj)*cell;if(dx*dx+dz*dz>r*r*.64)continue;if(H[k]>m)m=H[k]}return m};
  const repose=o.repose||.7,chunks=[];
  for(let n=0;n<o.n;n++){const r=o.rMin+rnd()*(o.rMax-o.rMin);let [x,z]=o.pour(rnd);
    // roll downhill while steeper than the angle of repose
    for(let step=0;step<14;step++){[x,z]=o.inside(x,z,restY(x,z,r),r);const h0=restY(x,z,r);let best=null,bh=h0;const d=r*.9;
      for(let a=0;a<8;a++){const t=a/8*Math.PI*2+rnd()*.3,xx=x+Math.cos(t)*d,zz=z+Math.sin(t)*d;const [cx,cz]=o.inside(xx,zz,h0,r);const hh=restY(cx,cz,r);if(hh>-1e8&&hh<bh){bh=hh;best=[cx,cz]}}
      if(!best||(h0-bh)/d<repose)break;[x,z]=best}
    let y=restY(x,z,r);if(y<-1e8)continue;
    const sink=.35;                                  // chunks bed into the mass below them
    let cy=y+r*(1-sink)*.62;
    if(o.cap){const c=o.cap(x,z);if(cy>c)continue}
    chunks.push({x,y:cy,z,r});
    // raise the surface under the chunk to its top profile
    const s=Math.ceil(r/cell),ci=Math.round((x-o.x0)/cell),cj=Math.round((z-o.z0)/cell);
    for(let i=ci-s;i<=ci+s;i++)for(let j=cj-s;j<=cj+s;j++){if(i<0||j<0||i>=nx||j>=nz)continue;const k=i*nz+j;if(!IN[k])continue;const dx=(i-ci)*cell,dz=(j-cj)*cell,q=r*r-dx*dx-dz*dz;if(q<=0)continue;
      const top=cy+Math.sqrt(q)*.55;if(top>H[k])H[k]=top}
  }
  return {chunks,H,IN,nx,nz,cell,x0:o.x0,z0:o.z0,hAt};
}

// Wet mass surface from the settled height field (slightly below the chunk tops), mottled colour.
export function massMesh(p,mat,{drop=.018,minY=-1e8,rnd=Math.random}={}){
  const {H,IN,nx,nz,cell,x0,z0}=p,pos=[],col=[],ind=[],map=new Int32Array(nx*nz).fill(-1);
  // smooth a copy
  const S=new Float32Array(H.length);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const k=i*nz+j;if(!IN[k])continue;let s=0,w=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const ii=i+a,jj=j+b;if(ii<0||jj<0||ii>=nx||jj>=nz)continue;const kk=ii*nz+jj;if(!IN[kk])continue;s+=H[kk];w++}S[k]=s/w-drop}
  const c0=new THREE.Color(0x2e1f0e),c1=new THREE.Color(0x553c1c),c2=new THREE.Color(0x3a4416),tmp=new THREE.Color();
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const k=i*nz+j;if(!IN[k]||S[k]<minY)continue;map[k]=pos.length/3;pos.push(x0+i*cell,S[k],z0+j*cell);
    const n=.5+.5*Math.sin(i*.9+Math.sin(j*.7)*2)*Math.cos(j*.8);tmp.copy(c0).lerp(c1,n).lerp(c2,rnd()*.35);col.push(tmp.r,tmp.g,tmp.b)}
  for(let i=0;i<nx-1;i++)for(let j=0;j<nz-1;j++){const a=map[i*nz+j],b=map[(i+1)*nz+j],c=map[(i+1)*nz+j+1],d=map[i*nz+j+1];if(a<0||b<0||c<0||d<0)continue;ind.push(a,d,b,b,d,c)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(ind);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.receiveShadow=true;m.castShadow=true;return m;
}

// Merge settled chunks by colour into a few meshes.
export function chunkMeshes(chunks,rnd,mats){const by=new Map();
  chunks.forEach(c=>{const col=WASTE_COLS[Math.floor(rnd()*WASTE_COLS.length)];const g=chunkGeo(c.r,rnd);g.translate(c.x,c.y,c.z);if(!by.has(col))by.set(col,[]);by.get(col).push(g)});
  const out=[];by.forEach((gs,col)=>{const m=new THREE.Mesh(merge(gs),mats[col]);m.castShadow=true;m.receiveShadow=true;out.push(m)});return out}

export function wasteMats(){const m={};WASTE_COLS.forEach(c=>m[c]=new THREE.MeshStandardMaterial({color:c,roughness:.62,metalness:0}));
  m.mass=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:0,envMapIntensity:.6});return m}

// Push every vertex of the pile meshes back inside the container (so nothing shows through walls or floors).
// clamp(v) receives a THREE.Vector3 and adjusts it in place.
export function containMeshes(meshes,clamp){const v=new THREE.Vector3();
  meshes.forEach(m=>{const P=m.geometry.attributes.position;for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i);clamp(v);P.setXYZ(i,v.x,v.y,v.z)}
    P.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere()})}

import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Copy a (possibly quantised / interleaved) geometry into plain float attributes, baked to world space.
export function bakeWorld(mesh){
  mesh.updateWorldMatrix(true,false);
  const src=mesh.geometry, g=new THREE.BufferGeometry();
  for(const name in src.attributes){
    const a=src.attributes[name], n=a.count, s=a.itemSize, arr=new Float32Array(n*s);
    for(let i=0;i<n;i++){arr[i*s]=a.getX(i);if(s>1)arr[i*s+1]=a.getY(i);if(s>2)arr[i*s+2]=a.getZ(i);if(s>3)arr[i*s+3]=a.getW(i)}
    g.setAttribute(name,new THREE.BufferAttribute(arr,s));
  }
  if(src.index)g.setIndex(Array.from(src.index.array));
  g.groups=src.groups.slice();
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

// Keep only triangles for which keep(centroid, [a,b,c]) is true. Returns a new indexed geometry.
export function filterTris(g,keep){
  const p=g.attributes.position, idx=g.index?g.index.array:null, n=idx?idx.length:p.count;
  const out=[], A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),M=new THREE.Vector3();
  for(let t=0;t<n;t+=3){const a=idx?idx[t]:t,b=idx?idx[t+1]:t+1,c=idx?idx[t+2]:t+2;
    A.fromBufferAttribute(p,a);B.fromBufferAttribute(p,b);C.fromBufferAttribute(p,c);
    M.copy(A).add(B).add(C).multiplyScalar(1/3);
    if(keep(M,A,B,C))out.push(a,b,c)}
  const r=new THREE.BufferGeometry();for(const k in g.attributes)r.setAttribute(k,g.attributes[k]);
  r.setIndex(out);return r;
}
// Clip every triangle to the half-space y <= yCut (interpolating all attributes). Non-indexed output.
export function clipBelow(g,yCut){return clipY(g,yCut,true)}
export function clipAbove(g,yCut){return clipY(g,yCut,false)}
export function clipY(g,yCut,below){
  const IN=y=>below?y<=yCut:y>=yCut;
  const names=Object.keys(g.attributes),A=names.map(n=>g.attributes[n]),idx=g.index?g.index.array:null;
  const pos=g.attributes.position,n=idx?idx.length:pos.count;
  const out=names.map(()=>[]);
  const vert=i=>A.map(a=>{const s=a.itemSize,v=[a.getX(i)];if(s>1)v.push(a.getY(i));if(s>2)v.push(a.getZ(i));if(s>3)v.push(a.getW(i));return v});
  const lerp=(p,q,t)=>p.map((arr,k)=>arr.map((x,j)=>x+(q[k][j]-x)*t));
  const emit=v=>v.forEach((arr,k)=>out[k].push(...arr));
  const pi=names.indexOf('position');
  for(let t=0;t<n;t+=3){
    const ids=idx?[idx[t],idx[t+1],idx[t+2]]:[t,t+1,t+2];
    const ys=ids.map(i=>pos.getY(i));
    if(IN(ys[0])&&IN(ys[1])&&IN(ys[2])){ids.forEach(i=>emit(vert(i)));continue}
    if(!IN(ys[0])&&!IN(ys[1])&&!IN(ys[2]))continue;
    const V=ids.map(vert),poly=[];
    for(let k=0;k<3;k++){const P=V[k],Q=V[(k+1)%3],yp=P[pi][1],yq=Q[pi][1];
      if(IN(yp))poly.push(P);
      if(IN(yp)!==IN(yq))poly.push(lerp(P,Q,(yCut-yp)/(yq-yp)))}
    for(let k=1;k+1<poly.length;k++){emit(poly[0]);emit(poly[k]);emit(poly[k+1])}
  }
  const r=new THREE.BufferGeometry();
  names.forEach((nm,k)=>r.setAttribute(nm,new THREE.BufferAttribute(new Float32Array(out[k]),A[k].itemSize)));
  return r;
}

// Split triangles into buckets by key(centroid). Returns Map key->geometry (null keys dropped).
export function splitTris(g,key){
  const p=g.attributes.position, idx=g.index?g.index.array:null, n=idx?idx.length:p.count;
  const buckets=new Map(), M=new THREE.Vector3(),T=new THREE.Vector3();
  for(let t=0;t<n;t+=3){const a=idx?idx[t]:t,b=idx?idx[t+1]:t+1,c=idx?idx[t+2]:t+2;
    M.fromBufferAttribute(p,a);M.add(T.fromBufferAttribute(p,b));M.add(T.fromBufferAttribute(p,c));M.multiplyScalar(1/3);
    const k=key(M);if(k==null)continue;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(a,b,c)}
  const out=new Map();
  for(const [k,list] of buckets){const r=new THREE.BufferGeometry();for(const nm in g.attributes)r.setAttribute(nm,g.attributes[nm]);r.setIndex(list);const c=r.toNonIndexed();c.computeBoundingBox();c.computeBoundingSphere();out.set(k,c)}
  return out;
}

// Box with UVs in metres (u along the long horizontal axis), so tiled textures keep their scale.
export function boxUV(w,h,d,scale=1){
  const g=new THREE.BoxGeometry(w,h,d);const uv=g.attributes.uv,pos=g.attributes.position,nor=g.attributes.normal;
  for(let i=0;i<uv.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),nx=Math.abs(nor.getX(i)),ny=Math.abs(nor.getY(i));
    let u,v;if(ny>.5){u=x;v=z}else if(nx>.5){u=z;v=y}else{u=x;v=y}
    uv.setXY(i,u*scale,v*scale)}
  return g;
}

export function merge(list){const gs=list.filter(Boolean).map(g=>g.index?g.toNonIndexed():g);
  gs.forEach(g=>{for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2))});
  return mergeGeometries(gs,false)}

// A geometry placed with position / euler / scale (helper for building merged parts).
export function placed(g,pos,rot,scale){const m=new THREE.Matrix4(),q=new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(...(rot||[0,0,0])));m.compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...(scale||[1,1,1])));
  return g.applyMatrix4(m)}

// Cylinder from point a to point b.
export function rod(a,b,r,seg=12){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),L=d.length();
  const g=new THREE.CylinderGeometry(r,r,L,seg,1,false);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  const m=new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(.5),q,new THREE.Vector3(1,1,1));return g.applyMatrix4(m)}

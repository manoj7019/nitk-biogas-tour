import * as THREE from 'three';
import {merge,rod,boxUV} from './geom.js';

// Build one pipe run: straight pieces, smooth 90° bends, flanges at both ends.
// pts: array of [x,y,z]. Returns {geo, fittings:[...geos], path:[Vector3]}
export function pipeRun(pts,r,{bend=r*3,flangeEnds=true}={}){
  const P=pts.map(p=>new THREE.Vector3(...p));
  const parts=[], fit=[];
  // trimmed segment ends
  const segs=[];
  for(let i=0;i<P.length-1;i++)segs.push({a:P[i].clone(),b:P[i+1].clone()});
  const bends=[];
  for(let i=1;i<P.length-1;i++){
    const din=P[i].clone().sub(P[i-1]),dout=P[i+1].clone().sub(P[i]);
    const R=Math.min(bend,din.length()*.45,dout.length()*.45);din.normalize();dout.normalize();
    if(din.dot(dout)>.999)continue;
    const s=P[i].clone().addScaledVector(din,-R),e=P[i].clone().addScaledVector(dout,R);
    segs[i-1].b=s;segs[i].a=e;
    bends.push(new THREE.QuadraticBezierCurve3(s,P[i].clone(),e));
  }
  segs.forEach(s=>{if(s.a.distanceTo(s.b)>1e-3)parts.push(rod(s.a.toArray(),s.b.toArray(),r,14))});
  bends.forEach(c=>parts.push(new THREE.TubeGeometry(c,8,r,14,false)));
  if(flangeEnds){
    const f=(p,q)=>{const d=q.clone().sub(p).normalize();fit.push(rod(p.toArray(),p.clone().addScaledVector(d,.035).toArray(),r*1.75,16))};
    f(P[0],P[1]);f(P[P.length-1],P[P.length-2]);
  }
  return {geo:merge(parts),fit,path:P};
}

// Ball valve on a pipe at point p with axis dir (unit [x,y,z]), handle colour mat.
export function valveAt(p,dir,r){
  const d=new THREE.Vector3(...dir).normalize(),P=new THREE.Vector3(...p);
  const body=rod(P.clone().addScaledVector(d,-r*2.2).toArray(),P.clone().addScaledVector(d,r*2.2).toArray(),r*1.45,14);
  const fl1=rod(P.clone().addScaledVector(d,-r*2.5).toArray(),P.clone().addScaledVector(d,-r*2.1).toArray(),r*1.8,16);
  const fl2=rod(P.clone().addScaledVector(d,r*2.1).toArray(),P.clone().addScaledVector(d,r*2.5).toArray(),r*1.8,16);
  // handle: up then along pipe
  const up=Math.abs(d.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const top=P.clone().addScaledVector(up,r*2.4);
  const stem=rod(P.toArray(),top.toArray(),r*.3,8);
  const lever=rod(top.toArray(),top.clone().addScaledVector(d,r*5).toArray(),r*.32,8);
  return {body:merge([body,fl1,fl2,stem]),handle:lever};
}

// Supports under horizontal runs. floorAt(x,z) gives the floor height there; blocked(x,z) true where kit stands.
export function supports(path,r,floorAt,blocked,{step=1.5}={}){
  const conc=[],steel=[];
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];if(Math.abs(a.y-b.y)>1e-3)continue;
    const L=a.distanceTo(b);if(L<0.6)continue;
    const n=Math.max(1,Math.floor(L/step));
    for(let k=0;k<n;k++){const t=(k+.5)/n;const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y;
      if(blocked(x,z))continue;const f=floorAt(x,z),h=y-r-f;if(h<.04)continue;
      const along=Math.abs(b.x-a.x)>Math.abs(b.z-a.z);
      if(h<0.7){const g=boxUV(along?0.12:0.26,h,along?0.26:0.12,1);g.translate(x,f+h/2,z);conc.push(g)}
      else{steel.push(rod([x,f,z],[x,y-r,z],0.035,8));
        steel.push(boxUV(along?0.06:0.3,0.04,along?0.3:0.06).translate(x,y-r-0.02,z));
        steel.push(boxUV(0.22,0.02,0.22).translate(x,f+0.01,z));}
    }
  }
  return {conc,steel};
}

// Flow markers: small flat 2D chevrons.
//  mode 'pipe'  : chevron lies on the pipe surface and turns about the pipe axis to face the camera
//  mode 'floor' : chevron painted flat on the floor (normal up)
function chevronGeo(L,W){const g=new THREE.BufferGeometry();
  // tip at +z; notch makes it read as an arrowhead rather than a triangle
  const v=[0,0,L/2, -W/2,0,-L/2, 0,0,-L/2+L*.42, 0,0,L/2, 0,0,-L/2+L*.42, W/2,0,-L/2];
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();return g}
export function flowRider(path,color,{mode='pipe',pipeR=.03,L=.075,W=.065,spacing=.34,speed=.3,lift=.004}={}){
  const segs=[];let Ltot=0;
  for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],d=b.clone().sub(a),l=d.length();if(l<1e-4)continue;segs.push({a,d:d.normalize(),l,s0:Ltot});Ltot+=l}
  const n=Math.max(1,Math.floor(Ltot/spacing));
  const mat=new THREE.MeshBasicMaterial({color,toneMapped:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const im=new THREE.InstancedMesh(chevronGeo(L,W),mat,n);im.frustumCulled=false;im.renderOrder=5;im.userData.noPick=true;
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),X=new THREE.Vector3(),Y=new THREE.Vector3(),V=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0);
  function update(t,cam){
    for(let i=0;i<n;i++){let s=((i*spacing+t*speed)%Ltot+Ltot)%Ltot;let sg=segs[0];for(const g of segs)if(s>=g.s0)sg=g;
      const k=Math.min(s-sg.s0,sg.l);p.copy(sg.a).addScaledVector(sg.d,k);
      if(mode==='floor'){Y.copy(UP)}
      else{V.copy(cam||p).sub(p);Y.copy(V).addScaledVector(sg.d,-V.dot(sg.d));if(Y.lengthSq()<1e-8)Y.set(0,1,0);Y.normalize()}
      X.crossVectors(Y,sg.d).normalize();
      const e=Math.max(0,Math.min(1,s/0.12,(Ltot-s)/0.12));
      m.makeBasis(X.multiplyScalar(e),Y.clone().multiplyScalar(e),sg.d.clone().multiplyScalar(e));
      p.addScaledVector(Y,mode==='floor'?lift:pipeR+lift);m.setPosition(p);im.setMatrixAt(i,m)}
    im.instanceMatrix.needsUpdate=true}
  update(0);
  return {mesh:im,update};
}

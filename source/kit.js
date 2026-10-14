// Clean procedural replacements for CAD items whose meshes were too broken to keep
// (hydrolysis tank ribs and the shredder motors had spiky, torn triangles).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {merge,placed,rod,boxUV} from './geom.js';

function lathe(profile,seg=72){const g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),seg);g.computeVertexNormals();return g}
function mesh(g,m,cast=true){const o=new THREE.Mesh(g,m);o.castShadow=cast;o.receiveShadow=true;return o}

// Ribbed black HDPE hydrolysis tank on a steel stand, conical bottom, domed top, manhole, vent and cage ladder.
export function hydrolyser(cx,cz,M){
  const g=new THREE.Group();g.name='hydrolyser_new';
  const R=0.9,y0=0.92,y1=3.3,rib=0.22;
  const prof=[[0.0,0.6],[0.06,0.6],[0.07,0.64],[R,y0]];
  for(let y=y0;y<=y1+1e-6;y+=0.01){const ph=((y-y0)/rib)%1;const bump=Math.pow(Math.max(0,Math.cos((ph-0.5)*Math.PI*2)),6);prof.push([R+0.035*bump,y])}
  for(let i=1;i<=14;i++){const a=i/14*Math.PI/2;prof.push([0.28+(R-0.28)*Math.cos(a),y1+0.32*Math.sin(a)])}
  prof.push([0.28,3.62],[0.0,3.62]);
  g.add(mesh(lathe(prof,96).translate(cx,0,cz),M.hdpeTank));
  // manhole and vent
  g.add(mesh(merge([placed(new THREE.CylinderGeometry(.24,.24,.1,40),[cx,3.67,cz]),placed(new THREE.CylinderGeometry(.27,.27,.04,40),[cx,3.74,cz])]),M.hdpeTank));
  // top outlet nozzle (north side): the slurry line to screw pump 2 starts here
  g.add(mesh(merge([rod([cx,3.5,cz-.45],[cx,3.76,cz-.45],.05,16),rod([cx,3.73,cz-.45],[cx,3.77,cz-.45],.085,20)]),M.hdpeTank));
  // drain plug under the cone
  g.add(mesh(rod([cx,0.62,cz],[cx,0.55,cz],.04,14),M.hdpeTank));
  // stand: 4 legs and a ring beam under the cone
  const st=[];[45,135,225,315].forEach(a=>{const r=THREE.MathUtils.degToRad(a);st.push(boxUV(.07,.75,.07).translate(cx+.66*Math.cos(r),.1+.375,cz+.66*Math.sin(r)),boxUV(.18,.02,.18).translate(cx+.66*Math.cos(r),.11,cz+.66*Math.sin(r)))});
  st.push(placed(new THREE.TorusGeometry(.68,.03,8,48),[cx,.82,cz],[Math.PI/2,0,0]));
  g.add(mesh(merge(st),M.steelDark));
  // cage ladder on the south face, topping out at the rim with grab handles onto the roof
  g.add(cageLadder(cx,cz,R+.035,Math.PI/2,.1,y1,M,{hoopFrom:2.0,off:.12,w:.4,ext:.35,roofY:3.44}));
  return g;
}

// Hammer-mill shredder skid: blue motor, coupling guard, charcoal mill housing with inlet throat
// under the hopper, discharge spout on the north face.
export function shredder(M,labelMat){
  const g=new THREE.Group();g.name='shredder_new';const z=4.19,ax=0.8;
  // skid frame
  const sk=[];[3.92,4.46].forEach(zz=>sk.push(boxUV(1.95,.14,.08).translate(1.93,.17,zz)));
  for(const x of [1.0,1.45,1.9,2.4,2.86])sk.push(boxUV(.06,.08,.62).translate(x,.2,z));
  sk.push(boxUV(.56,.34,.4).translate(1.3,.41,z));          // motor plinth
  g.add(mesh(merge(sk),M.steelDark));
  // motor: finned body, fan cowl, terminal box, feet
  const body=new THREE.CylinderGeometry(1,1,1,96,1,false);const p=body.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),zz=p.getZ(i),a=Math.atan2(zz,x);const f=1+0.06*Math.pow(Math.max(0,Math.cos(a*24)),3);p.setX(i,x*f);p.setZ(i,zz*f)}
  body.computeVertexNormals();body.scale(.19,.5,.19);body.rotateZ(Math.PI/2);body.translate(1.32,ax,z);
  g.add(mesh(body,M.motor));
  g.add(mesh(merge([placed(new THREE.CylinderGeometry(.2,.2,.12,48),[1.01,ax,z],[0,0,Math.PI/2]),placed(new THREE.SphereGeometry(.2,32,16,0,Math.PI*2,0,Math.PI/2),[0.95,ax,z],[0,0,Math.PI/2],[1,.35,1])]),M.motorDark));
  g.add(mesh(merge([placed(new THREE.CylinderGeometry(.19,.19,.04,48),[1.585,ax,z],[0,0,Math.PI/2]),new RoundedBoxGeometry(.16,.1,.16,3,.02).translate(1.32,ax+.24,z)]),M.motor));
  // shaft + coupling guard
  g.add(mesh(rod([1.6,ax,z],[1.78,ax,z],.035,16),M.galv));
  const gd=new THREE.CylinderGeometry(.11,.11,.18,32,1,true,0,Math.PI);gd.rotateZ(Math.PI/2);gd.translate(1.69,ax,z);
  g.add(mesh(gd,M.guard));
  // mill housing: rounded box with a half-drum top, bearing housings, inlet throat
  const hb=new RoundedBoxGeometry(.6,.6,.56,4,.04).translate(2.07,.55,z);
  const drum=new THREE.CylinderGeometry(.28,.28,.6,48,1,false,0,Math.PI);drum.rotateZ(Math.PI/2);drum.translate(2.07,.85,z);
  g.add(mesh(merge([hb,drum]),M.mill));
  g.add(mesh(merge([placed(new THREE.CylinderGeometry(.09,.09,.08,32),[1.74,ax,z],[0,0,Math.PI/2]),placed(new THREE.CylinderGeometry(.09,.09,.08,32),[2.4,ax,z],[0,0,Math.PI/2])]),M.motorDark));
  g.add(mesh(new RoundedBoxGeometry(.42,.2,.42,2,.02).translate(2.05,1.2,z),M.mill));
  // discharge spout (north face) — the slurry line S1 starts here
  g.add(mesh(merge([rod([2.05,.42,3.91],[2.05,.42,3.86],.06,20)]),M.mill));
  // name plate
  if(labelMat){const pl=new THREE.Mesh(new THREE.PlaneGeometry(.46,.115),labelMat);pl.position.set(2.07,.52,z+.283);g.add(pl)}
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  return g;
}

// One soft pillow-shaped gas balloon (superellipsoid).
export function balloon(c,rad,mat){
  const s=new THREE.SphereGeometry(1,64,40),p=s.attributes.position,e=0.55;
  for(let i=0;i<p.count;i++){const v=[p.getX(i),p.getY(i),p.getZ(i)].map(a=>Math.sign(a)*Math.pow(Math.abs(a),e));p.setXYZ(i,v[0]*rad[0]+c[0],v[1]*rad[1]+c[1],v[2]*rad[2]+c[2])}
  s.computeVertexNormals();return mesh(s,mat);
}

// Cage ladder on a vertical cylinder (centre cx,cz, radius R) at angle a (radians, 0 = +x).
// Rails stand off the shell on brackets; hoops start at hoopFrom; grab rails bend over the top.
export function cageLadder(cx,cz,R,a,y0,yTop,M,{hoopFrom=2.2,off=0.18,w=0.42,ext=0.35,roofY=yTop+0.05}={}){
  // Rails rise only a short way above the rim (yTop) and bend over onto the roof as grab handles,
  // so the climber steps straight off the top rung onto the tank roof.
  const ux=Math.cos(a),uz=Math.sin(a),tx=-uz,tz=ux,L=[];
  const P=(r,t,y)=>[cx+ux*r+tx*t,y,cz+uz*r+tz*t];
  const rr=R+off,yt=yTop+ext,rin=R-0.1;
  [-w/2,w/2].forEach(t=>{L.push(rod(P(rr,t,y0),P(rr,t,yt),.02,8));
    L.push(rod(P(rr,t,yt),P(rin,t,yt),.02,8));L.push(rod(P(rin,t,yt),P(rin,t,roofY),.02,8));
    L.push(new THREE.SphereGeometry(.02,8,6).translate(...P(rr,t,yt)),new THREE.SphereGeometry(.02,8,6).translate(...P(rin,t,yt)))});
  for(let y=y0+.3;y<=yTop+.01;y+=.3)L.push(rod(P(rr,-w/2,y),P(rr,w/2,y),.013,6));
  L.push(rod(P(rr,-w/2,yTop),P(rr,w/2,yTop),.013,6));                                                  // top rung at rim level
  for(let y=y0+.6;y<yTop;y+=1.2)[-w/2,w/2].forEach(t=>L.push(rod(P(R+.005,t,y),P(rr,t,y),.015,6)));   // brackets to shell
  const hr=.36;const hoops=[];for(let y=hoopFrom;y<=yTop-.05;y+=.5)hoops.push(y);if(hoops.length&&yTop-hoops[hoops.length-1]>.2)hoops.push(yTop);
  hoops.forEach(y=>{const arc=[];for(let i=0;i<=16;i++){const th=-Math.PI/2+i/16*Math.PI;arc.push(P(rr+Math.cos(th)*.5,Math.sin(th)*hr,y))}
    for(let i=0;i<arc.length-1;i++)L.push(rod(arc[i],arc[i+1],.011,6))});
  if(hoops.length)for(const th of [-0.9,-0.3,0.3,0.9])L.push(rod(P(rr+Math.cos(th)*.5,Math.sin(th)*hr,hoops[0]),P(rr+Math.cos(th)*.5,Math.sin(th)*hr,hoops[hoops.length-1]),.009,6));
  return mesh(merge(L),M.galv);
}

// Smooth dished bottom head + seating ring for the gas storage vessel.
export function vesselBase(cx,cz,R,yJoin,M,shellMat){
  const g=new THREE.Group();
  const prof=[[0,yJoin-.2]];for(let i=1;i<=16;i++){const t=i/16;prof.push([R*Math.sin(t*Math.PI/2),yJoin-.2+.2*(1-Math.cos(t*Math.PI/2))])}
  prof.push([R,yJoin+.03]);
  g.add(mesh(lathe(prof,72).translate(cx,0,cz),shellMat));
  g.add(mesh(lathe([[R-.06,yJoin-.19],[R+.03,yJoin-.19],[R+.03,yJoin-.02],[R-.02,yJoin-.02],[R-.06,yJoin-.1]],72).translate(cx,0,cz),M.steelDark));
  // stand: four I-section legs under the seating ring, base plates, gussets and a braced ring at knee height
  const st=[],floor=0.1,top=yJoin-.19,lr=R-.06;
  [45,135,225,315].forEach(d=>{const a=d*Math.PI/180,x=cx+Math.cos(a)*lr,z=cz+Math.sin(a)*lr,h=top-floor;
    const leg=new THREE.Group();
    [boxUV(.11,h,.012).translate(0,0,.05),boxUV(.11,h,.012).translate(0,0,-.05),boxUV(.012,h,.1)].forEach(b=>{b.rotateY(-a);b.translate(x,floor+h/2,z);st.push(b)});
    st.push(boxUV(.2,.016,.2).rotateY(-a).translate(x,floor+.008,z));                 // base plate
    st.push(boxUV(.16,.012,.16).rotateY(-a).translate(x,top-.006,z));                 // cap plate
    for(let k=0;k<4;k++)st.push(new THREE.CylinderGeometry(.012,.012,.03,8).translate(x+Math.cos(a+k*Math.PI/2+Math.PI/4)*.075,floor+.03,z+Math.sin(a+k*Math.PI/2+Math.PI/4)*.075));  // anchor bolts
  });
  st.push(new THREE.TorusGeometry(lr,.018,8,64).rotateX(Math.PI/2).translate(cx,floor+.18,cz));  // knee ring tying the legs
  g.add(mesh(merge(st),M.steelDark));
  return g;
}

import * as THREE from 'three';
import {EQUIP,SITE,ROOF_LIFT,DIG,FLARE_H} from './layout.js';
import {bakeWorld,filterTris,clipBelow,clipAbove,splitTris,boxUV,merge,placed,rod} from './geom.js';
import {pipeRun,valveAt,supports,flowRider} from './pipes.js';
import {ROUTES,VALVES,WASTE_FLOOR,MEDIA} from './routes.js';
import {hydrolyser,shredder,balloon,cageLadder,vesselBase} from './kit.js';

// Old GLB pipework, fittings and structures that are replaced by geometry built here.
const HIDE=/^(wall|plinth|S1_shredder_mixtank|flange|valve_body\.?\d*|pipe_support|D1_digester_digestate|G1_digester_cage|G6_compressor_storage_hose|sorting_table_grate)$/;
const SURROUND=/^(trunk|foliage_leaf_broad|foliage_leaf_forest|foliage_palm_frond|foliage_pot_frond|tarp_fence|fence_post|pot|groundmat\.?\d*)$/;
const KITCHEN=/^(kitchen_wall|kitchen_floor|burner_frame|label_burner\.?\d*)$/;
const DECOR=/^(digester_band|gas_bag|label_(?!burner).*|sticker_.*)$/;

export function buildPlant(root,scene){
  const byName={};root.children.forEach(o=>{byName[o.name]=o});
  const mats={};root.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{mats[m.name]=m})});
  const layers={roof:[],compound:[],surroundings:[],kitchen:[]};
  const plantG=new THREE.Group();plantG.name='plant_new';scene.add(plantG);

  // ---- tiled material clone with repeats per metre
  function tiled(name,perM){const src=mats[name];const m=src.clone();if(m.map){m.map=m.map.clone();m.map.repeat.set(perM,perM);m.map.offset.set(0,0);m.map.rotation=0;m.map.wrapS=m.map.wrapT=THREE.RepeatWrapping;m.map.needsUpdate=true}m.vertexColors=false;return m}
  const M={
    concrete:tiled('concrete',0.55), brick:tiled('brick',1.0), grate:tiled('grate',3),
    galv:new THREE.MeshStandardMaterial({color:0x9aa1a8,metalness:.85,roughness:.38}),
    steelDark:new THREE.MeshStandardMaterial({color:0x2c3136,metalness:.5,roughness:.45}),
    lid:new THREE.MeshStandardMaterial({color:0x48525a,metalness:.45,roughness:.5}),
    lidRim:new THREE.MeshStandardMaterial({color:0x2a2f34,metalness:.5,roughness:.45}),
    ss:new THREE.MeshStandardMaterial({color:0xc9ced3,metalness:.9,roughness:.28,side:THREE.DoubleSide}),
    pvc:new THREE.MeshStandardMaterial({color:0xeeeeea,metalness:0,roughness:.38}),
    pvcFl:new THREE.MeshStandardMaterial({color:0xd9d9d3,metalness:0,roughness:.4}),
    gas:new THREE.MeshStandardMaterial({color:0xf2b705,metalness:.15,roughness:.4}),
    gasFl:new THREE.MeshStandardMaterial({color:0xd99a00,metalness:.2,roughness:.4}),
    hdpe:new THREE.MeshStandardMaterial({color:0x151515,metalness:0,roughness:.5}),
    red:new THREE.MeshStandardMaterial({color:0xb3140d,metalness:.1,roughness:.45}),
    green:new THREE.MeshStandardMaterial({color:0x1f7a3a,metalness:0,roughness:.55}),
    greenDark:new THREE.MeshStandardMaterial({color:0x14522a,metalness:0,roughness:.6}),
    rubber:new THREE.MeshStandardMaterial({color:0x111111,metalness:0,roughness:.8}),
    handle:new THREE.MeshStandardMaterial({color:0xd62818,metalness:.1,roughness:.4}),
    hdpeTank:new THREE.MeshStandardMaterial({color:0x161616,metalness:0,roughness:.42}),
    motor:new THREE.MeshStandardMaterial({color:0x1d4f8f,metalness:.35,roughness:.4}),
    motorDark:new THREE.MeshStandardMaterial({color:0x1b232c,metalness:.5,roughness:.4}),
    guard:new THREE.MeshStandardMaterial({color:0xf2b705,metalness:.1,roughness:.45}),
    mill:new THREE.MeshStandardMaterial({color:0x30363c,metalness:.45,roughness:.42}),
  };
  function add(geo,mat,parent=plantG,{cast=true,recv=true}={}){if(!geo)return null;const m=new THREE.Mesh(geo,mat);m.castShadow=cast;m.receiveShadow=recv;parent.add(m);return m}

  // ---- 1. hide replaced GLB parts
  Object.values(byName).forEach(o=>{if(HIDE.test(o.name))o.visible=false});
  Object.values(byName).forEach(o=>{if(SURROUND.test(o.name))layers.surroundings.push(o);if(KITCHEN.test(o.name))layers.kitchen.push(o)});

  // ---- 2. digester: cut the broken CAD top off (before anything moves)
  const dNode=byName[EQUIP.digester.node];
  dNode.traverse(o=>{if(!o.isMesh)return;let g=clipAbove(clipBelow(bakeWorld(o),DIG.cut),DIG.base);
    g=filterTris(g,c=>!(Math.hypot(c.x-DIG.cx,c.z-DIG.cz)>1.555&&c.x>-0.98&&c.z<-1.25));   // broken CAD cage ladder (rebuilt below)
    const m=new THREE.Mesh(g,o.material);m.castShadow=m.receiveShadow=true;m.name=o.name+'_cut';o.visible=false;o.userData.replacedBy=m;o.parent.userData.cut=m});
  const dCut=[];dNode.traverse(o=>{if(o.userData.replacedBy)dCut.push(o.userData.replacedBy)});

  // shredder: drop the raised black stand/plate at its east end (the new hopper + bin tipper replace it)
  // storage vessel: the CAD bottom head is ragged where it meets the stand; cut it and fit a smooth dished head
  byName[EQUIP.storage.node].traverse(o=>{if(!o.isMesh||!/yellow/.test(o.material.name))return;const g=clipAbove(bakeWorld(o),0.82);
    const m=new THREE.Mesh(g,o.material);m.castShadow=m.receiveShadow=true;o.visible=false;o.userData.replacedBy=m});
  const stCut=[];byName[EQUIP.storage.node].traverse(o=>{if(o.userData.replacedBy)stCut.push(o.userData.replacedBy)});
  byName[EQUIP.mixtank.node].traverse(o=>{if(o.isMesh&&/black_paint/.test(o.material.name))o.visible=false});   // dangling CAD stub
  // hydrolyser + shredder CAD meshes are torn (spiky triangles): replaced by clean models (kit.js)
  [EQUIP.hydrolyzer.node,EQUIP.shredder.node].forEach(nm=>byName[nm].traverse(o=>{if(o.isMesh)o.visible=false}));

  // flare: stretch the post so the burner tip stands FLARE_H above ground
  {const lift=(-0.3+FLARE_H)-1.07;byName[EQUIP.flare.node].traverse(o=>{if(!o.isMesh)return;const g=bakeWorld(o),p=g.attributes.position;
    for(let i=0;i<p.count;i++)if(p.getY(i)>0.78)p.setY(i,p.getY(i)+lift);
    const m=new THREE.Mesh(g,o.material);m.castShadow=m.receiveShadow=true;o.visible=false;o.userData.replacedBy=m});}
  const fCut=[];byName[EQUIP.flare.node].traverse(o=>{if(o.userData.replacedBy)fCut.push(o.userData.replacedBy)});

  // ---- 3. decals and bands: bake to world now, assign triangles to an owner later
  const ownerOrder=Object.keys(EQUIP).sort((a,b)=>{const A=EQUIP[a].fp,B=EQUIP[b].fp;return (A[1]-A[0])*(A[3]-A[2])-(B[1]-B[0])*(B[3]-B[2])});
  function ownerAt(x,z){for(const k of ownerOrder){const f=EQUIP[k].fp;if(x>=f[0]&&x<=f[1]&&z>=f[2]&&z<=f[3])return k}return null}
  const decor=[];
  Object.values(byName).forEach(o=>{if(!DECOR.test(o.name))return;o.traverse(mm=>{if(!mm.isMesh)return;
    if(o.name==='label_shredder'||/^label_hydrolyzer/.test(o.name))return;
    const g=bakeWorld(mm);const parts=splitTris(g,c=>{const k=ownerAt(c.x,c.z);if(!k)return null;if(k==='digester'&&(c.y>DIG.cut-0.02||(o.name==='digester_band'&&c.y<DIG.base+0.05)))return null;
      if(o.name==='gas_bag'&&c.y<1.1)return null;   // the two small bottom balloons -> replaced by one
      return k});
    parts.forEach((pg,k)=>{if(k==='digester'){pg=pg.clone().translate(DIG.decorDX,0,0);if(o.name==='digester_band'){const P=pg.attributes.position;for(let i=0;i<P.count;i++){const y=P.getY(i);P.setX(i,DIG.cx+(P.getX(i)-DIG.cx)*1.022);P.setZ(i,DIG.cz+(P.getZ(i)-DIG.cz)*1.022)}}}decor.push({k,g:pg,mat:mm.material,name:o.name})})});o.visible=false});

  // ---- 4. move each item into its new place
  const groups={};
  for(const [k,e] of Object.entries(EQUIP)){
    const outer=new THREE.Group(),inner=new THREE.Group();outer.name='eq_'+k;
    outer.position.set(e.to[0],0,e.to[1]);outer.rotation.y=THREE.MathUtils.degToRad(e.to[2]);
    inner.position.set(-e.pivot[0],0,-e.pivot[1]);outer.add(inner);plantG.add(outer);
    const n=byName[e.node];if(n){inner.add(n)}
    groups[k]={outer,inner};
  }
  dCut.forEach(m=>groups.digester.inner.add(m));fCut.forEach(m=>groups.flare.inner.add(m));stCut.forEach(m=>groups.storage.inner.add(m));
  decor.forEach(d=>{const m=new THREE.Mesh(d.g,d.mat);m.castShadow=!/label|sticker/.test(d.name);m.receiveShadow=true;
    if(/label|sticker/.test(d.name)){m.material=d.mat;m.renderOrder=2}
    groups[d.k].inner.add(m)});
  // clean models
  groups.hydrolyzer.proc=hydrolyser(EQUIP.hydrolyzer.to[0],EQUIP.hydrolyzer.to[1],M);plantG.add(groups.hydrolyzer.proc);
  const lab=mats.lab_shred?mats.lab_shred.clone():null;if(lab)lab.vertexColors=false;if(lab&&lab.map){lab.map=lab.map.clone();lab.map.repeat.set(1,-1);lab.map.offset.set(0,1);lab.map.needsUpdate=true}
  groups.shredder.proc=shredder(M,lab);plantG.add(groups.shredder.proc);
  // hydrolyser signs, wrapped onto the curved shell
  {const hx=EQUIP.hydrolyzer.to[0],hz=EQUIP.hydrolyzer.to[1],R=.948,th=1.465;
    [['lab_hydro',2.6,.9,.22],['stk_caution',2.2,.35,.22]].forEach(([nm,y,w,h])=>{const src=mats[nm];if(!src)return;const m=src.clone();m.vertexColors=false;m.polygonOffset=true;m.polygonOffsetFactor=-1;
      if(m.map){m.map=m.map.clone();m.map.repeat.set(1,-1);m.map.offset.set(0,1);m.map.needsUpdate=true}
      const tl=w/R,g=new THREE.CylinderGeometry(R,R,h,24,1,true,th-tl/2,tl).translate(hx,y,hz);
      const sm=new THREE.Mesh(g,m);sm.renderOrder=2;groups.hydrolyzer.proc.add(sm)})}
  {const dg=new THREE.Group();dg.name='digester_new';plantG.add(dg);groups.digester.proc=dg;
    const R=1.503,b=DIG.base,band=mats.black_paint||M.lidRim;
    // solid skirt from the plinth to the shell, a bolted joint flange and a concrete ring foundation
    dg.add(add(new THREE.CylinderGeometry(R,R,b-0.1+0.03,96,1,true).translate(DIG.cx,0.1+(b-0.07)/2,DIG.cz),band,dg));
    dg.add(add(new THREE.CylinderGeometry(R+.12,R+.12,.12,96,1,false).translate(DIG.cx,b+.01,DIG.cz),M.lidRim,dg));
    {const bolts=[];for(let i=0;i<48;i++){const a=i/48*Math.PI*2;bolts.push(new THREE.CylinderGeometry(.013,.013,.03,6).translate(DIG.cx+Math.cos(a)*(R+.08),b+.08,DIG.cz+Math.sin(a)*(R+.08)))}dg.add(add(merge(bolts),M.galv,dg))}
    dg.add(add(new THREE.CylinderGeometry(R+.12,R+.15,.12,96,1,false).translate(DIG.cx,0.16,DIG.cz),M.concrete,dg));
    // access hatch in the skirt (south-west, clear of the pipes)
    {const a=Math.PI*0.78,hx=DIG.cx+Math.cos(a)*(R+.004),hz=DIG.cz+Math.sin(a)*(R+.004);const h=new THREE.Mesh(new THREE.CylinderGeometry(R+.012,R+.012,.5,24,1,true,Math.PI/2-a-.2,.4),M.lidRim);h.position.set(DIG.cx,0.62,DIG.cz);dg.add(h)}
    dg.add(cageLadder(DIG.cx,DIG.cz,R,-0.87,0.24,DIG.cut,M,{hoopFrom:2.3}));}
  groups.storage.proc=vesselBase(EQUIP.storage.to[0],EQUIP.storage.to[1],0.748,0.82,M,mats.yellow_paint);plantG.add(groups.storage.proc);
  {const a=Math.PI/3,cx=EQUIP.storage.to[0],cz=EQUIP.storage.to[1],u=[Math.cos(a),0,Math.sin(a)],P=r=>[cx+u[0]*r,0.95,cz+u[2]*r];   // spare nozzle, blanked off
    groups.storage.proc.add(add(merge([rod(P(.7),P(.86),.03,16),rod(P(.86),P(.885),.06,20)]),M.gasFl,groups.storage.proc))}
  if(mats.gas_bag)groups.cage.inner.add(balloon([3.165,0.69,0.32],[0.68,0.33,0.46],mats.gas_bag));
  plantG.updateMatrixWorld(true);
  // map an ORIGINAL-coordinate point of item k to the new world position
  function xf(k,p){const v=new THREE.Vector3(...p);return v.applyMatrix4(groups[k].inner.matrixWorld).toArray()}

  // ---- 5. roof + trusses: lift everything above the column heads
  ['roof','column'].forEach(nm=>{const o=byName[nm];if(!o)return;o.traverse(mm=>{if(!mm.isMesh)return;const g=bakeWorld(mm),p=g.attributes.position;
      for(let i=0;i<p.count;i++)if(p.getY(i)>5.0)p.setY(i,p.getY(i)+ROOF_LIFT);g.computeVertexNormals();
      if(nm==='column'){/* keep flat shading look from source normals */}
      const m=new THREE.Mesh(g,mm.material);m.castShadow=true;m.receiveShadow=true;m.name=nm+'_lifted';plantG.add(m);layers.roof.push(m)});o.visible=false});

  // ---- 6. platform, compound wall with east gate, pads
  const S=SITE;
  add(boxUV(9.3,0.4,9.3).translate(-0.14,-0.1,0.83),M.concrete,plantG,{cast:false});           // plinth slab
  add(boxUV(1.75,0.4,1.6).translate(5.385,-0.1,0.9),M.concrete,plantG,{cast:false});           // entrance landing
  [[-4.39,5.38],[-0.145,5.38],[4.115,5.38],[-4.39,-3.72],[-0.145,-3.72],[4.115,-3.72]].forEach(([x,z])=>add(boxUV(.34,.26,.34).translate(x,.23,z),M.concrete));
  {
    const t=S.t,h=S.h-0.1,y=0.1+h/2,bw=[],cp=[];
    const W=(x0,x1,z0,z1)=>{bw.push(boxUV(x1-x0,h,z1-z0).translate((x0+x1)/2,y,(z0+z1)/2));cp.push(boxUV(x1-x0+.06,.06,z1-z0+.06).translate((x0+x1)/2,S.h+.03,(z0+z1)/2))};
    W(S.x0,S.x1,S.z0,S.z0+t);                 // north
    W(S.x0,S.x1,S.z1-t,S.z1);                 // south
    W(S.x0,S.x0+t,S.z0+t,S.z1-t);             // west
    W(S.x1-t,S.x1,S.z0+t,S.gate[0]);          // east, north of gate
    W(S.x1-t,S.x1,S.gate[1],S.z1-t);          // east, south of gate
    const wall=add(merge(bw),M.brick),cop=add(merge(cp),M.concrete);layers.compound.push(wall,cop);
    // gate posts + one open mesh leaf
    const gp=[];[S.gate[0]-0.0,S.gate[1]+0.0].forEach(z=>gp.push(boxUV(.3,1.25,.3).translate(S.x1-t/2,.1+.625,z+(z<1?-.0:.0))));
    const posts=add(merge(gp),M.concrete);layers.compound.push(posts);
    const leaf=new THREE.Group();const fr=[];const L=S.gate[1]-S.gate[0]-0.3,gh=1.05;
    fr.push(rod([0,0.15,0],[0,0.15+gh,0],.025,8),rod([L,0.15,0],[L,0.15+gh,0],.025,8),rod([0,0.15,0],[L,0.15,0],.025,8),rod([0,0.15+gh,0],[L,0.15+gh,0],.025,8));
    leaf.add(new THREE.Mesh(merge(fr),M.galv));const mesh=new THREE.Mesh(new THREE.PlaneGeometry(L,gh),M.grate.clone());mesh.material.side=THREE.DoubleSide;mesh.position.set(L/2,0.15+gh/2,0);leaf.add(mesh);
    leaf.position.set(S.x1-t/2-0.02,0,S.gate[0]+0.17);leaf.rotation.y=Math.PI*0.5;// swung open against the inside of the north wall run
    leaf.rotation.y=-Math.PI/2;leaf.position.set(S.x1+0.02,0,S.gate[0]+0.15);leaf.rotation.y=-0.35;
    plantG.add(leaf);layers.compound.push(leaf);
  }
  add(boxUV(1.1,.15,1.1).translate(EQUIP.flare.to[0],-0.225,EQUIP.flare.to[1]),M.concrete,plantG,{cast:false});  // flare pad
  // flare guy wires: three cables from 3.6 m to ground anchors
  const flareExtra=new THREE.Group();plantG.add(flareExtra);
  {const fx=EQUIP.flare.to[0],fz=EQUIP.flare.to[1]+.08,gw=[],an=[];
    [-90,30,150].forEach(a=>{const r=THREE.MathUtils.degToRad(a),ax=fx+1.5*Math.cos(r),az=fz+1.5*Math.sin(r);
      gw.push(rod([fx,3.3,fz],[ax,-0.28,az],.006,4));an.push(boxUV(.16,.06,.16).translate(ax,-0.27,az))});
    add(merge(gw),M.galv,flareExtra).userData.noPick=true;add(merge(an),M.concrete,flareExtra);
    const sx=fx+.015,sz=EQUIP.flare.to[1]+.08,top=-0.3+FLARE_H;
    add(merge([rod([sx,.6,sz],[sx,top-.3,sz],.055,16),rod([sx,top-1.3,sz],[sx,top-1.0,sz],.1,18),rod([sx,top-1.33,sz],[sx,top-1.27,sz],.13,18),rod([sx,top-1.03,sz],[sx,top-.97,sz],.13,18)]),M.red,flareExtra);}
  // digestate collection pit outside the west wall
  const pit={x:-5.3,z:-0.73};
  const pitObjs=[add(boxUV(.7,.45,.7).translate(pit.x,-0.075,pit.z),M.concrete),add(boxUV(.56,.03,.56).translate(pit.x,.165,pit.z),M.steelDark)];

  // ---- 7. digester: clean conical lid with curb, manholes, gas nozzle and relief valve
  const D=DIG,lidG=groups.digester.inner;const cx=D.cx,cz=D.cz,top=D.cut;
  {
    const parts=[],rim=[];
    rim.push(placed(new THREE.CylinderGeometry(D.r+.035,D.r+.035,.16,72,1,true),[cx,top-.05,cz]));
    rim.push(placed(new THREE.TorusGeometry(D.r+.04,.03,8,72),[cx,top+.03,cz],[Math.PI/2,0,0]));
    parts.push(placed(new THREE.CylinderGeometry(.16,D.r+.03,.26,72,1,false),[cx,top+.03+.13,cz]));
    add(merge(parts),M.lid,lidG);add(merge(rim),M.lidRim,lidG);
    const slopeY=r=>top+.03+.26*(1-(r-.16)/(D.r+.03-.16));
    const mh=[],bolts=[];
    [[0.9,Math.PI*1.15],[0.9,Math.PI*.35]].forEach(([rr,a])=>{const x=cx+rr*Math.cos(a),z=cz+rr*Math.sin(a),y=slopeY(rr);
      mh.push(placed(new THREE.CylinderGeometry(.27,.27,.14,32),[x,y+.05,z]));
      mh.push(placed(new THREE.CylinderGeometry(.33,.33,.035,32),[x,y+.135,z]));
      for(let i=0;i<12;i++){const b=i/12*Math.PI*2;bolts.push(placed(new THREE.CylinderGeometry(.014,.014,.03,6),[x+.3*Math.cos(b),y+.165,z+.3*Math.sin(b)]))}});
    add(merge(mh),M.lid,lidG);add(merge(bolts),M.galv,lidG);
    // pressure / vacuum relief valve
    const rv=[];const rx=cx+.55*Math.cos(Math.PI*1.75),rz=cz+.55*Math.sin(Math.PI*1.75),ry=slopeY(.55);
    rv.push(placed(new THREE.CylinderGeometry(.06,.06,.18,16),[rx,ry+.09,rz]),placed(new THREE.CylinderGeometry(.13,.13,.12,20),[rx,ry+.24,rz]),placed(new THREE.CylinderGeometry(.15,.15,.02,20),[rx,ry+.31,rz]));
    add(merge(rv),M.gas,lidG);
    // central gas outlet nozzle
    const nz=[rod([cx,top+.27,cz],[cx,top+.47,cz],.05,16),rod([cx,top+.45,cz],[cx,top+.49,cz],.09,20)];
    add(merge(nz),M.gasFl,lidG);
  }

  let tipBin=null,tipPose=null;const fallLumps=[];
  // ---- 8. food-waste entry: bins at the gate, sorting table, bin tipper, hopper on the shredder
  const receptionG=new THREE.Group();receptionG.name='reception';plantG.add(receptionG);
  const RG=receptionG;
  const hop={x:2.05,z:4.19,y0:1.3,y1:1.45,y2:1.92,w:1.0,d:.9,tw:.4};
  {
    const g=[];
    // throat box + flared hopper (square frustum via 4-sided cylinder, scaled to a rectangle)
    g.push(placed(new THREE.CylinderGeometry(hop.tw*0.7071,hop.tw*0.7071,hop.y1-hop.y0,4,1,true),[hop.x,(hop.y0+hop.y1)/2,hop.z],[0,Math.PI/4,0]));
    const fr=new THREE.CylinderGeometry(0.7071,hop.tw/hop.w*0.7071,hop.y2-hop.y1,4,1,true);fr.rotateY(Math.PI/4);fr.scale(hop.w,1,hop.d);fr.translate(hop.x,(hop.y1+hop.y2)/2,hop.z);g.push(fr);
    add(merge(g),M.ss,RG);
    // rim angle
    const r=[];const hx=hop.w/2,hz=hop.d/2,Y=hop.y2;
    r.push(rod([hop.x-hx,Y,hop.z-hz],[hop.x+hx,Y,hop.z-hz],.022,6),rod([hop.x-hx,Y,hop.z+hz],[hop.x+hx,Y,hop.z+hz],.022,6),rod([hop.x-hx,Y,hop.z-hz],[hop.x-hx,Y,hop.z+hz],.022,6),rod([hop.x+hx,Y,hop.z-hz],[hop.x+hx,Y,hop.z+hz],.022,6));
    add(merge(r),M.galv,RG);
    // bin tipper: two posts, carriage and a green wheelie bin tipped into the hopper
    const tp=[];const tx=hop.x,tz=hop.z-0.95;
    tp.push(boxUV(.7,.04,.55).translate(tx,.12,tz-.05));
    [-.36,.36].forEach(o=>tp.push(boxUV(.08,2.85,.08).translate(tx+o,.1+2.85/2,tz-.1)));
    tp.push(boxUV(.8,.08,.08).translate(tx,2.95,tz-.1));
    tp.push(boxUV(.8,.1,.1).translate(tx,2.75,tz+.02));
    add(merge(tp),M.steelDark,RG);
    add(rod([tx-.36,0.3,tz-.1],[tx-.36,2.4,tz-.02],.04,10),M.red,RG);add(rod([tx+.36,0.3,tz-.1],[tx+.36,2.4,tz-.02],.04,10),M.red,RG);  // lift rams
    // animated bin: rests on the floor, is lifted up the mast and tipped into the hopper
    tipBin=makeBin(M,true);RG.add(tipBin);
    tipPose={A:{p:new THREE.Vector3(tx,.1,tz-.55),r:0},B:{p:new THREE.Vector3(tx,1.95,tz-.55),r:0},C:{p:new THREE.Vector3(tx,hop.y2+.17+.72,hop.z-.12-.72),r:2.36}};
    tipBin.position.copy(tipPose.C.p);tipBin.rotation.x=tipPose.C.r;
    const lumpG=new THREE.IcosahedronGeometry(.045,0);lumpG.scale(1,.7,1);
    [0x7a5a2e,0x9c7b35,0x5d7a2c,0xb0602a,0x6d4a2a,0x8a6a35,0xc9b27a,0x4f6b25,0x7a5a2e,0xb0602a].forEach((c,i)=>{const l=new THREE.Mesh(lumpG,new THREE.MeshStandardMaterial({color:c,roughness:.9}));l.visible=false;l.userData.k=i;RG.add(l);fallLumps.push(l)});
    // sorting table just inside the gate
    const st={x0:2.45,x1:3.65,z0:1.05,z1:1.85,y:.9};
    const tb=[];[[st.x0+.04,st.z0+.04],[st.x1-.04,st.z0+.04],[st.x0+.04,st.z1-.04],[st.x1-.04,st.z1-.04]].forEach(([x,z])=>tb.push(boxUV(.05,st.y-.1,.05).translate(x,.1+(st.y-.1)/2,z)));
    tb.push(boxUV(st.x1-st.x0,.05,.05).translate((st.x0+st.x1)/2,st.y-.025,st.z0+.025),boxUV(st.x1-st.x0,.05,.05).translate((st.x0+st.x1)/2,st.y-.025,st.z1-.025));
    tb.push(boxUV(.05,.05,st.z1-st.z0).translate(st.x0+.025,st.y-.025,(st.z0+st.z1)/2),boxUV(.05,.05,st.z1-st.z0).translate(st.x1-.025,st.y-.025,(st.z0+st.z1)/2));
    tb.push(boxUV(st.x1-st.x0,.12,.03).translate((st.x0+st.x1)/2,st.y+.06,st.z0+.015),boxUV(.03,.12,st.z1-st.z0).translate(st.x0+.015,st.y+.06,(st.z0+st.z1)/2),boxUV(.03,.12,st.z1-st.z0).translate(st.x1-.015,st.y+.06,(st.z0+st.z1)/2));
    tb.push(boxUV(st.x1-st.x0,.03,.03).translate((st.x0+st.x1)/2,.25,st.z0+.04),boxUV(st.x1-st.x0,.03,.03).translate((st.x0+st.x1)/2,.25,st.z1-.04));
    add(merge(tb),M.galv,RG);
    const top=new THREE.Mesh(new THREE.PlaneGeometry(st.x1-st.x0-.06,st.z1-st.z0-.06),M.grate);top.rotation.x=-Math.PI/2;top.position.set((st.x0+st.x1)/2,st.y,(st.z0+st.z1)/2);RG.add(top);
    // reject crate under the table
    add(boxUV(.5,.3,.38).translate(st.x0+.35,.25,(st.z0+st.z1)/2),M.red,RG);
    // food waste: heaped on the table, filling the hopper, in the open bins and in sacks by the gate
    const lumps=[],lumpMats=[0x7a5a2e,0x9c7b35,0x5d7a2c,0xb0602a,0x6d4a2a,0xc9b27a,0x4f6b25];let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
    const lump=(x,y,z,r)=>{const g=new THREE.IcosahedronGeometry(r,1);const P=g.attributes.position;for(let i=0;i<P.count;i++){const f=.8+.35*rnd();P.setXYZ(i,P.getX(i)*f,P.getY(i)*f*.62,P.getZ(i)*f)}g.computeVertexNormals();g.rotateY(rnd()*6);g.translate(x,y,z);lumps.push({g,c:lumpMats[Math.floor(rnd()*lumpMats.length)]})};
    const heap=(x,z,y,rx,rz,n,h)=>{for(let i=0;i<n;i++){const a=rnd()*Math.PI*2,d=Math.sqrt(rnd());const r=.03+rnd()*.035;const k=1-d;lump(x+Math.cos(a)*d*rx,y+r*.4+k*h*rnd(),z+Math.sin(a)*d*rz,r)}};
    heap((st.x0+st.x1)/2-.1,(st.z0+st.z1)/2,st.y,.42,.28,46,.12);                 // sorting table
    heap(hop.x,hop.z,hop.y2-.2,.36,.31,40,.16);                                   // hopper
    // the reject crate gets a few plastics
    for(let i=0;i<5;i++){const g=boxUV(.08+rnd()*.06,.02,.05+rnd()*.05).rotateY(rnd()*3).translate(st.x0+.22+rnd()*.26,.38+rnd()*.04,(st.z0+st.z1)/2-.12+rnd()*.24);lumps.push({g,c:[0x2a6fdb,0xe8e8e8,0xd9302c][i%3]})}
    // bins: one waiting by the tipper, two outside on the landing, all open and full
    [[3.05,2.95,0.2],[5.75,0.45,0.3],[5.75,1.3,-0.2]].forEach(([x,z,ry])=>{const b=makeBin(M,true);b.position.set(x,0.1,z);b.rotation.y=ry;RG.add(b);
      b.updateMatrixWorld(true);const c=new THREE.Vector3(0,1.0,0).applyMatrix4(b.matrixWorld);heap(c.x,c.z,c.y,.22,.26,22,.1)});
    // sacks of waste by the gate
    [[5.25,0.3,.0],[5.45,0.22,.9],[5.3,1.62,2.0],[4.95,1.55,.5]].forEach(([x,z,r],i)=>{const g=new THREE.SphereGeometry(.2,24,16);const P=g.attributes.position;
      for(let j=0;j<P.count;j++){const y=P.getY(j);P.setXYZ(j,P.getX(j)*(1+.1*Math.sin(j)),y<0?y*.55:y*1.15,P.getZ(j)*(.85+.1*Math.cos(j*1.7)))}g.computeVertexNormals();g.rotateY(r);g.translate(x,0.1+.11,z);
      const t=rod([x,.1+.32,z],[x,.1+.42,z],.035,8);lumps.push({g:merge([g,t]),c:i%2?0x1d1f21:0x2b4a2f})});
    const lc=new Map();lumps.forEach(l=>{if(!lc.has(l.c))lc.set(l.c,[]);lc.get(l.c).push(l.g)});
    lc.forEach((gs,c)=>add(merge(gs),new THREE.MeshStandardMaterial({color:c,roughness:c===0x1d1f21?.45:.85}),RG));
  }

  // ---- 9. pipework (from routes.js) + flow riders
  const flowObjs=[],riders=[];
  const floorAt=(x,z)=>(x>-4.79&&x<4.51&&z>-3.82&&z<5.48)||(x>=4.51&&x<6.26&&z>0.1&&z<1.7)?0.1:-0.3;
  const fpNew=Object.keys(EQUIP).map(k=>{const f=EQUIP[k].fp;const pts=[[f[0],0,f[2]],[f[1],0,f[2]],[f[1],0,f[3]],[f[0],0,f[3]]].map(p=>xf(k,p));
    return [Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[2])),Math.max(...pts.map(p=>p[2]))]});
  const blocked=(x,z)=>fpNew.some(f=>x>f[0]-.1&&x<f[1]+.1&&z>f[2]-.1&&z<f[3]+.1)||(Math.hypot(x-DIG.cx,z-DIG.cz)<DIG.r+.25)||
      (x>2.4&&x<3.7&&z>1.0&&z<1.9)||(x>S.x0-.05&&x<S.x0+S.t+.05)||(x>S.x1-S.t-.05&&x<S.x1+.05)||(z>S.z0-.05&&z<S.z0+S.t+.05)||(z>S.z1-S.t-.05&&z<S.z1+.05);
  const ctx={xf,DIG,hop,pit};
  const routes=ROUTES(ctx);
  // snap every pipe end onto the real surface of the equipment it connects to
  const rc=new THREE.Raycaster();
  const targets=k=>{const out=[];[groups[k].outer,groups[k].proc].forEach(r=>r&&r.traverse(m=>{if(m.isMesh&&m.visible&&!m.isInstancedMesh)out.push(m)}));return out};
  function snap(pts,atStart,k){if(!k||!groups[k])return;const n=pts.length;
    const E=new THREE.Vector3(...pts[atStart?0:n-1]),Pv=new THREE.Vector3(...pts[atStart?1:n-2]);
    const d=E.clone().sub(Pv),L=d.length();d.normalize();
    rc.set(Pv,d);rc.near=0.02;rc.far=L+0.9;
    const hit=rc.intersectObjects(targets(k),false).find(h=>h.distance>0.06);
    if(!hit){(window.__snapMiss=window.__snapMiss||[]).push(k+(atStart?' start':' end'));return}const ne=hit.point.clone().addScaledVector(d,0.012);pts[atStart?0:n-1]=ne.toArray()}
  plantG.updateMatrixWorld(true);
  routes.forEach(rt=>{snap(rt.pts,true,rt.a);snap(rt.pts,false,rt.b)});
  const byMat={};const pushG=(k,g)=>{if(!g)return;(byMat[k]=byMat[k]||[]).push(g)};
  const sup={conc:[],steel:[]};
  routes.forEach(rt=>{const md=MEDIA[rt.medium];const pr=pipeRun(rt.pts,md.r,{bend:md.r*3});
    pushG(md.mat,pr.geo);pr.fit.forEach(f=>pushG(md.fl,f));
    if(rt.supports!==false){const s=supports(pr.path,md.r,floorAt,blocked);sup.conc.push(...s.conc);sup.steel.push(...s.steel)}
    if(rt.medium!=='none'){const big=md.r>.04;const fr=flowRider(pr.path,md.flow,{pipeR:md.r,L:big?.085:.07,W:big?.075:.06,spacing:big?.38:.32});plantG.add(fr.mesh);flowObjs.push(fr.mesh);riders.push(fr)}
    rt._path=pr.path});
  VALVES(ctx).forEach(v=>{const md=MEDIA[v.medium];const va=valveAt(v.p,v.dir,md.r);pushG(md.fl,va.body);pushG('handle',va.handle)});
  const matOf={pvc:M.pvc,pvcFl:M.pvcFl,gas:M.gas,gasFl:M.gasFl,hdpe:M.hdpe,handle:M.handle,ss:M.ss};
  for(const k in byMat)add(merge(byMat[k]),matOf[k]);
  if(sup.conc.length)add(merge(sup.conc),M.concrete);
  if(sup.steel.length)add(merge(sup.steel),M.galv);
  // wall sleeves where pipes cross the compound wall
  // solid food-waste path: floating chevrons from the gate into the hopper
  // food waste: arrows painted on the floor (gate -> sorting table -> bin tipper); the tipper then animates
  WASTE_FLOOR().forEach(path=>{const P=path.map(p=>new THREE.Vector3(p[0],0.1,p[1]));const fr=flowRider(P,MEDIA.waste.flow,{mode:'floor',L:.2,W:.2,spacing:.42,speed:.22,lift:.006});
    fr.mesh.material.depthWrite=false;plantG.add(fr.mesh);flowObjs.push(fr.mesh);riders.push(fr)});

  const ease=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
  function poseLerp(a,b,k){k=ease(k);tipBin.position.lerpVectors(a.p,b.p,k);tipBin.rotation.x=a.r+(b.r-a.r)*k}
  const T=11; // tipper cycle, seconds
  function animateTipper(t){if(!tipBin)return;const u=((t%T)+T)%T;const P=tipPose;
    if(u<1.5)poseLerp(P.A,P.A,0);else if(u<4)poseLerp(P.A,P.B,(u-1.5)/2.5);else if(u<5.6)poseLerp(P.B,P.C,(u-4)/1.6);
    else if(u<7.4)poseLerp(P.C,P.C,0);else if(u<9)poseLerp(P.C,P.B,(u-7.4)/1.6);else poseLerp(P.B,P.A,(u-9)/2);
    fallLumps.forEach(l=>{const k=l.userData.k,s=(u-5.5-k*.22)/0.75;l.visible=s>0&&s<1;if(l.visible){l.position.set(hop.x+(k%3-1)*.12,2.05-0.5*s*s,hop.z-.15+(k%2)*.12);l.rotation.set(s*4+k,s*3,0)}});}
  function restTipper(){if(!tipBin)return;poseLerp(tipPose.C,tipPose.C,0);fallLumps.forEach(l=>l.visible=false)}
  function updateFlows(t,cam){riders.forEach(r=>r.update(t,cam));animateTipper(t)}

  // ---- kitchen: cast-iron burner heads, pan supports, a cooking pot, and live flames
  const kitchenG=new THREE.Group();kitchenG.name='kitchen_burners';plantG.add(kitchenG);layers.kitchen.push(kitchenG);
  const castIron=new THREE.MeshStandardMaterial({color:0x232527,metalness:.6,roughness:.55});
  const alu=new THREE.MeshStandardMaterial({color:0xc4c8cc,metalness:.85,roughness:.3});
  const flameIn=new THREE.MeshBasicMaterial({color:0x2a63ff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const flameOut=new THREE.MeshBasicMaterial({color:0xff7a1a,transparent:true,opacity:.32,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const flames=[];
  if(byName.burner_hose)byName.burner_hose.visible=false;
  const hoseMat=new THREE.MeshStandardMaterial({color:0xe2600f,roughness:.5});
  const brass=new THREE.MeshStandardMaterial({color:0xb8892e,metalness:.8,roughness:.35});
  [[6.81,-9.87,true],[7.91,-9.87,false]].forEach(([x,z,pot])=>{const y=.10;
    const head=[new THREE.CylinderGeometry(.13,.14,.04,40).translate(x,y+.02,z),new THREE.CylinderGeometry(.095,.11,.03,40).translate(x,y+.055,z),new THREE.CylinderGeometry(.06,.07,.02,32).translate(x,y+.08,z)];
    // pan support: ring on four bent legs
    const sup=[new THREE.TorusGeometry(.2,.012,8,40).rotateX(Math.PI/2).translate(x,y+.22,z)];
    for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,c=Math.cos(a),sn=Math.sin(a);sup.push(rod([x+c*.24,y,z+sn*.24],[x+c*.2,y+.22,z+sn*.2],.014,6),rod([x+c*.2,y+.22,z+sn*.2],[x+c*.13,y+.235,z+sn*.13],.012,6))}
    kitchenG.add(add(merge(head.concat(sup)),castIron,kitchenG));
    // gas drop from the G9 manifold: tee, ball valve, nozzle, then an orange hose to the burner's mixing tube
    {const mz=-10.47,my=.75;const drop=[new THREE.SphereGeometry(.042,16,12).translate(x,my,mz),rod([x,my,mz],[x,.46,mz],.022,12),rod([x,.5,mz],[x,.44,mz],.032,14)];
      kitchenG.add(add(merge(drop),M.gas,kitchenG));
      kitchenG.add(add(merge([rod([x,.6,mz],[x,.6,mz+.12],.008,6),new THREE.SphereGeometry(.03,12,10).translate(x,.6,mz)]),M.red,kitchenG));
      kitchenG.add(add(merge([rod([x,.44,mz],[x,.4,mz],.012,10),rod([x,y+.06,z-.12],[x,y+.06,z-.2],.016,12)]),brass,kitchenG));   // hose nozzle + burner mixing tube
      const c=new THREE.CatmullRomCurve3([[x,.4,mz],[x,.3,mz+.02],[x,.16,mz+.12],[x,y+.08,z-.3],[x,y+.06,z-.2]].map(v=>new THREE.Vector3(...v)));
      kitchenG.add(add(new THREE.TubeGeometry(c,40,.013,10,false),hoseMat,kitchenG));}
    // knob on the front of the body
    kitchenG.add(add(new THREE.CylinderGeometry(.025,.025,.03,16).rotateX(Math.PI/2).translate(x,-.1,z+.29),M.red,kitchenG));
    // flame tongues around the burner cap
    const n=18,fi=new THREE.InstancedMesh(new THREE.ConeGeometry(.012,.05,8).translate(0,.025,0),flameIn,n),fo=new THREE.InstancedMesh(new THREE.ConeGeometry(.02,.085,8).translate(0,.042,0),flameOut,n);
    fi.userData.noPick=fo.userData.noPick=true;fi.renderOrder=fo.renderOrder=6;kitchenG.add(fi,fo);
    flames.push({x,y:y+.09,z,n,fi,fo});
    if(pot){const pg=lathe2([[0,.0],[.17,.0],[.18,.01],[.18,.2],[.19,.21],[.185,.215],[0,.215]]).translate(x,y+.235,z);kitchenG.add(add(pg,alu,kitchenG));
      kitchenG.add(add(merge([new THREE.TorusGeometry(.05,.008,6,16,Math.PI).rotateZ(Math.PI/2).rotateY(Math.PI/2).translate(x+.19,y+.39,z),new THREE.TorusGeometry(.05,.008,6,16,Math.PI).rotateZ(-Math.PI/2).rotateY(Math.PI/2).translate(x-.19,y+.39,z)]),alu,kitchenG))}
  });
  const fm=new THREE.Matrix4(),fq=new THREE.Quaternion(),fp=new THREE.Vector3(),fs=new THREE.Vector3(),fe=new THREE.Euler();
  function updateAmbient(t){flames.forEach((F,j)=>{for(let i=0;i<F.n;i++){const a=i/F.n*Math.PI*2;const fl=.75+.25*Math.sin(t*17+i*2.3+j)+.12*Math.sin(t*31+i*5.1);
      fp.set(F.x+Math.cos(a)*.085,F.y,F.z+Math.sin(a)*.085);fe.set(Math.sin(a)*.5,0,-Math.cos(a)*.5);// lean outward
      fe.set(Math.sin(a)*0.45,0,-Math.cos(a)*0.45,'XYZ');fq.setFromEuler(new THREE.Euler(Math.sin(a)*.45*0+ 0.45*Math.sin(a),0,-0.45*Math.cos(a)));
      fs.set(1,fl,1);fm.compose(fp,fq,fs);F.fi.setMatrixAt(i,fm);fs.set(1,fl*(.9+.2*Math.sin(t*23+i)),1);fm.compose(fp,fq,fs);F.fo.setMatrixAt(i,fm)}
    F.fi.instanceMatrix.needsUpdate=F.fo.instanceMatrix.needsUpdate=true})}

  // ---- 10. what can be clicked: key -> objects
  const picks={reception:[receptionG],kitchen:['burner_frame'].map(n=>byName[n]).filter(Boolean).concat([kitchenG]),pit:pitObjs,flare:[groups.flare.outer,flareExtra]};
  for(const k in groups){if(k==='flare')continue;picks[k]=[groups[k].outer].concat(groups[k].proc?[groups[k].proc]:[])}
  return {layers,groups,xf,flowObjs,updateFlows,updateAmbient,restTipper,routes,picks,targets};
}

function makeBin(M,open){
  const g=new THREE.Group();const w=.58,d=.72,h=.98;
  const body=new THREE.CylinderGeometry(.7071,.62,1,4,1,false);body.rotateY(Math.PI/4);body.scale(w,h,d);body.translate(0,h/2+.05,0);
  const m=new THREE.Mesh(body,M.green);m.castShadow=true;g.add(m);
  const lidG=boxUV(w+.04,.04,d+.06);let lid;
  if(open){lidG.translate(0,.02,(d+.06)/2);lid=new THREE.Mesh(lidG,M.greenDark);lid.position.set(0,h+.06,-(d+.06)/2);lid.rotation.x=-2.75}
  else{lid=new THREE.Mesh(lidG.translate(0,h+.07,0),M.greenDark)}
  lid.castShadow=true;g.add(lid);
  const wheels=new THREE.Mesh(merge([placed(new THREE.CylinderGeometry(.1,.1,.05,16),[-w/2+.04,.1,-d/2+.08],[0,0,Math.PI/2]),placed(new THREE.CylinderGeometry(.1,.1,.05,16),[w/2-.04,.1,-d/2+.08],[0,0,Math.PI/2])]),M.rubber);g.add(wheels);
  return g;
}

function lathe2(pr){const g=new THREE.LatheGeometry(pr.map(([r,y])=>new THREE.Vector2(r,y)),48);g.computeVertexNormals();return g}

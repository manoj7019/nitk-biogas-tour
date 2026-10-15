import * as THREE from 'three';
import {EQUIP,SITE,ROOF_LIFT,DIG,FLARE_H} from './layout.js';
import {bakeWorld,filterTris,clipBelow,clipAbove,splitTris,boxUV,merge,placed,rod} from './geom.js';
import {pipeRun,valveAt,supports,flowRider} from './pipes.js';
import {ROUTES,VALVES,WASTE_FLOOR,MEDIA} from './routes.js';
import {hydrolyser,shredder,balloon,cageLadder,vesselBase} from './kit.js';
import {settlePile,massMesh,chunkMeshes,chunkGeo,wasteMats,makeRng,WASTE_COLS,containMeshes} from './piles.js';

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
    lid:new THREE.MeshStandardMaterial({color:0xc9ced4,metalness:1,roughness:.24,envMapIntensity:1.2}),
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
  // bright polished-steel skin (the CAD texture read as dull grey)
  const steelSkin=new THREE.MeshStandardMaterial({color:0xdfe3e8,metalness:1,roughness:.17,envMapIntensity:1.35});
  dCut.forEach(m=>{if(/stainless|clad/.test(m.material.name))m.material=steelSkin});

  // shredder: drop the raised black stand/plate at its east end (the new hopper + bin tipper replace it)
  // storage vessel: the CAD bottom head is ragged where it meets the stand; cut it and fit a smooth dished head
  byName[EQUIP.storage.node].traverse(o=>{if(o.isMesh&&/black/.test(o.material.name)){o.visible=false;return}   // ragged CAD stand -> clean stand in vesselBase
    if(!o.isMesh||!/yellow/.test(o.material.name))return;const g=clipAbove(bakeWorld(o),0.82);
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
      if(o.name==='gas_bag')return null;   // old CAD balloons -> replaced by two matching smooth ones
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
    dg.add(cageLadder(DIG.cx,DIG.cz,R,-0.87,0.24,DIG.cut,M,{hoopFrom:2.3,ext:.35,roofY:5.915}));}
  groups.storage.proc=vesselBase(EQUIP.storage.to[0],EQUIP.storage.to[1],0.748,0.82,M,mats.yellow_paint);plantG.add(groups.storage.proc);
  {const a=Math.PI/3,cx=EQUIP.storage.to[0],cz=EQUIP.storage.to[1],u=[Math.cos(a),0,Math.sin(a)],P=r=>[cx+u[0]*r,0.95,cz+u[2]*r];   // spare nozzle, blanked off
    groups.storage.proc.add(add(merge([rod(P(.7),P(.86),.03,16),rod(P(.86),P(.885),.06,20)]),M.gasFl,groups.storage.proc))}
  if(mats.gas_bag){groups.cage.inner.add(balloon([3.165,0.69,0.32],[0.68,0.33,0.46],mats.gas_bag));groups.cage.inner.add(balloon([3.165,1.55,0.32],[0.68,0.33,0.46],mats.gas_bag))}
  // twin balloons: each balloon has its own line to the automatic valve box (flanged nozzle + short hose to the cage face)
  {const cg=new THREE.Group();cg.name='cage_hoses';plantG.add(cg);groups.cage.proc=cg;
    const rub=M.gas,fit=M.gasFl;
    const hose=(pts,r=.022)=>{const c=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)),false,'centripetal');return add(new THREE.TubeGeometry(c,48,r,12,false),rub,cg)};
    const nozzle=(p,dir)=>{const d=new THREE.Vector3(...dir).normalize(),P=new THREE.Vector3(...p),q=P.clone().addScaledVector(d,.06);
      add(merge([rod(P.toArray(),q.toArray(),.028,14),rod(P.toArray(),P.clone().addScaledVector(d,.012).toArray(),.05,18),rod(q.clone().addScaledVector(d,-.015).toArray(),q.toArray(),.034,14)]),fit,cg);return q.toArray()};
    const upN=nozzle([0.98,1.5,-0.965],[0,0,-1]),loN=nozzle([0.98,0.72,-0.94],[0,0,-1]);
    hose([upN,[0.98,1.5,-1.1],[0.98,1.5,-1.17]]);hose([loN,[0.98,0.72,-1.08],[0.98,0.72,-1.17]]);
    // bulkhead fittings where the lines pass through the cage mesh
    add(merge([rod([0.98,1.5,-1.13],[0.98,1.5,-1.2],.04,16),rod([0.98,0.72,-1.13],[0.98,0.72,-1.2],.04,16)]),fit,cg);}
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
    // gas outlet nozzle on the east side of the roof (G1 starts here)
    {const gy=top-.16;add(merge([rod([cx+1.49,gy,cz],[cx+1.72,gy,cz],.05,16),rod([cx+1.5,gy,cz],[cx+1.54,gy,cz],.1,20),rod([cx+1.69,gy,cz],[cx+1.73,gy,cz],.09,20)]),M.gasFl,lidG)}
  }
  // ---- agitator: top-entry, at the exact centre of the roof (motor, gearbox, drive stool; shaft and impellers inside)
  const agitatorG=new THREE.Group();agitatorG.name='agitator';plantG.add(agitatorG);
  const internals=[];   // parts inside the digester, seen only in the "see inside" view
  {const x=cx,z=cz,y=top+.29,motorB=new THREE.MeshStandardMaterial({color:0x1d4f8f,metalness:.35,roughness:.4});
    add(merge([new THREE.CylinderGeometry(.26,.26,.04,40).translate(x,y+.02,z),new THREE.CylinderGeometry(.15,.17,.14,32).translate(x,y+.11,z)]),M.steelDark,agitatorG);
    {const b=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2;b.push(new THREE.CylinderGeometry(.012,.012,.03,6).translate(x+Math.cos(a)*.22,y+.05,z+Math.sin(a)*.22))}add(merge(b),M.galv,agitatorG)}
    add(new THREE.CylinderGeometry(.19,.19,.22,40).translate(x,y+.29,z),M.motorDark,agitatorG);                 // gearbox
    const body=new THREE.CylinderGeometry(1,1,1,72,1,false),P=body.attributes.position;
    for(let i=0;i<P.count;i++){const px=P.getX(i),pz=P.getZ(i),a=Math.atan2(pz,px),f=1+.06*Math.pow(Math.max(0,Math.cos(a*20)),3);P.setX(i,px*f);P.setZ(i,pz*f)}
    body.computeVertexNormals();body.scale(.15,.36,.15);body.translate(x,y+.58,z);add(body,motorB,agitatorG);  // finned motor
    add(merge([new THREE.CylinderGeometry(.155,.155,.08,40).translate(x,y+.8,z),new THREE.SphereGeometry(.155,32,12,0,Math.PI*2,0,Math.PI/2).scale(1,.3,1).translate(x,y+.84,z)]),M.motorDark,agitatorG);
    add(boxUV(.12,.1,.12).translate(x+.17,y+.6,z),motorB,agitatorG);                                           // terminal box
    // shaft and two pitched-blade impellers
    const sh=new THREE.Mesh(rod([x,top+.3,z],[x,1.9,z],.035,12),M.galv);agitatorG.add(sh);internals.push(sh);
    [4.3,2.4].forEach(iy=>{const bl=[new THREE.CylinderGeometry(.07,.07,.1,16).translate(x,iy,z)];
      for(let k=0;k<3;k++){const a=k/3*Math.PI*2;const g=boxUV(.5,.02,.14);g.rotateX(.6);g.translate(.3,0,0);g.rotateY(a);g.translate(x,iy,z);bl.push(g)}
      const m=new THREE.Mesh(merge(bl),M.galv);agitatorG.add(m);internals.push(m)});}
  // ---- heating: electric heater tub on the shell at 3/4 of the height, heating elements reaching inside
  const heaterG=new THREE.Group();heaterG.name='heater';plantG.add(heaterG);
  const HEAT={a:Math.PI*0.3,y:0.1+0.75*(top-0.1)};
  {const a=HEAT.a,R=1.503,ux=Math.cos(a),uz=Math.sin(a),P=(r,y,t=0)=>[cx+ux*r-uz*t,y,cz+uz*r+ux*t],y=HEAT.y;
    const tubM=new THREE.MeshStandardMaterial({color:0xc2c7cc,metalness:.7,roughness:.35});
    add(merge([rod(P(R-.01,y),P(R+.16,y),.11,28),rod(P(R+.14,y),P(R+.18,y),.17,32)]),tubM,heaterG);        // nozzle + flange
    {const tb=new THREE.CylinderGeometry(.2,.2,.42,40);tb.rotateZ(Math.PI/2);tb.rotateY(-a);tb.translate(...P(R+.39,y));add(tb,tubM,heaterG)}   // heater tub
    {const cap=new THREE.SphereGeometry(.2,32,16,0,Math.PI*2,0,Math.PI/2);cap.scale(1,.35,1);cap.rotateZ(-Math.PI/2);cap.rotateY(-a);cap.translate(...P(R+.6,y));add(cap,tubM,heaterG)}
    add(boxUV(.16,.14,.1).rotateY(-a).translate(...P(R+.5,y+.24)),M.steelDark,heaterG);                       // junction box on top of the tub
    // support brackets to the shell
    add(merge([rod(P(R+.02,y-.35),P(R+.36,y-.2),.02,8),rod(P(R+.02,y-.35,.12),P(R+.36,y-.2,.12),.02,8),rod(P(R+.02,y-.35,-.12),P(R+.36,y-.2,-.12),.02,8)]),M.steelDark,heaterG);
    // temperature sensor (thermowell + head) beside the tub
    add(merge([rod(P(R-.01,y+.5,.35),P(R+.16,y+.5,.35),.02,10),new THREE.CylinderGeometry(.045,.045,.08,16).translate(...P(R+.2,y+.5,.35))]),M.galv,heaterG);
    // heating elements inside: three U-bends glowing hot
    const hot=new THREE.MeshStandardMaterial({color:0x8a4a2a,metalness:.6,roughness:.4,emissive:0xff5a14,emissiveIntensity:.9});
    const el=[];[-.07,0,.07].forEach(t=>{const L=1.0;el.push(rod(P(R,y+.04,t),P(R-L,y+.04,t),.012,8),rod(P(R,y-.04,t),P(R-L,y-.04,t),.012,8));
      const c=new THREE.TorusGeometry(.04,.012,6,12,Math.PI);c.rotateZ(Math.PI/2);c.rotateY(-a);c.translate(...P(R-L,y,t));el.push(c)});
    const em=new THREE.Mesh(merge(el),hot);heaterG.add(em);internals.push(em);}

  let tipBin=null,tipPose=null,tipCar=null,tipFill=null,tablePile=null,hopPile=null;const fallLumps=[],slideLumps=[];
  // ---- 8. food-waste entry: bins come in through the east gate, a bin tipper empties them onto the
  //      segregation table, operators on the platform pick out rejects and push the waste into the
  //      hammer-mill hopper built into the end of the table
  const receptionG=new THREE.Group();receptionG.name='reception';plantG.add(receptionG);
  const RG=receptionG;
  const hop={x:2.05,z:4.19,y0:1.3,y1:1.38,y2:1.58,w:1.0,d:1.0,tw:.4};
  const tab={x0:2.55,x1:3.4,z0:3.69,z1:4.69,y:1.6};               // segregation table, flush with the hopper rim
  const plat={x0:2.45,x1:3.4,z0:2.9,z1:3.66,y:.65};                // operator platform
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
  const lumpCols=[0x7a5a2e,0x9c7b35,0x5d7a2c,0xb0602a,0x6d4a2a,0xc9b27a,0x4f6b25,0xa33b20,0xd9c27a];
  const lumpMat={};lumpCols.forEach(c=>lumpMat[c]=new THREE.MeshStandardMaterial({color:c,roughness:.85}));
  const lumpInto=(list,x,y,z,r)=>{const g=new THREE.IcosahedronGeometry(r,1);const P=g.attributes.position;for(let i=0;i<P.count;i++){const f=.8+.35*rnd();P.setXYZ(i,P.getX(i)*f,P.getY(i)*f*.62,P.getZ(i)*f)}
    g.computeVertexNormals();g.rotateY(rnd()*6);g.translate(x,y,z);list.push({g,c:lumpCols[Math.floor(rnd()*lumpCols.length)]})};
  const heapInto=(list,x,z,y,rx,rz,n,h)=>{for(let i=0;i<n;i++){const a=rnd()*Math.PI*2,d=Math.sqrt(rnd());const r=.03+rnd()*.035;lumpInto(list,x+Math.cos(a)*d*rx,y+r*.4+(1-d)*h*rnd(),z+Math.sin(a)*d*rz,r)}};
  const flush=(list,parent)=>{const lc=new Map();list.forEach(l=>{if(!lc.has(l.c))lc.set(l.c,[]);lc.get(l.c).push(l.g)});
    lc.forEach((gs,c)=>add(merge(gs),lumpMat[c]||new THREE.MeshStandardMaterial({color:c,roughness:c===0x1d1f21?.45:.85}),parent))};
  const WM=wasteMats();
  // settled, overfilled bin contents (bin-local coordinates)
  const fillBin=(bin,n=170)=>{const R=makeRng(11+Math.floor(rnd()*1e6)),b=.62/.7071,
      hwx=y=>.92*.29*(b+(1-b)*Math.min(1,(y-.1)/.92)),hwz=y=>.92*.36*(b+(1-b)*Math.min(1,(y-.1)/.92));
    const p=settlePile({x0:-.27,x1:.27,z0:-.34,z1:.34,cell:.02,floor:(x,z)=>(Math.abs(x)<=hwx(1.02)&&Math.abs(z)<=hwz(1.02))?.86:null,
      inside:(x,z,y,r)=>{const yy=Math.min(y,1.02),mx=hwx(yy)-(y>1.02?r*.2:r*.55),mz=hwz(yy)-(y>1.02?r*.2:r*.55);return[Math.max(-mx,Math.min(mx,x)),Math.max(-mz,Math.min(mz,z))]},
      n,rMin:.035,rMax:.07,repose:.75,pour:R=>[(R()-.5)*.5,(R()-.5)*.64]},R);
    const g=new THREE.Group(),ms=[massMesh(p,WM.mass,{minY:.8,rnd:R}),...chunkMeshes(p.chunks,R,WM)];
    containMeshes(ms,v=>{const yy=Math.min(Math.max(v.y,.13),1.02),mx=hwx(yy)-.006,mz=hwz(yy)-.006;if(v.y<.13)v.y=.13;
      if(v.y<=1.04){v.x=Math.max(-mx,Math.min(mx,v.x));v.z=Math.max(-mz,Math.min(mz,v.z))}});
    ms.forEach(m=>g.add(m));bin.add(g);return g};
  {
    // hopper: short stainless funnel on the mill inlet, rim flush with the table top
    const g=[];
    g.push(placed(new THREE.CylinderGeometry(hop.tw*0.7071,hop.tw*0.7071,hop.y1-hop.y0,4,1,true),[hop.x,(hop.y0+hop.y1)/2,hop.z],[0,Math.PI/4,0]));
    const fr=new THREE.CylinderGeometry(0.7071,hop.tw/hop.w*0.7071,hop.y2-hop.y1,4,1,true);fr.rotateY(Math.PI/4);fr.scale(hop.w,1,hop.d);fr.translate(hop.x,(hop.y1+hop.y2)/2,hop.z);g.push(fr);
    // upstands on the three outer sides of the hopper so waste is guided in from the table side
    const hx=hop.w/2,hz=hop.d/2,Y=hop.y2;
    g.push(boxUV(hop.w,.18,.012).translate(hop.x,Y+.09,hop.z-hz),boxUV(hop.w,.18,.012).translate(hop.x,Y+.09,hop.z+hz),boxUV(.012,.18,hop.d).translate(hop.x-hx,Y+.09,hop.z));
    add(merge(g),M.ss,RG);
    // segregation table: stainless top sloping slightly down to the hopper, lips on the far and end sides, open on the operator side
    const top=new THREE.BoxGeometry(tab.x1-tab.x0,.03,tab.z1-tab.z0);top.translate((tab.x0+tab.x1)/2,tab.y-.015,(tab.z0+tab.z1)/2);
    {const P=top.attributes.position;for(let i=0;i<P.count;i++){const x=P.getX(i);P.setY(i,P.getY(i)+(x-tab.x0)/(tab.x1-tab.x0)*.04)}top.computeVertexNormals()}
    add(merge([top,boxUV(tab.x1-tab.x0,.16,.012).translate((tab.x0+tab.x1)/2,tab.y+.1,tab.z1),boxUV(.012,.16,tab.z1-tab.z0).translate(tab.x1,tab.y+.12,(tab.z0+tab.z1)/2),
      boxUV(tab.x1-tab.x0,.03,.012).translate((tab.x0+tab.x1)/2,tab.y+.02,tab.z0)]),M.ss,RG);
    const tl=[];[[tab.x0+.05,tab.z0+.05],[tab.x1-.05,tab.z0+.05],[tab.x0+.05,tab.z1-.05],[tab.x1-.05,tab.z1-.05]].forEach(([x,z])=>tl.push(boxUV(.05,tab.y-.13,.05).translate(x,.1+(tab.y-.13)/2,z)));
    tl.push(boxUV(tab.x1-tab.x0,.04,.04).translate((tab.x0+tab.x1)/2,.5,tab.z0+.05),boxUV(tab.x1-tab.x0,.04,.04).translate((tab.x0+tab.x1)/2,.5,tab.z1-.05));
    add(merge(tl),M.galv,RG);
    // operator platform with chequer-plate deck, steps on the north side and a handrail
    const pf=[];pf.push(boxUV(plat.x1-plat.x0,.05,plat.z1-plat.z0).translate((plat.x0+plat.x1)/2,plat.y-.025,(plat.z0+plat.z1)/2));
    [[plat.x0+.04,plat.z0+.04],[plat.x1-.04,plat.z0+.04],[plat.x0+.04,plat.z1-.04],[plat.x1-.04,plat.z1-.04]].forEach(([x,z])=>pf.push(boxUV(.05,plat.y-.15,.05).translate(x,.1+(plat.y-.15)/2,z)));
    const sx0=2.62,sx1=3.22;[[.28,2.72],[.46,2.52]].forEach(([y,z])=>{pf.push(boxUV(sx1-sx0,.04,.22).translate((sx0+sx1)/2,y,z-.0));pf.push(boxUV(.04,y-.1,.04).translate(sx0,.1+(y-.1)/2,z),boxUV(.04,y-.1,.04).translate(sx1,.1+(y-.1)/2,z))});
    add(merge(pf),M.steelDark,RG);
    const hr=[],H=plat.y+1.0;
    hr.push(rod([plat.x0,plat.y,plat.z0],[plat.x0,H,plat.z0],.02,8),rod([plat.x0,plat.y,plat.z1],[plat.x0,H,plat.z1],.02,8),rod([plat.x0,H,plat.z0],[plat.x0,H,plat.z1],.02,8),rod([plat.x0,plat.y+.5,plat.z0],[plat.x0,plat.y+.5,plat.z1],.015,8));
    hr.push(rod([plat.x0,H,plat.z0],[sx0,H,plat.z0],.02,8),rod([plat.x1,plat.y,plat.z0],[plat.x1,H,plat.z0],.02,8),rod([sx1,H,plat.z0],[plat.x1,H,plat.z0],.02,8),rod([sx1,plat.y,plat.z0],[sx1,H,plat.z0],.02,8),rod([sx0,plat.y,plat.z0],[sx0,H,plat.z0],.02,8));
    add(merge(hr),M.handle,RG);
    // reject crate on the platform with a few plastics in it
    add(boxUV(.42,.28,.34).translate(plat.x0+.3,plat.y+.14,plat.z0+.3),M.red,RG);
    const rej=[];for(let i=0;i<6;i++)rej.push({g:boxUV(.07+rnd()*.06,.02,.05+rnd()*.05).rotateY(rnd()*3).translate(plat.x0+.2+rnd()*.2,plat.y+.27+rnd()*.03,plat.z0+.2+rnd()*.2),c:[0x2a6fdb,0xe8e8e8,0xd9302c][i%3]});
    // bin tipper at the far end of the table: lifts a bin and tips it onto the table
    const tx=3.78,tz=4.19,tp=[];
    tp.push(boxUV(.55,.04,.7).translate(tx,.12,tz));
    // taller mast (3.4 m) so the bin is lifted until its rim clears the table lip before it tips
    [-.36,.36].forEach(o=>tp.push(boxUV(.08,3.4,.08).translate(4.0,.1+1.7,tz+o)));
    tp.push(boxUV(.08,.08,.8).translate(4.0,3.5,tz),boxUV(.3,.03,.08).translate(3.88,3.46,tz-.36),boxUV(.3,.03,.08).translate(3.88,3.46,tz+.36));
    add(merge(tp),M.steelDark,RG);
    add(rod([4.0,.3,tz-.27],[4.0,1.95,tz-.27],.035,10),M.red,RG);add(rod([4.0,.3,tz+.27],[4.0,1.95,tz+.27],.035,10),M.red,RG);
    // carriage: slides up the mast and carries the tipping pivot at the bin's front rim
    tipCar=new THREE.Group();RG.add(tipCar);
    tipCar.add(add(merge([boxUV(.06,.08,.84).translate(.02,0,0),boxUV(.4,.05,.05).translate(-.17,0,-.34),boxUV(.4,.05,.05).translate(-.17,0,.34),rod([-.36,0,-.36],[-.36,0,.36],.025,12)]),M.steelDark,tipCar));
    tipBin=makeBin(M,true);tipBin.rotation.order='ZYX';tipBin.rotation.y=-Math.PI/2;RG.add(tipBin);
    tipFill=fillBin(tipBin,80);
    // pivot = bin's front rim (table side); B lifts the rim above the table lip, C tips about the pivot
    tipPose={A:{y:.1,r:0},B:{y:.83,r:0},C:{y:.83,r:2.3}};

    const lumpG=chunkGeo(.045,makeRng(3));
    for(let i=0;i<14;i++){const l=new THREE.Mesh(lumpG,WM[WASTE_COLS[i%WASTE_COLS.length]]);l.visible=false;l.userData.k=i;RG.add(l);fallLumps.push(l)}
    for(let i=0;i<16;i++){const l=new THREE.Mesh(lumpG,WM[WASTE_COLS[(i*4)%WASTE_COLS.length]]);l.userData.k=i;l.scale.setScalar(.8+((i*37)%10)/20);RG.add(l);slideLumps.push(l)}
    // waste heaped on the table and filling the hopper, rejects in the crate
    const L=[];
    {const R=makeRng(21),tY=(x)=>tab.y+(x-tab.x0)/(tab.x1-tab.x0)*.04;
      tablePile=settlePile({x0:tab.x0,x1:tab.x1,z0:tab.z0,z1:tab.z1,cell:.025,floor:(x,z)=>tY(x),
        inside:(x,z,y,r)=>[Math.max(tab.x0+.01+r*.5,Math.min(tab.x1-.02-r*.6,x)),Math.max(tab.z0+.03+r*.6,Math.min(tab.z1-.02-r*.6,z))],
        n:230,rMin:.03,rMax:.065,repose:.7,pour:R=>{const e=R()<.6;return[e?3.0+R()*.38:tab.x0+R()*(tab.x1-tab.x0),tab.z0+.12+R()*(tab.z1-tab.z0-.2)]}},R);
      {const ms=[massMesh(tablePile,WM.mass,{rnd:R}),...chunkMeshes(tablePile.chunks,R,WM)];
        containMeshes(ms,v=>{v.x=Math.max(tab.x0+.008,Math.min(tab.x1-.014,v.x));v.z=Math.max(tab.z0+.01,Math.min(tab.z1-.014,v.z));v.y=Math.max(v.y,tY(v.x)+.004)});
        ms.forEach(m=>RG.add(m))}
      const fl=(x,z)=>{const m=Math.max(Math.abs(x-hop.x),Math.abs(z-hop.z));if(m>.49)return null;if(m<hop.tw/2)return hop.y1-.12;return hop.y1+(m-hop.tw/2)/(.5-hop.tw/2)*(hop.y2-hop.y1)};
      hopPile=settlePile({x0:hop.x-.5,x1:hop.x+.5,z0:hop.z-.5,z1:hop.z+.5,cell:.025,floor:fl,
        inside:(x,z,y,r)=>{const lim=(y>=hop.y2?.48:Math.max(hop.tw/2,(.5-hop.tw/2)*(y-hop.y1)/(hop.y2-hop.y1)+hop.tw/2))-r*.5;return[Math.max(hop.x-lim,Math.min(hop.x+lim,x)),Math.max(hop.z-lim,Math.min(hop.z+lim,z))]},
        n:200,rMin:.03,rMax:.065,repose:.7,cap:(x,z)=>hop.y2+.1,pour:R=>[hop.x+(R()-.5)*.9,hop.z+(R()-.5)*.9]},R);
      {const ms=[massMesh(hopPile,WM.mass,{rnd:R}),...chunkMeshes(hopPile.chunks,R,WM)];
        containMeshes(ms,v=>{// inside the square funnel: half-size grows linearly from the throat (y1) to the rim (y2)
          const yy=Math.min(Math.max(v.y,hop.y1-.12),hop.y2),half=(yy<=hop.y1?hop.tw/2:hop.tw/2+(.5-hop.tw/2)*(yy-hop.y1)/(hop.y2-hop.y1))-.008;
          if(v.y<=hop.y2+.005){v.x=hop.x+Math.max(-half,Math.min(half,v.x-hop.x));v.z=hop.z+Math.max(-half,Math.min(half,v.z-hop.z))}
          else{v.x=hop.x+Math.max(-.49,Math.min(.49,v.x-hop.x));v.z=hop.z+Math.max(-.49,Math.min(.49,v.z-hop.z))}
          if(v.y<hop.y1-.12)v.y=hop.y1-.12});
        ms.forEach(m=>RG.add(m))}}
    L.push(...rej);
    // full open bins: one queued on the way to the tipper, two outside the gate
    [[3.78,2.5,1.57],[5.75,0.45,0.3],[5.75,1.3,-0.2]].forEach(([x,z,ry])=>{const b=makeBin(M,true);b.position.set(x,0.1,z);b.rotation.y=ry;RG.add(b);fillBin(b)});
    // sacks of waste by the gate and a few spilled scraps
    [[5.25,0.3,.0],[5.45,0.22,.9],[5.3,1.62,2.0],[4.95,1.55,.5]].forEach(([x,z,r],i)=>{const g=new THREE.SphereGeometry(.2,24,16);const P=g.attributes.position;
      for(let j=0;j<P.count;j++){const y=P.getY(j);P.setXYZ(j,P.getX(j)*(1+.1*Math.sin(j)),y<0?y*.55:y*1.15,P.getZ(j)*(.85+.1*Math.cos(j*1.7)))}g.computeVertexNormals();g.rotateY(r);g.translate(x,0.1+.11,z);
      const t=rod([x,.1+.32,z],[x,.1+.42,z],.035,8);L.push({g:merge([g,t]),c:i%2?0x1d1f21:0x2b4a2f})});
    {const R=makeRng(5),sp=[];for(let i=0;i<12;i++){const r=.025+R()*.02,g=chunkGeo(r,R);g.translate(3.5+R()*.55,.1+r*.35,3.75+R()*.9);sp.push(g)}
      add(merge(sp),WM[WASTE_COLS[0]],RG);}
    flush(L,RG);
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
  function poseLerp(a,b,k){k=ease(k);const y=a.y+(b.y-a.y)*k,th=a.r+(b.r-a.r)*k;
    // front rim of the bin sits at (-.36, 1.02) from its base in the tipper frame; rotate about it
    const px=3.78-.36,py=y+1.02,ox=-.36,oy=1.02,c=Math.cos(th),s=Math.sin(th);
    tipBin.position.set(px-(ox*c-oy*s),py-(ox*s+oy*c),4.19);tipBin.rotation.z=th;
    if(tipCar)tipCar.position.set(3.98,py,4.19)}
  const T=11; // tipper cycle, seconds
  function animateTipper(t){if(!tipBin)return;const u=((t%T)+T)%T;const P=tipPose;
    if(u<1.5)poseLerp(P.A,P.A,0);else if(u<4)poseLerp(P.A,P.B,(u-1.5)/2.5);else if(u<5.6)poseLerp(P.B,P.C,(u-4)/1.6);
    else if(u<7.4)poseLerp(P.C,P.C,0);else if(u<9)poseLerp(P.C,P.B,(u-7.4)/1.6);else poseLerp(P.B,P.A,(u-9)/2);
    tipFill.visible=u<5.3||u>10.6;
    // waste pours out of the bin mouth onto the far end of the table
    fallLumps.forEach(l=>{const k=l.userData.k,tt=u-5.25-k*.12;if(tt<0||tt>1.6){l.visible=false;return}l.visible=true;
      const x=3.15-.1*Math.min(tt,.4)+(k%3-1)*.05,z=4.19+((k%5)-2)*.12,land=Math.max(tablePile.hAt(x,z),tab.y)+.03,y0=2.05,y=y0-4.9*tt*tt;   // free fall, g = 9.8 m/s²
      l.position.set(x,Math.max(land,y),z);if(y>land)l.rotation.set(tt*9+k,tt*7,0)});
    // operators push sorted waste along the table and into the hopper
    slideLumps.forEach(l=>{const k=l.userData.k,s=((t*.14+k/16)%1+1)%1,z=4.19+(((k*7)%9)-4)*.08;
      if(s<.75){const q=s/.75,x=3.25-.7*q;l.position.set(x,Math.max(tablePile.hAt(x,z),tab.y)+.03,z);l.visible=true}else{const q=(s-.75)/.25,x=2.55-.25*q,zz=z*(1-q*.4)+hop.z*q*.4,yt=Math.max(tablePile.hAt(2.58,z),tab.y)+.03,yh=Math.max(hopPile.hAt(x,zz),hop.y2-.15)+.02-.08*q,y=yt-4.9*(q*.45)*(q*.45);l.position.set(x,Math.max(yh,y),zz);l.visible=q<.92}
      l.rotation.set(0,k,s*6)});}
  function restTipper(){if(!tipBin)return;poseLerp(tipPose.A,tipPose.A,0);tipFill.visible=true;fallLumps.forEach(l=>l.visible=false);slideLumps.forEach(l=>l.visible=false)}
  function updateFlows(t,cam){if(window.__tipT!=null)t=window.__tipT;if(slideLumps.length&&!slideLumps[0].visible)slideLumps.forEach(l=>l.visible=true);riders.forEach(r=>r.update(t,cam));animateTipper(t)}

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

  // ---- cable tray (as in the GPS electrical layout): ladder tray at 2.5 m; thin conduits drop from it
  //      straight onto the terminal boxes of each load and end in a cable gland
  const trayG=new THREE.Group();trayG.name='cable_tray';plantG.add(trayG);
  {const Y=2.5,W=.3,T=[],cond=[],gl=[],cr=.008;
    const run=(a,b)=>{const A=new THREE.Vector3(a[0],Y,a[1]),B=new THREE.Vector3(b[0],Y,b[1]),d=B.clone().sub(A),L=d.length(),ang=Math.atan2(d.x,d.z);
      [-W/2,W/2].forEach(o=>{const g=boxUV(.01,.04,L+.01);g.translate(o,0,L/2);g.rotateY(ang);g.translate(A.x,Y,A.z);T.push(g)});
      for(let t=.15;t<L;t+=.3){const g=boxUV(W,.008,.015);g.translate(0,-.016,t);g.rotateY(ang);g.translate(A.x,Y,A.z);T.push(g)}};
    const post=(x,z,along)=>{T.push(boxUV(.035,Y-.12,.035).translate(x,.1+(Y-.12)/2,z),(along?boxUV(.035,.03,.36):boxUV(.36,.03,.035)).translate(x,Y-.035,z),boxUV(.12,.01,.12).translate(x,.105,z))};
    run([-4.2,1.55],[2.83,1.55]);run([1.3,1.55],[1.3,4.25]);run([-1.45,1.55],[-1.45,4.3]);run([2.83,1.55],[2.83,-0.1]);
    [[-4.2,1.55],[-1.6,1.55],[0.45,1.55],[2.2,1.55]].forEach(([x,z])=>post(x,z));
    post(1.3,3.4,true);post(-1.45,2.75,true);post(2.83,0.62,true);
    {const tm=M.galv.clone();tm.transparent=true;tm.opacity=.5;tm.depthWrite=false;const tr=add(merge(T),tm,trayG);tr.castShadow=false;tr.renderOrder=3;}
    // conduit along an orthogonal path with small bends, ending in a gland on the terminal box
    const C=(pts,endUp=true)=>{const P=pts.map(p=>new THREE.Vector3(...p)),Q=[P[0]];
      for(let i=1;i<P.length-1;i++){const a=P[i].clone().sub(P[i-1]),b=P[i+1].clone().sub(P[i]),r=Math.min(.07,a.length()*.45,b.length()*.45);
        Q.push(P[i].clone().addScaledVector(a.normalize(),-r),P[i].clone(),P[i].clone().addScaledVector(b.normalize(),r))}
      Q.push(P[P.length-1]);const c=new THREE.CatmullRomCurve3(Q,false,'centripetal');
      cond.push(new THREE.TubeGeometry(c,Math.max(24,Q.length*10),cr,8,false));
      const e=P[P.length-1];gl.push(new THREE.CylinderGeometry(.016,.018,.03,12).translate(e.x,e.y-.012,e.z))};
    const d=Y-.045;   // underside of the tray
    // loads: terminal-box tops (from the CAD) and the new kit
    const pump1=xf('pump',[-3.411,.639,2.866]),pump2=xf('pump',[0,0,0])&&xf('pump2',[1.934,.639,4.156]),comp=xf('compressor',[2.15,1.054,-2.3]);
    const starter=xf('starter',[1.18,1.547,4.73]),dist=xf('dist',[-4.27,1.508,4.2]),vfd=xf('vfd',[-0.06,1.254,0]);
    const up=(p,h=.02)=>[p[0],p[1]+h,p[2]];
    C([[1.32,d,4.19],up([1.32,1.09,4.19])]);                                             // shredder motor
    C([[pump1[0],d,pump1[2]],up(pump1)]);                                                 // screw pump 1
    C([[pump2[0],d,1.55],[pump2[0],1.2,1.55],[pump2[0],1.2,pump2[2]],up(pump2)]);         // screw pump 2
    C([[comp[0],d,comp[2]],up(comp)]);                                                    // compressor
    [starter,dist,vfd].forEach(p=>C([[p[0],d,1.55],[p[0],2.1,1.55],[p[0],2.1,p[2]],up(p)]));   // panels up into the tray
    // digester heater junction box and agitator motor: riser from the top of the tray
    {const a=Math.PI*.3,jx=DIG.cx+Math.cos(a)*2.003,jz=DIG.cz+Math.sin(a)*2.003,jy=HEAT.y+.24+.07;
      C([[jx,Y+.045,1.55],[jx,jy+.25,1.55],[jx,jy+.25,jz],[jx,jy+.02,jz]]);
      const ax=DIG.cx+.17,az=DIG.cz,ay=DIG.cut+.29+.6+.05;
      C([[-1.25,Y+.045,1.55],[-1.25,ay+.3,1.55],[-1.25,ay+.3,az],[ax,ay+.3,az],[ax,ay+.02,az]]);
      // clips holding the risers
      [[jx,3.3,1.55],[jx,4.1,1.55],[-1.25,3.3,1.55],[-1.25,4.5,1.55],[-1.25,5.7,1.55]].forEach(p=>gl.push(new THREE.BoxGeometry(.03,.03,.03).translate(...p)));
      // riser support poles
      T.length=0;add(merge([rod([-1.25,.1,1.62],[-1.25,ay+.3,1.62],.02,8),rod([-1.25,ay+.3,1.62],[-1.25,ay+.3,1.55],.012,6)]),M.galv,trayG);}
    add(merge(cond),new THREE.MeshStandardMaterial({color:0x1e2124,roughness:.55}),trayG);
    add(merge(gl),M.galv,trayG);}

  // ---- 10. what can be clicked: key -> objects
  const picks={agitator:[agitatorG],heater:[heaterG],tray:[trayG],reception:[receptionG],kitchen:['burner_frame'].map(n=>byName[n]).filter(Boolean).concat([kitchenG]),pit:pitObjs,flare:[groups.flare.outer,flareExtra]};
  for(const k in groups){if(k==='flare')continue;picks[k]=[groups[k].outer].concat(groups[k].proc?[groups[k].proc]:[])}
  // ---- "see inside" view: digester skin turns glassy so the agitator and heater inside show
  const xrayMeshes=[];[groups.digester.outer,groups.digester.proc].forEach(r=>r&&r.traverse(m=>{if(m.isMesh&&!internals.includes(m))xrayMeshes.push(m)}));
  const xrayMat=new Map();
  function setXray(on){xrayMeshes.forEach(m=>{if(on){if(!m.userData.mat0)m.userData.mat0=m.material;let x=xrayMat.get(m.userData.mat0);
      if(!x){x=m.userData.mat0.clone();x.transparent=true;x.opacity=.16;x.depthWrite=false;x.side=THREE.DoubleSide;xrayMat.set(m.userData.mat0,x)}m.material=x;m.castShadow=false}
    else if(m.userData.mat0){m.material=m.userData.mat0;m.castShadow=true}})}
  internals.forEach(m=>{m.renderOrder=1});
  return {layers,groups,xf,flowObjs,updateFlows,updateAmbient,restTipper,routes,picks,targets,setXray};
}

function makeBin(M,open){
  // 240 L wheelie bin: tapered walls with real thickness, open mouth with a rolled rim, floor, lid hinged back, axle and wheels
  const g=new THREE.Group();const w=.58,d=.72,h=.98,b=.62/.7071;
  const shell=(sc,y0,y1,closed)=>{const c=new THREE.CylinderGeometry(.7071,.7071*b,1,4,1,!closed);c.rotateY(Math.PI/4);c.scale(w*sc,y1-y0,d*sc);c.translate(0,(y0+y1)/2,0);return c};
  if(!M.binIn)M.binIn=new THREE.MeshStandardMaterial({color:0x0f3d1f,roughness:.7,side:THREE.BackSide});
  if(!M.greenWall)M.greenWall=M.green.clone(),M.greenWall.side=THREE.FrontSide;
  const out=new THREE.Mesh(shell(1,.06,h+.04,!open),M.greenWall);out.castShadow=true;g.add(out);
  if(open){const inn=new THREE.Mesh(shell(.92,.1,h+.04,false),M.binIn);g.add(inn);
    g.add(new THREE.Mesh(boxUV(w*.84,.02,d*.84).translate(0,.11,0),M.binIn.clone()));
    // rolled rim around the mouth
    const hw=w/2,hd=d/2,y=h+.045,r=[rod([-hw,y,-hd],[hw,y,-hd],.022,8),rod([-hw,y,hd],[hw,y,hd],.022,8),rod([-hw,y,-hd],[-hw,y,hd],.022,8),rod([hw,y,-hd],[hw,y,hd],.022,8)];
    g.add(new THREE.Mesh(merge(r),M.greenDark))}
  const lidG=boxUV(w+.06,.04,d+.06);let lid;
  if(open){lidG.translate(0,.02,(d+.06)/2);lid=new THREE.Mesh(lidG,M.greenDark);lid.position.set(0,h+.06,-(d+.06)/2);lid.rotation.x=-2.75}
  else{lid=new THREE.Mesh(lidG.translate(0,h+.08,0),M.greenDark)}
  lid.castShadow=true;g.add(lid);
  g.add(new THREE.Mesh(merge([rod([0,h-.02,-d/2-.02],[0,h-.02,-d/2-.06],.02,8),rod([-w/2+.05,h-.04,-d/2-.07],[w/2-.05,h-.04,-d/2-.07],.018,8)]),M.greenDark));   // handle
  g.add(new THREE.Mesh(merge([placed(new THREE.CylinderGeometry(.1,.1,.05,16),[-w/2+.02,.1,-d/2+.08],[0,0,Math.PI/2]),placed(new THREE.CylinderGeometry(.1,.1,.05,16),[w/2-.02,.1,-d/2+.08],[0,0,Math.PI/2]),rod([-w/2,.1,-d/2+.08],[w/2,.1,-d/2+.08],.012,8)]),M.rubber));
  return g;
}

function lathe2(pr){const g=new THREE.LatheGeometry(pr.map(([r,y])=>new THREE.Vector2(r,y)),48);g.computeVertexNormals();return g}

import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/examples/jsm/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {OutlinePass} from 'three/examples/jsm/postprocessing/OutlinePass.js';
import {EQUIP,SITE,ROOF_LIFT,DIG} from './layout.js';
import {bakeWorld,filterTris,splitTris,boxUV,merge,placed,rod} from './geom.js';
import {buildPlant} from './plant.js';

function b64(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer}
const LITE=/[?&]lite/.test(location.search);

window.build3d=function(opts){
  const {canvas,stage,labelsEl,STOPS,LABELS,onReady}=opts;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(LITE?1:Math.min(window.devicePixelRatio||1,1.75));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(42,1,.1,400);
  const hdr=new RGBELoader().parse(b64(window.NITK_HDR));
  const env=new THREE.DataTexture(hdr.data,hdr.width,hdr.height,THREE.RGBAFormat,hdr.type);
  env.mapping=THREE.EquirectangularReflectionMapping;env.colorSpace=THREE.LinearSRGBColorSpace;
  env.minFilter=env.magFilter=THREE.LinearFilter;env.flipY=true;env.needsUpdate=true;
  const plainBg=new THREE.Color(0xc9d6e1);
  scene.background=env;scene.environment=env;scene.environmentIntensity=.85;scene.backgroundIntensity=.9;
  const sun=new THREE.DirectionalLight(0xfff0dd,2.6);
  sun.position.set(-9,16,11);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:1,far:60});
  sun.shadow.bias=-4e-4;sun.shadow.normalBias=.03;scene.add(sun);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.495;controls.minDistance=1.2;controls.maxDistance=45;
  let composer=null,gtao=null,outline=null;
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();composer&&composer.setSize(w,h)}
  window.addEventListener('resize',resize);

  // labels
  const labs=LABELS.map(L=>{const e=document.createElement('button');e.className='lab zone';e.innerHTML='<em>'+L.stop+'</em>'+L.name;e.onclick=()=>opts.onLabel(L.stop);labelsEl.appendChild(e);return{e,p:new THREE.Vector3(...L.pos),stop:L.stop}});
  let tween=null;
  function flyTo(c,d=1600){tween={t0:performance.now(),d,fp:camera.position.clone(),ft:controls.target.clone(),tp:new THREE.Vector3(c[3],c[4],c[5]),tt:new THREE.Vector3(c[0],c[1],c[2])}}
  function setStop(i){flyTo(STOPS[i].cam);labs.forEach(l=>l.e.classList.toggle('on',l.stop===i))}
  const c0=STOPS[0].cam;camera.position.set(c0[3],c0[4],c0[5]);controls.target.set(c0[0],c0[1],c0[2]);
  window.__cam=c=>{tween=null;camera.position.set(c[3],c[4],c[5]);controls.target.set(c[0],c[1],c[2]);controls.update()};

  let plant=null;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.parse(b64(window.NITK_GLB),'',gltf=>{
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=!/ground|label|canopy|frond/.test(o.name);o.receiveShadow=true;
      if(o.geometry.attributes.color)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.vertexColors=true;m.needsUpdate=true})}});
    scene.add(gltf.scene);
    plant=buildPlant(gltf.scene,scene);
    window.__plant=plant;window.__T=THREE;window.__scene=scene;
    composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
    if(!LITE){try{gtao=new GTAOPass(scene,camera,stage.clientWidth,stage.clientHeight);gtao.blendIntensity=.7;gtao.updateGtaoMaterial({radius:.6,distanceExponent:1.5,scale:1});composer.addPass(gtao)}catch(e){gtao=null}}
    outline=new OutlinePass(new THREE.Vector2(stage.clientWidth,stage.clientHeight),scene,camera);
    Object.assign(outline,{edgeStrength:5,edgeGlow:0,edgeThickness:1.6,pulsePeriod:0});outline.visibleEdgeColor.set(0x2f8cff);outline.hiddenEdgeColor.set(0x1c4f9a);
    composer.addPass(outline);
    composer.addPass(new OutputPass());resize();
    buildProxies();
    applyLayers();
    onReady&&onReady();
  },e=>{console.error(e);opts.onFail&&opts.onFail()});
  resize();

  // ---- picking: invisible proxy shapes per equipment item (cheap to ray-test)
  const proxies=[],ray=new THREE.Raycaster(),ndc=new THREE.Vector2();let selected=null;
  const CYL={digester:[-2.163,-0.728,1.56,0.1,6.45],hydrolyzer:[-2.95,3.5,0.98,0.1,3.78],storage:[2.95,-2.1,0.78,0.1,4.1]};
  function buildProxies(){
    const mat=new THREE.MeshBasicMaterial(),tmpB=new THREE.Box3();
    for(const [k,objs] of Object.entries(plant.picks)){
      const all=new THREE.Box3(),parts=[];
      objs.forEach(o=>{o.updateWorldMatrix(true,true);o.traverse(m=>{if(!m.isMesh||m.userData.noPick||m.isInstancedMesh)return;
        if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();tmpB.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        const sz=tmpB.getSize(new THREE.Vector3());if(Math.max(sz.x,sz.y,sz.z)<.05)return;all.union(tmpB);parts.push(tmpB.clone())})});
      if(all.isEmpty())continue;
      let boxes=parts;
      if(CYL[k]){const [x,z,r,y0,y1]=CYL[k];all.set(new THREE.Vector3(x-r,y0,z-r),new THREE.Vector3(x+r,y1,z+r));
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,y1-y0,24).translate(x,(y0+y1)/2,z),mat);m.userData={key:k,box:all};m.updateMatrixWorld(true);proxies.push(m);continue}
      if(boxes.length>40)boxes=[all];
      boxes.forEach(b=>{const sz=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
        const m=new THREE.Mesh(new THREE.BoxGeometry(Math.max(sz.x,.12)+.03,Math.max(sz.y,.12)+.03,Math.max(sz.z,.12)+.03).translate(c.x,c.y,c.z),mat);
        m.userData={key:k,box:all};m.updateMatrixWorld(true);proxies.push(m)})}
  }
  // pick: cheap proxy boxes find candidates, then the real meshes of those candidates decide (nearest surface wins)
  const pickMeshes={};
  function visibleChain(o){for(let q=o;q;q=q.parent)if(!q.visible)return false;return true}
  function meshesOf(k){if(!pickMeshes[k]){const L=[];(plant.picks[k]||[]).forEach(o=>o.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh&&!m.userData.noPick)L.push(m)}));pickMeshes[k]=L}
    return pickMeshes[k].filter(visibleChain)}
  function pickAt(cx,cy){if(!proxies.length)return null;const r=canvas.getBoundingClientRect();
    ndc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);
    const live=proxies.filter(p=>p.userData.key!=='kitchen'||layerState.kitchen);
    const keys=[];for(const h of ray.intersectObjects(live,false)){const k=h.object.userData.key;if(!keys.includes(k))keys.push(k);if(keys.length>=6)break}
    let best=null,bd=Infinity;
    for(const k of keys){const h=ray.intersectObjects(meshesOf(k),false)[0];if(h&&h.distance<bd){bd=h.distance;best=k}}
    return best}
  function dims(k){if(['reception','kitchen','pit','heater','agitator','tray'].includes(k))return null;const p=proxies.find(q=>q.userData.key===k);if(!p)return null;const s=p.userData.box.getSize(new THREE.Vector3());return [s.x,s.z,s.y].map(v=>Math.round(v*10)/10)}
  function select(k){selected=k||null;if(outline)outline.selectedObjects=selected&&plant?plant.picks[selected]:[]}
  let down=null,hoverPending=null,hoverKey=null;
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now()}});
  canvas.addEventListener('pointerup',e=>{if(!down)return;const d=Math.hypot(e.clientX-down.x,e.clientY-down.y),dt=performance.now()-down.t;down=null;
    if(d>6)return;const k=pickAt(e.clientX,e.clientY);select(k);opts.onPick&&opts.onPick(k,k?dims(k):null)});
  let lastHover=0;canvas.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')return;hoverPending={x:e.clientX,y:e.clientY}});
  canvas.addEventListener('pointerleave',()=>{hoverPending=null;if(hoverKey!==null){hoverKey=null;canvas.style.cursor='';opts.onHover&&opts.onHover(null)}});
  function doHover(){if(!hoverPending)return;const now=performance.now();if(now-lastHover<90)return;lastHover=now;const {x,y}=hoverPending;hoverPending=null;const k=pickAt(x,y);
    canvas.style.cursor=k?'pointer':'';if(k!==hoverKey||k){hoverKey=k;const r=stage.getBoundingClientRect();opts.onHover&&opts.onHover(k,x-r.left,y-r.top)}}

  // ---- layers (roof, compound wall, surroundings, kitchen) ----
  const layerState={roof:false,compound:false,surroundings:false,kitchen:true,xray:false};
  function applyLayers(){if(!plant)return;
    for(const k in layerState)(plant.layers[k]||[]).forEach(o=>o.visible=layerState[k]);
    plant.setXray(layerState.xray);
    scene.background=layerState.surroundings?env:plainBg;
    if(gtao)gtao.enabled=gtao.enabled; }
  function setLayer(k,v){layerState[k]=v;applyLayers()}

  let showLabels=true,showFlows=true;const tmp=new THREE.Vector3();
  const H={frames:0,fps:0,last:performance.now()};
  function frame(t){requestAnimationFrame(frame);
    if(tween){let k=Math.min(1,(t-tween.t0)/tween.d);k=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;camera.position.lerpVectors(tween.fp,tween.tp,k);controls.target.lerpVectors(tween.ft,tween.tt,k);if(k>=1)tween=null}
    controls.update();
    if(plant&&showFlows)plant.updateFlows(t*.001,camera.position);
    if(plant)plant.updateAmbient(t*.001);
    doHover();
    composer?composer.render():renderer.render(scene,camera);
    if(showLabels){const w=stage.clientWidth,h=stage.clientHeight;labs.forEach(l=>{tmp.copy(l.p).project(camera);const vis=tmp.z<1&&Math.abs(tmp.x)<1.1&&Math.abs(tmp.y)<1.1;l.e.style.display=vis?'':'none';if(vis)l.e.style.transform='translate(-50%,-100%) translate('+((tmp.x+1)/2*w).toFixed(1)+'px,'+((1-tmp.y)/2*h-10).toFixed(1)+'px)'})}
    H.frames++;if(t-H.last>1000){H.fps=H.frames*1000/(t-H.last);H.frames=0;H.last=t;
      if(gtao&&H.fps<28&&!H.cut){H.low=(H.low||0)+1;if(H.low>3){gtao.enabled=false;renderer.setPixelRatio(1);resize();H.cut=1}}}
  }
  requestAnimationFrame(frame);
  window.__fps=()=>H.fps;window.__camObj=camera;window.__layer=setLayer;
  window.__pick=(x,y)=>pickAt(x,y);window.__pickDbg=(cx,cy)=>{const r=canvas.getBoundingClientRect();ndc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);return ray.intersectObjects(proxies,false).slice(0,6).map(h=>h.object.userData.key+":"+h.distance.toFixed(2)+"/"+((ray.intersectObjects(meshesOf(h.object.userData.key),false)[0]||{}).distance||-1))};window.__proxies=()=>proxies.map(p=>p.userData.key);window.__proj=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(camera),r=canvas.getBoundingClientRect();return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height]};
  return {setStop,
    flows:v=>{showFlows=v;if(plant){plant.flowObjs.forEach(o=>o.visible=v);if(!v)plant.restTipper()}},
    select, dims,
    labels:v=>{showLabels=v},
    layer:setLayer, layers:()=>Object.assign({},layerState)};
};

// Pipe schedule. Points are world coordinates (x east, y up, z south), metres.
// Runs are orthogonal; bends are drawn as smooth elbows.
export const MEDIA={
  slurry:{r:.045,mat:'pvc',fl:'pvcFl',flow:0xe08a2c},
  digestate:{r:.045,mat:'hdpe',fl:'hdpe',flow:0x22c55e},
  gas:{r:.03,mat:'gas',fl:'gasFl',flow:0xff3d1a},
  waste:{flow:0x5b3a1e},
};
export const ROUTES=({DIG})=>{
  const T=[2.95,0.75,-4.2];               // gas header tee outside the north wall
  return [
  // ---- slurry (white PVC, low, on concrete saddles)
  {id:'S1',a:'shredder',b:'mixtank',medium:'slurry',from:'Shredder discharge',to:'Mixing tank inlet',pts:[[2.05,0.42,3.86],[2.05,0.42,3.72],[0.82,0.42,3.72],[0.82,0.63,3.72],[0.82,0.63,4.06],[0.66,0.63,4.06]]},
  {id:'S2',a:'mixtank',b:'pump',medium:'slurry',from:'Mixing tank outlet',to:'Feed pump 1 suction',pts:[[-0.95,0.62,3.745],[-1.45,0.62,3.745],[-1.45,0.53,3.745]]},
  {id:'S3',a:'pump',b:'hydrolyzer',medium:'slurry',from:'Feed pump 1 discharge',to:'Hydrolysis tank inlet',pts:[[-1.45,0.25,3.045],[-1.45,0.25,2.9],[-1.75,0.25,2.9],[-1.75,1.15,2.9],[-2.2,1.15,2.9]]},
  {id:'S4',a:'hydrolyzer',b:'pump2',medium:'slurry',from:'Hydrolysis tank top outlet',to:'Feed pump 2 suction',pts:[[-2.95,3.77,3.05],[-2.95,3.95,3.05],[-2.95,3.95,2.38],[-2.95,0.8,2.38],[-2.95,0.8,1.6],[-2.95,0.53,1.6]]},
  {id:'S5',a:'pump2',b:'digester',medium:'slurry',from:'Feed pump 2 discharge',to:'Digester feed inlet',pts:[[-2.3,0.25,1.6],[-2.0,0.25,1.6],[-2.0,1.65,1.6],[-2.0,1.65,0.76]]},
  // ---- digestate (black HDPE) over the west wall into the collection pit
  {id:'D1',a:'digester',b:null,medium:'digestate',from:'Digester overflow',to:'Digestate pit (outside west wall)',pts:[[DIG.cx-DIG.r+0.02,1.6,DIG.cz],[-5.3,1.6,DIG.cz],[-5.3,0.2,DIG.cz]]},
  // ---- biogas (yellow steel)
  {id:'G1',a:null,b:'cage',medium:'gas',from:'Digester gas outlet (top of the side wall)',to:'Balloon cage',pts:[[DIG.cx+1.73,DIG.cut-.16,DIG.cz],[-0.3,DIG.cut-.16,DIG.cz],[-0.3,2.75,DIG.cz],[0.8,2.75,DIG.cz],[0.8,2.44,DIG.cz]]},
  {id:'G2',a:'cage',b:'h2s',medium:'gas',from:'Balloon cage outlet',to:'H2S scrubber inlet',pts:[[0.4,0.55,-1.12],[0.4,0.55,-2.49]]},
  {id:'G3',a:'h2s',b:'h2o',medium:'gas',from:'H2S scrubber outlet',to:'Moisture scrubber inlet',pts:[[0.4,1.23,-2.75],[0.4,1.48,-2.75],[1.05,1.48,-2.75],[1.05,1.23,-2.75]]},
  {id:'G4',a:'h2o',b:'filter',medium:'gas',from:'Moisture scrubber outlet',to:'Gas filter inlet',pts:[[1.3,0.4,-2.75],[1.615,0.4,-2.75]]},
  {id:'G5',a:'filter',b:'compressor',medium:'gas',from:'Gas filter outlet',to:'Compressor suction',pts:[[1.75,0.47,-2.75],[1.75,0.8,-2.75],[1.75,0.8,-0.1],[1.95,0.8,-0.1]]},
  {id:'G6',a:'compressor',b:'storage',medium:'gas',from:'Compressor discharge',to:'Gas storage vessel inlet',pts:[[2.45,0.95,-0.43],[2.45,0.95,-1.12],[2.6,0.95,-1.38]]},
  {id:'G7',a:'storage',b:null,medium:'gas',from:'Gas storage vessel outlet (top)',to:'Header tee outside north wall',pts:[[2.95,4.08,-2.1],[2.95,4.35,-2.1],[2.95,4.35,-4.2],T]},
  {id:'G8',a:null,b:'flare',medium:'gas',from:'Header tee',to:'Flare stack (5 m)',pts:[T,[2.95,0.75,-5.38]]},
  {id:'G9',a:null,b:null,medium:'gas',from:'Header tee',to:'Kitchen burner manifold',pts:[T,[4.96,0.75,-4.2],[4.96,0.75,-10.47],[8.4,0.75,-10.47]]},
];};
export const VALVES=()=>[
  {medium:'slurry',p:[-1.2,0.62,3.745],dir:[1,0,0]},
  {medium:'slurry',p:[-2.95,0.8,2.0],dir:[0,0,1]},
  {medium:'slurry',p:[-2.0,1.65,1.2],dir:[0,0,1]},
  {medium:'gas',p:[2.95,4.35,-3.3],dir:[0,0,1]},
  {medium:'gas',p:[4.2,0.75,-4.2],dir:[1,0,0]},
];
// Food-waste route painted on the floor as arrows: [x,z] points.
export const WASTE_FLOOR=()=>[[[6.1,1.45],[3.78,1.45],[3.78,3.6]]];

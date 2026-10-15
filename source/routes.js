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
  // ---- biogas (yellow steel): digester -> moisture scrubber -> H2S scrubber -> automatic valve box
  //      -> twin balloons (production / flow measurement) -> valve box -> filter -> compressor -> storage
  //      -> kitchen; valve box -> flare when the storage vessel is full
  {id:'G1',a:null,b:'h2o',medium:'gas',from:'Digester gas outlet (top of the side wall)',to:'Moisture scrubber inlet (bottom side)',pts:[[DIG.cx+1.73,DIG.cut-.16,DIG.cz],[-0.3,DIG.cut-.16,DIG.cz],[-0.3,0.45,DIG.cz],[-0.3,0.45,-2.75],[0.25,0.45,-2.75]]},
  {id:'G2',a:'h2o',b:'h2s',medium:'gas',from:'Moisture scrubber outlet (top)',to:'H2S scrubber inlet (bottom side)',pts:[[0.25,1.2,-2.75],[0.25,1.45,-2.75],[0.575,1.45,-2.75],[0.575,0.45,-2.75],[0.9,0.45,-2.75]]},
  {id:'G3',a:'h2s',b:'valve',medium:'gas',from:'H2S scrubber outlet (top)',to:'Automatic valve box (gas in)',pts:[[0.9,1.2,-2.75],[0.9,1.45,-2.75],[1.3,1.45,-2.75],[1.3,1.45,-2.05],[1.3,0.5,-2.05],[1.6,0.5,-2.05]]},
  {id:'B1',a:'valve',b:null,medium:'gas',from:'Automatic valve box',to:'Balloon 1 (upper)',pts:[[1.6,0.9,-1.3],[1.3,0.9,-1.3],[1.3,1.5,-1.3],[0.98,1.5,-1.3],[0.98,1.5,-1.17]]},
  {id:'B2',a:null,b:'valve',medium:'gas',from:'Balloon 2 (lower)',to:'Automatic valve box',pts:[[0.98,0.72,-1.17],[0.98,0.72,-1.55],[1.6,0.72,-1.55]]},
  {id:'G4',a:'valve',b:'filter',medium:'gas',from:'Automatic valve box (to compressor)',to:'Gas filter inlet',pts:[[1.74,0.35,-1.6],[2.06,0.35,-1.6]]},
  {id:'G5',a:'filter',b:'compressor',medium:'gas',from:'Gas filter outlet',to:'Compressor suction',pts:[[2.06,0.47,-1.6],[2.06,0.8,-1.6],[2.06,0.8,-0.3]]},
  {id:'G6',a:'compressor',b:'storage',medium:'gas',from:'Compressor discharge',to:'Gas storage vessel inlet',pts:[[2.45,0.95,-0.43],[2.45,0.95,-1.12],[2.6,0.95,-1.38]]},
  {id:'G7',a:'storage',b:null,medium:'gas',from:'Gas storage vessel outlet (top)',to:'Kitchen burner manifold',pts:[[2.95,4.08,-2.1],[2.95,4.35,-2.1],[2.95,4.35,-4.2],[2.95,0.75,-4.2],[4.96,0.75,-4.2],[4.96,0.75,-10.47],[8.4,0.75,-10.47]]},
  {id:'G8',a:'valve',b:'flare',medium:'gas',from:'Automatic valve box (excess gas)',to:'Flare stack (5 m)',pts:[[1.6,1.0,-2.2],[1.6,1.25,-2.2],[1.6,1.25,-4.45],[2.95,1.25,-4.45],[2.95,0.75,-4.45],[2.95,0.75,-5.38]]},
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

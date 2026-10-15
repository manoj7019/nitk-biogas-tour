// Plant layout: where each CAD item from the SolidWorks assembly now sits.
// pivot = point in the ORIGINAL CAD coordinates the item is moved/rotated about
// to    = [x, z, rotDeg] new pivot position (three.js world, metres; +x east, +z south)
// fp    = original footprint [x0,x1,z0,z1] used to decide which loose decal/band
//         triangles belong to the item.
export const EQUIP = {
  digester:  {node:'CAD_digester',  pivot:[-1.81,-0.73], to:[-1.81,-0.73,0],  fp:[-4.05,0.12,-2.35,0.9]},
  hydrolyzer:{node:'CAD_hydrolyzer',pivot:[-0.107,3.83], to:[-2.95,3.5,0],   fp:[-1.1,0.9,2.85,5.0]},
  pump2:     {node:'CAD_pump2',     pivot:[1.935,3.735], to:[-3.035,1.6,-90], fp:[1.75,2.12,2.95,4.52]},
  mixtank:   {node:'CAD_mixtank',   pivot:[-3.31,1.82],  to:[-0.14,3.98,0],   fp:[-4.17,-2.45,1.19,2.45]},
  pump:      {node:'CAD_pump',      pivot:[-2.985,2.87], to:[-1.45,3.83,90],  fp:[-3.77,-2.2,2.68,3.06]},
  shredder:  {node:'CAD_shredder',  pivot:[3.28,3.2],    to:[2.33,3.89,0],    fp:[1.9,4.66,2.41,3.99]},
  storage:   {node:'CAD_storage',   pivot:[2.96,-2.31],  to:[2.95,-2.1,0],    fp:[2.16,3.76,-3.12,-0.87]},
  compressor:{node:'CAD_compressor',pivot:[1.775,-2.315],to:[2.45,-0.1,0],    fp:[1.23,2.32,-2.7,-1.93]},
  cage:      {node:'CAD_cage',      pivot:[3.17,0.32],   to:[0.8,-0.5,0],     fp:[2.27,4.07,-0.37,1.01]},
  h2s:       {node:'CAD_h2s',       pivot:[-4.57,-2.675],to:[0.9,-2.75,0],    fp:[-4.9,-4.29,-3.0,-2.35]},
  h2o:       {node:'CAD_h2o',       pivot:[-4.065,-3.385],to:[0.25,-2.75,0],  fp:[-4.29,-3.74,-3.71,-3.06]},
  filter:    {node:'CAD_filter',    pivot:[0.655,-2.295],to:[2.06,-1.6,0],    fp:[0.47,0.84,-2.48,-2.11]},
  starter:   {node:'CAD_starter',   pivot:[1.18,4.745],  to:[0.05,1.95,0],    fp:[0.79,1.57,4.52,4.97]},
  dist:      {node:'CAD_dist',      pivot:[-4.28,4.195], to:[-0.75,1.95,90],  fp:[-4.51,-4.05,3.84,4.55]},
  vfd:       {node:'CAD_vfd',       pivot:[-0.06,-0.025],to:[0.95,1.95,90],   fp:[-0.31,0.19,-0.48,0.43]},
  valve:     {node:'CAD_valve',     pivot:[-0.41,-3.03], to:[1.6,-1.75,90],   fp:[-1.06,0.24,-3.21,-2.85]},
  flare:     {node:'CAD_flare',     pivot:[-5.94,-3.0],  to:[2.95,-5.6,0],    fp:[-6.26,-5.62,-3.29,-2.72]},
};

// Compound (outer faces of the brick wall) and the gate in the east wall.
export const SITE = {x0:-4.64, x1:4.36, z0:-3.67, z1:5.33, t:0.23, h:1.0, gate:[0.1,1.7]};

// Roof and trusses are lifted so the digester top has headroom.
export const ROOF_LIFT = 0.65;
// The CAD digester top is cut here and replaced by a clean lid.
// Centre fitted to the CAD shell (the old bands/skirt/labels were 0.35 m off and are re-centred onto it).
export const DIG = {cx:-2.163, cz:-0.728, r:1.52, cut:5.86, base:1.42, decorDX:-0.353};

// Flare stack: total height above ground (ground is at y=-0.3).
export const FLARE_H = 5.0;

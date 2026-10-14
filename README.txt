NITK Food Waste to Biogas Plant - interactive 3D tour
=====================================================

HOW TO OPEN
  Unzip, then double-click index.html (Chrome / Edge / Firefox). Works offline.
  Click (or tap) any equipment to see what it is, its size, what goes in and out, and a button to jump to its tour stop.
  Drag to orbit, right-drag to pan, scroll to zoom. Numbered buttons jump to stops; "Play tour" runs the narrated tour.
  Toggles: Narration (voice), Labels (equipment tags), Flows (animated flow arrows).
  View menu (roof, compound wall and trees start hidden so the plant is clear; tick them to show): show or hide the roof and columns, the compound wall and gate, trees and surroundings,
  and the kitchen. "Plant only" hides all four so the equipment and pipework are seen clearly.

WHAT CHANGED IN v6
  - Hydrolysis tank: the outlet is the black nozzle on the tank roof; the white slurry line to screw pump 2
    runs from it, down the north side of the tank.
  - Kitchen: each stove has its own gas drop from the yellow line (tee, red ball valve, hose nozzle) and an
    orange hose into the burner's mixing tube. The old loose hoses are removed.

WHAT CHANGED IN v5
  - Clicking now tests the real shapes of the equipment, so any part you can see can be clicked from any angle
    (the waste-reception area no longer blocks the items behind it).
  - Hydrolysis tank: the slurry line to screw pump 2 now leaves from the tank's bottom outlet.
  - Digester: the shell-to-base joint is a wide bolted flange that covers the ragged CAD edge.
  - Kitchen: cast-iron burner heads with pan supports, a cooking pot, and animated blue gas flames.

WHAT CHANGED IN v4
  - Digester: the gap between shell and base is closed by a solid skirt with a bolted joint flange on a
    concrete ring; the ragged CAD bottom edge is cut away; the broken CAD ladder is replaced by a clean cage ladder.
  - Gas storage vessel: ragged bottom head replaced by a smooth dished head seated on the stand ring;
    the gas inlet now enters the vessel's real nozzle; the spare nozzle is blanked off.
  - Every pipe end is snapped onto the surface of the equipment it connects to; slurry lines now run into the
    real pump suction and discharge nozzles and the mixing tank inlet nozzle.
  - Stray fragments removed (old ladder pieces, a dangling stub on the mixing tank).
  - More food waste: heaped on the sorting table, filling the hopper, in open bins and in sacks by the gate.

WHAT CHANGED IN v3
  - Flow arrows are small flat 2D chevrons on the pipe surface; they turn to face you and point downstream.
  - Food waste is shown by arrows painted on the floor (gate -> sorting table -> bin tipper) and an animated
    bin tipper that lifts a bin and empties it into the hopper.
  - Digester: shell, black bands, base skirt, signs and conical roof are now concentric (the source model had
    the bands and signs 0.35 m off the shell centre).
  - Hydrolysis tank and shredder rebuilt as clean, smooth models (the CAD meshes had torn, spiky triangles).
  - Balloon cage: one balloon in the lower bay (was two).
  - Equipment is clickable, with a details card and an outline on the selected item.

WHAT CHANGED IN v2
  - Layout: equipment re-arranged in process order around the 9 x 9 m platform, every item at least
    ~0.4 m clear of the brick wall (previously scrubbers, shredder, cage, hydrolyser and panels touched
    or crossed the wall).
  - Food-waste entry: gate in the east wall -> sorting table (with reject crate) -> bin tipper ->
    stainless feed hopper on the shredder. Animated arrows follow the waste in.
  - Digester roof: the broken CAD top (floating black disc, jagged manholes) is cut off and replaced by a
    conical roof with curb ring, two bolted manholes, a pressure/vacuum relief valve and a central gas nozzle.
    The shed roof is raised 0.65 m so the digester top has headroom.
  - Pipework: all old pipes and fittings removed and rebuilt as short, orthogonal runs with smooth elbows,
    flanged ends, valves, concrete saddles (low runs) and steel posts (high runs).
  - Flare: 5 m flare stack with flame arrester and three guy wires, outside the north wall and clear of the roof.

PIPE SCHEDULE (process order)
  ID  From                              -> To                                Medium     Pipe
  S1  Shredder discharge                -> Mixing tank inlet                 slurry     White PVC ~90 mm
  S2  Mixing tank outlet                -> Screw pump 1 suction              slurry     White PVC, ball valve
  S3  Screw pump 1 discharge            -> Hydrolysis tank inlet             slurry     White PVC
  S4  Hydrolysis tank top outlet           -> Screw pump 2 suction              slurry     White PVC, ball valve
  S5  Screw pump 2 discharge            -> Digester feed inlet               slurry     White PVC, ball valve
  D1  Digester overflow                 -> Digestate pit (outside west wall) digestate  Black HDPE ~90 mm
  G1  Digester gas nozzle (roof centre) -> Balloon cage                      gas        Yellow steel ~60 mm
  G2  Balloon cage outlet               -> H2S scrubber inlet                gas
  G3  H2S scrubber outlet               -> Moisture scrubber inlet           gas
  G4  Moisture scrubber outlet          -> Gas filter inlet                  gas
  G5  Gas filter outlet                 -> Compressor suction                gas
  G6  Compressor discharge              -> Gas storage vessel inlet          gas
  G7  Gas storage vessel outlet (top)   -> Header tee outside north wall     gas        isolation valve
  G8  Header tee                        -> Flare stack (5 m)                 gas
  G9  Header tee                        -> Kitchen burner manifold           gas        isolation valve

  Nozzle positions and pipe sizes are approximate (the CAD has no nozzle data).

SOURCES
  Equipment geometry comes from the SolidWorks assembly "NITK TECNIMONT" (STEP/part files); positions were
  re-arranged for clearance and process order. Roof, walls, digester roof, hopper, bin tipper, sorting table,
  pipes, labels, kitchen and surroundings are modelled.

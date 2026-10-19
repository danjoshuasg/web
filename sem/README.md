# SEM isometric figure

Fig 5: a scanning electron microscope (Schottky field-emission gun, SE and BSE detection), built with the `anatomy`
skill kit (`../kit`, MIT) and the shared bench (`../common`). Every number in the readout, the LCD image, the beam's
probe size and the interaction volume comes from `model.mjs` (`run`, `probe`, `volume`, `kanayaRange`, `renderClean`,
`noisy`, `fov`, `seYield`, `electronsPerPixel`).

    node sem/build.mjs                  # sem.html (dark)
    node sem/build.mjs --light          # sem-light.html
    node sem/build.mjs --audit          # geometry audit, must print "audit passed" (also with --light)
    node scripts/lines.mjs sem/sem.html # must print "line ends: 0" (also on sem-light.html)

Files: `build.mjs` (static art, recorder, page), `live.js` (beam, lift, LCD raster, controls, tour), `sem.css`,
`model.mjs` (pure model, not edited).

Drawing convention: the column, the chamber walls and roof, the BSE ring and the specimen are cut along the planes
y = 0 and x = 0 through the electron-optical axis, so the front-right quarter is removed. Each round housing is drawn as
the kit's lathe solid clipped outside the removed wedge, plus its bore seen from inside, its top face and its two section
faces, with the lens coils as windings in the yoke section. Nothing in the figure lies in front of the axis, so the lit
layer (beam envelope, core, falling electrons, spot, interaction volume) is drawn last.

Parts (179 recorded solids, 7 tube/cable runs): plinth with feet, ruler and label; four isolator legs; chamber floor,
back, left, half front and half right walls, roof in five pieces; door with viewport, hinges and handle; stage base, Y
and X rails and carriages with two stepper motors on brackets, tilt cradle with trunnion, tilt table, Z housing; the
lift (post sliding out of the gland, rotation table, holder, stub, cut Si specimen with Au particles); pole piece, BSE
ring and arm, objective lens, scan coils (two deflector pairs), aperture holder with strip and micrometer drive, C2 and
C1 with flanges, spacer, gun isolation valve with actuator, anode chamber and plate, gun with insulator, emitter legs,
suppressor (Wehnelt), tip and extractor, HV bushing, connector and elbow, ion getter pump with magnet; ETD (guide,
scintillator, Faraday cage, flange, PMT, base) through the right wall; EDS (bosses and ball joints inside and on the
roof, snout, window, slide, fins, head); turbo pump under the floor, rotary pump with motor, foreline, load lock with
gate valve, lid, knob, transfer rod and roughing line; Pirani and Penning gauges, vent valve and N2 bottle with
regulator; electronics rack with four modules, monitor on the rack, console with knobs and trackball; HV, ETD, EDS and
console cables.

Live: the stage is a slider for magnification on a log scale (arrows ×1.12, Shift ×2, Home 100×, End 200 000×; it sets
the LCD field of view). Sliders: beam energy 1–30 kV, probe current 1–2000 pA (log), working distance 4–20 mm (lifts
the stage, 1 drawn unit per mm); SE/BSE radio group. The LCD is a 160 × 120 raster from `renderClean`/`noisy`,
rewritten line by line at 40 lines/s; each new frame gets fresh shot noise. Idle tour: 10 → 20 → 30 → 3 kV, BSE, 5 pA,
1000 pA, 100 000×, 8000× at WD 15, 30 000× at WD 5. Reduced motion: one frame with the full image and the beam parked.

Assumptions (drawn only, not in the model): the pear is drawn on a square-root scale of the Kanaya-Okayama depth
(10.2 units at 30 kV) with half-width 0.8 × depth as `volume` gives; beam swing (±2 units at the specimen, 1.6 s line
period), electron dot speed, beam envelope widths and crossovers are illustrative; the drawn spot grows with the
model's probe size. The image builds at 40 lines/s (real 5 µs dwell: 0.1 s a frame). Below about 1000× the 5 µm scene
tile is smaller than a pixel and the model's image aliases.

Phase 2b (WebGL glow on the beam and spot) is not built; the SVG figure is complete without it.

Checked: `--audit` and `--light --audit` pass; `lines.mjs` reads 0 in both themes, at WD 4 and 20 mm (`drive.mjs`
`["lines"]`) and under `--reduced`. Shots in `shots/`: `desk*.png` (1440), `phone*.png` (390), `z-*.png` (4× close-ups,
both themes), `pose-*.png` (2 and 30 kV, WD 4 and 20), `lcd-bse.png`, `lcd-1pa.png`, `reduced*.png`, `lines*.png`.

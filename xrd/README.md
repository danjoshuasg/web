# Powder XRD isometric figure

Fig 4: a benchtop powder X-ray diffractometer (Bragg-Brentano), built with the `anatomy` skill kit (`../kit`, MIT) and
the shared bench (`../common`). Every number in the readout, the beam brightness, the arm angles and the diffractogram
comes from `model.mjs` (`run`, `identify`, `beamGlow`, `counts`, `dSpacing`, `fwhm`).

    node xrd/build.mjs                  # xrd.html (dark)
    node xrd/build.mjs --light          # xrd-light.html
    node xrd/build.mjs --audit          # geometry audit ("audit passed") plus the arm sweep ("sweep passed")
    node scripts/lines.mjs xrd/xrd.html # must print "line ends: 0" (also on xrd-light.html)

Files: `build.mjs` (static art, recorder, page), `gonio.mjs` (the moving group, shared by build and page),
`live.js` (motion, LCD, controls), `xrd.css`, `model.mjs` (pure model, not edited).

Convention: theta-theta. The powder stays flat at the goniometer axis; the tube arm stands at θ above horizontal on the
left (180° − θ) and the detector arm at θ on the right, so the scattering angle is 2θ (10–90°). Both arms are real
moving parts, rebuilt in the page from `gonio.mjs` at the current angle, with painter's order from separating planes
(y slabs for wheels and plates, x planes between tube optics / sample stage / detector optics, arm planes along each
arm, z plane for the beams above the powder). `--audit` records the group at rest for the kit audit and then
re-records it every 5° of 2θ to prove no part sinks into another or loses its support.

Parts (158 recorded solids, 8 tube/cable runs; the moving group alone is 59 parts): Cu tube in a finned shield with
raised band, nose, Be window, Ni Kβ filter, Soller and divergence slit on an optics rail, two brackets, HV/water cap with
three jumpers into glands on the arm; detector arm with anti-scatter slit, Soller, receiving slit, finned 1D strip
detector with label, status dot and connector, signal jumper; two gear wheels with teeth that turn with the arms, hub
nut and axle; worm, bearing blocks and stepper on the face plate (the tube arm's stepper is on the housing's back);
graduated arc in 5° segments with 1° ticks on two legs and feet; housing with face plate, vents and plate; sample stage
(base, column, knurled spinner with turning ticks, holder with powder well); rear rotary union on the axis with four
ports; water pair along the enclosure floor and out of the left wall to the chiller, HV cable out of the right wall to
the generator, detector signal to a floor feedthrough; enclosure (plinth, floor, three walls, linings, roof, X-ray
lamp) with the lead-glass lid flipped back onto the roof on its piano hinge, interlock tongue and switch; chiller with
display, keys, filler cap and handle; HV generator with fan; tray of spare holders (the loaded one is missing); LCD panel
cabled to the plinth.

Live: the stage is a slider for 2θ (arrows 0.05°, Shift 1°, Home 10°, End 90°); radio groups for sample (Si, NaCl,
quartz, mix) and anode (Cu, Co), a crystallite slider (20–200 nm) and a scan button (`aria-pressed`). The arms follow
the set angle with τ 0.2 s, slew-limited to 24°/s 2θ. The incident beam is steady; the diffracted beam's ribbon and
photon rate follow `beamGlow(run, 2θ)`, so it lights only near a Bragg peak. The LCD shows `counts(run, 0.5 s)` with
hkl names and a cursor; a scan slews to 10°, then steps in lock with the arms at 6°/s and reveals a fresh noisy pattern
(150× real time: 0.02° steps at 0.5 s a step is 33 min). Idle tour: Si 111/220/311, off-peak, Co (111) at 33.15°,
200 nm and 20 nm, NaCl (200), quartz (101), a mix scan; once the user sets anything, the tour only visits the named
peaks. Reduced motion: one frame with the full pattern; keys and controls redraw it at once.

Assumptions (drawn only, not in the model): beam widths (1° divergence, 8.4-long line focus), photon speed 70 units/s,
spinner 0.5 rev/s, fan speed, the chiller's 20.0 °C display, worm ratio (one turn per tooth). The lid is drawn flipped
open and the front wall cut away; the caption says that in use it is closed and the interlock cuts the HV.

Checked: `--audit` and `--light --audit` pass (audit and sweep); `lines.mjs` reads 0 in both themes and at 2θ = 10, 37,
50, 70, 90° (`drive.mjs` `["lines"]`) and under `--reduced`. At 2θ 28.44° with Si/Cu the readout says Si (111) and the
diffracted beam is lit; Co puts (111) at 33.15°; 200 nm gives FWHM 0.07° at (111) against 0.41° at 20 nm.
Shots in `shots/`: `desk*.png` (1440), `phone*.png` (390), `z-*.png` (4× close-ups), `pose-*.png`, `lcd-states.png`,
`reduced*.png`, `lines*.png`.

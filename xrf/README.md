# EDXRF isometric figure

Fig 3: a benchtop energy-dispersive XRF spectrometer, built with the `anatomy` skill kit (`../kit`, MIT) and the shared
bench (`../common`). Every number in the readout, the photon rates, the beam brightness and the spectrum comes from
`model.mjs` (`run`, `identify`, `counts`).

    node xrf/build.mjs                  # xrf.html (dark)
    node xrf/build.mjs --light          # xrf-light.html
    node xrf/build.mjs --audit          # geometry audit, must print "audit passed"
    node scripts/lines.mjs xrf/xrf.html # must print "line ends: 0" (also on xrf-light.html)

Parts (108 recorded solids, 8 tube/cable runs): Rh tube in a finned shield on two cradles, HV receptacle, nose, Be
window and collimator; filter wheel (open, Al, Cu) on a collimator block with its motor behind; sample spinner, cup,
collar and Mylar film; SDD with Be window, snout, flange, body, finned Peltier cooler and preamp on two cradles;
shielded chamber (plinth, floor, three walls with linings, front cut away) with the lid raised on its hinge, its
interlock tongue and switch; HV generator with fan, HV cable and lead through wall feedthroughs; pulse processor/MCA
with the detector signal cable; He cylinder, regulator, purge valve; small vacuum pump; LCD panel with the spectrum.

Live: the stage is a slider for the cursor energy (arrows 0.05 keV, Shift 1 keV, Home/End); kV and µA sliders and
radio groups for filter, path and sample. The filter wheel turns the short way to the chosen filter and the beam is
blanked until an aperture is on it. Beam brightness follows `run().inCps`, fluorescence photons `run().outCps`. The
spectrum is `counts(run, t)` accumulated over the 30 s preset (`DEFAULTS.live`), log scale, peaks named with
`identify`. Idle tour; once the user has set anything, the tour only moves the cursor between named peaks.
Reduced motion: one frame with the finished spectrum.

Assumptions (not in the model, drawn only): the acquisition clock runs 4× real time; photons are drawn at 40 and
26 units/s; spinner 0.25 rev/s; fan speed. Geometry: the beam comes in at 30° to the sample, the detector looks at
40° take-off and 90° to the beam (matching the model's 90° Compton angle). The lid is drawn open for the view; the
caption says that in use it is closed and the interlock cuts the HV.

Model notes: Fe (edge 7.11 keV) never disappears because the kV slider stops at 10 kV; Pb (13.04), Hg (12.28),
Sr (16.1) and Cd (26.7) do. The `plastic` preset is weak (≈1e3 cps open, ≈350 cps with Cu at 50 kV, mostly Rh
scatter), so its spectrum looks sparse; that is the model, not the display.

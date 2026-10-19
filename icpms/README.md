# ICP-MS isometric figure

Built with the `anatomy` skill kit (`../kit`, MIT) and the shared bench (`../common`). All numbers come from `model.mjs`.

    node icpms/build.mjs            # icpms.html (dark)
    node icpms/build.mjs --light    # icpms-light.html
    node icpms/build.mjs --audit    # geometry audit, must print "audit passed"
    node scripts/lines.mjs icpms/icpms.html   # must print "line ends: 0"

Layers: back SVG (items up to the quartz torch in the settled order), WebGL plasma canvas, front SVG (everything
painted after the torch). Without WebGL (`data-gl` absent) the SVG plasma with a CSS glow shows instead.

Assumptions: pump 0.1 rev/s (roller motion only); ion packets drawn at 70 units/s and sampled from the model's lines
in proportion to cps^0.4 so weak analytes still show beside Ar2+; the plasma's brightness, tail length and central
channel follow the model's T, RF power and nebulizer flow, but its shape is illustrative.

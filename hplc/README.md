# HPLC isometric figure

Built with the `anatomy` skill kit (`../kit`, MIT). All numbers come from `model.mjs`.

    node hplc/build.mjs            # hplc.html (dark)
    node hplc/build.mjs --light    # hplc-light.html
    node hplc/build.mjs --audit    # geometry audit, must print "audit passed"
    node scripts/lines.mjs hplc/hplc.html   # must print "line ends: 0"

Assumptions: 20 uL per piston stroke (piston frequency only), run clock 36x real time.

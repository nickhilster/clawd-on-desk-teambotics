import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "sleeping.svg").read_text()

N_FRAMES = 6
frames = []
for i in range(N_FRAMES):
    angle = 2 * math.pi * i / N_FRAMES
    breathe = 1 + 0.3 * math.sin(angle)
    drift = -1.5 * ((math.sin(angle) + 1) / 2)
    op = 0.4 + 0.4 * ((math.sin(angle) + 1) / 2)

    new_svg = SRC.replace(
        'transform="translate(0 1) rotate(2 7.5 4)"',
        f'transform="translate(0 {breathe:.2f}) rotate(2 7.5 4)"',
    )
    assert new_svg != SRC, "body-js substitution failed to match"

    new_svg2 = new_svg.replace(
        '<text x="12" y="-9" font-size="2.8" font-weight="bold" fill="#8A8A8A">Z</text>',
        f'<text x="12" y="{-9 + drift:.2f}" font-size="2.8" font-weight="bold" fill="#8A8A8A" opacity="{op:.2f}">Z</text>',
    )
    assert new_svg2 != new_svg, "Z text substitution failed to match"

    frames.append(render_svg_to_pil(new_svg2, size=200))

save_apng(frames, str(ASSETS / "sleeping.apng"), durations=500, loop=0)

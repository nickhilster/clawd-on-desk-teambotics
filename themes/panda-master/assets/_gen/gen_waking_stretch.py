import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "tired-bored.svg").read_text()

N_FRAMES = 5
frames = []
for i in range(N_FRAMES):
    t = i / (N_FRAMES - 1)
    stretch = 1 + 0.15 * t
    new_svg = SRC.replace('<g id="body-js">', f'<g id="body-js" transform="scale(1 {stretch:.2f})">')
    assert new_svg != SRC, "body-js substitution failed to match"
    frames.append(render_svg_to_pil(new_svg, size=200))
save_apng(frames, str(ASSETS / "waking-stretch.apng"), durations=250, loop=1)

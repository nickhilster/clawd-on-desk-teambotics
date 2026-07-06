import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "working-watch.svg").read_text()

N_FRAMES = 6
frames = []
for i in range(N_FRAMES):
    angle = 2 * math.pi * i / N_FRAMES
    eye_dx = 1.2 * math.sin(angle)
    body_dy = -0.3 * math.cos(angle)
    new_svg = SRC.replace('<g id="body-js">', f'<g id="body-js" transform="translate(0 {body_dy:.2f})">')
    assert new_svg != SRC, "body-js substitution failed to match"
    new_svg2 = new_svg.replace('<g id="eyes-js">', f'<g id="eyes-js" transform="translate({eye_dx:.2f} 0)">')
    assert new_svg2 != new_svg, "eyes-js substitution failed to match"
    frames.append(render_svg_to_pil(new_svg2, size=200))
save_apng(frames, str(ASSETS / "working-watch.apng"), durations=400, loop=0)

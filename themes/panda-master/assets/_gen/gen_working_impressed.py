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
    rot = 6 * math.sin(angle)
    jump = -1.0 * max(0, math.sin(angle))
    new_svg = SRC.replace('<g id="body-js">', f'<g id="body-js" transform="translate(0 {jump:.2f}) rotate({rot:.2f} 7.5 4)">')
    assert new_svg != SRC, "body-js substitution failed to match"
    frames.append(render_svg_to_pil(new_svg, size=200))
save_apng(frames, str(ASSETS / "working-impressed.apng"), durations=300, loop=0)

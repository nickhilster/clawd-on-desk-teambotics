import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "idle-curious.svg").read_text()

N = 6
frames = []
for i in range(N):
    angle = 2 * math.pi * i / N
    dy = -0.5 * math.sin(angle)
    rot = 3 * math.sin(angle)
    svg = SRC.replace(
        '<g id="body-js">',
        f'<g id="body-js" transform="translate(0 {dy:.2f}) rotate({rot:.2f} 7.5 4)">',
    )
    assert svg != SRC, "body-js replace failed"
    frames.append(render_svg_to_pil(svg, size=200))

save_apng(frames, str(ASSETS / "carrying-proud.apng"), durations=400, loop=0)

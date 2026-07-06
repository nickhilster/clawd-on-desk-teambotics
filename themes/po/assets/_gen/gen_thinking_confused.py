import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "thinking-confused.svg").read_text()

N_FRAMES = 6
frames = []
for i in range(N_FRAMES):
    angle = 2 * math.pi * i / N_FRAMES
    rot = -6 + 4 * math.sin(angle)
    svg = SRC.replace(
        '<g id="body-js" transform="rotate(-6 7.5 4)">',
        f'<g id="body-js" transform="rotate({rot:.2f} 7.5 4)">',
    )
    assert svg != SRC, "body-js transform replace failed"
    frames.append(render_svg_to_pil(svg, size=200))

out = ASSETS / "thinking-confused.apng"
save_apng(frames, str(out), durations=450, loop=0)

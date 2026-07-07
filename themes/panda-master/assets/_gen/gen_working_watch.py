import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "working-watch.svg").read_text()

N_FRAMES = 6
frames = []
for i in range(N_FRAMES):
    angle = 2 * math.pi * i / N_FRAMES
    eye_dx = 1.6 * math.sin(angle)
    body_dy = -0.5 * math.cos(angle)
    svg = SRC
    new_svg = svg.replace('<g id="body-js">',
                       f'<g id="body-js" transform="translate(0 {body_dy:.2f})">')
    assert new_svg != svg, "body-js substitution failed to match"
    svg = new_svg
    new_svg = svg.replace('<g id="eyes-js">',
                       f'<g id="eyes-js" transform="translate({eye_dx:.2f} 0)">')
    assert new_svg != svg, "eyes-js substitution failed to match"
    svg = new_svg
    frames.append(render_svg_to_pil(svg, size=200))

out = ASSETS / "working-watch.apng"
save_apng(frames, str(out), durations=400, loop=0)

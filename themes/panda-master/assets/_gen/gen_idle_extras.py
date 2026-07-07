import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
TIRED_SRC = (ASSETS / "tired-bored.svg").read_text()
PLAY_SRC = (ASSETS / "playful-mischievous.svg").read_text()

N = 6


def build_nod_frames(src):
    frames = []
    for i in range(N):
        angle = 2 * math.pi * i / N
        dy = 0.4 * math.sin(angle)
        svg = src.replace(
            '<g id="body-js">',
            f'<g id="body-js" transform="translate(0 {dy:.2f})">',
        )
        assert svg != src, "body-js replace failed"
        frames.append(render_svg_to_pil(svg, size=200))
    return frames


save_apng(build_nod_frames(TIRED_SRC), str(ASSETS / "idle-tired-bored.apng"), durations=500, loop=0)
save_apng(build_nod_frames(PLAY_SRC), str(ASSETS / "idle-playful-mischievous.apng"), durations=500, loop=0)

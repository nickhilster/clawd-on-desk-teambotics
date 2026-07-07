import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
PLAY_SRC = (ASSETS / "playful-mischievous.svg").read_text()
DIZZY_SRC = (ASSETS / "dizzy-overwhelmed.svg").read_text()


def build_bob_frames(src, n_frames):
    frames = []
    for i in range(n_frames):
        angle = 2 * math.pi * i / n_frames
        dy = 1.2 * math.sin(angle)
        svg = src.replace(
            '<g id="body-js">',
            f'<g id="body-js" transform="translate(0 {dy:.2f})">',
        )
        assert svg != src, "body-js replace failed"
        frames.append(render_svg_to_pil(svg, size=200))
    return frames


play_frames = build_bob_frames(PLAY_SRC, 6)
save_apng(play_frames, str(ASSETS / "juggling-play.apng"), durations=350, loop=0)

dizzy_frames = build_bob_frames(DIZZY_SRC, 6)
save_apng(dizzy_frames, str(ASSETS / "juggling-dizzy.apng"), durations=300, loop=0)

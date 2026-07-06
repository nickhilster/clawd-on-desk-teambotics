import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_animation

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "playful-mischievous.svg").read_text()

N = 6
DURATION = 300


def build_specs(transform_fn):
    specs = []
    for i in range(N):
        angle = 2 * math.pi * i / N
        specs.append({"outer_transform": transform_fn(angle), "duration": DURATION})
    return specs


# playful lean
render_animation(
    SRC,
    build_specs(lambda a: f"rotate({6*math.sin(a):.2f} 7.5 4)"),
    str(ASSETS / "react-drag-playful.apng"),
)

# drag left
render_animation(
    SRC,
    build_specs(lambda a: f"translate({-2*math.sin(a):.2f} 0)"),
    str(ASSETS / "react-drag-left.apng"),
)

# drag right
render_animation(
    SRC,
    build_specs(lambda a: f"translate({2*math.sin(a):.2f} 0)"),
    str(ASSETS / "react-drag-right.apng"),
)

# left cheeky (drag-left + upward hop)
render_animation(
    SRC,
    build_specs(lambda a: f"translate({-2*math.sin(a):.2f} {-1*max(0, math.sin(a)):.2f})"),
    str(ASSETS / "react-left-cheeky.apng"),
)

# right cheeky (drag-right + upward hop)
render_animation(
    SRC,
    build_specs(lambda a: f"translate({2*math.sin(a):.2f} {-1*max(0, math.sin(a)):.2f})"),
    str(ASSETS / "react-right-cheeky.apng"),
)

# flail (fast wobble)
render_animation(
    SRC,
    build_specs(lambda a: f"rotate({12*math.sin(a*2):.2f} 7.5 4)"),
    str(ASSETS / "react-flail.apng"),
)

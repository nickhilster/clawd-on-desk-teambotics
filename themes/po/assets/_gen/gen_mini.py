import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_animation

ASSETS = Path(__file__).parent.parent
CURIOUS_SRC = (ASSETS / "idle-curious.svg").read_text()
SLEEPING_SRC = (ASSETS / "sleeping.svg").read_text()

N = 6
BASE = "scale(0.6) translate(4 8)"


def build_specs(transform_fn):
    specs = []
    for i in range(N):
        angle = 2 * math.pi * i / N
        specs.append({"outer_transform": transform_fn(angle), "duration": 300})
    return specs


# peek: slides in from the side
render_animation(
    CURIOUS_SRC,
    build_specs(lambda a: f"{BASE} translate({2*max(0, math.sin(a)):.2f} 0)"),
    str(ASSETS / "mini-idle-peek.apng"),
)

# enter bounce
render_animation(
    CURIOUS_SRC,
    build_specs(lambda a: f"{BASE} translate(0 {-1.5*math.sin(a):.2f})"),
    str(ASSETS / "mini-enter-bounce.apng"),
)

# crabwalk
render_animation(
    CURIOUS_SRC,
    build_specs(lambda a: f"{BASE} translate({3*math.sin(a):.2f} 0)"),
    str(ASSETS / "mini-crabwalk.apng"),
)

# peek (duplicate variant used for the "mini-peek" state)
render_animation(
    CURIOUS_SRC,
    build_specs(lambda a: f"{BASE} translate({2*max(0, math.sin(a)):.2f} 0)"),
    str(ASSETS / "mini-peek.apng"),
)

# alert-excited: quick upward pop
render_animation(
    CURIOUS_SRC,
    build_specs(lambda a: f"translate(0 {-2*max(0, math.sin(a)):.2f}) scale(0.6)"),
    str(ASSETS / "mini-alert-excited.apng"),
)

# celebrate: little spin/rock
render_animation(
    CURIOUS_SRC,
    build_specs(lambda a: f"rotate({10*math.sin(a):.2f} 7.5 4) scale(0.6)"),
    str(ASSETS / "mini-celebrate.apng"),
)

# sleep-cozy: static lean with subtle breathing bob, using sleeping.svg
sleep_specs = []
for i in range(N):
    angle = 2 * math.pi * i / N
    bob = 0.3 * math.sin(angle)
    sleep_specs.append({
        "outer_transform": f"scale(0.6) rotate(4 7.5 4) translate(0 {bob:.2f})",
        "duration": 300,
    })
render_animation(SLEEPING_SRC, sleep_specs, str(ASSETS / "mini-sleep-cozy.apng"))

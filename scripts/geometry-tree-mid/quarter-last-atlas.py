"""Combine the existing authored and shared atlas cells used by MID 4314257259."""
from hashlib import sha256
import io
import json
from pathlib import Path
import sys

from PIL import Image, __version__ as pillow_version

D = Path(".cache/geometry-release-20261111/tree-quarter-20261113")
CANDIDATE = D / "rollout/catalog-4314257259-reference-cards"


def pinned(descriptor, path):
    data = path.read_bytes()
    assert len(data) == descriptor["bytes"] and sha256(data).hexdigest() == descriptor["sha256"], path
    return data


def main():
    mode, = sys.argv[1:]
    assert mode in ("--write", "--verify")
    assert CANDIDATE.resolve(strict=True).drive.upper() == "D:"
    plan = json.loads((CANDIDATE / "atlas-plan.json").read_bytes())
    candidate = json.loads((CANDIDATE / "candidate-geometry.json").read_bytes())
    threshold = plan["opacityCutoff"]
    # An affine remap commutes with bilinear interpolation and mip averaging.
    # Preserve the clear gutter as subthreshold and align the source .2 with .5.
    opacity = [round(255 * (.5 + .625 * (value / 255 - threshold))) for value in range(256)]
    # Babylon PBR normal strength scales the tangent-space X and Y components.
    level = plan["originalNormalLevel"]
    reduced_normal = [round(127.5 + (value - 127.5) * level) for value in range(256)]

    def emit(name, data):
        target = CANDIDATE / name
        if mode == "--write":
            with target.open("xb") as output:
                output.write(data)
        else:
            assert target.read_bytes() == data, target

    textures = {}
    for channel, descriptor in plan["base"].items():
        base = Image.open(io.BytesIO(pinned(descriptor, D / "d" / (channel + ".png"))))
        other = Image.open(io.BytesIO(pinned(plan["shared"][channel], Path("public" + plan["shared"][channel]["url"]))))
        assert base.size == (plan["size"],) * 2 and other.size == (1024, 1024)
        if channel == "opacity":
            base = base.convert("L")
            other = other.convert("L").point(opacity)
        else:
            base = base.convert("RGB")
            other = other.convert("RGB")
        if channel == "normalGL":
            red, green, blue = base.split()
            base = Image.merge("RGB", (red.point(reduced_normal), green.point(reduced_normal), blue))
        for tile in plan["tiles"]:
            x, y = tile["x"], tile["y"]
            base.paste(other.crop((x, y, x + 32, y + 32)), (tile["destX"], tile["destY"]))
        stream = io.BytesIO()
        base.save(stream, format="PNG", compress_level=9)
        payload = stream.getvalue()
        name = channel + ".png"
        emit(name, payload)
        textures[channel] = {"url": "/textures/trees/tree-quarter-4314257259-qa/" + name,
                             "bytes": len(payload), "sha256": sha256(payload).hexdigest()}
    candidate["midTextures"] = textures
    candidate["atlasPillow"] = pillow_version
    emit("candidate.json", (json.dumps(candidate, indent=2) + "\n").encode())


if __name__ == "__main__":
    main()

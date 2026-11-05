#!/usr/bin/env python3
"""
Convert the GameMaker Studio 2 Frak! project into data files for the HTML5 port.

Usage:
    python3 tools/convert_gms.py ../gamemakerstudio-frak

Generates (relative to this repo's root):
    assets/sprites/<name>.png   one horizontal strip per sprite (all frames side by side)
    js/data/sprites.js          sprite metadata, precise-collision masks and vector shapes
    js/data/rooms.js            room sizes, background colours and instances
    js/data/sounds.js           sound effects / instrument samples as base64 WAV

Requires Pillow (pip install pillow).
"""
import base64
import glob
import io
import json
import os
import re
import sys
import wave

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swf_shapes import swf_vector_paths  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_yy(path):
    """GameMaker .yy files are JSON with trailing commas."""
    with open(path, encoding="utf-8") as f:
        s = f.read()
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    return json.loads(s)


# Objects/sprites that only exist for Android/Google Play/IAP builds
SKIP_OBJECT = re.compile(r"^(obj|oIAP|oCloudSave|oIndicator)")
SKIP_ROOM = {"rmGooglePlayServicesDemo"}


def gms_colour_to_css(value):
    """GameMaker colours are 0xAABBGGRR (or $BBGGRR in source)."""
    v = int(value) & 0xFFFFFF
    r, g, b = v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF
    return "#%02x%02x%02x" % (r, g, b)


def parse_value(s):
    """Convert a GameMaker object-property string into a JS-friendly value."""
    if s in ("True", "true"):
        return True
    if s in ("False", "false"):
        return False
    if s.startswith("$"):
        return gms_colour_to_css(int(s[1:], 16))
    try:
        if re.fullmatch(r"-?\d+", s):
            return int(s)
        return float(s)
    except ValueError:
        return s  # a resource name, e.g. "sHooter_Beeb" or "room_D_8"


def convert_objects(src):
    objects = {}
    for path in sorted(glob.glob(os.path.join(src, "objects", "*", "*.yy"))):
        o = load_yy(path)
        name = o["name"]
        if SKIP_OBJECT.match(name):
            continue
        props = {p["name"]: parse_value(p["value"]) for p in o["properties"]}
        for p in o["overriddenProperties"]:
            props[p["propertyId"]["name"]] = parse_value(p["value"])
        objects[name] = {
            "parent": (o["parentObjectId"] or {}).get("name"),
            "sprite": (o["spriteId"] or {}).get("name"),
            "visible": o["visible"],
            "props": props,
        }
    return objects


def convert_sprites(src, used):
    out_dir = os.path.join(ROOT, "assets", "sprites")
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for name in sorted(used):
        path = os.path.join(src, "sprites", name, name + ".yy")
        o = load_yy(path)
        seq = o["sequence"]
        w, h = o["width"], o["height"]
        frames = []
        for fr in o["frames"]:
            png = os.path.join(src, "sprites", name, fr["name"] + ".png")
            if not os.path.exists(png):  # vector sprites only have a preview png
                png = sorted(glob.glob(os.path.join(src, "sprites", name, "*.png")))[0]
            im = Image.open(png).convert("RGBA")
            if im.size != (w, h):
                im = im.resize((w, h), Image.NEAREST)
            frames.append(im)
        strip = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
        for i, im in enumerate(frames):
            strip.paste(im, (i * w, 0))
        strip.save(os.path.join(out_dir, name + ".png"), optimize=True)

        info = {
            "w": w,
            "h": h,
            "xo": seq["xorigin"],
            "yo": seq["yorigin"],
            "n": len(frames),
            # GameMaker playback speed in frames per second (type 0) or per game frame (type 1)
            "fps": seq["playbackSpeed"] if seq["playbackSpeedType"] == 0 else seq["playbackSpeed"] * 60,
            "bbox": [o["bbox_left"], o["bbox_top"], o["bbox_right"], o["bbox_bottom"]],
        }
        # collisionKind 0 = precise, 4 = precise per frame, 1 = rectangle
        if o["collisionKind"] in (0, 4):
            masks = []
            for im in frames:
                a = im.getchannel("A").tobytes()
                bits = "".join("1" if px > 0 else "0" for px in a)
                # pack 4 bits per hex digit to keep the file small
                bits += "0" * (-len(bits) % 4)
                masks.append("%x" % int("1" + bits, 2))
            info["mask"] = masks
        # Vector (SWF) sprites: keep the shapes so they can be drawn sharply at any size
        swfs = glob.glob(os.path.join(src, "sprites", name, "*.swf"))
        if swfs:
            info["vector"] = swf_vector_paths(swfs[0])
        meta[name] = info
    return meta


def convert_rooms(src, objects):
    rooms = {}
    for path in sorted(glob.glob(os.path.join(src, "rooms", "*", "*.yy"))):
        r = load_yy(path)
        name = r["name"]
        if name in SKIP_ROOM:
            continue
        bg = "#000000"
        insts = {}
        for layer in r["layers"]:
            if layer["resourceType"] == "GMRBackgroundLayer":
                bg = gms_colour_to_css(layer["colour"])
            for inst in layer.get("instances", []):
                obj = inst["objectId"]["name"]
                if obj not in objects:
                    continue
                props = {p["propertyId"]["name"]: parse_value(p["value"]) for p in inst["properties"]}
                entry = [obj, inst["x"], inst["y"]]
                if props:
                    entry.append(props)
                insts[inst["name"]] = entry
        order = [i["name"] for i in r.get("instanceCreationOrder", []) if i["name"] in insts]
        order += [k for k in insts if k not in order]
        rooms[name] = {
            "w": r["roomSettings"]["Width"],
            "h": r["roomSettings"]["Height"],
            "bg": bg,
            "inst": [insts[k] for k in order],
        }
    return rooms


def convert_sounds(src):
    sounds = {}
    for d in sorted(glob.glob(os.path.join(src, "sounds", "*"))):
        name = os.path.basename(d)
        files = [f for f in glob.glob(os.path.join(d, "*")) if not f.endswith(".yy") and os.path.isfile(f)]
        if not files:
            continue
        with wave.open(files[0], "rb") as w:
            params = w.getparams()
            data = w.readframes(params.nframes)
        # Down-mix stereo to mono to halve the download size
        if params.nchannels == 2 and params.sampwidth == 2:
            import array
            a = array.array("h", data)
            a = array.array("h", [(a[i] + a[i + 1]) // 2 for i in range(0, len(a), 2)])
            data = a.tobytes()
            params = params._replace(nchannels=1)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(params.nchannels)
            w.setsampwidth(params.sampwidth)
            w.setframerate(params.framerate)
            w.writeframes(data)
        yy = load_yy(os.path.join(d, name + ".yy"))
        sounds[name] = {"volume": yy.get("volume", 1.0), "data": base64.b64encode(buf.getvalue()).decode("ascii")}
    return sounds


def write_js(path, header, varname, data, indent=None):
    with open(path, "w", encoding="utf-8") as f:
        f.write("// " + header + "\n")
        f.write("// GENERATED by tools/convert_gms.py from the GameMaker project - do not edit by hand.\n")
        f.write("'use strict';\n")
        f.write("const %s = " % varname)
        if indent is None and isinstance(data, dict):
            f.write("{\n")
            items = list(data.items())
            for i, (k, v) in enumerate(items):
                f.write("  %s: %s%s\n" % (json.dumps(k), json.dumps(v, separators=(",", ":")), "," if i < len(items) - 1 else ""))
            f.write("};\n")
        else:
            f.write(json.dumps(data, indent=indent) + ";\n")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    objects = convert_objects(src)
    rooms = convert_rooms(src, objects)

    # Sprites used by objects, plus the ones drawn directly by name from code
    used = {o["sprite"] for o in objects.values() if o["sprite"]}
    code = ""
    for f in glob.glob(os.path.join(src, "objects", "*", "*.gml")) + glob.glob(os.path.join(src, "scripts", "*", "*.gml")):
        code += open(f, encoding="utf-8").read()
    for name in os.listdir(os.path.join(src, "sprites")):
        if re.search(r"\b%s\b" % re.escape(name), code):
            used.add(name)
    used = {s for s in used if not re.match(r"^(spr(?!TroggSanta)|sprite\d)", s)}
    sprites = convert_sprites(src, used)
    sounds = convert_sounds(src)

    data_dir = os.path.join(ROOT, "js", "data")
    os.makedirs(data_dir, exist_ok=True)
    write_js(os.path.join(data_dir, "objects.js"), "Object definitions (parents, sprites, default properties)", "OBJECT_DATA", objects)
    write_js(os.path.join(data_dir, "sprites.js"), "Sprite metadata", "SPRITE_DATA", sprites)
    write_js(os.path.join(data_dir, "rooms.js"), "Rooms (levels and menu screens)", "ROOM_DATA", rooms)
    write_js(os.path.join(data_dir, "sounds.js"), "Sound samples (base64 WAV)", "SOUND_DATA", sounds)
    print("objects: %d, sprites: %d, rooms: %d, sounds: %d" % (len(objects), len(sprites), len(rooms), len(sounds)))


if __name__ == "__main__":
    main()

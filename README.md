# Frak! for web browsers

An HTML5 version of **Frak!**, ported from the GameMaker Studio 2 PC/Steam version
(repository `gamemakerstudio-frak`). It is plain JavaScript and a `<canvas>`, with no build step,
no frameworks and no external downloads.

## Playing it

* **Online:** put the contents of this repository on any static web host (GitHub Pages,
  itch.io, Netlify, your own server) and open `index.html`.
* **Locally:** double-click `index.html`. Everything (including the sounds) loads from local
  files, so it also works from `file://`. You can also run `python3 -m http.server` in this
  folder and open <http://localhost:8000/>.

Progress (medals, best times, settings) is saved in the browser's `localStorage`.

### Controls

| | Keyboard | Mouse / touch | Gamepad |
|---|---|---|---|
| Walk | Z / X or ← / → | drag left / right | d-pad or left stick |
| Climb / jump | O / K or ↑ / ↓ | drag up / down | d-pad or left stick |
| Yoyo | P or Space | press and hold still | A |
| Shortcut commands | L R U D J Y, 0–9 (e.g. `3L`) | mouse wheel = up / down | X, Y, shoulder buttons |
| Back to menu | Backspace | right-click, or the ◀ button on touch screens | Select |
| Title screen | Esc | middle-click | Start |

In the menus, use the arrow keys (or Z X O K) and Space/Enter, or click/tap a box once to
select it and again to start it.

## How the port is organised

The GameMaker game is a set of objects with event code (Create, Step, Draw, Key Press,
Collision, ...) placed in rooms. To keep the port faithful and easy to check against the GML,
`js/engine.js` provides a very small GameMaker-like runtime, and each GML object/script was
translated close to line-by-line, with the same names.

| File | Contents | GML source |
|---|---|---|
| `js/engine.js` | rooms, instances, event order, sprites, sprite font, input, pixel-perfect collisions, main loop | (GameMaker runtime) |
| `js/render.js` | screen fitting/scrolling, sprite/text/line drawing, level table | `ResizeScreen`, `SpriteDraw*`, `TextDraw`, `DrawLineScaled`, `GetLevelInfo`, ... |
| `js/world.js` | platform and ladder tables and collision queries | `Platform*`, `Ladder*`, `RoomCreateFinish` |
| `js/trogg.js` | Trogg: controls, movement state machine, yoyo, checkpoints, HUD | `oTrogg`, `Trogg*`, `YoyoCollide` |
| `js/objects.js` | meanies, platforms, balloons, daggers, training arrows, title and menu screens, settings | all other `o*` objects |
| `js/audio.js` | sound effects and the BBC Micro-style music synthesiser with all the tunes | `SetupMusic`, `StartMusic`, `StepMusic`, `NotesToArray`, ... |
| `js/save.js` | save game | `FrakSave_*` |
| `js/data/*.js`, `assets/sprites/*.png` | **generated** level layouts, object defaults, sprites and sounds | `rooms/`, `objects/*.yy`, `sprites/`, `sounds/` |

The game runs at a fixed 60 ticks per second, like the original.

### Regenerating the data

The level layouts, sprites and sounds are extracted from the GameMaker project, so changes made
in GameMaker (new levels, tweaked sprites) can be brought across with:

```sh
pip install pillow
python3 tools/convert_gms.py ../gamemakerstudio-frak
```

### Comparing with the GameMaker original

`tools/connections.js` is a static platform-and-ladder connection finder (the same search as the
original's unused `GraphFind`), run against both versions to see whether the port moves Trogg
exactly as the original does:

```sh
node tools/connections.js ../gamemakerstudio-frak            # every level
node tools/connections.js ../gamemakerstudio-frak room_F_8 --detail
node tools/connections.js ../gamemakerstudio-frak --trace=room_A_1,572,83,1   # one jump, tick by tick
```

From every pixel of every platform and every point of every ladder, holding each key Trogg could
hold, it runs his movement forward until he stands, climbs or dies, and records which platforms
and ladders he reaches and how quickly. It does this with this port's own code (`js/world.js`
and the movement functions in `js/trogg.js`, unchanged) and with the original's scripts
transcribed into the tool, on rooms read from the GameMaker project, then reports every start
and every connection where the two differ.

The arithmetic is the same (doubles in both), but GameMaker compares reals with an epsilon
(0.00001 by default): two values that close are equal, for `<` and `>` too. JavaScript compares
exactly, and Trogg's y moves in steps of 0.05, which isn't exact in binary. With the original's
side comparing exactly (`--eps=0`), the two agree on every start in every level, so every
difference it finds comes from the epsilon. Across the 55 levels, about 3% of the 520,000 or so
starts differ, and 18 of about 4,100 connections:

* **Landing a tick early.** When a fall ends exactly on a platform's top, give or take
  rounding, GameMaker counts it as not yet landed and lands Trogg there on the next tick. This
  port finds the platform a tick early and lands him short of it, up to about a pixel above it
  (he then drops onto it). Most of the differences are this, a tick apart, and it also changes
  which ladders he can grab right at the landing.
* **Slipping past a platform's corner.** In the original, if that exact hit is at the edge of a
  platform and Trogg is moving sideways, by the next tick he is past the edge and keeps falling.
  This port lands him on it. It happens from one or two starts in about one level in seven.
* **Bounces.** In the original each bounce leaves 0.05 faster than the last (the bounce adds
  twice gravity), so Trogg bounces higher and higher. Here the early landing takes that back,
  and after a couple of bounces he bounces at the same height every time. This is the biggest
  difference: most of the Bouncing levels' differing starts, and some connections that exist
  only in the original (a bounce that eventually reaches a ladder or platform above).

### What was left out

* Steam achievements, Google Play services, in-app purchases and ads.
* The click-to-move path finder (`oDownArrow`, `Graph*`, `Path*`), which was already disabled
  with `if (0)` in the GML.
* The "Mono"/Electron graphics mode and the "in space" desaturate shader, which the original
  could not select either.

### Small differences from the PC version

* **Graphics → Blocky** draws crisp, unfiltered pixels and **Smooth** uses bilinear filtering.
  (The PC version switched on texture filtering whenever the window was taller than 256 pixels.)
* Changing the **Music** setting takes effect immediately rather than at the next tune.
* In the menus, **D** moves down (the GML mapped it to up, unlike in the game itself).
* Touch screens get on-screen Back and Full-screen buttons, since phones have no Backspace key.
* Music pauses while the browser tab is hidden.

## Notes for an 8-bit or Amiga version

The game logic was kept close to the GML so it can serve as a readable reference:

* All movement is in BBC Micro pixels on a 256-pixel-high playfield (levels scroll
  horizontally up to 1020 pixels wide, or vertically up to 800 pixels high on a 320-pixel-wide
  playfield).
* Platforms and ladders live in flat arrays with lookup tables bucketed by y (platforms) and x
  (ladders) (`js/world.js`). That suits 6502/68000 code directly.
* Trogg's height is always a multiple of 1/20 pixel (gravity is 0.05 per tick), so a fixed-point
  representation with 1/20 or 1/32 pixel units would reproduce the movement closely.
* The music is already described as BBC Micro-style ENVELOPEs (attack/decay/sustain/release
  rates in 1/100 s steps, pitch in quarter-semitones) in `js/audio.js`, which maps naturally
  onto `SOUND`/`ENVELOPE` on the BBC Master, or onto Paula on the Amiga.
* `ROOM_DATA` in `js/data/rooms.js` is the complete set of 55 levels as
  `[object, x, y, {properties}]` lists, which is a convenient source for building compact level
  data for another machine.

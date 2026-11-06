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

This port is meant as a reference version of the original, warts and all: it should move Trogg
exactly as the GameMaker game does. `tools/connections.js` checks that. It is a static
platform-and-ladder connection finder (the same search as the original's unused `GraphFind`),
run against both versions:

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
and every connection where the two differ. Over the 55 levels that's about 520,000 starts and
4,100 connections, and they're all the same.

They weren't at first. The arithmetic is the same (doubles in both), but GameMaker compares
reals with an epsilon (0.00001 by default): two values that close are equal, and that goes for
`<` and `>` too. JavaScript compares exactly, and Trogg's y moves in steps of 0.05, which isn't
exact in binary. So when a fall ended exactly on a platform's top, give or take rounding,
GameMaker landed Trogg there on the next tick, and this port found the platform a tick early and
landed him short of it (up to about a pixel above, dropping onto it after). About 3% of the
starts differed, and 18 connections. It mostly meant landing a tick early, and in the
original:

* Trogg could grab a ladder in that extra tick as he landed.
* If that exact hit was at a platform's edge and he was moving sideways, by the next tick he was
  past the edge and fell on (one or two starts in about one level in seven).
* Each bounce left 0.05 faster than the last (the bounce adds twice gravity), so Trogg bounced
  higher and higher; here the early landing took that back, and he settled at one height.

Now the game logic compares reals the way GameMaker does (`gmlCmp` and `gEQ`, `gLT` etc. in
`js/engine.js`, used in `js/world.js`, `js/trogg.js` and `js/objects.js` wherever a value can be
fractional: Trogg, the yoyo, moving platforms, meanies, balloons and daggers, the training
arrows, gamepad and mouse directions). `--eps=0` runs the original's side with exact
comparisons instead, which reproduces the old differences.

### What was left out

* Steam achievements, Google Play services, in-app purchases and ads.
* The click-to-move path finder (`oDownArrow`, `Graph*`, `Path*`), which was already disabled
  with `if (0)` in the GML.
* The "Mono"/Electron graphics mode and the "in space" desaturate shader, which the original
  could not select either.

### Small differences from the PC version

These are about the display and the browser; the game itself behaves as the original (see above).

* **Graphics → Blocky** draws crisp, unfiltered pixels and **Smooth** uses bilinear filtering.
  (The PC version switched on texture filtering whenever the window was taller than 256 pixels.)
* Touch screens get on-screen Back and Full-screen buttons, since phones have no Backspace key.
* Music pauses while the browser tab is hidden.
* Two lines of the original's music (`wbass[5]` and `wbass[6]` in `SetupMusic`) have a stray
  `+` between two strings (`"..." + + "..."`). This reads them as joined, which is what they
  look meant to be; what GameMaker makes of a `+` in front of a string hasn't been checked.

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

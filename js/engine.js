// Frak! HTML5 - minimal GameMaker-style runtime
//
// The original game was written in GameMaker Studio 2. To keep the port faithful (and easy to
// compare against the GML source), this file provides a tiny subset of the GameMaker runtime:
// rooms, object instances with inheritance, the per-frame event order, sprites, sprite fonts,
// keyboard/mouse/touch/gamepad input, and precise (per-pixel) collisions.
'use strict';

const ROOM_SPEED = 60;          // game ticks per second (GameMaker "game speed")

// Everything the GML code kept in "global." lives here
const G = {};

// GameMaker virtual key codes
const vk_anykey = 1, vk_backspace = 8, vk_enter = 13, vk_escape = 27, vk_space = 32;
const vk_left = 37, vk_up = 38, vk_right = 39, vk_down = 40;

const c_black = '#000000', c_white = '#ffffff', c_yellow = '#ffff00';

// ---------------------------------------------------------------------------------------------
// Small GML helpers
// ---------------------------------------------------------------------------------------------

function sign(v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// GameMaker's round() rounds halves to even
function gmlRound(v) {
    const r = Math.round(v);
    return (Math.abs(v % 1) === 0.5 && (r % 2) !== 0) ? r - 1 : r;
}
function irandom_range(a, b) {
    a = Math.floor(a); b = Math.floor(b);
    return a + Math.floor(Math.random() * (b - a + 1));
}
// point_direction(0, 0, x, y) - degrees, anticlockwise, with y pointing down the screen
function pointDirection(x, y) {
    let d = Math.atan2(-y, x) * 180 / Math.PI;
    if (d < 0) d += 360;
    return d;
}

// ---------------------------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------------------------

const SPR = {};

function loadSprites() {
    const promises = [];
    for (const name in SPRITE_DATA) {
        const d = SPRITE_DATA[name];
        const s = Object.assign({ name }, d);
        if (d.mask) {
            s.masks = d.mask.map(hex => {
                // Re-align: the sentinel '1' is the most significant set bit of the first nibble
                const first = parseInt(hex[0], 16);
                const lead = first >= 8 ? 0 : first >= 4 ? 1 : first >= 2 ? 2 : 3;
                const bits = new Uint8Array(s.w * s.h);
                let pos = -(lead + 1);
                for (let i = 0; i < hex.length; i++) {
                    const nib = parseInt(hex[i], 16);
                    for (let b = 3; b >= 0; b--, pos++) {
                        if (pos >= 0 && pos < bits.length) bits[pos] = (nib >> b) & 1;
                    }
                }
                return bits;
            });
        }
        if (d.vector) {
            s.paths = d.vector.map(([colour, path, width]) => ({ colour, path: new Path2D(path), width }));
        }
        s.img = new Image();
        promises.push(new Promise((resolve, reject) => {
            s.img.onload = resolve;
            s.img.onerror = () => reject(new Error('Failed to load sprite ' + name));
        }));
        s.img.src = 'assets/sprites/' + name + '.png';
        SPR[name] = s;
    }
    return Promise.all(promises);
}

// Tinted copies of the BBC Micro font (sprite fonts are drawn multiplied by the draw colour)
const fontCache = {};
function getFont(colour) {
    if (!fontCache[colour]) {
        const s = SPR.sBBCMicroFont;
        const c = document.createElement('canvas');
        c.width = s.img.width; c.height = s.img.height;
        const cx = c.getContext('2d');
        cx.drawImage(s.img, 0, 0);
        cx.globalCompositeOperation = 'multiply';
        cx.fillStyle = colour;
        cx.fillRect(0, 0, c.width, c.height);
        cx.globalCompositeOperation = 'destination-in';
        cx.drawImage(s.img, 0, 0);
        fontCache[colour] = c;
    }
    return fontCache[colour];
}

// ---------------------------------------------------------------------------------------------
// Canvas / screen
// ---------------------------------------------------------------------------------------------

const Display = {
    canvas: null,
    ctx: null,
    w: 640,             // backing-store size in device pixels (GameMaker's window/room size)
    h: 512,
    dpr: 1,
};

function screenInit() {
    Display.canvas = document.getElementById('game');
    Display.ctx = Display.canvas.getContext('2d', { alpha: false });
    screenUpdateSize();
}

function screenUpdateSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    Display.dpr = dpr;
    if (Display.canvas.width !== w || Display.canvas.height !== h) {
        Display.canvas.width = w;
        Display.canvas.height = h;
    }
    Display.w = w;
    Display.h = h;
}

// draw_sprite_ext() equivalent (no rotation, no tint)
function drawSpriteExt(name, frame, x, y, xscale, yscale) {
    const s = SPR[name];
    if (!s) return;
    let f = Math.floor(frame) % s.n;
    if (f < 0) f += s.n;
    const ctx = Display.ctx;
    ctx.setTransform(xscale, 0, 0, yscale, x, y);
    if (s.paths) {
        // Vector sprite (imported from SWF in GameMaker): draw the shapes so it stays sharp
        ctx.translate(-s.xo, -s.yo);
        for (const p of s.paths) {
            if (p.width) {
                ctx.strokeStyle = p.colour;
                ctx.lineWidth = p.width;
                ctx.lineCap = ctx.lineJoin = 'round';
                ctx.stroke(p.path);
            } else {
                ctx.fillStyle = p.colour;
                ctx.fill(p.path);
            }
        }
    } else {
        ctx.drawImage(s.img, f * s.w, 0, s.w, s.h, -s.xo, -s.yo, s.w, s.h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// draw_text_transformed() with the BBC Micro sprite font (first glyph is ' ')
function drawTextTransformed(x, y, str, xscale, yscale, colour) {
    const font = getFont(colour);
    const ctx = Display.ctx;
    ctx.setTransform(xscale, 0, 0, yscale, x, y);
    for (let i = 0; i < str.length; i++) {
        const g = str.charCodeAt(i) - 32;
        if (g > 0 && g < SPR.sBBCMicroFont.n) {
            ctx.drawImage(font, g * 8, 0, 8, 8, i * 8, 0, 8, 8);
        }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawLineWidth(x1, y1, x2, y2, width, colour) {
    const ctx = Display.ctx;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const KEY_CODES = {
    Backspace: 8, Enter: 13, NumpadEnter: 13, Escape: 27, Space: 32,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
};
for (let i = 0; i < 10; i++) { KEY_CODES['Digit' + i] = 48 + i; KEY_CODES['Numpad' + i] = 48 + i; }
for (let i = 0; i < 26; i++) KEY_CODES['Key' + String.fromCharCode(65 + i)] = 65 + i;

const Input = {
    held: new Set(),
    pressed: new Set(),         // pressed since last tick
    released: new Set(),
    lastChar: '',
    // mouse / touch (positions in device pixels)
    mx: 0, my: 0,
    mouseHeld: [false, false, false],    // left, middle, right
    mousePressed: [false, false, false],
    wheelUp: false, wheelDown: false,
    anyInput: false,
    // gamepad
    pad: null,
    padPrev: [],
};

function inputInit(onFirstInput) {
    const first = () => { if (onFirstInput) { onFirstInput(); } };

    window.addEventListener('keydown', e => {
        first();
        const vk = KEY_CODES[e.code];
        if (vk === undefined) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (e.key && e.key.length === 1) Input.lastChar = e.key.toUpperCase();
        if (!Input.held.has(vk)) {
            Input.held.add(vk);
            Input.pressed.add(vk);
        }
    });
    window.addEventListener('keyup', e => {
        const vk = KEY_CODES[e.code];
        if (vk === undefined) return;
        e.preventDefault();
        if (Input.held.has(vk)) {
            Input.held.delete(vk);
            Input.released.add(vk);
        }
    });
    window.addEventListener('blur', () => {
        for (const vk of Input.held) Input.released.add(vk);
        Input.held.clear();
        Input.mouseHeld = [false, false, false];
    });

    const canvas = Display.canvas;
    const btnIndex = b => (b === 0 ? 0 : b === 1 ? 1 : b === 2 ? 2 : -1);
    const setPos = e => {
        const r = canvas.getBoundingClientRect();
        Input.mx = (e.clientX - r.left) * Display.dpr;
        Input.my = (e.clientY - r.top) * Display.dpr;
    };
    canvas.addEventListener('pointerdown', e => {
        first();
        e.preventDefault();
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        setPos(e);
        const b = btnIndex(e.button);
        if (b >= 0) { Input.mouseHeld[b] = true; Input.mousePressed[b] = true; }
    });
    canvas.addEventListener('pointermove', e => { setPos(e); });
    const up = e => {
        setPos(e);
        const b = btnIndex(e.button);
        if (b >= 0) Input.mouseHeld[b] = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.deltaY < 0) Input.wheelUp = true;
        if (e.deltaY > 0) Input.wheelDown = true;
    }, { passive: false });
}

// Simulate a key being tapped (used by the on-screen touch buttons)
function injectKeyPress(vk) {
    Input.pressed.add(vk);
    Input.released.add(vk);
}

// Gamepad (standard mapping) - GameMaker constant names
const gp_face1 = 0, gp_face2 = 1, gp_face3 = 2, gp_face4 = 3;
const gp_shoulderl = 4, gp_shoulderr = 5, gp_shoulderlb = 6, gp_shoulderrb = 7;
const gp_select = 8, gp_start = 9;
const gp_padu = 12, gp_padd = 13, gp_padl = 14, gp_padr = 15;

function pollGamepad() {
    Input.padPrev = Input.pad ? Input.pad.buttons.slice() : [];
    Input.pad = null;
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const p of pads) {
        if (p && p.connected) {
            Input.pad = {
                buttons: p.buttons.map(b => b.pressed || b.value > 0.5),
                axes: p.axes.slice(),
            };
            break;
        }
    }
}
function gamepad_is_connected() { return Input.pad !== null; }
function gamepad_button_check(b) { return !!(Input.pad && Input.pad.buttons[b]); }
function gamepad_button_check_pressed(b) { return gamepad_button_check(b) && !Input.padPrev[b]; }
function gamepad_axis(i) {
    if (!Input.pad) return 0;
    const v = Input.pad.axes[i] || 0;
    return Math.abs(v) < 0.1 ? 0 : v;
}

// ---------------------------------------------------------------------------------------------
// Objects and instances
// ---------------------------------------------------------------------------------------------

// Behaviour (event code) per object, filled in by objects.js / trogg.js
const OBJ = {};
function defineObject(name, events) {
    OBJ[name] = events;
}

const Runtime = {
    instances: [],
    nextId: 100000,
    room: null,
    roomName: '',
    pendingRoom: null,
    roomCreationCode: {},
};

const isACache = {};
function objectIsA(objName, ancestor) {
    const key = objName + '>' + ancestor;
    if (key in isACache) return isACache[key];
    let o = objName, r = false;
    while (o) {
        if (o === ancestor) { r = true; break; }
        o = OBJECT_DATA[o] ? OBJECT_DATA[o].parent : null;
    }
    isACache[key] = r;
    return r;
}

function objectParent(objName) {
    return OBJECT_DATA[objName] ? OBJECT_DATA[objName].parent : null;
}

// Find an event handler, starting at objName and walking up the parent chain
function findEvent(objName, path) {
    let o = objName;
    while (o) {
        const ev = OBJ[o];
        if (ev) {
            let h = ev;
            for (const p of path) { h = h ? h[p] : undefined; }
            if (h) return h;
        }
        o = objectParent(o);
    }
    return null;
}

// event_inherited(): call the parent's version of the event
function inherited(self, fromObj, ...path) {
    const h = findEvent(objectParent(fromObj), path);
    if (h) h(self);
}

function callEvent(self, ...path) {
    const h = findEvent(self.object, path);
    if (h) h(self);
    return !!h;
}

// event_perform(ev_keypress, vk)
function performKeyPress(self, vk) {
    callEvent(self, 'keyPress', vk);
}

function defaultProps(objName) {
    const chain = [];
    for (let o = objName; o; o = objectParent(o)) chain.unshift(o);
    const props = {};
    let sprite = null, visible = true;
    for (const o of chain) {
        Object.assign(props, OBJECT_DATA[o].props);
        if (OBJECT_DATA[o].sprite) sprite = OBJECT_DATA[o].sprite;
    }
    visible = OBJECT_DATA[objName].visible;
    return { props, sprite, visible };
}

function instance_create(objName, x, y, depth, props) {
    const d = defaultProps(objName);
    const inst = Object.assign({}, d.props, props || {});
    inst.id = Runtime.nextId++;
    inst.object = objName;
    inst.x = x; inst.y = y;
    inst.xstart = x; inst.ystart = y;
    inst.sprite_index = d.sprite;
    inst.image_index = 0;
    inst.image_speed = 1;
    inst.depth = depth || 0;
    inst.visible = d.visible;
    inst.alive = true;
    Runtime.instances.push(inst);
    callEvent(inst, 'create');
    return inst;
}

function instance_destroy(inst) {
    if (inst && inst.alive) {
        inst.alive = false;
        callEvent(inst, 'destroy');
    }
}

// instance_destroy(objName) - destroy all instances of an object (and its children)
function instance_destroy_all(objName) {
    for (const i of Runtime.instances) if (i.alive && objectIsA(i.object, objName)) instance_destroy(i);
}

function instance_number(objName) {
    let n = 0;
    for (const i of Runtime.instances) if (i.alive && objectIsA(i.object, objName)) n++;
    return n;
}

function instance_find(objName) {
    for (const i of Runtime.instances) if (i.alive && objectIsA(i.object, objName)) return i;
    return null;
}

function instance_exists(inst) {
    return !!(inst && inst.alive && Runtime.instances.includes(inst));
}

function sprite_width(inst) { return SPR[inst.sprite_index] ? SPR[inst.sprite_index].w : 0; }
function sprite_height(inst) { return SPR[inst.sprite_index] ? SPR[inst.sprite_index].h : 0; }

// ---------------------------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------------------------

function instBBox(inst) {
    const s = SPR[inst.sprite_index];
    if (!s) return null;
    const ox = inst.x - s.xo, oy = inst.y - s.yo;
    return {
        s, ox, oy,
        l: ox + s.bbox[0], t: oy + s.bbox[1],
        r: ox + s.bbox[2] + 1, b: oy + s.bbox[3] + 1,
    };
}

function maskAt(box, inst, wx, wy) {
    const s = box.s;
    if (!s.masks) return true;
    const px = Math.floor(wx - box.ox), py = Math.floor(wy - box.oy);
    if (px < 0 || py < 0 || px >= s.w || py >= s.h) return false;
    const m = s.masks[s.masks.length === 1 ? 0 : (Math.floor(inst.image_index) % s.masks.length)];
    return m[py * s.w + px] === 1;
}

function instancesCollide(a, b) {
    const A = instBBox(a), B = instBBox(b);
    if (!A || !B) return false;
    const l = Math.max(A.l, B.l), r = Math.min(A.r, B.r);
    const t = Math.max(A.t, B.t), bt = Math.min(A.b, B.b);
    if (l >= r || t >= bt) return false;
    if (!A.s.masks && !B.s.masks) return true;
    for (let y = Math.floor(t); y < bt; y++) {
        for (let x = Math.floor(l); x < r; x++) {
            const cx = x + 0.5, cy = y + 0.5;
            if (cx < l || cy < t) continue;
            if (maskAt(A, a, cx, cy) && maskAt(B, b, cx, cy)) return true;
        }
    }
    return false;
}

// collision_circle_list(..., prec = false) - circle against bounding boxes
function collisionCircleList(x, y, r, objName) {
    const out = [];
    for (const i of Runtime.instances) {
        if (!i.alive || !objectIsA(i.object, objName)) continue;
        const b = instBBox(i);
        if (!b) continue;
        const nx = clamp(x, b.l, b.r), ny = clamp(y, b.t, b.b);
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy <= r * r) out.push(i);
    }
    return out;
}

function collisionRectangleList(x1, y1, x2, y2, objName) {
    const out = [];
    for (const i of Runtime.instances) {
        if (!i.alive || !objectIsA(i.object, objName)) continue;
        const b = instBBox(i);
        if (b && b.l < x2 && b.r > x1 && b.t < y2 && b.b > y1) out.push(i);
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------------------------

function room_goto(name) { Runtime.pendingRoom = name; }
function room_restart() { Runtime.pendingRoom = Runtime.roomName; }

function startRoom(name) {
    // Room End for the old room
    for (const i of Runtime.instances) if (i.alive) callEvent(i, 'roomEnd');
    Runtime.instances = [];

    const room = ROOM_DATA[name];
    Runtime.room = room;
    Runtime.roomName = name;
    G.room_width = room.w;
    G.room_height = room.h;

    for (const [obj, x, y, props] of room.inst) {
        if (!OBJECT_DATA[obj]) continue;
        instance_create(obj, x, y, 0, props);
    }
    if (Runtime.roomCreationCode[name]) Runtime.roomCreationCode[name]();
    for (const i of Runtime.instances.slice()) if (i.alive) callEvent(i, 'roomStart');
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------

function forEachAlive(fn) {
    const list = Runtime.instances.slice();
    for (const i of list) {
        if (i.alive) fn(i);
    }
}

function gameTick() {
    pollGamepad();

    // Begin Step
    forEachAlive(i => callEvent(i, 'beginStep'));

    // Keyboard events: held, pressed, released
    for (const vk of Input.held) forEachAlive(i => callEvent(i, 'keyboard', vk));
    for (const vk of Input.pressed) forEachAlive(i => callEvent(i, 'keyPress', vk));
    if (Input.pressed.size) forEachAlive(i => callEvent(i, 'keyPress', vk_anykey));
    for (const vk of Input.released) forEachAlive(i => callEvent(i, 'keyRelease', vk));
    if (Input.mousePressed[0]) forEachAlive(i => callEvent(i, 'globalTap'));

    // Step
    forEachAlive(i => callEvent(i, 'step'));

    // Collision events
    forEachAlive(self => {
        const ev = findEvent(self.object, ['collision']);
        if (!ev) return;
        for (const target in ev) {
            for (const other of Runtime.instances.slice()) {
                if (!self.alive) return;
                if (!other.alive || other === self || !objectIsA(other.object, target)) continue;
                if (instancesCollide(self, other)) ev[target](self, other);
            }
        }
    });

    // End Step
    forEachAlive(i => callEvent(i, 'endStep'));

    // Sprite animation
    for (const i of Runtime.instances) {
        if (!i.alive) continue;
        const s = SPR[i.sprite_index];
        if (!s || s.n <= 1) continue;
        i.image_index += i.image_speed * s.fps / ROOM_SPEED;
        if (i.image_index >= s.n) i.image_index -= s.n;
        if (i.image_index < 0) i.image_index += s.n;
    }

    Runtime.instances = Runtime.instances.filter(i => i.alive);

    Input.pressed.clear();
    Input.released.clear();
    Input.mousePressed = [false, false, false];
    Input.wheelUp = Input.wheelDown = false;

    if (Runtime.pendingRoom) {
        const r = Runtime.pendingRoom;
        Runtime.pendingRoom = null;
        startRoom(r);
    }
}

function gameDraw() {
    const ctx = Display.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = (G.GraphicsOption === 1);
    ctx.fillStyle = Runtime.room ? Runtime.room.bg : '#000';
    ctx.fillRect(0, 0, Display.w, Display.h);

    // Higher depth draws first; stable for equal depths (creation order)
    const list = Runtime.instances.filter(i => i.alive && i.visible)
        .map((inst, idx) => ({ inst, idx }))
        .sort((a, b) => (b.inst.depth - a.inst.depth) || (a.idx - b.idx));
    for (const { inst } of list) {
        if (!inst.alive) continue;
        if (!callEvent(inst, 'draw') && inst.sprite_index) {
            SpriteDraw(inst.sprite_index, inst.image_index, inst.x, inst.y);
        }
    }
}

function runMainLoop() {
    let last = performance.now();
    let acc = 0;
    const tickMs = 1000 / ROOM_SPEED;
    function frame(now) {
        acc += Math.min(now - last, 250);
        last = now;
        let ticks = 0;
        while (acc >= tickMs && ticks < 4) {
            gameTick();
            acc -= tickMs;
            ticks++;
        }
        if (ticks === 4) acc = 0;     // running too slowly - don't try to catch up forever
        if (ticks > 0) gameDraw();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

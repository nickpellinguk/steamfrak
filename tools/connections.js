#!/usr/bin/env node
// Static platform/ladder connection finder, for the GameMaker Studio original and this HTML5 port.
//
//     node tools/connections.js ../gamemakerstudio-frak [room_A_1 ...] [--eps=0.00001] [--detail]
//
// For every level, from every pixel of every platform and every point of every ladder, and for
// every key Trogg could be holding, it runs Trogg's movement forward until he stands, climbs or
// dies, the way the original's (unused) GraphFind script does, and records which platforms and
// ladders he can get to and how quickly (GraphAdd: the fewest ticks, then the shortest hop).
// It does this twice:
//
//   web   with this port's own code: js/world.js and the TroggStanding/Falling/Climbing
//         functions from js/trogg.js, run unchanged, on js/data/rooms.js
//   gms   with the original's scripts (TroggStanding, TroggFalling, TroggClimbing, PlatformFind,
//         LadderFind, LadderAdd, RoomCreateFinish...) transcribed below line for line, on the
//         rooms, objects and sprites read from the GameMaker project's .yy files
//
// The arithmetic is the same (both are IEEE doubles). What differs is comparison: GameMaker
// compares two reals as equal when they're within its epsilon (math_set_epsilon, 0.00001 by
// default), and that applies to <, <=, > and >= too (a - b within epsilon compares as 0), while
// JavaScript compares exactly. Trogg's y moves in steps of 0.05, which isn't exact in binary.
//
// It then reports, per level: every start (point, key) whose outcome differs (where Trogg ends
// up, after how many ticks, in what state), and every connection (from one platform or ladder
// to another) that only one version has, or that differs in ticks.
//
// Not used here, as in GraphFind: moving meanies, balloons and daggers. Moving platforms are
// where they start. Two quirks of the original's scripts are not reproduced, because they are
// GraphFind's, not the game's: TroggClimbing doesn't return the platform or ladder it found
// (GraphFind read stale values), so the platform or ladder found is taken from the lookups it
// made; and TroggFalling's bounce reads the calling instance's yvel, which in the game is
// Trogg's own (the yvel passed in), so that's what's used.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const args = process.argv.slice(2);
const opt = k => { const a = args.find(s => s.startsWith('--' + k)); return a ? (a.split('=')[1] ?? true) : undefined; };
const GMS = args.find(a => !a.startsWith('--') && !a.startsWith('room')) || path.join(ROOT, '..', 'gamemakerstudio-frak');
const EPS = opt('eps') !== undefined ? Number(opt('eps')) : 0.00001;
const DETAIL = !!opt('detail');
const ONLY = args.filter(a => a.startsWith('room'));
const MAX_WIDTH = 1024, MAX_HEIGHT = 1024, LADDER_EXTRA_LENGTH = 16;

// ---------------------------------------------------------------------------------------------
// The web version: its own code and data, in a sandbox
// ---------------------------------------------------------------------------------------------

function webSource(file, names) {
    // the named top-level functions from a file
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return names.map(n => {
        const i = src.indexOf('\nfunction ' + n + '(');
        if (i < 0) throw new Error(n + ' not found in ' + file);
        const j = src.indexOf('\n}\n', i);
        return src.slice(i, j + 3);
    }).join('\n');
}

function webEngine(roomName) {
    const ctx = vm.createContext({ Math, console, Object, Array, Number });
    for (const f of ['js/data/objects.js', 'js/data/sprites.js', 'js/data/rooms.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') +
            '\nthis.OBJECT_DATA = typeof OBJECT_DATA !== "undefined" ? OBJECT_DATA : this.OBJECT_DATA;' +
            'this.SPRITE_DATA = typeof SPRITE_DATA !== "undefined" ? SPRITE_DATA : this.SPRITE_DATA;' +
            'this.ROOM_DATA = typeof ROOM_DATA !== "undefined" ? ROOM_DATA : this.ROOM_DATA;', ctx);
    }
    vm.runInContext(`
        var G = {}, Runtime = { instances: [] }, SPR = SPRITE_DATA;
        ${webSource('js/engine.js', ['sign', 'gmlRound', 'objectParent', 'sprite_width', 'sprite_height'])}
        ${fs.readFileSync(path.join(ROOT, 'js/world.js'), 'utf8')}
        ${webSource('js/trogg.js', ['TroggStanding', 'TroggFalling', 'TroggClimbing'])}
        // (the LadderFind result each movement function last used, for the connection finder)
        var lastFind = null;
        const _LadderFind = LadderFind;
        LadderFind = function () { return lastFind = _LadderFind.apply(null, arguments); };
        function defaults(obj) {
            const chain = [];
            for (let o = obj; o; o = OBJECT_DATA[o] ? OBJECT_DATA[o].parent : null) chain.unshift(o);
            const props = {};
            for (const o of chain) Object.assign(props, (OBJECT_DATA[o] || {}).props || {});
            return { props, sprite: (OBJECT_DATA[obj] || {}).sprite };
        }
        function setupRoom(name) {
            const room = ROOM_DATA[name];
            Runtime.instances = room.inst.map(([obj, x, y, p]) => {
                const d = defaults(obj);
                return Object.assign({}, d.props, p || {}, { object: obj, x, y, sprite_index: d.sprite, alive: true });
            });
            G = { frak_gravity: 0.05, level_width: room.w, level_height: room.h };
            RoomCreateFinish();
        }
    `, ctx);
    vm.runInContext(`setupRoom(${JSON.stringify(roomName)})`, ctx);
    const G = () => ctx.G;
    const self = { yvel: 0 };
    return {
        name: 'web',
        platforms: () => ({ n: G().platforms_num, x: G().platform_x, y: G().platform_y, w: G().platform_w,
                            moving: G().platform_x.map((_, i) => G().platform_isVertMover[i] || G().platform_isMovable[i]) }),
        ladders: () => ({ n: G().ladder_num, x: G().ladder_x, y: G().ladder_y, h: G().ladder_h }),
        standing(x, y, xvel, yvel, xm, ym) {
            const r = ctx.TroggStanding(self, x, y, xvel, yvel, xm, ym);
            return { x: r.x, y: r.y, xvel: r.xvel, yvel: r.yvel, dofall: r.dofall, doclimb: r.doclimb,
                     plat: r.platformIndex, ladder: r.ladderIndex };
        },
        falling(x, y, xvel, yvel, xm, ym) {
            self.yvel = yvel;
            const r = ctx.TroggFalling(self, x, y, xvel, yvel, xm, ym);
            return { x: r.x, y: r.y, xvel: r.xvel, yvel: r.yvel, doclimb: r.doclimb, dostand: r.dostand,
                     dodie: r.dodie, plat: r.platformIndex, ladder: r.ladderIndex };
        },
        climbing(x, y, xvel, yvel, xm, ym) {
            ctx.lastFind = null;
            ctx.G.platformfind_platformIndex = -1;
            const r = ctx.TroggClimbing(self, x, y, xvel, yvel, xm, ym);
            // (the ladder it moved Trogg along, as TroggClimbing's own ladderIndex: one it
            // found, and moved by more than 0.001, and he's still on)
            const f = ctx.lastFind;
            const ladder = !r.dofall && f && f.found && Math.abs(y - f.y) > 0.001 ? f.ladderIndex : -1;
            return { x: r.x, y: r.y, xvel: r.xvel, yvel: r.yvel, dofall: r.dofall, dostand: r.dostand,
                     plat: ctx.G.platformfind_platformIndex, ladder };
        },
    };
}

// ---------------------------------------------------------------------------------------------
// The GameMaker original: its project files, and its scripts transcribed with GML's comparisons
// ---------------------------------------------------------------------------------------------

function loadYY(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/,(\s*[}\]])/g, '$1'));
}

const gmsCache = {};
function gmsObject(name) {
    if (!gmsCache[name]) {
        const o = loadYY(path.join(GMS, 'objects', name, name + '.yy'));
        const parent = o.parentObjectId ? o.parentObjectId.name : null;
        const props = parent ? Object.assign({}, gmsObject(parent).props) : {};
        for (const p of o.properties || []) props[p.name] = p.value;
        for (const p of o.overriddenProperties || []) props[p.propertyId.name] = p.value;
        gmsCache[name] = { parent, sprite: o.spriteId ? o.spriteId.name : null, props };
    }
    return gmsCache[name];
}
function gmsSprite(name) {
    const key = 'spr:' + name;
    if (!gmsCache[key]) {
        const s = loadYY(path.join(GMS, 'sprites', name, name + '.yy'));
        gmsCache[key] = { w: s.width, h: s.height };
    }
    return gmsCache[key];
}
const gmlBool = v => v === true || v === 'True' || v === 'true' || (typeof v === 'string' && Number(v) !== 0 && !isNaN(Number(v)));

function gmsEngine(roomName) {
    // GML compares reals with an epsilon: cmp(a, b) is 0 if they're within it
    const cmp = (a, b) => { const d = a - b; return d === 0 || Math.abs(d) < EPS ? 0 : (d < 0 ? -1 : 1); };
    const lt = (a, b) => cmp(a, b) < 0, le = (a, b) => cmp(a, b) <= 0;
    const gt = (a, b) => cmp(a, b) > 0, ge = (a, b) => cmp(a, b) >= 0;
    const eq = (a, b) => cmp(a, b) === 0, ne = (a, b) => cmp(a, b) !== 0;
    const sign = v => (gt(v, 0) ? 1 : (lt(v, 0) ? -1 : 0));
    const round = v => { const r = Math.round(v); return (Math.abs(v % 1) === 0.5 && (r % 2) !== 0) ? r - 1 : r; };
    const idx = v => Math.trunc(v);         // (a real used as an array index)
    const g = { frak_gravity: 0.05 };

    // --- RoomCreateFinish (the platform and ladder parts)
    const r = loadYY(path.join(GMS, 'rooms', roomName, roomName + '.yy'));
    g.level_width = r.roomSettings.Width;
    g.level_height = r.roomSettings.Height;
    const byName = {};
    for (const layer of r.layers || []) for (const inst of layer.instances || []) byName[inst.name] = inst;
    const order = (r.instanceCreationOrder || []).map(i => byName[i.name]).filter(Boolean);
    const insts = order.map(inst => {
        const o = gmsObject(inst.objectId.name);
        const props = Object.assign({}, o.props);
        for (const p of inst.properties || []) props[p.propertyId.name] = p.value;
        return { obj: inst.objectId.name, parent: o.parent, sprite: o.sprite, x: inst.x, y: inst.y, props };
    });
    g.platforms_num = 0;
    Object.assign(g, { platform_x: [], platform_y: [], platform_w: [], platform_h: [], platform_isVertMover: [],
                       platform_isMovable: [], platform_isBouncy: [] });
    for (const j of insts) {
        if (j.parent !== 'oPlatform') continue;
        const s = gmsSprite(j.sprite);
        const i = g.platforms_num++;
        g.platform_x[i] = j.x; g.platform_y[i] = j.y; g.platform_w[i] = s.w; g.platform_h[i] = s.h;
        g.platform_isVertMover[i] = gmlBool(j.props.scan_up) || gmlBool(j.props.scan_down);
        g.platform_isMovable[i] = gmlBool(j.props.is_movable_by_trogg);
        g.platform_isBouncy[i] = gmlBool(j.props.is_bouncy);
    }
    // PlatformFixup
    g.platform_group_base = []; g.platform_group_array = [];
    let gi = 0;
    for (let yco = 0; yco < MAX_HEIGHT; yco++) {
        g.platform_group_base[yco] = gi;
        for (let i = 0; i < g.platforms_num; i++) {
            if (eq(g.platform_y[i], yco) || g.platform_isVertMover[i] || g.platform_isMovable[i]) g.platform_group_array[gi++] = i;
        }
    }
    g.platform_group_base[MAX_HEIGHT] = gi;

    // PlatformFind
    function PlatformFind(_x, _y1, _y2) {
        let result = _y2, platformIndex = -1;
        if (lt(_y1, _y2)) {
            const ceily1 = Math.ceil(_y1);
            if (lt(ceily1, MAX_HEIGHT)) {
                for (let yco = ceily1; lt(yco, _y2); yco++) {
                    const first = g.platform_group_base[idx(yco)], last = g.platform_group_base[idx(yco) + 1];
                    for (let i = first; i < last; i++) {
                        const index = g.platform_group_array[i];
                        const platx = g.platform_x[index], platy = g.platform_y[index], platw = g.platform_w[index];
                        if (ge(_x, platx) && lt(_x, platx + platw) && eq(yco, platy)) {
                            platformIndex = index;
                            result = yco;
                            break;
                        }
                    }
                    if (platformIndex !== -1) break;
                }
            }
        }
        g.platformfind_platformIndex = platformIndex;
        return result;
    }

    // LadderAdd, LadderFixup
    g.ladder_num = 0;
    Object.assign(g, { ladder_x: [], ladder_y: [], ladder_w: [], ladder_h: [], ladder_extrah: [] });
    for (const j of insts) {
        if (j.parent !== 'oLadder') continue;
        const s = gmsSprite(j.sprite);
        let _yco = j.y;
        const _height = s.h + LADDER_EXTRA_LENGTH;
        const foundy = PlatformFind(j.x, _yco - LADDER_EXTRA_LENGTH, _yco - 1);
        const extra = g.platformfind_platformIndex === -1 ? 0 : _yco - foundy - 1;
        _yco -= extra;
        const i = g.ladder_num++;
        g.ladder_x[i] = j.x; g.ladder_y[i] = _yco; g.ladder_w[i] = s.w;
        g.ladder_extrah[i] = extra; g.ladder_h[i] = _height + extra;
    }
    g.ladder_group_base = []; g.ladder_group_array = [];
    gi = 0;
    for (let xco = 0; xco < MAX_WIDTH; xco++) {
        g.ladder_group_base[xco] = gi;
        for (let i = 0; i < g.ladder_num; i++) {
            const ladx = g.ladder_x[i];
            if (ge(xco, ladx - 6) && le(xco, ladx + 6)) g.ladder_group_array[gi++] = i;
        }
    }
    g.ladder_group_base[MAX_WIDTH] = gi;

    // LadderFind
    function LadderFind(_x, _y1, _y2, _isonplatform, _isjumping) {
        let result_found = false, result_x = _x, result_y = _y1, ladderIndex = -1;
        const isgoingup = lt(_y2, _y1);
        if (ne(_y1, _y2) && ge(_x, 0) && lt(_x, MAX_WIDTH)) {     // (the GML tests the caller's x: Trogg's)
            const first = g.ladder_group_base[idx(_x)], last = g.ladder_group_base[idx(_x) + 1];
            for (let gg = first; gg < last; gg++) {
                const i = g.ladder_group_array[gg];
                const ladx = g.ladder_x[i];
                let lady = g.ladder_y[i], ladh = g.ladder_h[i];
                if (isgoingup) {
                    if (_isjumping) { lady += g.ladder_extrah[i]; ladh -= g.ladder_extrah[i]; }
                    if (_isonplatform && gt(lady, _y1)) continue;
                    if (ge(result_y, lady) && lt(_y2, lady + ladh)) {
                        result_found = true;
                        result_x = _x + sign(ladx - _x);
                        result_y = Math.max(_y2, lady);
                        ladderIndex = i;
                        if (eq(result_y, _y2)) break;
                    }
                } else {
                    if (_isonplatform && lt(lady, _y1)) continue;
                    if (lt(result_y, lady + ladh - 1) && ge(_y2, lady)) {
                        result_found = true;
                        result_x = _x + sign(ladx - _x);
                        result_y = Math.min(_y2, lady + ladh - 1);
                        ladderIndex = i;
                        if (eq(result_y, _y2)) break;
                    }
                }
            }
        }
        g.ladderfind_result_x = result_x;
        g.ladderfind_result_y = result_y;
        g.ladderfind_ladderIndex = ladderIndex;
        return result_found;
    }

    // TroggStanding
    function TroggStanding(_xco, _yco, _xvel, _yvel, _xmove, _ymove) {
        let dofall = false, doclimb = false, platformIndex = -1, ladderIndex = -1;
        _xco += _xmove;
        const nexty = PlatformFind(_xco, _yco, _yco + 1);
        if (ne(nexty, _yco)) {
            dofall = true;
        } else {
            platformIndex = g.platformfind_platformIndex;
            if (_ymove !== 0) {
                if (LadderFind(_xco, _yco, _yco - _ymove, true, true)) {
                    doclimb = true;
                    _xco = g.ladderfind_result_x;
                    _yco = g.ladderfind_result_y;
                    ladderIndex = g.ladderfind_ladderIndex;
                } else if (_ymove > 0) {
                    dofall = true;
                }
            }
        }
        if (dofall) {
            _xvel = _xmove;
            _yvel = (_ymove > 0) ? 1.25 : 0;
        }
        _yco = round(_yco / g.frak_gravity) * g.frak_gravity;
        return { x: _xco, y: _yco, xvel: _xvel, yvel: _yvel, dofall, doclimb, plat: platformIndex, ladder: ladderIndex };
    }

    // TroggFalling (yvel: the calling instance's, i.e. Trogg's own, as passed in)
    function TroggFalling(_xco, _yco, _xvel, _yvel, _xmove, _ymove) {
        const yvel = _yvel;
        let doclimb = false, dostand = false, dodie = false, platformIndex = -1, ladderIndex = -1;
        _xco = Math.max(12, _xco + _xvel);
        _xco = Math.min(g.level_width - 10, _xco);
        if (gt(_yvel, -4)) _yvel -= g.frak_gravity;
        if (_ymove !== 0 && ge(_yvel, -1.25 - 0.025)) {
            if (LadderFind(_xco, _yco, _yco - _yvel, false, true)) {
                doclimb = true;
                _xco = g.ladderfind_result_x;
                _yco = g.ladderfind_result_y;
                _xvel = 0;
                _yvel = 0;
                ladderIndex = g.ladderfind_ladderIndex;
            }
        }
        if (!doclimb) {
            if (ge(_yvel, 0)) {
                _yco -= _yvel;
            } else {
                const nexty = PlatformFind(_xco, _yco, _yco - _yvel);
                if (eq(nexty, _yco - _yvel)) {
                    _yco = nexty;
                } else {
                    platformIndex = g.platformfind_platformIndex;
                    if (g.platform_isBouncy[platformIndex]) {
                        _yco = nexty;
                        _yvel = -yvel + g.frak_gravity * 2;
                    } else {
                        if (le(_yvel, -1.60)) dodie = true;
                        dostand = true;
                        _xvel = 0;
                        _yvel = 0;
                    }
                }
            }
        }
        if (ge(_yco, g.level_height)) {
            _xvel = 0;
            _yco = g.level_height - 1;
            dodie = true;
        }
        _yco = round(_yco / g.frak_gravity) * g.frak_gravity;
        return { x: _xco, y: _yco, xvel: _xvel, yvel: _yvel, doclimb, dostand, dodie, plat: platformIndex, ladder: ladderIndex };
    }

    // TroggClimbing (returning the platform or ladder it found, which the GML doesn't)
    function TroggClimbing(_xco, _yco, _xvel, _yvel, _xmove, _ymove) {
        let dofall = false, dostand = false, ladderIndex = -1, platformIndex = -1;
        _xvel = 0;
        _yvel = 0;
        const above = i => ge(_yco, g.ladder_y[i] + g.ladder_extrah[i]);
        if (_ymove > 0) {
            const found = LadderFind(_xco, _yco, _yco - _ymove, false, false);
            if (found && gt(Math.abs(_yco - g.ladderfind_result_y), 0.001)) {
                _xco = g.ladderfind_result_x;
                _yco = g.ladderfind_result_y;
                ladderIndex = g.ladderfind_ladderIndex;
                if (_xmove !== 0 && above(ladderIndex)) { _xvel = _xmove; dofall = true; ladderIndex = -1; }
            } else {
                PlatformFind(_xco, _yco - 1, _yco + 2);
                if (g.platformfind_platformIndex !== -1) {
                    _yco -= _ymove;
                    dofall = true;
                } else {
                    _yvel = 0;
                }
            }
        }
        if (_ymove === 0) {
            const found = LadderFind(_xco, _yco, _yco + 2, false, false);
            if (found && gt(Math.abs(_yco - g.ladderfind_result_y), 0.001)) {
                _xco = g.ladderfind_result_x;
                ladderIndex = g.ladderfind_ladderIndex;
                if (_xmove !== 0 && above(ladderIndex)) { _xvel = _xmove; dofall = true; ladderIndex = -1; }
            } else if (_xmove !== 0) {
                _xvel = _xmove;
                dofall = true;
            }
        }
        if (_ymove < 0) {
            PlatformFind(_xco, _yco, _yco - _ymove);
            platformIndex = g.platformfind_platformIndex;
            if (platformIndex !== -1) {
                dostand = true;
            } else {
                const found = LadderFind(_xco, _yco, _yco - _ymove, false, false);
                if (found && gt(Math.abs(_yco - g.ladderfind_result_y), 0.001)) {
                    _xco = g.ladderfind_result_x;
                    _yco = g.ladderfind_result_y;
                    ladderIndex = g.ladderfind_ladderIndex;
                    if (_xmove !== 0 && above(ladderIndex)) { _xvel = _xmove; dofall = true; ladderIndex = -1; }
                } else {
                    _xvel = 0;
                    _yvel = -1;
                    _yco -= _ymove;
                    dofall = true;
                }
            }
        }
        _yco = round(_yco / g.frak_gravity) * g.frak_gravity;
        return { x: _xco, y: _yco, xvel: _xvel, yvel: _yvel, dofall, dostand, plat: platformIndex, ladder: ladderIndex };
    }

    return {
        name: 'gms',
        platforms: () => ({ n: g.platforms_num, x: g.platform_x, y: g.platform_y, w: g.platform_w,
                            moving: g.platform_x.map((_, i) => g.platform_isVertMover[i] || g.platform_isMovable[i]) }),
        ladders: () => ({ n: g.ladder_num, x: g.ladder_x, y: g.ladder_y, h: g.ladder_h }),
        standing: TroggStanding, falling: TroggFalling, climbing: TroggClimbing,
        le,
    };
}

// ---------------------------------------------------------------------------------------------
// The connection finder (GraphFind and GraphAdd), the same for both
// ---------------------------------------------------------------------------------------------

// key directions 0-8: (x, y) = (-1..1, up..down); 4 = no key
const XM = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
const YM = [1, 1, 1, 0, 0, 0, -1, -1, -1];     // (ymove: +1 = up, as the game's)
const STAND_DIRS = [1, 3, 5, 6, 7, 8];
const CLIMB_DIRS = [1, 3, 5, 7];
const NO_KEY = 4;

function findConnections(E) {
    const P = E.platforms(), L = E.ladders();
    const edges = new Map();        // "P3>L5" -> {ticks, sx, sy, dx, dy, sdir, ddir}
    const outcomes = new Map();     // "P3 x y dir" -> where that start ends up (for comparing)
    const add = (src, dst, sx, sy, dx, dy, sdir, ddir, ticks) => {
        const k = src + '>' + dst, e = edges.get(k);
        if (e) {
            if (ticks > e.ticks) return;
            if (ticks === e.ticks && (e.dx - e.sx) ** 2 + (e.dy - e.sy) ** 2 <= (dx - sx) ** 2 + (dy - sy) ** 2) return;
        }
        edges.set(k, { ticks, sx, sy, dx, dy, sdir, ddir });
    };
    const fmt = v => Number.isInteger(v) ? String(v) : v.toFixed(6);
    // Run a jump or fall forward (GraphFind's inner loop). Returns how it ended.
    function fall(src, sx, sy, sdir, s, srcPlat, srcLadder) {
        let tick;
        const grabs = [];
        for (tick = 2; tick < 1000; tick++) {
            for (const ddir of [1, 7]) {        // (holding up or down: grab a ladder)
                const r = E.falling(s.x, s.y, s.xvel, s.yvel, XM[ddir], YM[ddir]);
                if (r.dodie) continue;
                if (r.doclimb && r.ladder !== srcLadder) {
                    add(src, 'L' + r.ladder, sx, sy, r.x, r.y, sdir, ddir, tick);
                    grabs.push(`${ddir === 1 ? 'up' : 'down'}@${tick}:L${r.ladder}`);
                }
                if (r.dostand && r.plat !== -1 && r.plat !== srcPlat) add(src, 'P' + r.plat, sx, sy, r.x, r.y, sdir, ddir, tick);
            }
            const r = E.falling(s.x, s.y, s.xvel, s.yvel, 0, 0);
            s = { x: r.x, y: r.y, xvel: r.xvel, yvel: r.yvel };
            if (r.dodie) return `dies@${tick} ${fmt(r.x)},${fmt(r.y)} ${grabs.join(' ')}`;
            if (r.doclimb) return `climbs?@${tick}`;
            if (r.dostand && r.plat !== -1) {
                if (r.plat !== srcPlat) add(src, 'P' + r.plat, sx, sy, r.x, r.y, sdir, NO_KEY, tick);
                return `lands P${r.plat}@${tick} ${fmt(r.x)},${fmt(r.y)} ${grabs.join(' ')}`;
            }
            if (E.le ? E.le(s.yvel, -1.60) : s.yvel <= -1.60) return `too fast@${tick} ${fmt(s.x)},${fmt(s.y)} ${grabs.join(' ')}`;
        }
        return 'still falling';
    }
    for (let p = 0; p < P.n; p++) {
        const y = P.y[p];
        for (let x = P.x[p]; x < P.x[p] + P.w[p]; x++) {
            for (const dir of STAND_DIRS) {
                const r = E.standing(x, y, 0, 0, XM[dir], YM[dir]);
                let out;
                if (r.doclimb) { add('P' + p, 'L' + r.ladder, x, y, r.x, r.y, dir, NO_KEY, 1); out = `climbs L${r.ladder} ${fmt(r.x)},${fmt(r.y)}`; }
                else if (!r.dofall) { if (r.plat !== p) add('P' + p, 'P' + r.plat, x, y, r.x, r.y, dir, NO_KEY, 1); out = `stands P${r.plat}`; }
                else out = fall('P' + p, x, y, dir, r, p, -1);
                outcomes.set(`P${p} ${x},${y} ${dir}`, out);
            }
        }
    }
    for (let l = 0; l < L.n; l++) {
        const x = L.x[l];
        for (let y = L.y[l]; y < L.y[l] + L.h[l]; y++) {
            for (const dir of CLIMB_DIRS) {
                const r = E.climbing(x, y, 0, 0, XM[dir], YM[dir]);
                let out;
                if (r.dostand && r.plat !== -1) { add('L' + l, 'P' + r.plat, x, y, r.x, r.y, dir, NO_KEY, 1); out = `stands P${r.plat}`; }
                else if (!r.dofall) {
                    if (r.ladder !== -1 && r.ladder !== l) add('L' + l, 'L' + r.ladder, x, y, r.x, r.y, dir, NO_KEY, 1);
                    out = `climbing L${r.ladder} ${fmt(r.x)},${fmt(r.y)}`;
                } else out = fall('L' + l, x, y, dir, r, -1, l);
                outcomes.set(`L${l} ${x},${y} ${dir}`, out);
            }
        }
    }
    return { edges, outcomes, P, L };
}

// ---------------------------------------------------------------------------------------------

// --trace=room,x,y,dir: both versions' jump or fall from a standing start, tick by tick
if (opt('trace')) {
    const [room, x, y, dir] = opt('trace').split(',');
    for (const E of [gmsEngine(room), webEngine(room)]) {
        let s = E.standing(+x, +y, 0, 0, XM[+dir], YM[+dir]);
        console.log(E.name, 'start', JSON.stringify(s));
        for (let t = 2; t < (+opt('ticks') || 200) && s.dofall !== false; t++) {
            const r = E.falling(s.x, s.y, s.xvel, s.yvel, 0, 0);
            console.log(E.name, t, r.x, r.y, r.yvel, r.dostand ? 'stand P' + r.plat : '', r.dodie ? 'die' : '');
            if (r.dostand || r.dodie) break;
            s = Object.assign(r, { dofall: true });
        }
    }
    process.exit(0);
}

const ROOMS = (() => {
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/rooms.js'), 'utf8') + ';this.R = ROOM_DATA;', ctx);
    return Object.keys(ctx.R).filter(n => /^room_[0A-F]/.test(n));
})();

const DIRNAME = ['up-left', 'up', 'up-right', 'left', '-', 'right', 'down-left', 'down', 'down-right'];
let totalOut = 0, totalEdge = 0, totalEnd = 0, totalGrab = 0;
for (const room of (ONLY.length ? ONLY : ROOMS)) {
    const w = findConnections(webEngine(room)), g = findConnections(gmsEngine(room));
    const lines = [];
    // the levels themselves should match
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!same([w.P.x, w.P.y, w.P.w], [g.P.x, g.P.y, g.P.w]) || !same([w.L.x, w.L.y, w.L.h], [g.L.x, g.L.y, g.L.h])) {
        lines.push('  the platforms or ladders differ between the two!');
    }
    // What a start ends in: how it finishes (which platform Trogg lands on, or how he dies),
    // and the ladders he could grab on the way, without the ticks or exact positions
    const end = v => v.split(' ').slice(0, 2).join(' ').replace(/@\d+/, '').replace(/ -?[\d.]+,-?[\d.]+/, '');
    const grabs = v => v.split(' ').filter(t => /^(up|down)@/.test(t)).map(t => t.replace(/@\d+/, '')).sort().join(' ');
    let nOut = 0, nGrab = 0, nEnd = 0;
    for (const [k, v] of g.outcomes) {
        const wv = w.outcomes.get(k);
        if (wv === v) continue;
        nOut++;
        const kind = end(v) !== end(wv) ? 'end' : grabs(v) !== grabs(wv) ? 'grab' : 'timing';
        if (kind === 'end') nEnd++;
        if (kind === 'grab') nGrab++;
        const [obj, xy, dir] = k.split(' ');
        if (DETAIL || kind === 'end') lines.push(`  from ${obj} at ${xy} holding ${DIRNAME[dir]} (${kind}):\n      gms: ${v}\n      web: ${wv}`);
    }
    if (nOut > nEnd && !DETAIL) lines.push(`  (and ${nOut - nEnd} starts that end the same way: ${nGrab} with different ladders to grab on the way, the rest at a different tick or height: --detail)`);
    let nEdge = 0;
    const keys = new Set([...g.edges.keys(), ...w.edges.keys()]);
    for (const k of [...keys].sort()) {
        const a = g.edges.get(k), b = w.edges.get(k);
        if (a && b && a.ticks === b.ticks) continue;
        nEdge++;
        const d = e => e ? `${e.ticks} ticks, from ${e.sx},${e.sy} holding ${DIRNAME[e.sdir]}${e.ddir !== NO_KEY ? ' then ' + DIRNAME[e.ddir] : ''}` : 'none';
        lines.push(`  connection ${k}: gms ${d(a)}; web ${d(b)}`);
    }
    totalOut += nOut; totalEdge += nEdge; totalEnd += nEnd; totalGrab += nGrab;
    console.log(`${room}: ${g.edges.size} connections (gms), ${w.edges.size} (web), ${g.outcomes.size} starts; ` +
                (nOut || nEdge ? `${nOut} starts differ (${nEnd} end differently, ${nGrab} grab differently), ${nEdge} connections differ` : 'the same'));
    for (const l of lines) console.log(l);
}
console.log(`\nIn all: ${totalOut} starts differ (${totalEnd} end differently, ${totalGrab} grab differently) and ${totalEdge} connections differ (GameMaker epsilon ${EPS})`);

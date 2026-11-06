// Frak! HTML5 - platforms and ladders
//
// Port of PlatformInit/Add/Fixup/Find/FindMovable/MoveTo, LadderInit/Add/Fixup/Find and
// RoomCreateFinish. Platforms and ladders are kept in flat arrays (as in the GML, and as they
// would be in an 8-bit or Amiga version) with lookup tables bucketed by y (platforms) and by
// x (ladders) so collision tests stay cheap.
'use strict';

const MAX_HEIGHT = 1024;            // maximum expected height of a level (BBC Micro pixels)
const MAX_WIDTH = 1024;             // maximum expected width of a level
const LADDER_EXTRA_LENGTH = 16;     // ladders reach this far above their top, to grab hold of
const DAGGER_DEPTH = 3;
const BALLOON_DEPTH = 4;

function PlatformInit() {
    G.platforms_num = 0;
    G.platform_x = [];
    G.platform_y = [];
    G.platform_w = [];
    G.platform_h = [];
    G.platform_isVertMover = [];
    G.platform_isMovable = [];
    G.platform_isBouncy = [];
    G.platform_linkedInstance = [];
    G.platform_is_moving = [];
    G.platform_group_index = 0;
    G.platform_group_base = null;
    G.platform_group_array = [];
}

function PlatformAdd(x, y, w, h, isVertMover, isMovable, isBouncy, linkedInstance) {
    const i = G.platforms_num++;
    G.platform_x[i] = x;
    G.platform_y[i] = y;
    G.platform_w[i] = w;
    G.platform_h[i] = h;
    G.platform_isVertMover[i] = isVertMover;
    G.platform_isMovable[i] = isMovable;
    G.platform_isBouncy[i] = isBouncy;
    G.platform_linkedInstance[i] = linkedInstance;
    return i;
}

// Bucket platforms by y. Platforms that can move vertically (or be moved by Trogg) go in every bucket.
function PlatformFixup() {
    G.platform_group_index = 0;
    G.platform_group_base = new Array(MAX_HEIGHT + 1).fill(0);
    G.platform_group_array = [];
    for (let yco = 0; yco < MAX_HEIGHT; yco++) {
        G.platform_group_base[yco] = G.platform_group_index;
        for (let i = 0; i < G.platforms_num; i++) {
            if (gEQ(G.platform_y[i], yco) || G.platform_isVertMover[i] || G.platform_isMovable[i]) {
                G.platform_group_array[G.platform_group_index++] = i;
            }
        }
    }
    G.platform_group_base[MAX_HEIGHT] = G.platform_group_index;
}

// Look for the first platform top between y1 (exclusive-ish) and y2 at column x.
// Returns the y of the platform found, or y2. Sets G.platformfind_platformIndex.
function PlatformFind(x, y1, y2) {
    let result = y2;
    let platformIndex = -1;

    // Only do platform detection if Trogg is falling downwards
    if (gLT(y1, y2) && G.platform_group_base) {
        const ceily1 = Math.ceil(y1);
        // Only check if Trogg hasn't fallen off the bottom of the world
        if (ceily1 < MAX_HEIGHT) {
            for (let yco = Math.max(0, ceily1); gLT(yco, y2) && yco < MAX_HEIGHT; yco++) {
                const first = G.platform_group_base[yco];
                const last = G.platform_group_base[yco + 1];
                for (let g = first; g < last; g++) {
                    const i = G.platform_group_array[g];
                    const px = G.platform_x[i];
                    if (gGE(x, px) && gLT(x, px + G.platform_w[i]) && gEQ(yco, G.platform_y[i])) {
                        platformIndex = i;
                        result = yco;
                        break;
                    }
                }
                if (platformIndex !== -1) break;
            }
        }
    }

    G.platformfind_platformIndex = platformIndex;
    return result;
}

function PlatformFindMovable(x, y) {
    const yi = Math.trunc(y);
    if (yi < 0 || yi >= MAX_HEIGHT || !G.platform_group_base) return -1;
    const first = G.platform_group_base[yi];
    const last = G.platform_group_base[yi + 1];
    for (let g = first; g < last; g++) {
        const i = G.platform_group_array[g];
        if (!G.platform_isMovable[i]) continue;
        const px = G.platform_x[i], py = G.platform_y[i];
        if (gGE(x, px) && gLT(x, px + G.platform_w[i]) && gGE(y, py) && gLT(y, py + G.platform_h[i])) {
            return i;
        }
    }
    return -1;
}

// centreFlag: < 0 = right-align, 0 = centre, > 0 = left-align on xco
function PlatformMoveTo(index, xco, yco, centreFlag) {
    const wid = G.platform_w[index];
    if (centreFlag < 0) xco -= wid - 1;
    if (centreFlag === 0) xco -= wid >> 1;
    G.platform_x[index] = xco;
    G.platform_y[index] = yco;
    const inst = G.platform_linkedInstance[index];
    inst.x = xco;
    inst.y = yco;
}

function LadderInit() {
    G.ladder_num = 0;
    G.ladder_x = [];
    G.ladder_y = [];
    G.ladder_w = [];
    G.ladder_h = [];
    G.ladder_extrah = [];
    G.ladder_group_base = null;
    G.ladder_group_array = [];
}

function LadderAdd(x, y, w, h) {
    h += LADDER_EXTRA_LENGTH;
    // Ladders extend up to the platform just above them (if there is one within reach)
    const foundy = PlatformFind(x, y - LADDER_EXTRA_LENGTH, y - 1);
    const extra = (G.platformfind_platformIndex === -1) ? 0 : y - foundy - 1;
    const i = G.ladder_num++;
    G.ladder_x[i] = x;
    G.ladder_y[i] = y - extra;
    G.ladder_w[i] = w;
    G.ladder_extrah[i] = extra;
    G.ladder_h[i] = h + extra;
}

// Bucket ladders by x (any ladder within 6 pixels of a column)
function LadderFixup() {
    G.ladder_group_base = new Array(MAX_WIDTH + 1).fill(0);
    G.ladder_group_array = [];
    let index = 0;
    for (let xco = 0; xco < MAX_WIDTH; xco++) {
        G.ladder_group_base[xco] = index;
        for (let i = 0; i < G.ladder_num; i++) {
            const lx = G.ladder_x[i];
            if (gGE(xco, lx - 6) && gLE(xco, lx + 6)) G.ladder_group_array[index++] = i;
        }
    }
    G.ladder_group_base[MAX_WIDTH] = index;
}

// Can Trogg (at x, y1) move along a ladder towards y2? Returns a result object.
function LadderFind(x, y1, y2, isOnPlatform, isJumping) {
    let found = false;
    let rx = x, ry = y1;
    let ladderIndex = -1;
    const goingUp = gLT(y2, y1);
    const xi = Math.trunc(x);

    if (gNE(y1, y2) && xi >= 0 && xi < MAX_WIDTH && G.ladder_group_base) {
        const first = G.ladder_group_base[xi];
        const last = G.ladder_group_base[xi + 1];
        for (let g = first; g < last; g++) {
            const i = G.ladder_group_array[g];
            const ladx = G.ladder_x[i];
            let lady = G.ladder_y[i];
            let ladh = G.ladder_h[i];

            if (goingUp) {
                if (isJumping) {
                    // Don't allow Trogg to hold on to the invisible top of ladders if jumping upwards!
                    lady += G.ladder_extrah[i];
                    ladh -= G.ladder_extrah[i];
                }
                if (isOnPlatform && gGT(lady, y1)) continue;
                if (gGE(ry, lady) && gLT(y2, lady + ladh)) {
                    // Overlap found, so go up no further than the top of this ladder
                    found = true;
                    rx = x + sign(ladx - x);
                    ry = Math.max(y2, lady);
                    ladderIndex = i;
                    if (gEQ(ry, y2)) break;
                }
            } else {
                if (isOnPlatform && gLT(lady, y1)) continue;
                if (gLT(ry, lady + ladh - 1) && gGE(y2, lady)) {
                    // Overlap found, so go down no further than the bottom of this ladder
                    found = true;
                    rx = x + sign(ladx - x);
                    ry = Math.min(y2, lady + ladh - 1);
                    ladderIndex = i;
                    if (gEQ(ry, y2)) break;
                }
            }
        }
    }

    return { found, x: rx, y: ry, ladderIndex };
}

// Called at the very start of the first step of a level, after all instances exist
function RoomCreateFinish() {
    PlatformInit();
    LadderInit();
    G.numKeys = 0;
    G.numGems = 0;

    const parentOf = i => objectParent(i.object);

    for (const j of Runtime.instances) {
        if (!j.alive) continue;
        const obj = j.object, parent = parentOf(j);

        // Force depths to consistent values for each object type
        if (obj === 'oTrogg') j.depth = 0;
        if (obj === 'oGem') j.depth = 6;
        if (obj === 'oKey') j.depth = 7;
        if (obj === 'oBulb') j.depth = 8;
        if (parent === 'oMeanie') j.depth = 5;
        if (parent === 'oTrainingArrow') j.depth = 9;
        if (parent === 'oLadder') j.depth = 10;
        if (parent === 'oPlatform') j.depth = 11;

        // Add platforms to the abstract platform array
        if (parent === 'oPlatform') {
            const isVertMover = !!(j.scan_up || j.scan_down);
            j.platform_index = PlatformAdd(j.x, j.y, sprite_width(j), sprite_height(j),
                isVertMover, !!j.is_movable_by_trogg, !!j.is_bouncy, j);
        }
        if (obj === 'oKey') G.numKeys++;
        if (obj === 'oGem') G.numGems++;
    }

    PlatformFixup();    // Must be called before adding ladders, because ladders 'reach up' to platforms

    for (const j of Runtime.instances) {
        if (j.alive && parentOf(j) === 'oLadder') {
            LadderAdd(j.x, j.y, sprite_width(j), sprite_height(j));
        }
    }

    LadderFixup();
    G.isdead = false;
}

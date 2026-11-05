// Frak! HTML5 - Trogg, the player character
//
// Port of the oTrogg object events and the TroggStanding / TroggFalling / TroggClimbing /
// YoyoCollide / UpdateKeyOverrides / StopKeyOverrides scripts.
//
// (The GML also contained a disabled click-to-move path finder - oDownArrow, Graph*, Path* -
// which was switched off with "if (0)", so it is not ported.)
'use strict';

const TS = {    // eTroggState_t
    Standing_l: 0, Standing_r: 1, Walking_l: 2, Walking_r: 3,
    YoyoingOut_l: 4, YoyoingOut_r: 5, YoyoingBack_l: 6, YoyoingBack_r: 7,
    Falling_l: 8, Falling_r: 9, Climbing_n: 10, Climbing_u: 11, Climbing_d: 12,
};

const CMD = {    // eCommand_t
    GoLeft: 0, GoRight: 1, GoUp: 2, GoDown: 3, GoJump: 4, GoYoyo: 5,
    Count0: 6, // Count0..Count9 = 6..15
};

function isStandingState(s) {
    return s === TS.Standing_r || s === TS.Walking_r || s === TS.Standing_l || s === TS.Walking_l;
}

function enqueue(cmd) { G.commandQueue.push(cmd); }

// --- Movement scripts -------------------------------------------------------------------------

function TroggStanding(self, xco, yco, xvel, yvel, xmove, ymove) {
    let dofall = false, doclimb = false, douddebounce = false;
    let platformIndex = -1, ladderIndex = -1;

    xco += xmove;
    const nexty = PlatformFind(xco, yco, yco + 1);
    if (nexty !== yco) {
        dofall = true;
    } else {
        platformIndex = G.platformfind_platformIndex;
        if (ymove !== 0) {
            const lf = LadderFind(xco, yco, yco - ymove, true, true);
            if (lf.found) {
                doclimb = true;
                xco = lf.x;
                yco = lf.y;
                ladderIndex = lf.ladderIndex;
            } else if (ymove > 0) {
                dofall = true;
            }
        }
    }

    if (dofall) {
        xvel = xmove;
        yvel = (ymove > 0) ? 1.25 : 0;      // Initial jump velocity
        douddebounce = true;
    }

    yco = gmlRound(yco / G.frak_gravity) * G.frak_gravity;   // Fix rounding bug!

    return { x: xco, y: yco, xvel, yvel, dofall, doclimb, douddebounce, platformIndex, ladderIndex };
}

function TroggFalling(self, xco, yco, xvel, yvel, xmove, ymove) {
    let doclimb = false, dostand = false, dodie = false;
    let dolrdebounce = false, douddebounce = false;
    let platformIndex = -1, ladderIndex = -1;

    xco = Math.max(12, xco + xvel);
    xco = Math.min(G.level_width - 10, xco);
    if (yvel > -4) {            // Terminal velocity!!
        yvel -= G.frak_gravity; // Gravity!!
    }
    if (ymove !== 0 && yvel >= -1.25 - 0.025) {
        const lf = LadderFind(xco, yco, yco - yvel, false, true);
        if (lf.found) {
            doclimb = true;
            xco = lf.x;
            yco = lf.y;
            xvel = 0;
            yvel = 0;
            ladderIndex = lf.ladderIndex;
            dolrdebounce = true;
        }
    }
    if (!doclimb) {
        if (yvel >= 0) {
            yco -= yvel;
        } else {
            const nexty = PlatformFind(xco, yco, yco - yvel);
            if (nexty === yco - yvel) {
                yco = nexty;
            } else {
                platformIndex = G.platformfind_platformIndex;
                if (G.platform_isBouncy[platformIndex]) {
                    // Bouncy platform. (The GML used Trogg's velocity from before gravity here.)
                    yco = nexty;
                    yvel = -self.yvel + G.frak_gravity * 2;
                } else {
                    if (yvel <= -1.60) {
                        dodie = true;   // Trogg dies if he lands on a platform too fast!
                    }
                    dostand = true;
                    xvel = 0;
                    yvel = 0;
                    douddebounce = true;
                }
            }
        }
    }
    if (yco >= G.level_height) {
        xvel = 0;
        yco = G.level_height - 1;
        dodie = true;
    }

    yco = gmlRound(yco / G.frak_gravity) * G.frak_gravity;   // Fix rounding bug!

    return { x: xco, y: yco, xvel, yvel, doclimb, dostand, dodie, platformIndex, ladderIndex,
        dolrdebounce, douddebounce };
}

function TroggClimbing(self, xco, yco, xvel, yvel, xmove, ymove) {
    let dofall = false, dostand = false, douddebounce = false;
    let ladderIndex = -1, platformIndex = -1;

    xvel = 0;
    yvel = 0;

    if (ymove > 0) {
        const lf = LadderFind(xco, yco, yco - ymove, false, false);
        if (lf.found && Math.abs(yco - lf.y) > 0.001) {
            xco = lf.x;
            yco = lf.y;
            ladderIndex = lf.ladderIndex;
            if (xmove !== 0 && yco >= G.ladder_y[ladderIndex] + G.ladder_extrah[ladderIndex]) {
                xvel = xmove;
                dofall = true;
                ladderIndex = -1;
            }
        } else {
            PlatformFind(xco, yco - 1, yco + 2);
            if (G.platformfind_platformIndex !== -1) {
                // At the top of the ladder, so step off onto the platform
                yco -= ymove;
                dofall = true;
                douddebounce = (ymove !== 0);
            } else {
                // If there's no platform there, stop climbing
                yvel = 0;
                douddebounce = true;
            }
        }
    }

    if (ymove === 0) {
        const lf = LadderFind(xco, yco, yco + 2, false, false);
        if (lf.found && Math.abs(yco - lf.y) > 0.001) {
            xco = lf.x;
            ladderIndex = lf.ladderIndex;
            if (xmove !== 0 && yco >= G.ladder_y[ladderIndex] + G.ladder_extrah[ladderIndex]) {
                xvel = xmove;
                dofall = true;
                ladderIndex = -1;
            }
        } else if (xmove !== 0) {
            xvel = xmove;
            dofall = true;
        }
    }

    if (ymove < 0) {
        // Is Trogg climbing down onto a platform?
        PlatformFind(xco, yco, yco - ymove);
        platformIndex = G.platformfind_platformIndex;
        if (platformIndex !== -1) {
            dostand = true;
            douddebounce = true;
        } else {
            const lf = LadderFind(xco, yco, yco - ymove, false, false);
            if (lf.found && Math.abs(yco - lf.y) > 0.001) {
                xco = lf.x;
                yco = lf.y;
                ladderIndex = lf.ladderIndex;
                if (xmove !== 0 && yco >= G.ladder_y[ladderIndex] + G.ladder_extrah[ladderIndex]) {
                    xvel = xmove;
                    dofall = true;
                    ladderIndex = -1;
                }
            } else {
                xvel = 0;
                yvel = -1;      // Slightly different to climbing up
                yco -= ymove;
                dofall = true;
                douddebounce = (ymove !== 0);
            }
        }
    }

    yco = gmlRound(yco / G.frak_gravity) * G.frak_gravity;   // Fix rounding bug!

    return { x: xco, y: yco, xvel, yvel, dofall, dostand, douddebounce };
}

function YoyoCollide(self, xco, yco, dir) {
    let hascollided = false;
    const list = collisionCircleList(xco, yco - 3.5, 3.5, 'oMeanie');
    for (const inst of list) {
        if (inst.sprite_index === 'sScrubbly_Beeb' || inst.sprite_index === 'sPoglet_Beeb' ||
            inst.sprite_index === 'sHooter_Beeb') {
            if (!inst.meanie_isdead) {
                PlaySound('sfxSqueal');
                inst.meanie_velocity = 8 * sign(dir);
                inst.meanie_isdead = true;
            }
        } else {
            if (inst.sprite_index === 'sBalloon_Beeb') PlaySound('sfxPop');
            if (inst.sprite_index === 'sDagger_Beeb' || inst.sprite_index === 'sDaggerLR_Beeb' ||
                inst.sprite_index === 'sDaggerUD_Beeb') PlaySound('sfxDaggerHit');
            instance_destroy(inst);
        }
        hascollided = true;
    }

    if (!hascollided && self.trogg_carryingPlatform === -1 && !self.hasDroppedPlatform) {
        const p = PlatformFindMovable(xco, yco);
        if (p !== -1) {
            self.trogg_carryingPlatform = p;
            self.hasPickedUpPlatform = true;
            hascollided = true;
        }
    }
    return hascollided;
}

function UpdateKeyOverrides(self) {
    if (self.currentcount > 0) {
        if (--self.currentcount === 0) {
            self.leftkey = self.rightkey = self.upkey = self.downkey = self.yoyokey = false;
        }
    }
}

function StopKeyOverrides(self) {
    if (self.currentcount !== 0) {
        self.currentcount = 0;
        self.leftkey = self.rightkey = self.upkey = self.downkey = self.yoyokey = false;
    }
}

// --- Level checkpoints (GameMaker's game_save_buffer / game_load_buffer) ----------------------

function saveLevelState() {
    G.level_snapshot = structuredClone(Runtime.instances.filter(i => i.alive));
    G.level_saved = true;
}

function loadLevelState() {
    for (const i of Runtime.instances) i.alive = false;
    Runtime.instances = structuredClone(G.level_snapshot);
    const byId = {};
    for (const i of Runtime.instances) byId[i.id] = i;
    // Re-link the platform table to the restored instances
    for (let p = 0; p < G.platforms_num; p++) {
        const inst = byId[G.platform_linkedInstance[p].id];
        if (inst) {
            G.platform_linkedInstance[p] = inst;
            G.platform_x[p] = inst.x;
            G.platform_y[p] = inst.y;
        }
    }
    return instance_find('oTrogg');
}

// --- oTrogg -----------------------------------------------------------------------------------

const TROGG_SPRITES = {
    [TS.Standing_r]: 'sTrogg_sr_Beeb', [TS.Falling_r]: 'sTrogg_sr_Beeb',
    [TS.Standing_l]: 'sTrogg_sl_Beeb', [TS.Falling_l]: 'sTrogg_sl_Beeb',
    [TS.Walking_r]: 'sTrogg_wr_Beeb', [TS.Walking_l]: 'sTrogg_wl_Beeb',
    [TS.YoyoingOut_r]: 'sTrogg_yr_Beeb', [TS.YoyoingOut_l]: 'sTrogg_yl_Beeb',
    [TS.YoyoingBack_r]: 'sTrogg_yr_Beeb', [TS.YoyoingBack_l]: 'sTrogg_yl_Beeb',
    [TS.Climbing_n]: 'sTrogg_cn_Beeb', [TS.Climbing_u]: 'sTrogg_cu_Beeb', [TS.Climbing_d]: 'sTrogg_cd_Beeb',
};

function troggKeyDown(field) {
    return self => { StopKeyOverrides(self); self[field] = true; };
}
function troggKeyUp(field) {
    return self => { self[field] = false; };
}

defineObject('oTrogg', {
    create(self) {
        self.eTroggState = TS.Standing_r;
        self.leftkey = self.rightkey = self.upkey = self.downkey = self.yoyokey = false;
        self.yoyodir = 1;
        self.yoyolength = 0;
        self.yoyox = 0;
        self.yoyoy = 0;
        self.xvel = 0;
        self.yvel = 0;
        self.dead_timeout = 60;
        self.fallticks = 0;
        self.falldir = 0;
        self.climbtime = 0;
        self.updowndebounce = false;
        self.leftrightdebounce = false;
        self.yoyodebounce = false;

        self.dragtimer = 0;
        self.isDragging = false;
        self.ticksWhileDragging = 0;
        self.mightbeYoyo = false;
        self.last_gui_x = 0;
        self.last_gui_y = 0;
        self.start_x = 0;
        self.start_y = 0;
        self.lastseg = 0;

        self.current_platform_index = -1;
        self.lastplatform_x = 0;
        self.lastplatform_y = 0;

        self.hasPickedUpPlatform = false;
        self.hasDroppedPlatform = false;
        self.trogg_carryingPlatform = -1;

        G.doface = 0;
        G.isdead = false;
        G.hasWon = false;
        G.hasWonTimer = 0;
        G.forceyoyodown = false;
        G.trogg_x = self.x;
        G.trogg_y = self.y;
        G.mouseClicked = false;

        G.gp = {};      // gamepad edge-detection state (the GML used a set of global.gp_last_* flags)

        self.currentcount = 0;
        self.nextcount = 0;
        self.save_when_standing = false;
        self.tick_counter = 0;
        self.start_walking_counter = 0;
        self.start_climbing_counter = 0;

        G.fixup_platforms = false;
        G.next_levelIndex = G.current_levelIndex;
        G.next_difficulty_level = G.difficulty_level;

        if (instance_number('oPoglet') !== 0) {
            PlayMusic(MUSIC_ALITTLEBAGOFWEED);
        } else if (instance_number('oHooter') !== 0) {
            PlayMusic(MUSIC_THEMANWHOONCEWASI);
        } else {
            PlayMusic(MUSIC_FRAKTHEME);
        }
    },

    roomStart(self) {
        G.commandQueue = [];
        G.level_restarts = 0;
        G.level_saved = false;
        G.level_snapshot = null;
        G.restarting = false;
    },

    roomEnd(self) {
        G.commandQueue = [];
        StopMusic();
        audio_stop_all();
    },

    beginStep(self) {
        if (!G.isdead && !G.hasWon) self.tick_counter++;

        // Make the platform table consistent with the instances after a checkpoint restart
        if (G.fixup_platforms) {
            G.fixup_platforms = false;
            instance_destroy_all('oBalloon');
            instance_destroy_all('oDagger');
            G.numKeysFound = G.numKeys - instance_number('oKey');
            G.numGemsFound = G.numGems - instance_number('oGem');
            G.numKeysConfirmed = G.numKeysFound;
            for (let p = 0; p < G.platforms_num; p++) {
                G.platform_x[p] = G.platform_linkedInstance[p].x;
                G.platform_y[p] = G.platform_linkedInstance[p].y;
            }
        }
    },

    keyboard: {
        [vk_space]: troggKeyDown('yoyokey'),
        [vk_left]: troggKeyDown('leftkey'),
        [vk_up]: troggKeyDown('upkey'),
        [vk_right]: troggKeyDown('rightkey'),
        [vk_down]: troggKeyDown('downkey'),
        75: troggKeyDown('downkey'),    // K
        79: troggKeyDown('upkey'),      // O
        80: troggKeyDown('yoyokey'),    // P
        88: troggKeyDown('rightkey'),   // X
        90: troggKeyDown('leftkey'),    // Z
    },

    keyRelease: {
        [vk_space]: troggKeyUp('yoyokey'),
        [vk_left]: troggKeyUp('leftkey'),
        [vk_up]: troggKeyUp('upkey'),
        [vk_right]: troggKeyUp('rightkey'),
        [vk_down]: troggKeyUp('downkey'),
        75: troggKeyUp('downkey'),
        78: troggKeyUp('downkey'),
        79: troggKeyUp('upkey'),
        80: troggKeyUp('yoyokey'),
        88: troggKeyUp('rightkey'),
        90: troggKeyUp('leftkey'),
    },

    keyPress: (() => {
        const k = {
            [vk_escape]() { StopMusic(); audio_stop_all(); room_goto('_StartRoom'); },
            [vk_backspace]() { StopMusic(); audio_stop_all(); room_goto('roomTopMenu'); },
            68() { enqueue(CMD.GoDown); },     // D = DOWN
            74() { enqueue(CMD.GoJump); },     // J = JUMP
            76() { enqueue(CMD.GoLeft); },     // L = LEFT
            82() { enqueue(CMD.GoRight); },    // R = RIGHT
            85() { enqueue(CMD.GoUp); },       // U = UP
            89() { enqueue(CMD.GoYoyo); },     // Y = YOYO
        };
        for (let d = 0; d < 10; d++) k[48 + d] = () => enqueue(CMD.Count0 + d);
        return k;
    })(),

    step(self) { troggStep(self); },

    endStep(self) { troggEndStep(self); },

    collision: {
        oBulb(self, other) {
            if (!G.hasWon) {
                PlaySound('sfxChing');
                instance_destroy(other);
            }
        },
        oGem(self, other) {
            if (!G.hasWon) {
                PlaySound('sfxChing');
                instance_destroy(other);
                G.numGemsFound++;
            }
        },
        oKey(self, other) { troggCollectKey(self, other); },
        oMeanie(self, other) {
            if (!G.hasWon) G.isdead = true;
            StopMusic();
            audio_stop_all();
        },
    },

    draw(self) { troggDraw(self); },
});

function troggCollectKey(self, other) {
    if (G.hasWon) return;
    instance_destroy(other);
    G.numKeysFound++;
    if (G.numKeysFound >= G.numKeys) {
        G.hasWon = true;
        G.hasWonTimer = 0;
        audio_stop_all();
        PlayMusic(MUSIC_VICTORYTHEME);

        const gemFlag = (G.numGemsFound >= G.numGems);
        FrakSave_UpdateLevel(G.current_levelIndex, G.difficulty_level, self.tick_counter, G.level_restarts, gemFlag);

        // Default next play level to the current play level
        G.next_levelIndex = G.current_levelIndex;
        G.next_difficulty_level = G.difficulty_level;

        if (G.current_levelIndex !== 0) {
            for (let diff = G.difficulty_level; diff < NUM_DIFFICULTIES; diff++) {
                // Select the next level along for which the player hasn't got a gold medal
                for (let levoff = 1; levoff < 55; levoff++) {
                    let lev = G.current_levelIndex + levoff;
                    if (lev >= 55) lev -= 54;   // Loop round to start of levels (but not to the training level!)
                    if (G.GameState['Restarts_' + lev + '_' + diff] !== 0) {
                        G.next_levelIndex = lev;
                        G.next_difficulty_level = diff;
                        break;
                    }
                }
                if (G.next_levelIndex !== G.current_levelIndex || G.next_difficulty_level !== G.difficulty_level) break;
            }
        }
    } else {
        self.save_when_standing = true;
    }
    PlaySound('sfxChing');      // Needs to be after music has been stopped!
}

function troggMouseAndGamepad(self) {
    if (Input.mouseHeld[2]) performKeyPress(self, vk_backspace);
    if (Input.mouseHeld[1]) performKeyPress(self, vk_escape);
    if (Input.wheelUp) enqueue(CMD.GoUp);
    if (Input.wheelDown) enqueue(CMD.GoDown);

    // Touch / mouse drag controls: drag in a direction to move, hold still to yoyo
    const mx = Input.mx, my = Input.my;
    if (Input.mouseHeld[0]) {
        if (!self.isDragging) {
            self.isDragging = true;
            self.mightbeYoyo = true;
            self.ticksWhileDragging = 0;
            self.start_x = mx;
            self.start_y = my;
        } else {
            const xdiff = mx - self.last_gui_x;
            const ydiff = my - self.last_gui_y;
            if (xdiff !== 0 || ydiff !== 0) self.mightbeYoyo = false;
            if (++self.ticksWhileDragging >= 15 && self.mightbeYoyo) {
                G.forceyoyodown = true;
                self.mightbeYoyo = false;
            }
            if (!G.forceyoyodown && (xdiff !== 0 || ydiff !== 0)) {
                const ax = Math.abs(xdiff), ay = Math.abs(ydiff);
                let seg;
                if (ax >= ay) {
                    seg = (ax * 577350 < ay * 1000000) ? 1 : 0;     // tan(30)
                } else {
                    seg = (ay * 363970 < ax * 1000000) ? 1 : 2;     // tan(20)
                }
                if (xdiff < 0) seg = 4 - seg;
                if (ydiff < 0) seg = (8 - seg) & 7;
                self.leftkey = (seg >= 3 && seg <= 5);
                self.rightkey = (seg === 0 || seg === 1 || seg === 7);
                self.upkey = (seg >= 5 && seg <= 7);
                self.downkey = (seg >= 1 && seg <= 3);
                self.lastseg = seg;
            }
        }
        self.last_gui_x = mx;
        self.last_gui_y = my;
        self.dragtimer = 6;     // continue moving in same direction for this many ticks!
    } else {
        if (self.isDragging) {
            G.yoyotriggered = false;
            G.forceyoyodown = false;
            self.isDragging = false;
        }
        if (self.dragtimer > 0 && --self.dragtimer === 0) {
            self.leftkey = self.rightkey = self.upkey = self.downkey = false;
        }
    }

    if (gamepad_is_connected()) {
        const gp = G.gp;
        const haxis = gamepad_axis(0), vaxis = gamepad_axis(1);
        const spd = Math.hypot(haxis, vaxis);
        let lrhalf, lrsens, udhalf, udsens;
        switch (self.eTroggState) {
            case TS.Climbing_d: case TS.Climbing_n: case TS.Climbing_u:
                lrhalf = 25; lrsens = 0.85; udhalf = 45; udsens = 0.50; break;
            case TS.Falling_l: case TS.Falling_r:
                lrhalf = 60; lrsens = 0.50; udhalf = 60; udsens = 0.50; break;
            case TS.Standing_l: case TS.Standing_r:
                lrhalf = 50; lrsens = 0.75; udhalf = 50; udsens = 0.75; break;
            default:
                lrhalf = 60; lrsens = 0.50; udhalf = 30; udsens = 0.75; break;
        }

        let last = gp.lr_moving;
        gp.lr_moving = (spd >= lrsens);
        if (!gp.lr_moving && last) { self.leftkey = false; self.rightkey = false; }
        if (gp.lr_moving && !last) { gp.axis_left = false; gp.axis_right = false; }

        last = gp.ud_moving;
        gp.ud_moving = (spd >= udsens);
        if (!gp.ud_moving && last) { self.upkey = false; self.downkey = false; }
        if (gp.ud_moving && !last) { gp.axis_up = false; gp.axis_down = false; }

        const ang = pointDirection(haxis, vaxis);
        const edge = (key, now, field) => {
            const was = gp[key];
            gp[key] = now;
            if (now && !was) self[field] = true;
            if (!now && was) self[field] = false;
        };
        if (gp.ud_moving) {
            edge('axis_up', ang >= 90 - udhalf && ang <= 90 + udhalf, 'upkey');
            edge('axis_down', ang >= 270 - udhalf && ang <= 270 + udhalf, 'downkey');
        }
        if (gp.lr_moving) {
            edge('axis_left', ang >= 180 - lrhalf && ang <= 180 + lrhalf, 'leftkey');
            edge('axis_right', ang <= lrhalf || ang >= 360 - lrhalf, 'rightkey');
        }
        edge('yoyo', gamepad_button_check(gp_face1), 'yoyokey');
        edge('left', gamepad_button_check(gp_padl), 'leftkey');
        edge('right', gamepad_button_check(gp_padr), 'rightkey');
        edge('up', gamepad_button_check(gp_padu), 'upkey');
        edge('down', gamepad_button_check(gp_padd), 'downkey');

        const press = (key, button) => {
            const was = gp[key];
            gp[key] = gamepad_button_check(button);
            return gp[key] && !was;
        };
        if (press('x', gp_face3)) enqueue(CMD.GoDown);
        if (press('y', gp_face4)) enqueue(CMD.GoUp);
        if (press('shoulderleft', gp_shoulderl)) enqueue(CMD.GoLeft);
        if (press('shoulderright', gp_shoulderr)) enqueue(CMD.GoRight);
        if (press('shoulderleftbut', gp_shoulderlb)) { enqueue(CMD.Count0 + 2); enqueue(CMD.GoDown); }
        if (press('shoulderrightbut', gp_shoulderrb)) { enqueue(CMD.Count0 + 2); enqueue(CMD.GoUp); }
        if (press('jump', gp_face2)) enqueue(CMD.GoJump);
        if (gamepad_button_check(gp_start)) performKeyPress(self, vk_escape);
        if (gamepad_button_check(gp_select)) performKeyPress(self, vk_backspace);
    }
}

function troggProcessCommandQueue(self, flags) {
    const S = self.eTroggState;
    // We only handle keydown commands (e.g. typed shortcuts) when no key is held down
    const keyispressed = self.leftkey || self.rightkey || self.upkey || self.downkey || self.yoyokey;
    if (keyispressed || G.commandQueue.length === 0) return;

    let command = G.commandQueue[0];
    if ((command === CMD.GoLeft || command === CMD.GoRight) && (S === TS.Falling_l || S === TS.Falling_r)) {
        return;     // Don't dequeue L(eft) and R(ight) when Trogg is falling
    }
    command = G.commandQueue.shift();

    if (command >= CMD.Count0) {
        self.nextcount = self.nextcount * 10 + (command - CMD.Count0);
        return;
    }

    const standing = isStandingState(S);
    switch (command) {
        case CMD.GoLeft:
            if (S === TS.Standing_r) {
                self.eTroggState = TS.Standing_l;
            } else if (S === TS.Walking_r) {
                self.eTroggState = TS.Walking_l;
                self.start_walking_counter = self.tick_counter;
            } else {
                if (S !== TS.Walking_l) self.start_walking_counter = self.tick_counter;
                self.currentcount = self.nextcount ? self.nextcount : 1000;
                self.leftkey = true;
                flags.isOverrideFirstTick = true;
            }
            self.nextcount = 0;
            break;

        case CMD.GoRight:
            if (S === TS.Standing_l) {
                self.eTroggState = TS.Standing_r;
            } else if (S === TS.Walking_l) {
                self.eTroggState = TS.Walking_r;
                self.start_walking_counter = self.tick_counter;
            } else {
                if (S !== TS.Walking_r) self.start_walking_counter = self.tick_counter;
                self.currentcount = self.nextcount ? self.nextcount : 1000000;
                self.rightkey = true;
                flags.isOverrideFirstTick = true;
            }
            self.nextcount = 0;
            break;

        case CMD.GoJump:
            if (S === TS.Standing_l || S === TS.Walking_l) {
                self.upkey = !G.yFlip;
                self.downkey = G.yFlip;
                self.leftkey = true;
                flags.isJump = true;
            } else if (S === TS.Standing_r || S === TS.Walking_r) {
                self.upkey = !G.yFlip;
                self.downkey = G.yFlip;
                self.rightkey = true;
                flags.isJump = true;
            }
            self.nextcount = 0;
            flags.isOverrideFirstTick = true;
            break;

        case CMD.GoUp:
            if (standing) {
                if (!G.yFlip) {
                    self.upkey = true;
                    self.leftkey = false;
                    self.rightkey = false;
                    flags.isJump = true;
                } else {
                    self.currentcount = 2;
                    self.upkey = true;
                }
            } else {
                self.currentcount = self.nextcount ? self.nextcount : 1000000;
                self.upkey = true;
            }
            self.nextcount = 0;
            flags.isOverrideFirstTick = true;
            break;

        case CMD.GoDown:
            if (standing) {
                if (G.yFlip) {
                    self.downkey = true;
                    self.leftkey = false;
                    self.rightkey = false;
                    flags.isJump = true;
                } else {
                    self.currentcount = 3;
                    self.downkey = true;
                }
            } else {
                self.currentcount = self.nextcount ? self.nextcount : 1000000;
                self.downkey = true;
            }
            self.nextcount = 0;
            flags.isOverrideFirstTick = true;
            break;

        case CMD.GoYoyo:
            self.currentcount = self.nextcount ? self.nextcount : 1000000;
            self.yoyokey = true;
            self.nextcount = 0;
            flags.isOverrideFirstTick = true;
            break;
    }
}

function troggSetWalking(self, xmove) {
    if (xmove < 0 && self.eTroggState !== TS.Walking_l) {
        self.eTroggState = TS.Walking_l;
        self.start_walking_counter = self.tick_counter;
    }
    if (xmove > 0 && self.eTroggState !== TS.Walking_r) {
        self.eTroggState = TS.Walking_r;
        self.start_walking_counter = self.tick_counter;
    }
}

function troggStartClimbing(self, ymove) {
    if (ymove > 0) {
        self.eTroggState = TS.Climbing_u;
        self.start_climbing_counter = self.tick_counter;
    } else if (ymove < 0) {
        self.eTroggState = TS.Climbing_d;
        self.start_climbing_counter = self.tick_counter;
    } else {
        self.eTroggState = TS.Climbing_n;
    }
    self.climbtime = 0;
}

function troggCarry(self) {
    if (self.trogg_carryingPlatform !== -1) {
        PlatformMoveTo(self.trogg_carryingPlatform, self.x, self.y - 11 - 3, 0);
    }
}

function troggStep(self) {
    // Ride along with the platform Trogg was standing on
    if (self.current_platform_index !== -1) {
        self.x += G.platform_x[self.current_platform_index] - self.lastplatform_x;
        self.y += G.platform_y[self.current_platform_index] - self.lastplatform_y;
        self.current_platform_index = -1;
    }

    troggMouseAndGamepad(self);
    UpdateKeyOverrides(self);

    const flags = { isJump: false, isOverrideFirstTick: false };
    troggProcessCommandQueue(self, flags);

    let xmove, ymove, doyoyo;
    if (self.updowndebounce) {
        ymove = 0;
        if (!self.upkey && !self.downkey) self.updowndebounce = false;
    } else {
        ymove = (self.upkey ? 1 : 0) - (self.downkey ? 1 : 0);
        if (G.yFlip) ymove = -ymove;
    }
    if (self.leftrightdebounce) {
        xmove = 0;
        if (!self.rightkey && !self.leftkey) self.leftrightdebounce = false;
    } else {
        xmove = (self.rightkey ? 1 : 0) - (self.leftkey ? 1 : 0);
    }
    if (self.yoyodebounce) {
        doyoyo = false;
        if (!self.yoyokey) self.yoyodebounce = false;
    } else {
        doyoyo = self.yoyokey || G.forceyoyodown;
    }

    if (G.isdead) {
        // Handled in End Step
    } else if (G.hasWon) {
        if (G.level_restarts < 3) {
            self.eTroggState = TS.YoyoingOut_r;
            self.x = G.trogg_x;
            self.y = G.trogg_y;
        } else {
            self.eTroggState = TS.Walking_r;
            self.x++;
        }
        G.hasWonTimer++;
        if (G.hasWonTimer >= 60 * (7 - Math.min(G.level_restarts, 3))) {
            G.hasWon = false;
            const nextroom = GetLevelInfo(G.next_levelIndex, 0);
            if (nextroom !== 0) {
                G.current_levelIndex = G.next_levelIndex;
                G.replay_levelIndex = G.next_levelIndex;
                G.difficulty_level = G.next_difficulty_level;
                FrakSave_UpdateOptions();
                room_goto(nextroom);
            } else {
                room_restart();
            }
        }
    } else {
        troggMove(self, xmove, ymove, doyoyo, flags);
    }

    if (self.current_platform_index !== -1 && !G.isdead) {
        self.lastplatform_x = G.platform_x[self.current_platform_index];
        self.lastplatform_y = G.platform_y[self.current_platform_index];
    }

    const S = self.eTroggState;
    if ((S === TS.Walking_l || S === TS.Walking_r) && ((self.tick_counter - self.start_walking_counter) & 7) === 0 && !G.hasWon) {
        PlaySound('sfxThud');
    }
    if ((S === TS.Climbing_u || S === TS.Climbing_d) && ((self.tick_counter - self.start_climbing_counter) & 15) === 0 && !G.hasWon) {
        PlaySound('sfxThud');
    }

    self.sprite_index = TROGG_SPRITES[self.eTroggState];
    self.image_speed = G.isdead ? 0 : 1;

    if (!G.hasWon) {
        G.trogg_x = self.x;
        G.trogg_y = self.y;
        if (G.is_vertical_scroll) {
            let scroll = self.y - (G.windowHeight >> 1);
            scroll = Math.max(0, scroll);
            scroll = Math.min(G.level_height - G.windowHeight, scroll);
            G.yScroll = scroll;
        } else {
            let scroll = self.x - (G.windowWidth >> 1);
            scroll = Math.max(0, scroll);
            scroll = Math.min(G.level_width - G.windowWidth, scroll);
            G.xScroll = scroll;
        }
    }
}

function troggMove(self, xmove, ymove, doyoyo, flags) {
    let isJump = flags.isJump;
    const isOverrideFirstTick = flags.isOverrideFirstTick;

    switch (self.eTroggState) {
        case TS.Standing_r:
        case TS.Walking_r:
        case TS.Standing_l:
        case TS.Walking_l: {
            const r = TroggStanding(self, self.x, self.y, self.xvel, self.yvel, xmove, ymove);
            let dofall = r.dofall;
            let doclimb = r.doclimb;
            if (self.currentcount > 0 && !isOverrideFirstTick && (dofall || (doclimb && !isJump))) {
                // A typed command (e.g. "3L") never walks Trogg off a ledge or onto a ladder
                self.currentcount = 0;
                self.leftkey = self.rightkey = self.upkey = self.downkey = false;
                dofall = false;
                doclimb = false;
                self.xvel = 0;
                self.yvel = 0;
            } else {
                self.x = r.x;
                self.y = r.y;
                self.xvel = r.xvel;
                self.yvel = r.yvel;
            }

            if (dofall) {
                if (isJump) {
                    isJump = false;
                    self.upkey = self.downkey = self.leftkey = self.rightkey = false;
                }
                StopKeyOverrides(self);
                const S = self.eTroggState;
                self.eTroggState = (S === TS.Standing_r || S === TS.Walking_r) ? TS.Falling_r : TS.Falling_l;
            } else if (doclimb) {
                StopKeyOverrides(self);
                if (isJump && isOverrideFirstTick) {
                    self.upkey = self.downkey = self.leftkey = self.rightkey = false;
                }
                troggStartClimbing(self, ymove);
            } else {
                self.current_platform_index = r.platformIndex;

                if (doyoyo) {
                    const S = self.eTroggState;
                    if ((S === TS.Standing_r || S === TS.Walking_r || G.doface > 0) && G.doface !== -1) {
                        self.eTroggState = TS.YoyoingOut_r;
                        self.yoyodir = 1;
                    } else {
                        self.eTroggState = TS.YoyoingOut_l;
                        self.yoyodir = -1;
                    }
                    self.yoyolength = 1;
                    G.doface = 0;
                    self.hasPickedUpPlatform = false;
                    self.hasDroppedPlatform = false;

                    self.yoyox = self.x + (self.yoyolength + 12) * self.yoyodir;
                    self.yoyoy = self.y - 11;
                    const collided = YoyoCollide(self, self.yoyox, self.yoyoy, self.yoyodir);
                    if (self.trogg_carryingPlatform !== -1) {
                        // (The state has just been set to Yoyoing, so this is always 0 - kept as in the GML)
                        let dir = 0;
                        if (self.eTroggState === TS.Walking_r) dir = 1;
                        if (self.eTroggState === TS.Walking_l) dir = -1;
                        PlatformMoveTo(self.trogg_carryingPlatform, self.yoyox - 3 * dir, self.yoyoy - 3, dir);
                    }
                    if (collided) {
                        self.yoyodebounce = true;
                        self.eTroggState = (self.eTroggState === TS.YoyoingOut_r) ? TS.YoyoingBack_r : TS.YoyoingBack_l;
                    }
                } else {
                    troggSetWalking(self, xmove);
                    if (xmove === 0) {
                        if (self.eTroggState === TS.Walking_r) self.eTroggState = TS.Standing_r;
                        if (self.eTroggState === TS.Walking_l) self.eTroggState = TS.Standing_l;
                    }
                }
            }

            troggCarry(self);
            self.yoyolength = 0;
            break;
        }

        case TS.Falling_l:
        case TS.Falling_r: {
            const r = TroggFalling(self, self.x, self.y, self.xvel, self.yvel, xmove, ymove);
            self.x = r.x;
            self.y = r.y;
            self.xvel = r.xvel;
            self.yvel = r.yvel;
            if (r.dolrdebounce && self.currentcount === 0) self.leftrightdebounce = true;
            if (r.douddebounce && self.currentcount === 0) self.updowndebounce = true;

            troggCarry(self);

            if (r.dodie) {
                G.isdead = true;    // Trogg dies if he hits the bottom of the play area
                StopMusic();
                audio_stop_all();
            }

            if (r.dostand) {
                StopKeyOverrides(self);
                self.eTroggState = (self.eTroggState === TS.Falling_r) ? TS.Standing_r : TS.Standing_l;
                self.y = Math.ceil(self.y);     // Fix rounding bug!
            } else if (r.doclimb) {
                StopKeyOverrides(self);
                troggStartClimbing(self, ymove);
                self.y = gmlRound(self.y);      // Fix rounding bug!
            }
            break;
        }

        case TS.YoyoingOut_r:
        case TS.YoyoingOut_l: {
            const r = TroggStanding(self, self.x, self.y, 0, 0, 0, 0);
            self.current_platform_index = r.platformIndex;

            let dochangestate = false;
            if (doyoyo && self.yoyolength < 80) {
                self.yoyolength += 1.3;
            } else {
                dochangestate = true;
            }

            self.yoyox = self.x + (self.yoyolength + 12) * self.yoyodir;
            self.yoyoy = self.y - 11;
            const collided = YoyoCollide(self, self.yoyox, self.yoyoy, self.yoyodir);

            if (self.trogg_carryingPlatform !== -1) {
                const dir = (self.eTroggState === TS.YoyoingOut_r) ? 1 : -1;
                PlatformMoveTo(self.trogg_carryingPlatform, self.yoyox - 3 * dir, self.yoyoy - 3, dir);
            }

            if (dochangestate || collided || self.yoyox < 2) {
                if (dochangestate && self.trogg_carryingPlatform !== -1) {
                    // Force dropped platforms' x & y to be on integer boundaries
                    const p = self.trogg_carryingPlatform;
                    const px = gmlRound(G.platform_x[p]);
                    const py = gmlRound(G.platform_y[p]);
                    G.platform_x[p] = px;
                    G.platform_y[p] = py;
                    G.platform_linkedInstance[p].x = px;
                    G.platform_linkedInstance[p].y = py;
                    self.trogg_carryingPlatform = -1;
                    self.hasDroppedPlatform = true;
                }
                self.yoyodebounce = true;
                self.eTroggState = (self.eTroggState === TS.YoyoingOut_r) ? TS.YoyoingBack_r : TS.YoyoingBack_l;
            }
            break;
        }

        case TS.YoyoingBack_r:
        case TS.YoyoingBack_l: {
            const r = TroggStanding(self, self.x, self.y, 0, 0, 0, 0);
            self.current_platform_index = r.platformIndex;

            if (self.yoyolength > 0) self.yoyolength -= 1.3;
            if (self.yoyolength <= 0) {
                self.eTroggState = (self.eTroggState === TS.YoyoingBack_r) ? TS.Standing_r : TS.Standing_l;
                self.yoyokey = false;
            } else {
                self.yoyox = self.x + (self.yoyolength + 12) * self.yoyodir;
                self.yoyoy = self.y - 11;
                YoyoCollide(self, self.yoyox, self.yoyoy, self.yoyodir);
                if (self.trogg_carryingPlatform !== -1) {
                    const dir = (self.eTroggState === TS.YoyoingBack_r) ? 1 : -1;
                    PlatformMoveTo(self.trogg_carryingPlatform, self.yoyox - 3 * dir, Math.floor(self.yoyoy - 3), dir);
                }
            }
            break;
        }

        case TS.Climbing_u:
        case TS.Climbing_n:
        case TS.Climbing_d: {
            self.climbtime++;
            const r = TroggClimbing(self, self.x, self.y, self.xvel, self.yvel, xmove, ymove);
            let dofall, dostand;
            if (self.currentcount > 0 && r.dofall && !r.dostand && xmove === 0 && !r.douddebounce) {
                StopKeyOverrides(self);
                dofall = false;
                dostand = false;
                self.xvel = 0;
                self.yvel = 0;
            } else if (self.currentcount > 0 && xmove === 0 && ymove !== 0 && r.y === self.y && !r.dostand) {
                StopKeyOverrides(self);
                dofall = false;
                dostand = false;
                self.xvel = 0;
                self.yvel = 0;
            } else {
                dofall = r.dofall;
                dostand = r.dostand;
                self.x = r.x;
                self.y = r.y;
                self.xvel = r.xvel;
                self.yvel = r.yvel;
                if (r.douddebounce && self.currentcount === 0) self.updowndebounce = true;
            }

            troggCarry(self);

            if (dofall) {
                StopKeyOverrides(self);
                self.eTroggState = (self.xvel >= 0) ? TS.Falling_r : TS.Falling_l;
            } else if (dostand) {
                StopKeyOverrides(self);
                self.eTroggState = TS.Standing_r;
            } else if (ymove === 0) {
                self.eTroggState = TS.Climbing_n;
            } else if (ymove > 0) {
                if (self.eTroggState !== TS.Climbing_u) {
                    self.eTroggState = TS.Climbing_u;
                    self.start_climbing_counter = self.tick_counter;
                }
            } else if (self.eTroggState !== TS.Climbing_d) {
                self.eTroggState = TS.Climbing_d;
                self.start_climbing_counter = self.tick_counter;
            }
            break;
        }
    }
}

function troggEndStep(self) {
    if (!G.isdead && isStandingState(self.eTroggState)) {
        G.numKeysConfirmed = G.numKeysFound;
    }

    // Checkpoint: save the level state once Trogg is standing still on solid ground after
    // collecting a key, so that dying restarts from here
    if (self.save_when_standing && !G.isdead && isStandingState(self.eTroggState) &&
        self.current_platform_index !== -1 && !G.platform_is_moving[self.current_platform_index]) {
        self.save_when_standing = false;
        const keys = [self.leftkey, self.rightkey, self.upkey, self.downkey, self.yoyokey];
        self.leftkey = self.rightkey = self.upkey = self.downkey = self.yoyokey = false;
        saveLevelState();
        [self.leftkey, self.rightkey, self.upkey, self.downkey, self.yoyokey] = keys;
    }

    if (G.isdead) {
        if (self.dead_timeout > 0) self.dead_timeout--;
        if (self.dead_timeout === 0) {
            if (!G.level_saved) {
                room_restart();
            } else {
                G.level_restarts++;
                const t = loadLevelState();
                G.commandQueue = [];
                G.forceyoyodown = false;
                G.isdead = false;
                if (t) {
                    t.dead_timeout = 60;
                    t.save_when_standing = false;
                }
                G.numKeysFound = G.numKeysConfirmed;
                G.fixup_platforms = true;
                StopMusic();
                audio_stop_all();
                PlayMusic(G.music_currentIndex);
            }
        }
    }
}

function troggDraw(self) {
    // Medal indicator in the corner
    let xco = G.windowWidth - 8;
    let yco = G.windowHeight - 1;
    if (G.is_vertical_scroll) yco += G.yScroll; else xco += G.xScroll;
    const yflip = G.yFlip;
    if (yflip) {
        G.yFlip = false;
        yco = (G.windowHeight - yco) + 13;
    }
    const medal = ['sRating_1_Beeb', 'sRating_2_Beeb', 'sRating_3_Beeb'][G.level_restarts] || 'sRating_Tick_Beeb';
    SpriteDraw(medal, 0, xco, yco);
    G.yFlip = yflip;

    if (G.hasWon) {
        xco = G.windowWidth / 2;
        yco = G.windowHeight / 2 - 40;
        if (G.level_restarts < 3) yco -= 20;
        if (G.is_vertical_scroll) yco += G.yScroll; else xco += G.xScroll;
        const centred = (msg, y) => TextDraw(xco - msg.length * 8 / 2, y, msg, c_black);
        centred("We've done it!", yco);
        yco += 16;
        TextDraw(xco - 8 * 8 / 2, yco, CounterToTime(self.tick_counter, true), c_black);
        yco += 16;
        if (G.numGems > 0 && G.numGemsFound >= G.numGems) {
            centred('You collected all the gems!', yco);
            yco += 16;
        }
        yco += 32;

        const t = G.hasWonTimer;
        const medals = [
            ['!!! Gold Medal !!!', 4, 2, 'sRating_1_Beeb'],
            ['!!! Silver Medal !!!', 8, 4, 'sRating_2_Beeb'],
            ['!!! Bronze Medal !!!', 16, 8, 'sRating_3_Beeb'],
        ];
        const m = medals[G.level_restarts];
        if (m) {
            if (t >= 60 * 3 || (t & m[1])) {
                centred(m[0], yco);
                yco += 32;
            }
            if (t >= 60 || (t & m[2])) {
                SpriteDraw(m[3], 0, self.x + 21, self.y - 23);
                SpriteDraw('sTrophyStand_Beeb', 0, self.x + 21, self.y - 23);
            }
        }

        if (t >= 60 * 4) {
            centred('Next level: ' + GetLevelInfo(G.next_levelIndex, 1), yco);
            yco += 24;
            if (G.next_difficulty_level !== G.difficulty_level) {
                centred('Difficulty = ' + GetDifficultyName(G.next_difficulty_level), yco);
                yco += 16;
            }
        }
    } else {
        xco = 4;
        yco = 2;
        if (G.is_vertical_scroll) yco += G.yScroll; else xco += G.xScroll;
        TextDraw(xco, yco, CounterToTime(self.tick_counter, false), c_black);

        // Black borders at the edges of the play area
        if (G.is_vertical_scroll) {
            yco = G.yScroll;
            const len = G.windowWidth;
            DrawLineScaled(-2, yco - 1, -2, yco + G.windowHeight + 1, 1, c_black);
            DrawLineScaled(len + 2, yco - 1, len + 2, yco + G.windowHeight + 1, 1, c_black);
        } else {
            xco = G.xScroll;
            const len = G.windowHeight;
            DrawLineScaled(xco - 1, -2, xco + G.windowWidth + 1, -2, 1, c_black);
            DrawLineScaled(xco - 1, len + 2, xco + G.windowWidth + 1, len + 2, 1, c_black);
        }
    }

    if (self.yoyolength !== 0) {
        const frame = ((self.yoyolength * self.yoyodir) >> 3) & 3;
        SpriteDraw('sYoyo_Beeb', frame, self.yoyox, self.yoyoy);
        DrawLineScaled(self.yoyox, self.yoyoy - 0.5, self.yoyox - self.yoyolength * self.yoyodir, self.yoyoy - 0.5, 1, c_black);
    }

    TroggDraw(self.sprite_index, self.image_index, self.x, self.y);

    if (G.isdead) {
        SpriteDraw('sFrak_Beeb', 0, self.x + 12, self.y - 26);
    }
}

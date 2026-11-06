// Frak! HTML5 - game objects (everything except Trogg)
//
// Each defineObject() below corresponds to a GameMaker object of the same name; parents and
// default property values come from js/data/objects.js (generated from the .yy files).
'use strict';

// --- Room controllers -------------------------------------------------------------------------

defineObject('oBaseRoom', {
    create(self) {
        G.xScroll = 0;
        G.yScroll = 0;
        G.level_width = Runtime.room.w;
        G.level_height = Runtime.room.h;
        G.is_in_space = !!self.is_in_space;
        screenUpdateSize();
        ResizeScreen(Display.w, Display.h);
    },
    step(self) {
        screenUpdateSize();
        if (Display.w !== G.lastResizeW || Display.h !== G.lastResizeH) {
            ResizeScreen(Display.w, Display.h);
        }
        StepMusic();
    },
});

defineObject('oFrontEndRoom', {
    create(self) {
        inherited(self, 'oFrontEndRoom', 'create');
        const mus = [MUSIC_INTROSCREEN, MUSIC_SELECTSCREEN, MUSIC_LEVELSCREEN][self.RoomType] || MUSIC_INTROSCREEN;
        if (G.music_currentIndex !== mus) {
            StopMusic();
            PlayMusic(mus);
        }
    },
});

// Difficulty settings: [balloon_time, dagger_time, balloon_pause, dagger_pause,
//                       balloon_velocity, dagger_velocity, balloon_spread, dagger_spread, yFlip]
const DIFFICULTY_SETTINGS = {
    1: [180, 220, 60, 60, 1.2, 1.0, 270, 270, false],     // Easy
    2: [120, 132, 55, 55, 1.3, 1.1, 280, 280, false],     // Hard
    3: [120, 132, 55, 55, 1.3, 1.1, 280, 280, true],      // Hard (flipped)
    4: [90, 110, 50, 50, 1.4, 1.2, 290, 290, false],      // Harder
    5: [90, 110, 50, 50, 1.4, 1.2, 290, 290, true],       // Harder (flipped)
    6: [60, 75, 45, 45, 1.5, 1.3, 300, 300, false],       // Insane
};

defineObject('oRoom', {
    create(self) {
        G.moving_enabled = !!self.moving_enabled;
        self.do_rebuild_maps = true;
        inherited(self, 'oRoom', 'create');

        G.numKeysFound = 0;         // number of keys collided with
        G.numKeysConfirmed = 0;     // number of keys confirmed collected
        G.numGemsFound = 0;         // number of gems collided with

        const d = DIFFICULTY_SETTINGS[G.difficulty_level] || [0, 0, 0, 0, 0, 0, 0, 0, false];
        [G.balloon_time, G.dagger_time, G.balloon_pause, G.dagger_pause,
            G.balloon_velocity, G.dagger_velocity, G.balloon_spread, G.dagger_spread, G.yFlip] = d;

        if (G.is_vertical_scroll) {
            G.balloon_spread *= 1.25;   // widen balloon spread
            G.dagger_spread *= 1.15;    // widen dagger spread
        }

        self.balloon_timer = 0;
        self.dagger_timer = 0;
        G.frak_gravity = self.frak_gravity;
        audio_stop_all();
    },

    beginStep(self) {
        if (self.do_rebuild_maps) {
            self.do_rebuild_maps = false;
            RoomCreateFinish();
        }
    },

    step(self) {
        inherited(self, 'oRoom', 'step');
        if (G.isdead) return;

        if (gGT(G.balloon_time, 0)) {
            if (gGT(self.balloon_timer, 0)) self.balloon_timer--;
            if (gLE(self.balloon_timer, 0)) {
                const midx = G.trogg_x;
                const bx = irandom_range(midx - G.balloon_spread / 2, midx + G.balloon_spread / 2);
                instance_create('oBalloon', Math.floor(bx), G.level_height - 4, BALLOON_DEPTH);
                self.balloon_timer = G.balloon_time;
            }
        }

        if (gGT(G.dagger_time, 0)) {
            if (gGT(self.dagger_timer, 0)) self.dagger_timer--;
            if (gLE(self.dagger_timer, 0)) {
                let midx = G.trogg_x;
                const h = Math.max(0, G.trogg_y - 4);   // distance to dagger spawn height
                midx += G.is_vertical_scroll ? h * (0.6 / 0.8) : h * (0.8 / 0.6);
                const bx = irandom_range(midx - G.dagger_spread / 2, midx + G.dagger_spread / 2);
                instance_create('oDagger', Math.floor(bx), 4, DAGGER_DEPTH);
                self.dagger_timer = G.dagger_time;
            }
        }
    },
});

// --- Level objects ----------------------------------------------------------------------------

defineObject('oStaticObject', {
    create(self) {
        self.display_sprite_index = self.sprite_index;
    },
    draw(self) {
        if (!G.hasWon) SpriteDraw(self.sprite_index, self.image_index, self.x, self.y);
    },
});

const PLATFORM_PAUSE_AT_START = 5;
const PLATFORM_PAUSE_TIME = 30;

defineObject('oPlatform', {
    create(self) {
        inherited(self, 'oPlatform', 'create');
        self.is_moving = !!(self.scan_left || self.scan_right || self.scan_up || self.scan_down);
        self.x_left = self.x;
        self.x_right = self.x;
        self.y_up = self.y;
        self.y_down = self.y;
        self.x_vel = 0;
        self.y_vel = 0;
        self.pause_countdown = PLATFORM_PAUSE_AT_START;
        self.inited = false;
        self.platform_index = -1;
    },

    step(self) {
        if (!self.inited) {
            self.inited = true;
            G.platform_is_moving[self.platform_index] = self.is_moving;

            // A moving platform travels until it would bump into another platform
            if (self.is_moving) {
                const platw = sprite_width(self), plath = sprite_height(self);
                if (self.scan_left) {
                    for (let xco = self.x_left - 1; xco !== -1; xco--) {
                        PlatformFind(xco, self.y, self.y + plath);
                        if (G.platformfind_platformIndex === -1) continue;
                        self.x_left = xco + 1;
                        break;
                    }
                }
                if (self.scan_right) {
                    for (let xco = self.x_right + platw; xco !== 1000; xco++) {
                        PlatformFind(xco, self.y, self.y + plath);
                        if (G.platformfind_platformIndex === -1) continue;
                        self.x_right = xco - platw;
                        break;
                    }
                }
                const hitsAt = yco => {
                    PlatformFind(self.x - 1, yco - 1, yco);
                    if (G.platformfind_platformIndex !== -1) return true;
                    PlatformFind(self.x + platw, yco - 1, yco);
                    return G.platformfind_platformIndex !== -1;
                };
                if (self.scan_up) {
                    for (let yco = self.y_up - 1; yco !== -1; yco--) {
                        if (!hitsAt(yco)) continue;
                        self.y_up = yco - 1;
                        break;
                    }
                }
                if (self.scan_down) {
                    for (let yco = self.y_down + 1; yco !== 1000; yco++) {
                        if (!hitsAt(yco)) continue;
                        self.y_down = yco - 1;
                        break;
                    }
                }
            }
            if (self.x_left !== self.x_right) self.x_vel = self.start_moving_right ? 1 : -1;
            if (self.y_up !== self.y_down) self.y_vel = self.start_moving_up ? 1 : -1;
        }

        if (!G.isdead && self.is_moving) {
            if (gGT(self.pause_countdown, 0)) {
                self.pause_countdown--;
            } else {
                self.x += self.x_vel;
                if (gGT(self.x, self.x_right)) { self.x = self.x_right; self.x_vel = -self.x_vel; self.pause_countdown = PLATFORM_PAUSE_TIME; }
                if (gLT(self.x, self.x_left)) { self.x = self.x_left; self.x_vel = -self.x_vel; self.pause_countdown = PLATFORM_PAUSE_TIME; }
                self.y += self.y_vel;
                if (gGT(self.y, self.y_down)) { self.y = self.y_down; self.y_vel = -self.y_vel; self.pause_countdown = PLATFORM_PAUSE_TIME; }
                if (gLT(self.y, self.y_up)) { self.y = self.y_up; self.y_vel = -self.y_vel; self.pause_countdown = PLATFORM_PAUSE_TIME; }
                if (self.platform_index !== -1) {
                    G.platform_x[self.platform_index] = self.x;
                    G.platform_y[self.platform_index] = self.y;
                }
            }
        }
    },

    draw(self) {
        inherited(self, 'oPlatform', 'draw');
        if (G.hasWon) return;
        if (self.is_bouncy) {
            const x1 = self.x + sprite_width(self) / 2;
            let y1 = self.y + sprite_height(self);
            if (/^sLog[1-5]_Beeb$/.test(self.sprite_index)) y1 -= 3;
            SpriteDraw('sSpring_Beeb', 0, x1, y1);
        }
        if (self.is_movable_by_trogg) {
            const y1 = self.y + sprite_height(self) + 1;
            DrawLineScaled(self.x, y1, self.x + sprite_width(self), y1, 1, c_yellow);
        }
    },
});

const MAX_DISTANCE_FROM_TROGG = 400;

defineObject('oMeanie', {
    create(self) {
        self.inited = false;
        self.meanie_isdead = false;
        self.meanie_velocity = 0;
        inherited(self, 'oMeanie', 'create');
    },
    step(self) {
        // A yoyo'd meanie flies off sideways
        if (!G.isdead && self.meanie_isdead) {
            self.x += self.meanie_velocity;
            if (gGT(Math.abs(self.x - G.trogg_x), MAX_DISTANCE_FROM_TROGG)) instance_destroy(self);
        }
    },
});

defineObject('oBalloon', {
    create(self) {
        self.countdown_timer = G.balloon_pause;
        inherited(self, 'oBalloon', 'create');
    },
    step(self) {
        if (!G.isdead) {
            if (gGT(self.countdown_timer, 0)) {
                self.countdown_timer--;
            } else {
                self.y -= G.balloon_velocity;
                if (gLT(self.y, 0)) instance_destroy(self);
            }
        }
        inherited(self, 'oBalloon', 'step');
    },
});

defineObject('oDagger', {
    create(self) {
        self.countdown_timer = G.dagger_pause;
        if (G.is_vertical_scroll) {
            self.sprite_index = 'sDaggerUD_Beeb';
            self.dagger_xstep = G.dagger_velocity * 0.60;
            self.dagger_ystep = G.dagger_velocity * 0.80;
        } else {
            self.sprite_index = 'sDaggerLR_Beeb';
            self.dagger_xstep = G.dagger_velocity * 0.80;
            self.dagger_ystep = G.dagger_velocity * 0.60;
        }
        inherited(self, 'oDagger', 'create');
    },
    step(self) {
        if (!G.isdead) {
            if (gGT(self.countdown_timer, 0)) {
                self.countdown_timer--;
            } else {
                self.x -= self.dagger_xstep;
                self.y += self.dagger_ystep;
                if (gGE(self.y, G.level_height) || gLE(self.x, -11)) instance_destroy(self);
            }
        }
        inherited(self, 'oDagger', 'step');
    },
});

defineObject('oScrubbly', {
    create(self) {
        self.minx = self.x;
        self.maxx = self.x;
        inherited(self, 'oScrubbly', 'create');
        self.platform_index = -1;
    },
    step(self) {
        if (!G.isdead) {
            if (!self.inited && G.platform_group_index > 0) {
                self.inited = true;
                self.meanie_velocity = 0;
                if (G.moving_enabled) {
                    // Patrol the platform underneath
                    PlatformFind(self.x, self.y - 1, self.y + 3);
                    self.platform_index = G.platformfind_platformIndex;
                    if (self.platform_index !== -1) {
                        self.minx = G.platform_x[self.platform_index];
                        self.maxx = G.platform_w[self.platform_index] + self.minx - 1;
                        self.minx += 8;
                        self.maxx -= 8;
                        self.meanie_velocity = self.default_x_velocity;
                    }
                }
            }
            if (!self.meanie_isdead) {
                self.x += self.meanie_velocity;
                if (gLT(self.x, self.minx)) { self.x = self.minx; self.meanie_velocity = self.default_x_velocity; }
                if (gGT(self.x, self.maxx)) { self.x = self.maxx; self.meanie_velocity = -self.default_x_velocity; }
                if (self.platform_index !== -1 && self.follow_platform_y) {
                    self.y = G.platform_y[self.platform_index];
                }
            }
        }
        inherited(self, 'oScrubbly', 'step');
    },
});

defineObject('oPoglet', {
    create(self) {
        self.miny = self.y;
        self.maxy = self.y;
        inherited(self, 'oPoglet', 'create');
    },
    step(self) {
        if (!G.isdead) {
            if (!self.inited && G.ladder_group_base) {
                self.inited = true;
                self.meanie_velocity = 0;
                if (G.moving_enabled) {
                    if (gNE(self.yoff_min, 0) || gNE(self.yoff_max, 0)) {
                        self.miny = self.y + self.yoff_min;
                        self.maxy = self.y + self.yoff_max;
                        self.meanie_velocity = self.default_y_velocity;
                    } else {
                        // Climb up and down the ladder it is on
                        const lf = LadderFind(self.x, self.y - 16, self.y + 4, false, true);
                        if (lf.ladderIndex !== -1) {
                            self.miny = G.ladder_y[lf.ladderIndex];
                            self.maxy = G.ladder_h[lf.ladderIndex] + self.miny - 1;
                            self.miny += 30;
                            self.maxy += 14;
                            self.meanie_velocity = self.default_y_velocity;
                        }
                    }
                    if (self.initially_go_down) self.meanie_velocity = -self.default_y_velocity;
                }
            }
            if (!self.meanie_isdead && gNE(self.meanie_velocity, 0)) {
                self.y += self.meanie_velocity;
                if (gLT(self.y, self.miny)) { self.y = self.miny; self.meanie_velocity = self.default_y_velocity; }
                if (gGT(self.y, self.maxy)) { self.y = self.maxy; self.meanie_velocity = -self.default_y_velocity; }
            }
        }
        inherited(self, 'oPoglet', 'step');
    },
});

defineObject('oHooter', {
    create(self) {
        self.basey = self.y;
        self.meanie_velocity = 0;
        inherited(self, 'oHooter', 'create');
    },
    step(self) {
        if (gGT(self.initial_sleep_ticks, 0)) {
            self.initial_sleep_ticks--;
        } else if (!G.isdead && G.moving_enabled && !self.meanie_isdead) {
            // Bounce up and down
            self.meanie_velocity -= G.frak_gravity;
            self.y -= self.meanie_velocity;
            if (gGT(self.y, self.basey)) {
                self.y = self.basey;
                self.meanie_velocity = self.initial_jump_velocity;
            }
        }
        inherited(self, 'oHooter', 'step');
    },
});

// --- Training level arrows --------------------------------------------------------------------

const TRAINING_ARROW_DISTANCE = 50;

defineObject('oTrainingArrow', {
    draw(self) {
        const dx = self.x - G.trogg_x, dy = self.y - G.trogg_y;
        if (gLE(dx * dx + dy * dy, TRAINING_ARROW_DISTANCE * TRAINING_ARROW_DISTANCE)) {
            inherited(self, 'oTrainingArrow', 'draw');
        }
    },
});
defineObject('oTrainingDown', {
    draw(self) { if (gLT(G.trogg_y, self.y + 10)) inherited(self, 'oTrainingDown', 'draw'); },
});
defineObject('oTrainingUp', {
    draw(self) { if (gGT(G.trogg_y, self.y - 10)) inherited(self, 'oTrainingUp', 'draw'); },
});
defineObject('oTrainingLeft', {
    draw(self) { if (gGT(G.trogg_x, self.x - 10)) inherited(self, 'oTrainingLeft', 'draw'); },
});
defineObject('oTrainingRight', {
    draw(self) { if (gLT(G.trogg_x, self.x + 10)) inherited(self, 'oTrainingRight', 'draw'); },
});
defineObject('oTrainingJumpRight', {
    draw(self) { if (gLT(G.trogg_x, self.x + 10)) inherited(self, 'oTrainingJumpRight', 'draw'); },
});
defineObject('oTrainingYoyoRight', {
    create(self) {
        inherited(self, 'oTrainingYoyoRight', 'create');
        self.meanie_searched = false;
        self.meanie_id = -1;    // instance id (not a reference, so checkpoints can copy it)
    },
    draw(self) {
        if (!self.meanie_searched) {
            self.meanie_searched = true;
            const list = collisionRectangleList(self.x, self.y - 10, self.x + 120, self.y + 10, 'oMeanie');
            if (list.length) self.meanie_id = list[list.length - 1].id;
        }
        // Only display if there's a meanie to the right that hasn't been yoyoed!
        const m = Runtime.instances.find(i => i.id === self.meanie_id && i.alive);
        if (m && !m.meanie_isdead) inherited(self, 'oTrainingYoyoRight', 'draw');
    },
});

// --- Title screen -----------------------------------------------------------------------------

defineObject('oDemoBubble', {
    create(self) {
        self.bubbleIndex = 0;
        self.bubbleScale = 5;
        self.demoPhase = 1;
        self.demoTicks = 0;
    },
    step(self) {
        self.demoTicks++;
        switch (self.demoPhase) {
            case 0: {
                self.bubbleIndex++;
                const theta = (self.bubbleIndex % 280) / (280.0 / (2 * Math.PI));
                self.x = 33 + 30 * Math.sin(theta);
                self.y = 160 + 30 * Math.cos(theta);
                if (self.demoTicks > 10 * 60) { self.demoPhase = 1; self.demoTicks = 0; }
                break;
            }
            case 1:
                if (self.demoTicks > 10 * 60) { self.demoPhase = 0; self.demoTicks = 0; self.bubbleIndex = 0; }
                break;
        }
        if (gamepad_is_connected()) {
            if (gamepad_button_check_pressed(gp_face1) || gamepad_button_check_pressed(gp_face2) ||
                gamepad_button_check_pressed(gp_start)) {
                performKeyPress(self, vk_space);
            }
        }
    },
    draw(self) {
        const centre = (msg, y) => TextDraw(256 / 2 - msg.length / 2 * 8, y, msg, c_black);
        switch (self.demoPhase) {
            case 0:
                centre('Welcome to Frak!', 10);
                centre('https://tinyurl.com/frakmanual', 10 + 8 * 2);
                SpriteDrawStretched(self.sprite_index, 0, self.x, self.y, self.bubbleScale, self.bubbleScale);
                centre('Controls: Z X K O P    BkSp Esc', 256 - 10 - 8 * 3);
                centre('Shortcut keys: L R U D J Y 0..9', 256 - 10 - 8 * 1);
                break;
            case 1:
                SpriteDraw('sFrak_Beeb', 0, 128 - 28, 8 * 3 + 6);
                centre('The Cast', 10 + 8 * 3);
                centre('--------', 10 + 8 * 4);
                TroggDraw('sTrogg_sr_Beeb', 0, 64, 8 * 10 + 4);
                TextDraw(192 - 5 / 2 * 8, 10 + 8 * 7, 'Trogg', c_black);
                centre('vs.', 10 + 8 * 10);
                SpriteDraw('sScrubbly_Beeb', 0, 64, 8 * 17);
                TextDraw(192 - 8 / 2 * 8, 10 + 8 * 13, 'Scrubbly', c_black);
                SpriteDraw('sHooter_Beeb', 0, 64, 8 * 21 - 4);
                TextDraw(192 - 6 / 2 * 8, 10 + 8 * 17 + 4, 'Hooter', c_black);
                SpriteDraw('sPoglet_Beeb', 0, 64, 8 * 25);
                TextDraw(192 - 6 / 2 * 8, 10 + 8 * 22, 'Poglet', c_black);
                centre('Collect all the keys to win!', 256 - 10 - 8 * 3);
                centre('(C) 1984-2026 Nick Pelling', 256 - 10 - 8 * 1);
                break;
        }
    },
    keyPress: {
        [vk_space]() { room_goto('roomTopMenu'); },
        [vk_enter]() { room_goto('roomTopMenu'); },
        80() { room_goto('roomTopMenu'); },     // P
        89() { room_goto('roomTopMenu'); },     // Y
    },
    globalTap() { room_goto('roomTopMenu'); },
});

// --- Menu buttons (3x3 grid) ------------------------------------------------------------------

function menuSelect(self, next) {
    if (self.selectionIndex === G.selectedItem) G.nextSelectedItem = next;
}

defineObject('oButtonRoom', {
    create(self) {
        G.selectedItem = 0;
        G.nextSelectedItem = G.selectedItem;
        G.selectedColour = c_white;
        self.counter = 0;
        G.gp_last_lr_moving = false;
        G.gp_last_ud_moving = false;
    },

    step(self) {
        self.counter++;
        if (self.selectionIndex === 0) {
            G.selectedItem = G.nextSelectedItem;
            G.selectedColour = ((self.counter & 63) < 56) ? c_white : c_yellow;
        }
        if (self.selectionIndex !== G.selectedItem) return;

        if (Input.mousePressed[2]) performKeyPress(self, vk_backspace);
        if (Input.mousePressed[1]) performKeyPress(self, vk_escape);
        if (Input.mousePressed[0]) {
            const scale = G.screenHeight / 256;
            const xx = Math.trunc(Input.mx / scale) - G.xScroll;
            const yy = Math.trunc(Input.my / scale) - G.yScroll;
            if (xx >= 0 && xx < 255 && yy >= 0 && yy < 255) {
                // Note: 85 * 3 = 255, so don't allow clicks to 255!
                const clicked = Math.floor(xx / 85) + Math.floor(yy / 85) * 3;
                if (clicked !== G.selectedItem) {
                    G.nextSelectedItem = clicked;
                } else {
                    performKeyPress(self, vk_space);
                }
            }
        }

        if (gamepad_is_connected()) {
            const h = gamepad_axis(0), v = gamepad_axis(1);
            const spd = Math.hypot(h, v);
            const ang = pointDirection(h, v);
            const half = 60.0;
            let last = G.gp_last_lr_moving;
            G.gp_last_lr_moving = gGE(spd, 0.6);
            if (G.gp_last_lr_moving && !last) {
                if (gGE(ang, 180 - half) && gLE(ang, 180 + half)) performKeyPress(self, vk_left);
                if (gLE(ang, half) || gGE(ang, 360 - half)) performKeyPress(self, vk_right);
            }
            last = G.gp_last_ud_moving;
            G.gp_last_ud_moving = gGE(spd, 0.6);
            if (G.gp_last_ud_moving && !last) {
                if (gGE(ang, 90 - half) && gLE(ang, 90 + half)) performKeyPress(self, vk_up);
                if (gGE(ang, 270 - half) && gLE(ang, 270 + half)) performKeyPress(self, vk_down);
            }
            if (gamepad_button_check_pressed(gp_padl) || gamepad_button_check_pressed(gp_shoulderl)) performKeyPress(self, vk_left);
            if (gamepad_button_check_pressed(gp_padr) || gamepad_button_check_pressed(gp_shoulderr)) performKeyPress(self, vk_right);
            if (gamepad_button_check_pressed(gp_padu)) performKeyPress(self, vk_up);
            if (gamepad_button_check_pressed(gp_padd)) performKeyPress(self, vk_down);
            if (gamepad_button_check_pressed(gp_face1) || gamepad_button_check_pressed(gp_face2)) performKeyPress(self, vk_space);
            if (gamepad_button_check_pressed(gp_start)) performKeyPress(self, vk_backspace);
            if (gamepad_button_check_pressed(gp_select)) performKeyPress(self, vk_escape);
        }
    },

    draw(self) {
        // Highlight the selected button
        if (self.selectionIndex === G.selectedItem) {
            const midy = self.y + sprite_height(self) / 2;
            DrawLineScaled(self.x, midy, self.x + sprite_width(self) - 1, midy, sprite_height(self) - 1, G.selectedColour);
        }
    },

    keyPress: {
        [vk_enter](self) { performKeyPress(self, vk_space); },
        [vk_escape](self) {
            if (self.selectionIndex === G.selectedItem) room_goto('_StartRoom');
        },
        [vk_backspace](self) {
            if (self.selectionIndex === G.selectedItem) {
                room_goto(Runtime.roomName === 'roomTopMenu' ? '_StartRoom' : 'roomTopMenu');
            }
        },
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem) {
                FrakSave_UpdateOptions();
                if (self.room_to_launch) room_goto(self.room_to_launch);
            }
        },
        [vk_left](self) { if (G.selectedItem % 3 !== 0) menuSelect(self, G.selectedItem - 1); },
        [vk_right](self) { if (G.selectedItem % 3 !== 2) menuSelect(self, G.selectedItem + 1); },
        [vk_up](self) { if (G.selectedItem >= 3) menuSelect(self, G.selectedItem - 3); },
        [vk_down](self) { if (G.selectedItem < 6) menuSelect(self, G.selectedItem + 3); },
        // Same letter keys as the game: Z/L left, X/R right, O/U up, K/D down, P/Y select
        90(self) { performKeyPress(self, vk_left); },
        76(self) { performKeyPress(self, vk_left); },
        88(self) { performKeyPress(self, vk_right); },
        82(self) { performKeyPress(self, vk_right); },
        79(self) { performKeyPress(self, vk_up); },
        85(self) { performKeyPress(self, vk_up); },
        75(self) { performKeyPress(self, vk_down); },
        68(self) { performKeyPress(self, vk_up); },        // (D: up, as in the original's menus)
        80(self) { performKeyPress(self, vk_space); },
        89(self) { performKeyPress(self, vk_space); },
    },
});

function buttonGeometry(self) {
    const width = sprite_width(self), height = sprite_height(self);
    return { width, height, midx: self.x + width / 2, midy: self.y + height / 2 };
}
function centredText(midx, y, text, colour) {
    TextDraw(midx - text.length * 8 / 2, y, text, colour || c_black);
}

// Level button in the level-select screens
defineObject('oGameRoom', {
    create(self) {
        const suffix = '_' + self.levelIndex;
        inherited(self, 'oGameRoom', 'create');
        self.levelname = GetLevelInfo(self.levelIndex, 1);
        self.goodtime = GetLevelInfo(self.levelIndex, 2) * 60;
        self.gemFlag = G.GameState['GemMedal' + suffix];
        self.besttime = G.GameState['BestTime' + suffix];
        self.speedFlag = (self.besttime >= 0) && (self.besttime < self.goodtime);
        self.hooter_ypos = 0;
        self.hooter_yvel = 1.5;
    },

    draw(self) {
        const { width, height, midx, midy } = buttonGeometry(self);
        let textColour = c_black;
        inherited(self, 'oGameRoom', 'draw');

        if (self.levelIndex < 0) {
            SpriteDraw('sLock', 0, midx, midy);
        } else {
            DrawLineScaled(self.x + 4, midy, self.x + width - 5, midy, height - 10, self.game_room_colour);

            const meany = self.associated_meany;
            if (meany) {
                let sprx = self.x + 23;
                let spry = midy + 10;
                if (meany === 'sScrubbly_Beeb') {
                    SpriteDraw('sLedge2_Beeb', 0, self.x + 7, spry);
                    if (self.levelIndex >= 10) {
                        let xoff = (self.counter / 3) % 28;
                        xoff = Math.abs(xoff - 14);
                        sprx += xoff - 7;
                    }
                }
                if (meany === 'sPoglet_Beeb') {
                    SpriteDraw('sQiana1_Beeb', 0, self.x + 24, self.y + 5);
                    SpriteDraw('sLog5_Beeb', 0, self.x + 7, spry);
                    if (self.levelIndex >= 10) {
                        let yoff = (self.counter / 3) % 30;
                        yoff = Math.abs(yoff - 15);
                        spry -= yoff;
                    }
                }
                if (meany === 'sHooter_Beeb') {
                    SpriteDraw('sGirder3_Beeb', 0, self.x + 7, spry);
                    if (self.levelIndex >= 10) spry -= self.hooter_ypos;
                    if (G.GraphicsOption !== 2) textColour = c_white;
                }
                SpriteDraw(meany, 0, sprx, spry);
            }

            TextDraw(self.x + 6, self.y + height - 14, self.levelname, textColour);
            TextDraw(midx + 5, self.y + 7, CounterToTime(self.goodtime, false), textColour);
            if (self.besttime > -1) {
                if (self.besttime > self.goodtime || (self.counter & 31) >= 5) {
                    TextDraw(midx + 5, midy + 1, CounterToTime(self.besttime, false), textColour);
                }
            }
            ShowRatings(midx + 8, midy + 20, 0, self.levelIndex, 1, false);
            SpriteDraw(self.gemFlag ? 'sGem_Small_Beeb' : 'sGem_Outline_Small_Beeb', 0, midx + 19, midy + 20);
            SpriteDraw(self.speedFlag ? 'sStopwatch_Small_Beeb' : 'sStopwatch_Outline_Small_Beeb', 0, midx + 30, midy + 20);
        }
        SpriteDraw('sButton', 0, self.x, self.y);
    },

    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem && self.levelIndex >= 0) {
                const nextroom = GetLevelInfo(self.levelIndex, 0);
                if (nextroom) {
                    G.current_levelIndex = self.levelIndex;
                    G.replay_levelIndex = self.levelIndex;
                    FrakSave_UpdateOptions();
                    room_goto(nextroom);
                }
            }
        },
    },
});

defineObject('oHooterRoom', {
    step(self) {
        inherited(self, 'oHooterRoom', 'step');
        self.hooter_ypos += self.hooter_yvel;
        self.hooter_yvel -= 0.05;
        if (gLT(self.hooter_ypos, 0)) {
            self.hooter_ypos = 0;
            self.hooter_yvel = 1.5;
        }
    },
});

const C_CYAN = '#00f0f0';
const C_GREEN = '#00f000';
const BACKGROUND_COL = '#ccb07a';

// "Replay last level" button
defineObject('oReplayLast', {
    create(self) {
        inherited(self, 'oReplayLast', 'create');
        self.goodtime = 60 * 60;
        self.gemFlag = false;
        self.besttime = 10 * 60 * 60;
        self.speedFlag = false;
        if (G.replay_levelIndex >= 0) {
            const suffix = '_' + G.replay_levelIndex;
            self.goodtime = GetLevelInfo(G.replay_levelIndex, 2) * 60;
            self.gemFlag = G.GameState['GemMedal' + suffix];
            self.besttime = G.GameState['BestTime' + suffix];
            self.speedFlag = (self.besttime >= 0) && (self.besttime < self.goodtime);
        }
    },
    draw(self) {
        const { midx, midy } = buttonGeometry(self);
        inherited(self, 'oReplayLast', 'draw');
        if (G.replay_levelIndex >= 0) {
            centredText(midx, midy - 38, GetLevelInfo(G.replay_levelIndex, 1));
            SpriteDraw('sRefresh', 0, midx, midy);
            if (self.besttime > -1) {
                if (self.besttime > self.goodtime || (self.counter & 31) >= 5) {
                    TextDraw(midx + 9, midy + 31, CounterToTime(self.besttime, false), c_black);
                }
            }
            ShowRatings(self.x + 8, midy + 38, 0, G.replay_levelIndex, 1, false);
            SpriteDraw(self.gemFlag ? 'sGem_Small_Beeb' : 'sGem_Outline_Small_Beeb', 0, self.x + 19, midy + 38);
            SpriteDraw(self.speedFlag ? 'sStopwatch_Small_Beeb' : 'sStopwatch_Outline_Small_Beeb', 0, self.x + 30, midy + 38);
        } else {
            SpriteDraw('sFrak_Beeb', 0, midx - 27, midy + 10);
        }
        SpriteDraw('sButton', 0, self.x, self.y);
    },
    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem && G.replay_levelIndex >= 0) {
                const nextroom = GetLevelInfo(G.replay_levelIndex, 0);
                if (nextroom) {
                    G.current_levelIndex = G.replay_levelIndex;
                    FrakSave_UpdateOptions();
                    room_goto(nextroom);
                }
            }
        },
    },
});

defineObject('oTrainingRoom', {
    create(self) {
        inherited(self, 'oTrainingRoom', 'create');
        self.goodtime = GetLevelInfo(0, 2) * 60;
        self.gemFlag = G.GameState.GemMedal_0;
        self.besttime = G.GameState.BestTime_0;
        self.speedFlag = (self.besttime >= 0) && (self.besttime < self.goodtime);
    },
    draw(self) {
        const { width, height, midx, midy } = buttonGeometry(self);
        const x = self.x, y = self.y;
        inherited(self, 'oTrainingRoom', 'draw');
        TextDraw(x + 3, midy - 38, 'Train', c_black);
        DrawLineScaled(x, midy, x + width - 1, midy, height - 12 * 2, C_GREEN);
        SpriteDraw('sButton', 0, x, y);
        SpriteDraw('sLog1_Beeb', 0, midx - 34, midy + 15);
        SpriteDraw('sQiana1_Beeb', 0, midx + 21, midy - 29);
        TroggDraw('sTrogg_wr_Beeb', 0, midx - 20, midy + 15);
        const index = Math.floor(self.counter / 20) % 2;
        SpriteDraw('sTroggHelp', 0, midx - 6, midy - 11 + index * 2);
        SpriteDraw('sPoglet_Beeb', 0, midx + 20, midy + 15);
        DrawLineScaled(x, y + 12, x + width - 1, y + 12, 1, c_black);
        DrawLineScaled(x, y + height - 12, x + width - 1, y + height - 12, 1, c_black);
        TextDraw(midx + 9, y + 3, CounterToTime(self.goodtime, false), c_black);
        if (self.besttime > 0) {
            if (self.besttime > self.goodtime || (self.counter & 31) >= 5) {
                TextDraw(midx + 9, midy + 32, CounterToTime(self.besttime, false), c_black);
            }
        }
        ShowRatings(x + 8, midy + 39, 0, 0, 1, false);
        SpriteDraw(self.gemFlag ? 'sGem_Small_Beeb' : 'sGem_Outline_Small_Beeb', 0, x + 19, midy + 39);
        SpriteDraw(self.speedFlag ? 'sStopwatch_Small_Beeb' : 'sStopwatch_Outline_Small_Beeb', 0, x + 30, midy + 39);
    },
    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem) {
                G.current_levelIndex = 0;
                FrakSave_UpdateOptions();
                room_goto(GetLevelInfo(0, 0));
            }
        },
    },
});

// Common frame for the animated level-group buttons on the top menu
function groupButtonFrame(self, name, colourLine) {
    const { width, height, midx, midy } = buttonGeometry(self);
    centredText(midx, midy - 38, name);
    if (colourLine !== false) DrawLineScaled(self.x, midy, self.x + width - 1, midy, height - 12 * 2, C_CYAN);
    return { width, height, midx, midy };
}
function groupButtonLines(self, width, height) {
    DrawLineScaled(self.x, self.y + 12, self.x + width - 1, self.y + 12, 1, c_black);
    DrawLineScaled(self.x, self.y + height - 12, self.x + width - 1, self.y + height - 12, 1, c_black);
}
function animFrame(spr, t) { return t % SPR[spr].n; }

defineObject('oClassicRoom', {
    draw(self) {
        inherited(self, 'oClassicRoom', 'draw');
        const { width, height, midx, midy } = groupButtonFrame(self, 'Classic');
        const x = self.x, y = self.y, c = self.counter;
        groupButtonLines(self, width, height);
        SpriteDraw('sButton', 0, x, y);
        TroggDraw('sTrogg_wr_Beeb', animFrame('sTrogg_wr_Beeb', c / 7), midx + 3, midy + 10);
        SpriteDraw('sTrainingLeft_Beeb', animFrame('sTrainingLeft_Beeb', c / 7), midx - 20, midy);
        SpriteDraw('sTrainingRight_Beeb', animFrame('sTrainingRight_Beeb', c / 7), midx + 20, midy);
        const ledgew = SPR.sLedge1_Beeb.w;
        const index = (c / 2) % ledgew;
        SpriteDraw('sLedge4_Beeb', 0, x + 2 + ledgew - index, midy + 10);
        ShowRatings(x + 5, y + height - 3, 9, 1, 9, true);
        DrawLineScaled(x + 1, midy + 16, x + 1 + ledgew, midy + 16, 16, C_CYAN);
        DrawLineScaled(x + 1 + ledgew * 4, midy + 16, x + 1 + ledgew * 5, midy + 16, 16, C_CYAN);
    },
});

const SCRUBW = 8;
defineObject('oMovingMeanieRoom', {
    draw(self) {
        inherited(self, 'oMovingMeanieRoom', 'draw');
        const { width, height, midx, midy } = groupButtonFrame(self, 'Moving');
        SpriteDraw('sButton', 0, self.x, self.y);
        TroggDraw('sTrogg_wr_Beeb', 0, midx - 24, midy + 14);
        SpriteDraw('sLedge1_Beeb', 0, midx - 32, midy + 14);
        SpriteDraw('sLedge2_Beeb', 0, midx, midy + 14);
        let index = Math.floor(self.counter * 0.6) % (SCRUBW * 4);
        if (index > SCRUBW * 2) index = SCRUBW * 4 - 1 - index;
        SpriteDraw('sScrubbly_Beeb', 0, midx + 16 - SCRUBW + index, midy + 14);
        groupButtonLines(self, width, height);
        ShowRatings(self.x + 5, self.y + height - 3, 9, 1 + 9 * 1, 9, true);
    },
});

defineObject('oVerticalScrollRoom', {
    draw(self) {
        const { width, height, midx, midy } = buttonGeometry(self);
        const x = self.x, y = self.y, c = self.counter;
        const bcol = (self.selectionIndex === G.selectedItem) ? G.selectedColour : BACKGROUND_COL;
        inherited(self, 'oVerticalScrollRoom', 'draw');
        DrawLineScaled(x, midy, x + width - 1, midy, height - 12 * 2, C_CYAN);
        const ladderh = SPR.sLadder1_Beeb.h;
        SpriteDraw('sLadder5_Beeb', 0, midx - 2, midy - 41 + (c / 2) % (ladderh - 1));
        const ledgeh = SPR.sLedge1_Beeb.h;
        const index = c / 2;
        for (let k = 0; k < 4; k++) {
            const lx = (k & 1) ? midx + 12 : midx - 26;
            SpriteDraw('sLedge1_Beeb', 0, lx, midy - 41 + (ledgeh * k * 5 / 4 + index) % (ledgeh * 5 - 1));
        }
        DrawLineScaled(x, y + 12 / 2, x + width - 1, y + 12 / 2, 12, bcol);
        DrawLineScaled(x, y + height - 12 / 2, x + width - 1, y + height - 12 / 2, 12, bcol);
        TroggDraw('sTrogg_cu_Beeb', animFrame('sTrogg_cu_Beeb', c / 14), midx, midy + 16);
        SpriteDraw('sTrainingUp_Beeb', animFrame('sTrainingUp_Beeb', c / 7), x + 8, midy + 6);
        SpriteDraw('sTrainingDown_Beeb', animFrame('sTrainingDown_Beeb', c / 7), x + width - 8, midy - 4);
        ShowRatings(x + 5, y + height - 3, 9, 1 + 9 * 2, 9, true);
        groupButtonLines(self, width, height);
        centredText(midx, midy - 38, 'Up/Down');
        SpriteDraw('sButton', 0, x, y);
    },
});

const TROGGW = 15, TPAUSE = 30;
defineObject('oMovingPlatformRoom', {
    draw(self) {
        inherited(self, 'oMovingPlatformRoom', 'draw');
        const { width, height, midx, midy } = groupButtonFrame(self, 'Sliding');
        SpriteDraw('sLedge1_Beeb', 0, midx - 32 - 6, midy + 10);
        SpriteDraw('sLedge1_Beeb', 0, midx + 30 - 6, midy + 10);
        let index = self.counter % (TROGGW * 4 + TPAUSE * 2);
        if (index > TROGGW * 2 + TPAUSE) index = TROGGW * 4 + TPAUSE - 1 - index;
        index = clamp(index, 0, TROGGW * 2);
        TroggDraw('sTrogg_wr_Beeb', 0, midx - 1 - TROGGW + 2 + index, midy + 10);
        SpriteDraw('sLedge1_Beeb', 0, midx - 1 - TROGGW - 6 + index, midy + 10);
        ShowRatings(self.x + 5, self.y + height - 3, 9, 1 + 9 * 3, 9, true);
        groupButtonLines(self, width, height);
        SpriteDraw('sButton', 0, self.x, self.y);
    },
});

defineObject('oMovablePlatformRoom', {
    draw(self) {
        const cycle = (60 + 20 + 20) * 2;
        const index = self.counter % cycle;
        const half = index % (cycle >> 1);
        inherited(self, 'oMovablePlatformRoom', 'draw');
        const { width, height, midx, midy } = groupButtonFrame(self, 'Placing');

        let yoyolen = -1;
        if (half > 60) {
            yoyolen = half - 60;
            if (yoyolen > 20) yoyolen = 20 - (yoyolen - 20);
        }
        const platy = midy + 10 - 14;
        let platx;
        if (index < 80) platx = midx + 7;
        else if (index < 100) platx = midx - 13 + yoyolen;
        else if (index < 160) platx = midx - 24 - 16;
        else if (index < 180) platx = midx - 13 + yoyolen;
        else platx = midx + 7;

        SpriteDraw('sLedge2_Beeb', 0, platx, platy);
        DrawLineScaled(platx, platy + 15, platx + 32, platy + 15, 1, c_yellow);
        SpriteDraw('sLedge1_Beeb', 0, midx - 32, midy + 10);
        if (half < 60) {
            TroggDraw('sTrogg_wr_Beeb', 0, midx - 24, midy + 10);
        } else {
            TroggDraw('sTrogg_yr_Beeb', 0, midx - 24, midy + 10);
            if (yoyolen > 0) {
                const yx = midx - 24 + 15, yy = midy + 10 - 11;
                SpriteDraw('sYoyo_Beeb', (yoyolen >> 3) & 3, yx + yoyolen, yy);
                DrawLineScaled(yx, yy, yx + yoyolen, yy, 1, c_black);
            }
        }
        ShowRatings(self.x + 5, self.y + height - 3, 9, 1 + 9 * 4, 9, true);
        SpriteDraw('sButton', 0, self.x, self.y);
        groupButtonLines(self, width, height);
    },
});

const BOUNCEWIDTH = 20 + 60 + 20;
defineObject('oSpaceRoom', {
    create(self) {
        inherited(self, 'oSpaceRoom', 'create');
        self.x_array = [];
        self.y_array = [];
        self.facing_right = true;
        let xco = 0, yco = 0, xvel = 0, yvel = 0;
        for (let i = 0; i < BOUNCEWIDTH; i++) {
            if (i === 20) xvel = 1;
            if (xvel !== 0) {
                yvel += 0.03;
                if (xco < 10) yvel = 0;
                if (xco === 24) yvel = -yvel;
                if (xco >= 48) { xvel = 0; yvel = 0; }
            }
            xco += xvel;
            yco += yvel;
            self.x_array[i] = xco;
            self.y_array[i] = yco;
        }
    },
    draw(self) {
        inherited(self, 'oSpaceRoom', 'draw');
        const { width, height, midx, midy } = groupButtonFrame(self, 'Bouncing');
        SpriteDraw('sLedge1_Beeb', 0, midx - 28 - 6, midy + 5);
        SpriteDraw('sLedge1_Beeb', 0, midx + 26 - 6, midy + 5);
        SpriteDraw('sLedge1_Beeb', 0, midx - 1 - 6, midy + 8);
        SpriteDraw('sSpring_Beeb', 0, midx - 1 - 6 + 8, midy + 8 + 13);
        DrawLineScaled(self.x, self.y + 12, self.x + width - 1, self.y + 12, 1, c_black);
        const index = self.counter % BOUNCEWIDTH;
        if (index === 0) self.facing_right = !self.facing_right;
        if (self.facing_right) {
            TroggDraw('sTrogg_wr_Beeb', 0, midx - 22 + self.x_array[index], midy + 5 + self.y_array[index]);
        } else {
            TroggDraw('sTrogg_wl_Beeb', 0, midx - 22 + 45 - self.x_array[index], midy + 5 + self.y_array[index]);
        }
        ShowRatings(self.x + 5, self.y + height - 3, 9, 1 + 9 * 5, 9, true);
        DrawLineScaled(self.x, self.y + height - 12, self.x + width - 1, self.y + height - 12, 1, c_black);
        SpriteDraw('sButton', 0, self.x, self.y);
    },
});

// --- Settings ---------------------------------------------------------------------------------

function drawDifficulty(self, title) {
    const { midx, midy } = buttonGeometry(self);
    const d = G.difficulty_level;
    if (title) centredText(midx, midy - 38, title);

    // Difficulty levels 3 and 5 are upside-down versions of 2 and 4!
    const isFlipped = (d === 3 || d === 5);
    const period = { 1: 90, 2: 60, 3: 60, 4: 45, 5: 45, 6: 30 }[d];
    const flag = period ? (((self.counter / period) & 1) !== 0) : false;

    let numItems = d;
    if (d >= 5) numItems--;
    if (d >= 3) numItems--;
    for (let i = 0; i < numItems; i++) {
        SpriteDraw('sBalloon_Beeb', 0, self.x + 15, midy - 26 + i * 14 + 9);
        SpriteDraw('sDaggerLR_Beeb', 0, midx + 20, midy - 26 + i * 14);
    }

    const name = GetDifficultyName(d);
    const trogg = flag ? 'sTrogg_sl_Beeb' : 'sTrogg_sr_Beeb';
    if (isFlipped) {
        G.yFlip = true;
        const fy = G.windowHeight - (midy + 10 - 25);
        TroggDraw(trogg, 0, midx, fy);
        SpriteDraw('sLedge2_Beeb', 0, midx - 16, fy);
        G.yFlip = false;
        centredText(midx, midy + 20, name);
        centredText(midx, midy + 31, 'Flipped');
    } else {
        TroggDraw(trogg, 0, midx, midy + 8);
        SpriteDraw('sLedge2_Beeb', 0, midx - 16, midy + 8);
        centredText(midx, midy + 31, name);
    }
    SpriteDraw('sButton', 0, self.x, self.y);
}

defineObject('oSettings', {
    draw(self) {
        inherited(self, 'oSettings', 'draw');
        drawDifficulty(self, 'Settings');
    },
});

defineObject('oSettingsShared', {
    keyPress: {
        [vk_escape](self) { FrakSave_UpdateOptions(); inherited(self, 'oSettingsShared', 'keyPress', vk_escape); },
        [vk_backspace](self) { FrakSave_UpdateOptions(); inherited(self, 'oSettingsShared', 'keyPress', vk_backspace); },
    },
});

defineObject('oSettingsDifficulty', {
    draw(self) {
        inherited(self, 'oSettingsDifficulty', 'draw');
        drawDifficulty(self, null);
    },
    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem) {
                G.difficulty_level = (G.difficulty_level + 1) % NUM_DIFFICULTIES;
            }
        },
    },
});

function drawOption(self, title, lines) {
    const { midx, midy } = buttonGeometry(self);
    centredText(midx, midy - 15, title);
    lines.forEach((t, i) => centredText(midx, midy + 15 + i * 10, t));
    SpriteDraw('sButton', 0, self.x, self.y);
}

defineObject('oSettingsGraphics', {
    draw(self) {
        inherited(self, 'oSettingsGraphics', 'draw');
        drawOption(self, 'Graphics', [['Blocky', 'Smooth', 'Mono'][G.GraphicsOption] || '???']);
    },
    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem) {
                G.GraphicsOption = (G.GraphicsOption + 1) % NUM_GRAPHICS_OPTIONS;
            }
        },
    },
});

defineObject('oSettingsSound', {
    draw(self) {
        inherited(self, 'oSettingsSound', 'draw');
        drawOption(self, 'Sounds', [['Off', 'On'][G.SoundsOption] || '???']);
    },
    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem) {
                G.SoundsOption = (G.SoundsOption + 1) % NUM_SOUNDS_OPTIONS;
            }
        },
    },
});

defineObject('oSettingsMusic', {
    draw(self) {
        inherited(self, 'oSettingsMusic', 'draw');
        const names = [['Off', ''], ['Retro', 'Mono'], ['Retro', 'Poly']][G.MusicOption] || ['???', ''];
        drawOption(self, 'Music', names);
    },
    keyPress: {
        [vk_space](self) {
            if (self.selectionIndex === G.selectedItem) {
                G.MusicOption = (G.MusicOption + 1) % NUM_MUSIC_OPTIONS;     // (heard from the next tune)
            }
        },
    },
});

defineObject('oSettingsLocked', {
    create(self) {
        inherited(self, 'oSettingsLocked', 'create');
        self.captain_index = 0;
    },
    draw(self) {
        const { midx, midy } = buttonGeometry(self);
        inherited(self, 'oSettingsLocked', 'draw');
        SpriteDraw('sLock', 0, midx, midy);
        SpriteDraw('sButton', 0, self.x, self.y);
    },
    keyPress: {
        [vk_space]() { /* locked */ },
        // Easter egg: on the CpPogwash level, type "I AM THE CAPTAIN"...
        [vk_anykey](self) {
            if (G.GameState.LastLevel !== 50) return;
            const secret = 'IAMTHECAPTAIN';
            if (self.captain_index >= secret.length) self.captain_index = 0;
            if (Input.lastChar === secret[self.captain_index]) {
                self.captain_index++;
                if (self.captain_index === secret.length && self.selectionIndex === 4) {
                    StopMusic();
                    PlayMusic(MUSIC_PUGWASH);
                }
            } else {
                self.captain_index = 0;
            }
        },
    },
});

// --- Room creation code -----------------------------------------------------------------------

Runtime.roomCreationCode._StartRoom = () => {
    G.selectedItem = 0;
    G.nextSelectedItem = 0;
    G.isdead = false;
    G.yFlip = false;
    G.balloon_time = 0;
    G.dagger_time = 0;
};
Runtime.roomCreationCode.roomTopMenu = () => {
    G.selectedItem = 0;
    G.yFlip = false;
};
Runtime.roomCreationCode.roomClassicMenu = () => { G.selectedItem = 0; };
Runtime.roomCreationCode.roomSettings = () => { G.selectedItem = 0; };

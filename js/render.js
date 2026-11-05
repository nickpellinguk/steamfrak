// Frak! HTML5 - screen layout and drawing helpers
// Ports of ResizeScreen, SpriteDraw, SpriteDrawStretched, TextDraw, DrawLineScaled, TroggDraw,
// ShowRatings, CounterToTime, GetLevelInfo and GetDifficultyName.
'use strict';

// ResizeScreen(w, h): work out the visible window onto the level (in BBC Micro pixels)
function ResizeScreen(w, h) {
    let _w = Math.round(w);
    let _h = Math.round(h);

    G.xScroll = 0;
    G.yScroll = 0;

    G.is_vertical_scroll = (G.level_height > G.level_width);
    if (G.level_height === G.level_width) {
        G.is_vertical_scroll = (_w > _h);
    }

    if (G.is_vertical_scroll) {
        // This is a vertically scrolling level
        if (_w > _h) {
            G.xScroll = Math.floor((_w - _h) * G.level_width / _h / 2);
            _w = _h;
        }
        G.windowWidth = G.level_width;
        G.windowHeight = _h * G.level_width / _w;
    } else {
        // This is a horizontally scrolling level
        if (_h > _w) {
            G.yScroll = Math.floor((_h - _w) * G.level_height / _w / 2);
            _h = _w;
        }
        G.windowWidth = _w * G.level_height / _h;
        G.windowHeight = G.level_height;
    }

    G.screenWidth = _w;
    G.screenHeight = _h;
    G.lastResizeW = w;
    G.lastResizeH = h;
}

function SpriteDraw(spr, frame, x, y) {
    SpriteDrawStretched(spr, frame, x, y, 1, 1);
}

function SpriteDrawStretched(spr, frame, xco, yco, xScale, yScale) {
    let x1, y1, xscale, yscale, y_add;

    if (G.is_vertical_scroll) {
        xscale = G.screenWidth / G.level_width;
        yscale = xscale;
        x1 = xco + G.xScroll;
        y1 = yco - G.yScroll;
        y_add = 0;
    } else {
        yscale = G.screenHeight / G.level_height;
        xscale = yscale;
        x1 = xco - G.xScroll;
        y1 = yco;
        y_add = G.yScroll;
    }

    if (G.yFlip) {
        y1 = G.windowHeight + 1 - y1;   // 2 more than you'd expect, because sprite flips are one pixel out
        y1 += y_add;
        drawSpriteExt(spr, frame, x1 * xscale, y1 * yscale, xscale * xScale, -yscale * yScale);
    } else {
        y1 += y_add;
        drawSpriteExt(spr, frame, x1 * xscale, y1 * yscale, xscale * xScale, yscale * yScale);
    }
}

function TextDraw(xco, yco, text, colour) {
    let x2, y2, y_add, xscale, yscale;

    if (G.is_vertical_scroll) {
        xscale = G.screenWidth / G.level_width;
        yscale = xscale;
        x2 = xco + G.xScroll;
        y2 = yco - G.yScroll;
        y_add = 0;
    } else {
        yscale = G.screenHeight / G.level_height;
        xscale = yscale;
        x2 = xco - G.xScroll;
        y2 = yco;
        y_add = G.yScroll;
    }

    if (G.yFlip) {
        y2 = G.windowHeight + 1 - y2;
        y2 -= 8;
    }
    y2 += y_add;

    drawTextTransformed(x2 * xscale, y2 * yscale, String(text), xscale, yscale, colour);
}

function DrawLineScaled(_x1, _y1, _x2, _y2, width, colour) {
    let xscale, yscale, x1, y1, x2, y2;

    if (G.is_vertical_scroll) {
        xscale = G.screenWidth / G.windowWidth;
        yscale = xscale;
        x1 = (_x1 + G.xScroll) * xscale;
        x2 = (_x2 + G.xScroll) * xscale;
        y1 = (_y1 - G.yScroll) * yscale;
        y2 = (_y2 - G.yScroll) * yscale;
        width = width * xscale;
    } else {
        yscale = G.screenHeight / G.windowHeight;
        xscale = yscale;
        x1 = (_x1 - G.xScroll) * xscale;
        x2 = (_x2 - G.xScroll) * xscale;
        y1 = (_y1 + G.yScroll) * yscale;
        y2 = (_y2 + G.yScroll) * yscale;
        width = width * yscale;
    }

    if (G.yFlip) {
        y1 = G.screenHeight + 1 - y1;
        y2 = G.screenHeight + 1 - y2;
    }

    drawLineWidth(x1, y1, x2, y2, width, colour);
}

function TroggDraw(spr, frame, xx, yy) {
    SpriteDraw(spr, frame, xx, yy);

    // If you're playing Frak! on Christmas Day, you should get this bonus!
    const now = new Date();
    if (now.getMonth() === 11 && now.getDate() === 25) {
        switch (spr) {
            case 'sTrogg_cd_Beeb':
            case 'sTrogg_cn_Beeb':
            case 'sTrogg_cu_Beeb':
                SpriteDraw('sprTroggSantaL_Beeb', 0, xx + 2, yy - 30); break;
            case 'sTrogg_sl_Beeb':
            case 'sTrogg_wl_Beeb':
                SpriteDraw('sprTroggSantaL_Beeb', 0, xx - 2, yy - 30); break;
            case 'sTrogg_yl_Beeb':
                SpriteDraw('sprTroggSantaL_Beeb', 0, xx - 3, yy - 30); break;
            case 'sTrogg_sr_Beeb':
            case 'sTrogg_wr_Beeb':
                SpriteDraw('sprTroggSantaR_Beeb', 0, xx + 2, yy - 30); break;
            case 'sTrogg_yr_Beeb':
                SpriteDraw('sprTroggSantaR_Beeb', 0, xx + 5, yy - 30); break;
        }
    }
}

function CounterToTime(counter, addFraction) {
    if (counter >= 10 * 60 * 60) counter = 10 * 60 * 60 - 1;   // display's upper time limit is "9:59"
    let secs = Math.floor(counter / 60);
    const mins = Math.floor(secs / 60);
    secs = secs % 60;
    let tm = mins + ':' + Math.floor(secs / 10) + (secs % 10);
    if (addFraction) {
        const frame = counter % 60;
        const ms = Math.floor(frame * 1000 / 60);
        tm += '.' + String(ms).padStart(3, '0');
    }
    return tm;
}

function ShowRatings(xco, yco, xstep, startlevel, numlevels, usedash) {
    for (let i = 0; i < numlevels; i++) {
        const r = G.GameState['Restarts_' + (startlevel + i) + '_' + G.difficulty_level];
        let spr = usedash ? 'sRating_None_Small_Beeb' : 'sStopwatch_Outline_Small_Beeb';
        if (r === 0) spr = 'sRating_1_Small_Beeb';
        if (r === 1) spr = 'sRating_2_Small_Beeb';
        if (r === 2) spr = 'sRating_3_Small_Beeb';
        if (r >= 3) spr = 'sRating_Tick_Small_Beeb';
        SpriteDraw(spr, 0, xco + i * xstep, yco);
    }
}

// Level table: [room, name, "good" time in seconds]
const LEVELS = [
    ['room_0', 'Training', 11],

    ['room_A_1', 'Read&Weep', 25],
    ['room_A_2', 'JungledUp', 33],
    ['room_A_3', 'Big Trubs', 18],
    ['room_A_4', 'Lock&Key', 40],
    ['room_A_5', 'SpinCycle', 38],
    ['room_A_6', 'Hypnotism', 45],
    ['room_A_7', 'Sign Here', 30],
    ['room_A_8', 'SwingKing', 44],
    ['room_A_9', 'Key Slope', 60],

    ['room_B_1', 'ZigZagDie', 60 + 18],
    ['room_B_2', 'RopeADope', 60 + 3],
    ['room_B_3', 'ChainGang', 24],
    ['room_B_4', 'BreatheIn', 60],
    ['room_B_5', 'JumpyRope', 28],
    ['room_B_6', 'Gauntlet', 49],
    ['room_B_7', 'NowHateMe', 60 + 5],
    ['room_B_8', 'SpiderWeb', 60 + 12],
    ['room_B_9', 'RedOrDead', 60 + 11],

    ['room_C_1', 'RoundTrip', 46],
    ['room_C_2', 'CrossOver', 60 + 12],
    ['room_C_3', 'Curtains!', 60 + 18],
    ['room_C_4', 'ScrubADub', 60 + 12],
    ['room_C_5', 'LoopDLoop', 60 + 27],
    ['room_C_6', 'Staircase', 60 + 25],
    ['room_C_7', 'ScrubFast', 60],
    ['room_C_8', 'Gus,IFall', 35],
    ['room_C_9', 'NotSoEasy', 60 + 6],

    ['room_D_1', 'Stairway2', 26],
    ['room_D_2', 'LogRhythm', 60 + 50],
    ['room_D_3', 'Ferry,Man', 44],
    ['room_D_4', 'Jump&Wave', 60 + 6],
    ['room_D_5', 'SlideWays', 60 + 11],
    ['room_D_6', 'LeapFaith', 45],
    ['room_D_7', 'LiftShaft', 60 + 47],
    ['room_D_8', 'NiceBelt!', 36],
    ['room_D_9', 'UnderOver', 60 + 5],

    ['room_E_1', 'New World', 60 + 6],
    ['room_E_2', 'RecycleIt', 60 + 60],
    ['room_E_3', 'DeusXFrak', 60 + 40],
    ['room_E_4', 'Stretcher', 60],
    ['room_E_5', 'LogJuggle', 60 * 6 + 15],
    ['room_E_6', 'LittleNoz', 60 * 2],
    ['room_E_7', 'Hanoiance', 60 * 4 + 35],
    ['room_E_8', 'GoodPlace', 60 + 1],
    ['room_E_9', 'ManyRivrs', 60 * 3 + 35],

    ['room_F_1', 'Springery', 47],
    ['room_F_2', 'NearShave', 45],
    ['room_F_3', 'Dr.Bounce', 50],
    ['room_F_4', 'NuttyPine', 42],
    ['room_F_5', 'CpPogwash', 60 + 25],
    ['room_F_6', 'BodyGuard', 60 + 60],
    ['room_F_7', 'SpaceWalk', 60 + 45],
    ['room_F_8', 'DarwinIan', 60 + 16],
    ['room_F_9', 'Born Free', 60 + 60],
];

// GetLevelInfo(levelIndex, what): 0 = room, 1 = name, 2 = good time (seconds)
function GetLevelInfo(levelIndex, what) {
    const lev = LEVELS[levelIndex];
    if (!lev) return what === 0 ? 0 : what === 1 ? 'Unknown' : 0;
    return lev[what];
}

function GetDifficultyName(d) {
    return ['Zero', 'Easy', 'Hard', 'Hard', 'Harder', 'Harder', 'Insane'][d] || 'Zero';
}

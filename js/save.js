// Frak! HTML5 - save game (port of the FrakSave_* scripts)
// The PC version wrote JSON to FrakFile.sav; here the same JSON lives in localStorage.
'use strict';

const SAVEGAME_KEY = 'FrakFile.sav';
const NUM_LEVELS = 55;
const NUM_DIFFICULTIES = 7;
const NUM_GRAPHICS_OPTIONS = 2;    // 0 = Blocky, 1 = Smooth (2 = Electron, not used)
const NUM_SOUNDS_OPTIONS = 2;      // 0 = Off, 1 = On
const NUM_MUSIC_OPTIONS = 3;       // 0 = Off, 1 = RetroMono, 2 = RetroPoly

function FrakSave_SetDefault() {
    G.replay_levelIndex = 1;    // Read&Weep
    G.difficulty_level = 1;     // Easy
    G.GraphicsOption = 0;       // Blocky
    G.SoundsOption = 1;         // On
    G.MusicOption = 2;          // Retro polyphonic

    const gs = {};
    gs.Difficulty = G.difficulty_level;
    gs.LastLevel = G.replay_levelIndex;
    gs.GraphicsOption = G.GraphicsOption;
    gs.SoundsOption = G.SoundsOption;
    gs.MusicOption = G.MusicOption;

    for (let lev = 0; lev < NUM_LEVELS; lev++) {
        gs['GemMedal_' + lev] = false;      // true if you have completed the level after collecting all gems
        gs['BestTime_' + lev] = -1;
        for (let i = 0; i < NUM_DIFFICULTIES; i++) {
            gs['Restarts_' + lev + '_' + i] = -1;
        }
    }
    G.GameState = gs;
}

function FrakSave_Load() {
    let json = null;
    try {
        json = window.localStorage.getItem(SAVEGAME_KEY);
    } catch (e) {
        json = null;
    }
    if (!json) return;
    let game;
    try {
        game = JSON.parse(json);
    } catch (e) {
        return;
    }
    if (!game || typeof game !== 'object') return;

    // Merge so that any keys missing from an old save keep their defaults
    Object.assign(G.GameState, game);
    if (game.Difficulty !== undefined) G.difficulty_level = game.Difficulty;
    if (game.LastLevel !== undefined) G.replay_levelIndex = game.LastLevel;
    if (game.GraphicsOption !== undefined) G.GraphicsOption = game.GraphicsOption % NUM_GRAPHICS_OPTIONS;
    if (game.SoundsOption !== undefined) G.SoundsOption = game.SoundsOption;
    if (game.MusicOption !== undefined) G.MusicOption = game.MusicOption;
}

function FrakSave_Save() {
    try {
        window.localStorage.setItem(SAVEGAME_KEY, JSON.stringify(G.GameState));
    } catch (e) {
        // Storage may be unavailable (private browsing, blocked cookies) - carry on without saving
    }
}

function FrakSave_UpdateLevel(levelIndex, difficulty, ticks, numRestarts, gotAllGems) {
    let doSave = false;
    const ls = '_' + levelIndex;
    const ds = ls + '_' + difficulty;
    const gs = G.GameState;

    const gem = gs['GemMedal' + ls];
    if (gem === undefined || (gotAllGems === true && gem === false)) {
        gs['GemMedal' + ls] = true;
        doSave = true;
    }

    const cur = gs['BestTime' + ls];
    if (cur === undefined || cur < 0 || ticks < cur) {
        gs['BestTime' + ls] = ticks;
        doSave = true;
    }

    const restarts = gs['Restarts' + ds];
    if (restarts === undefined || restarts < 0 || numRestarts < restarts) {
        gs['Restarts' + ds] = numRestarts;
        doSave = true;
    }

    if (doSave) FrakSave_Save();
}

function FrakSave_UpdateOptions() {
    let doSave = false;
    const gs = G.GameState;
    const set = (key, value) => {
        if (gs[key] !== value) { gs[key] = value; doSave = true; }
    };
    set('LastLevel', G.replay_levelIndex);
    set('Difficulty', G.difficulty_level);
    set('GraphicsOption', G.GraphicsOption);
    set('SoundsOption', G.SoundsOption);
    set('MusicOption', G.MusicOption);
    if (doSave) FrakSave_Save();
}

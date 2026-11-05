// Frak! HTML5 - sound effects and the BBC Micro-style music engine
//
// Port of PlaySound, PlayMusic, StopMusic, StartMusic, StepMusic, NotesToArray, TrackSetup,
// MakeEnvelope, MakePitchEnv and SetupMusic. The tunes are synthesised at run time: every voice
// is a looped single-cycle square wave (or a noise sample for drums) whose pitch and volume are
// driven by BBC Micro style ENVELOPE parameters, stepped once per 1/60s game tick.
'use strict';

const Snd = {
    ctx: null,
    master: null,
    buffers: {},
    volumes: {},
    playing: new Set(),     // every active source, so audio_stop_all() can find them
};

function audioInit() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    Snd.ctx = new AC();
    Snd.master = Snd.ctx.createGain();
    Snd.master.gain.value = 0.8;
    Snd.master.connect(Snd.ctx.destination);
    const jobs = [];
    for (const name in SOUND_DATA) {
        const bin = atob(SOUND_DATA[name].data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        Snd.volumes[name] = SOUND_DATA[name].volume;
        jobs.push(new Promise(resolve => {
            Snd.ctx.decodeAudioData(bytes.buffer, buf => { Snd.buffers[name] = buf; resolve(); }, () => resolve());
        }));
    }
    return Promise.all(jobs);
}

function audioResume() {
    if (Snd.ctx && Snd.ctx.state !== 'running') Snd.ctx.resume();
}

// --- GameMaker audio API subset ---------------------------------------------------------------

function audio_play_sound(name, priority, loop) {
    return audioPlay(name, loop, 0);
}

function audio_play_sound_at(name, stereo, loop) {
    return audioPlay(name, loop, stereo / 100);
}

function audioPlay(name, loop, pan) {
    if (!Snd.ctx || !Snd.buffers[name]) return null;
    const ctx = Snd.ctx;
    const src = ctx.createBufferSource();
    src.buffer = Snd.buffers[name];
    src.loop = !!loop;
    const gain = ctx.createGain();
    const base = Snd.volumes[name] === undefined ? 1 : Snd.volumes[name];
    gain.gain.value = base;
    src.connect(gain);
    let out = gain;
    if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = clamp(pan * 0.75, -1, 1);
        gain.connect(p);
        out = p;
    }
    out.connect(Snd.master);
    const h = { src, gain, base, level: 1, from: 1, to: 1, t0: 0, t1: 0, stopped: false };
    src.onended = () => { Snd.playing.delete(h); };
    src.start();
    Snd.playing.add(h);
    return h;
}

function audio_stop_sound(h) {
    if (!h || h.stopped) return;
    h.stopped = true;
    try { h.src.stop(); } catch (e) { /* already stopped */ }
    Snd.playing.delete(h);
}

function audio_stop_all() {
    for (const h of Array.from(Snd.playing)) audio_stop_sound(h);
}

function audio_sound_pitch(h, ratio) {
    if (!h || h.stopped) return;
    h.src.playbackRate.setValueAtTime(ratio, Snd.ctx.currentTime);
}

function audio_sound_get_gain(h) {
    if (!h) return 0;
    const now = Snd.ctx.currentTime;
    if (now >= h.t1 || h.t1 <= h.t0) return h.to;
    return h.from + (h.to - h.from) * (now - h.t0) / (h.t1 - h.t0);
}

// audio_sound_gain(handle, level, time_ms): linear fade to "level" over "time_ms"
function audio_sound_gain(h, level, ms) {
    if (!h || h.stopped) return;
    const now = Snd.ctx.currentTime;
    const current = audio_sound_get_gain(h);
    const g = h.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(current * h.base, now);
    h.from = current;
    h.to = level;
    h.t0 = now;
    h.t1 = now + Math.max(0, ms) / 1000;
    if (ms > 0) {
        g.linearRampToValueAtTime(level * h.base, h.t1);
    } else {
        g.setValueAtTime(level * h.base, now);
    }
}

// --- Sound effects ----------------------------------------------------------------------------

function PlaySound(name) {
    if (G.SoundsOption !== 0) {
        if (name === 'sfxThud' && G.MusicOption > 1) {
            // Don't play Trogg footstep sound effect if polyphonic music is playing!
        } else {
            audio_play_sound(name, 10, false);
        }
    }
}

// --- Music ------------------------------------------------------------------------------------

const MUSIC_NONE = 0, MUSIC_FRAKTHEME = 1, MUSIC_ALITTLEBAGOFWEED = 2, MUSIC_THEMANWHOONCEWASI = 3;
const MUSIC_VICTORYTHEME = 4, MUSIC_INTROSCREEN = 5, MUSIC_SELECTSCREEN = 6, MUSIC_LEVELSCREEN = 7;
const MUSIC_PUGWASH = 8;

const ADSR_WAITING = 0, ADSR_ATTACK = 1, ADSR_DECAY = 2, ADSR_SUSTAIN = 3, ADSR_RELEASE = 4;
const PITCHSTATE_DONE = 0, PITCHSTATE_RATE1 = 1, PITCHSTATE_RATE2 = 2, PITCHSTATE_RATE3 = 3;
const LEFT = -100, LEFTISH = -50, CENTRE = 0, RIGHTISH = 50, RIGHT = 100;

// Instruments
const BASS_GUITAR = 0, SLIDE_GUITAR = 1, LEAD_GUITAR = 2, VIOLIN = 3, UKELELE = 4, JEWS_HARP = 5;
const BOTTLE = 6, TRUMPET = 7, TROMBONE = 8, FLUTE = 9, DRUM = 10, SNARE = 11, HIHAT_CLOSED = 12;
const HIHAT_OPEN = 13, CYMBAL = 14, MALE_VOICE = 15, FEMALE_VOICE = 16, PIANO = 17;
const PUGWASH_LOW = 18, PUGWASH_HIGH = 19;

// Notes
const NOTE_REST = 0, NOTE_EXTEND = 1;
const NOTE_C = 2, NOTE_D = 4, NOTE_E = 6, NOTE_F = 7, NOTE_G = 9, NOTE_A = 11, NOTE_B = 13;
const NOTE_c = 14, NOTE_d = 16, NOTE_e = 18, NOTE_f = 19, NOTE_g = 21, NOTE_a = 23, NOTE_b = 25;

const PITCHENV_NONE = 0, PITCHENV_SLOWUP = 1, PITCHENV_MIDUP = 2, PITCHENV_FASTUP = 3;
const PITCHENV_SLOWTREMOLO = 4, PITCHENV_MIDTREMOLO = 5, PITCHENV_FASTTREMOLO = 6, PITCHENV_MAJORTHIRD = 7;

// One semitone = 8 pitch steps (BBC Micro SOUND command resolution was a quarter semitone)
function noteRatio(index) { return Math.pow(2, index / 96); }

function MakeEnvelope(sfx, volume, octave, step, aa, ad, as, ar, ala, ald) {
    // Note: BBC Micro envelopes have a 1/100th second timestep
    return { sfx, volume, octave, step, aa, ad, as, ar, ala, ald };
}

function MakePitchEnv(doRepeat, o1, r1, d1, o2, r2, d2, o3, r3, d3) {
    return { doRepeat, o1, r1, d1, o2, r2, d2, o3, r3, d3 };
}

// Parse a note string like "c3 G3 A2 -2 e2? +4" into packed note values
function NotesToArray(voiceBase, notes) {
    const s = notes + ' ';
    const out = [];
    let j = 0;
    const PITCH = { '-': NOTE_REST, '+': NOTE_EXTEND, C: NOTE_C, D: NOTE_D, E: NOTE_E, F: NOTE_F,
        G: NOTE_G, A: NOTE_A, B: NOTE_B, c: NOTE_c, d: NOTE_d, e: NOTE_e, f: NOTE_f, g: NOTE_g,
        a: NOTE_a, b: NOTE_b };
    const ENV = { '^': PITCHENV_SLOWUP, '?': PITCHENV_MIDUP, '!': PITCHENV_FASTUP,
        '@': PITCHENV_SLOWTREMOLO, '~': PITCHENV_MIDTREMOLO, '*': PITCHENV_FASTTREMOLO,
        '%': PITCHENV_MAJORTHIRD };
    const slen = s.length - 1;  // GML loop ran while j < string_length (1-based)
    while (j < slen) {
        const ch = s[j++];
        let pitch = (ch in PITCH) ? PITCH[ch] : -1;
        if (s[j] === '#') { pitch++; j++; }
        if (s[j] === 'b') { pitch--; j++; }
        let duration = 0;
        for (; j < slen; j++) {
            const c = s.charCodeAt(j);
            if (c < 48 || c > 57) break;
            duration = duration * 10 + (c - 48);
        }
        let env = PITCHENV_NONE;
        if (s[j] in ENV) { env = ENV[s[j]]; j++; }
        let voice = voiceBase;
        if (voice === DRUM) {
            // This is a drum track, so convert pitch to a drumkit sound
            switch (pitch) {
                case NOTE_C: voice = DRUM; pitch = NOTE_C; break;
                case NOTE_D: voice = SNARE; pitch = NOTE_C; break;
                case NOTE_E: voice = HIHAT_OPEN; pitch = NOTE_C; break;
                case NOTE_F: voice = HIHAT_CLOSED; pitch = NOTE_C; break;
                case NOTE_G: voice = CYMBAL; pitch = NOTE_C; break;
            }
        }
        for (; j < slen; j++) if (s[j] !== ' ') break;
        out.push({ pitch, voice, duration, env });
    }
    return out;
}

// Concatenate (indexed) subtracks into one track
function TrackSetup(parts, stereo, indexString) {
    const track = { stereo, notes: [] };
    for (const ch of indexString) {
        const c = ch.charCodeAt(0);
        const index = (c >= 48 && c <= 57) ? c - 48 : 10 + (c - 65);
        const sub = parts[index] || [];
        for (const n of sub) {
            if (n.pitch === NOTE_EXTEND) {
                if (track.notes.length) track.notes[track.notes.length - 1].duration += n.duration;
            } else {
                track.notes.push(Object.assign({}, n));
            }
        }
    }
    return track;
}

const M = {};    // music data and playback state

function SetupMusic() {
    M.pitchenvs = [];
    M.pitchenvs[PITCHENV_NONE] = MakePitchEnv(false, 0, 0, 0, 0, 0, 1, 0, 0, 1);
    M.pitchenvs[PITCHENV_SLOWUP] = MakePitchEnv(false, -8, 0.25, 8 * 4, 0, 0, 1, 0, 0, 1);
    M.pitchenvs[PITCHENV_MIDUP] = MakePitchEnv(false, -8, 0, 5, -8, 8 / 16, 16, 0, 0, 1);
    M.pitchenvs[PITCHENV_FASTUP] = MakePitchEnv(false, -8, 1, 8 * 1, 0, 0, 1, 0, 0, 1);
    M.pitchenvs[PITCHENV_SLOWTREMOLO] = MakePitchEnv(true, 0, 0.5, 2, 1, -0.5, 4, -2, 0.5, 2);
    M.pitchenvs[PITCHENV_MIDTREMOLO] = MakePitchEnv(true, 0, 1, 1, 1, -1, 2, -1, 1, 1);
    M.pitchenvs[PITCHENV_FASTTREMOLO] = MakePitchEnv(true, 0, 1, 2, 2, -1, 4, -2, 2, 1);
    M.pitchenvs[PITCHENV_MAJORTHIRD] = MakePitchEnv(true, 0, 32, 1, 32, -32, 1, 0, 0, 0);

    const sq = 'sfxPureSquare';
    const S = M.sounds = [];
    S[BASS_GUITAR] = MakeEnvelope(sq, 0.20, 0, 3, 120, -10, -3, -6, 120, 70);
    S[SLIDE_GUITAR] = MakeEnvelope(sq, 0.10, 1, 2, 120, -20, -1, -2, 120, 60);
    S[LEAD_GUITAR] = MakeEnvelope(sq, 0.10, 1, 2, 120, -20, -1, -4, 120, 70);
    S[FLUTE] = MakeEnvelope(sq, 0.10, 1, 2, 10, -3, -1, -7, 110, 80);
    S[UKELELE] = MakeEnvelope(sq, 0.15, 1, 1, 120, -20, -2, -2, 120, 60);
    S[VIOLIN] = MakeEnvelope(sq, 0.10, 1, 2, 20, -5, -1, -4, 120, 80);
    S[MALE_VOICE] = MakeEnvelope(sq, 0.12, 1, 2, 20, -5, -1, -4, 120, 80);
    S[FEMALE_VOICE] = MakeEnvelope(sq, 0.12, 2, 2, 20, -5, -1, -4, 120, 80);
    S[TRUMPET] = MakeEnvelope(sq, 0.15, 1, 2, 40, -7, -1, -6, 120, 90);
    S[PIANO] = MakeEnvelope(sq, 0.15, 0, 1, 120, -10, -2, -10, 120, 80);
    S[PUGWASH_LOW] = MakeEnvelope(sq, 0.15, 0, 1, 60, -6, -2, -2, 120, 90);
    S[PUGWASH_HIGH] = MakeEnvelope(sq, 0.15, 1, 1, 60, -6, -2, -2, 120, 90);
    S[DRUM] = MakeEnvelope('sfxBeebNoise6', 5.0, 0, 1, 125, -40, -30, -30, 125, 45);
    S[SNARE] = MakeEnvelope('sfxBeebNoise5', 3.0, 0, 1, 125, -20, -10, -10, 125, 85);
    S[HIHAT_OPEN] = MakeEnvelope('sfxBeebNoise4', 3.0, 0, 1, 125, -30, -20, -40, 125, 65);
    S[HIHAT_CLOSED] = MakeEnvelope('sfxBeebNoise4', 3.0, 0, 1, 125, -30, -40, -40, 125, 65);
    S[CYMBAL] = MakeEnvelope('sfxBeebNoise4', 3.0, 0, 1, 125, -15, -15, -15, 125, 85);

    const N = NotesToArray;

    // FRAK THEME
    M.fdrums = [
        N(DRUM, '-16 -2 F2 -2 F2 -2 F2 -2 F2 '),
        N(DRUM, 'C2 F2 C1 E1 F2 C2 F2 -2 F2 ' + 'C2 F2 C1 E1 F2 C2 C2 C2 F1 F1 '),
        N(DRUM, 'C2 F2 C1 E1 F2 C2 F2 -2 F2 ' + 'C2 F2 C1 E1 F2 C2 C2 C2 F1 F1 '),
        N(DRUM, 'C2 F2 C1 E1 F2 C2 F2 -2 F2 ' + 'C2 F2 C1 E1 F2 C2 C2 C2 F1 F1 '),
        N(DRUM, 'C2 F2 C1 E1 F2 C2 F2 -2 F2 ' + 'C2 F2 C1 E1 F2 C2 C2 C2 F2 '),
    ];
    M.fbass = [
        N(BASS_GUITAR, '-32 '),
        N(BASS_GUITAR, 'c3 G3 A2 c3 G2 G1 A2 ' + 'c3 G3 A2 c2 d2 d#2 e2 '),
        N(BASS_GUITAR, 'f3 c3 d2 f3 A1 A1 A#1 B1 c1 ' + 'f3 c2 c1 d2 f1 f1 e2 f2 f#2 '),
        N(BASS_GUITAR, 'g3 d2 d1 e2 g3 B1 c1 B1 c#1 d1 ' + 'g3 d2 d1 e2 g1 g#1 a1 d#2 c1 d2 '),
        N(BASS_GUITAR, 'c3 c1 E3 E1 F3 F1 F#3 F#1 ' + 'G1 F#1 G1 G#2 A#1 G#2 G2 G2 A2 B2 '),
    ];
    M.fintro = [
        undefined,
        N(BASS_GUITAR, 'c3 -13 ' + 'c3 -7 d2 d#2 e2 '),
        N(BASS_GUITAR, 'f3 -8 A1 A1 A#1 B1 c1 ' + 'f3 -9 f2 f#2 '),
        N(BASS_GUITAR, 'g3 -8 B1 c1 B1 c#1 d1 ' + 'g3 -11 d2 '),
        N(BASS_GUITAR, 'c3 -11 F#2 ' + 'G3 -11 B2 '),
    ];
    M.fslide = [
        N(SLIDE_GUITAR, '-32 '),
        N(SLIDE_GUITAR, '+16 -14 A2? '),
        N(SLIDE_GUITAR, '+16 -14 B2? '),
        N(SLIDE_GUITAR, '+16 -14 -2 '),
        N(SLIDE_GUITAR, '-2 c2 Bb4 -2 A2 Ab2 -2 ' + '-2 G3 -1 F#2 G2 -4 E2? '),
        N(SLIDE_GUITAR, '-16 -14 E2? '),
    ];
    M.fukelele = [
        N(UKELELE, '-32 '),
        N(UKELELE, '-14 D#2 E2 G1 D#1 E1 C1 D2 C4 -4 '),
        N(UKELELE, '-14 G#2 A2 c1 G#1 A1 F1 G2 F4 -4 '),
        N(UKELELE, '-14 A#2 B2 d1 A#1 B1 G1 A2 G4 -4 '),
    ];
    M.fmalevoice = [
        N(MALE_VOICE, '-32 '),
        N(MALE_VOICE, 'e2 e2 e2 A2 ' + 'c1 c2 e1 -2 A2 ' + 'c2 c2 c2 c1 e3? -6 '),
        N(MALE_VOICE, 'd#2 d#2 d#2 A2 ' + 'c1 c2 d#1 -2 A2 ' + 'c2 c2 c2 c1 F3 -6 '),
        N(MALE_VOICE, 'd2 d2 d2 c2 ' + 'd1 d2 d2 -1 c2 ' + 'd2 d2 d2 c1 d#1? ' + '+2 -4 c1 c1 '),
        N(MALE_VOICE, 'e2! e2! e2! -1 c1 ' + 'd#1 d#2 d#3 c1 c1 ' + 'g2 g2 f2 d#2! ' + 'c2 -6 '),
    ];
    M.ffemalevoice = [
        N(FEMALE_VOICE, '-32 '),
        N(FEMALE_VOICE, 'c2~ -2 c2~ -2 ' + 'c2~ -2 c2~ -2 ' + 'C2 C1 C3 D2 ' + 'D#1 D2 D2 C1 -2 '),
        N(FEMALE_VOICE, 'c2~ -2 c2~ -2 ' + 'c2~ -2 c2~ -2 ' + 'C2 C1 C3 D2 ' + 'D#1 D2 D2 C1 -2 '),
        N(FEMALE_VOICE, 'd2~ -2 d2~ -2 ' + 'd2~ -2 d2~ -1 C1' + 'C2 C2 C1 D3 ' + 'D#1 D2 C2 -1 C1 C1 '),
        N(FEMALE_VOICE, 'C2 C2 C1 C2 -1 ' + 'C2 C2 C1 C2 -1 ' + 'G2 G2 F2 D#2 ' + 'C2 -6 '),
    ];
    M.fviol = [
        N(VIOLIN, '-32 '),
        N(VIOLIN, '-2 g8^ f1 g1 e1 c1 -1 c1 ' + 'e2 e2 f1 g2 e7~ -2 '),
        N(VIOLIN, '-2 g8^ f1 g1 d#1 c1 -1 c1 ' + 'c2 c2 d#1 c1 Bb2 c6~ -2 '),
        N(VIOLIN, '-2 g8^ f1 g1 d#1 d1 -1 g1 ' + 'g2 g2 a#1 g1 f2 g6~ -2 '),
        N(VIOLIN, 'g2! g2! f1 e1 -2 ' + 'g2! g2! f1 d#1 -2 ' + 'g2! a#1 g2! a#1 g2! -1 a#1 g1 a#1 g2 a#1 -1 '),
    ];

    // A LITTLE BAG OF WEED
    M.wdrums = [
        N(DRUM, 'C3 F2 F1 E3 F2 F1 ' + 'E3 F2 F1 E2 E1 F2 F1 ' + 'C3 F2 F1 E3 F2 F1 ' + 'E3 F2 F1 E2 E1 F2 F1 '),
        N(DRUM, 'C3 F2 F1 E3 F2 F1 ' + 'E3 F2 F1 E2 E1 F2 F1 ' + 'C3 E3 -2 E3 -1 ' + 'E3 -2 F1 E2 F1 E3  '),
    ];
    M.wintro = [
        N(BASS_GUITAR, '-48 '),
        N(BASS_GUITAR, 'c3 -3 g3 -3 ' + 'd#3 -2 B2 -1 B2 -1 B1 ' + 'c3 -9 ' + '-8 G1 B3 '),
        N(BASS_GUITAR, 'c3 -9 ' + '-8 B2 -1 B1 ' + 'c2 -10 ' + '-12 '),
        N(BASS_GUITAR, 'c3 -9 ' + '-8 B2 -1 B1 ' + 'c2 -10 ' + '-2 g4 f2 -1 eb2 -1 '),
    ];
    M.wbass = [
        N(BASS_GUITAR, '-48 '),
        N(BASS_GUITAR, 'c3 -3 g3 -3 ' + 'd#3 -2 B2 -1 B2 -1 B1 ' + 'c3 -3 g3 -3 ' + 'd#3 G3 -2 G3 -1 '),
        N(BASS_GUITAR, 'c3 -3 g3 -3 ' + 'd#3 -2 B2 -1 B2 -1 B1 ' + 'c2 -1 c2 -1 d2 -1 d2 -1 ' + 'eb2 -1 eb2 -1 d2 eb1 c2 -1 '),
        N(BASS_GUITAR, 'F2 -1 G2 -1 Ab2 -1 Bb2 -1 ' + 'c2 -1 d2 -1 eb2 -1 f2 -1 ' + 'eb2 eb1 eb2 -1 d2 d1 d2 -1 ' + 'c2 c1 c2 -1 G2 G1 F#2 -1 '),
        N(BASS_GUITAR, 'F2 -1 G2 -1 Ab2 -1 F2 -1 ' + 'F#2 -1 G2 -1 A2 -1 F#2 -1 ' + 'Ab3 -2 Ab2 -5 ' + 'G3 -2 G2 -5 '),
        // (The GML source had a stray extra '+' before the third string on these two lines.)
        N(BASS_GUITAR, 'c3  -3  c3 -2 d1 ' + '+2 d3 d1 d3 -3 ' + 'eb3 -3 eb3 -2 f1 ' + '+2 f3 f1 f3 -3 '),
        N(BASS_GUITAR, 'Ab3 -3 Ab3 -2 G1 ' + '+2 G3 G1 G3 -2 G1 ' + 'c3 -21 '),
        N(BASS_GUITAR, 'F2 -1 F2 -1 G2 -1 G2 -1 ' + 'Ab2 -1 Ab2 -1 Bb2 -1 Bb2 -1 ' + 'c2 c1 c2 -1 d2 -1 d2 -1 ' + 'eb2 -1 eb2 -1 d2 -1 c2 -1 '),
        N(BASS_GUITAR, 'F2 -1 F2 -1 G2 -1 G2 -1 ' + 'Ab2 -1 Ab2 -1 F2 -1 F2 -1 ' + 'Ab3 -2 Ab2 -5 ' + 'G3 -2 G2 -5 '),
        N(BASS_GUITAR, 'F2 -1 F2 -1 Eb2 -1 Eb2 -1 ' + 'D2 -1 D2 -1 F#2 -1 F#2 -1 ' + 'Ab3 -2 Ab2 -5 ' + 'G3 -2 G2 -5 '),
    ];
    M.wmale = [
        N(MALE_VOICE, '-48 '),
        N(MALE_VOICE, 'f2 eb1 f2 eb1 g6^ ' + '-12 ' + '-24 '),
        N(MALE_VOICE, 'f2 eb1 f2 eb1 g6^ ' + '-6 g1 -1 g1 B2 -1' + 'c2 -22 '),
        N(MALE_VOICE, 'f3 eb3 f2 eb3 -1 ' + 'f3 eb3 f3 eb3 ' + 'g3 g3 f2 eb3 d1 ' + '+1 -2 c3 d3 eb3 '),
        N(MALE_VOICE, 'f3 eb3 f2 eb3 -1 ' + 'f#3 c3 d3 eb3 ' + 'f3 eb3 f2 eb3 -1 ' + 'g2 b5 -5 '),
        N(MALE_VOICE, 'c2 c1 c2 c1 c2 -1 c2 c1 ' + 'B2 B2 -1 B2 -5 ' + 'Bb2 Bb1 Bb2 Bb1 Bb2 -1 Bb2 Bb1 ' + ' A2 A2 -1 A2 -5 '),
        N(MALE_VOICE, 'F2 Eb1 F2 Eb1 G6^ ' + '-6 G1 -1 G1 G2 -1' + 'c2 -22 '),
        N(MALE_VOICE, 'F2 Eb1 F2 Eb1 G6^ ' + '-6 G1 -1 G1 G2 -1' + 'c9 -15 '),
    ];
    M.wtrump = [
        N(TRUMPET, '-48 '),
        N(TRUMPET, '-2 c1 B2 G1 Bb2 A1 F2 Ab1 ' + 'G2 Eb1 F#2 G1 Eb2 F1 Eb2 F1 ' + 'G2 Ab1 G2 F1 -3 F2 G1 F2 Eb1 -3 D2 Eb1 D2 C1 '),
        N(TRUMPET, '-2 c1 B2 G1 Bb2 A1 F2 Ab1 ' + 'G2 Eb1 F#2 G1 Eb2 F1 Eb2 F1 ' + 'G2 Ab1 F#2 G1 -3 G2 Ab1 F#2 G1 -3 G2 Ab1 F#2 G1 '),
        N(TRUMPET, '-2 c1 B2 G1 Bb2 A1 F2 Ab1 ' + 'G2 Eb1 F#2 G1 Eb2 F1 Eb2 F1 ' + 'G3 G3 Bb2 A1 Ab2 G1 ' + '+3 eb3 -2 B3 -1 '),
    ];
    M.wpiano = [
        N(PIANO, '-48 '),
        N(PIANO, 'c3  eb3  g2 b#3 b1 ' + '+2 f1 d3  B3 -3 ' + 'db3  g3 bb2 b#3 a1 ' + '+2 f1 c3  A3 -3 '),
        N(PIANO, 'F#3 Bb3  c2 d#3 g1 ' + '+2 g4 f2 eb4 ' + 'c3 -21 '),
    ];
    M.wukelele = [
        N(UKELELE, '-48 '),
        N(UKELELE, '-24 ' + '-2 f#1 g2 -1 f#1 g2 -2 f#1 ' + 'g2 -3 g1 f2 eb2 -2 '),
        N(UKELELE, '-24 ' + '-2 f#1 g2 -1 f#1 g2 -2 f#1 ' + 'g2 -3 g1 f2 eb1 c2 Bb1 '),
    ];
    M.wviolin = [
        N(VIOLIN, '-48 '),
        N(VIOLIN, 'Ab24 G24'),
        N(VIOLIN, 'Ab12 A12 c3 -2 c2 -5 B3 -2 B2 -5 '),
        N(VIOLIN, 'F24 Eb24'),
        N(VIOLIN, 'F12 F#12 c3 -2 c2 -5 B3 -2 B2 -5 '),
    ];

    // THE MAN WHO ONCE WAS I
    M.mdrums = [
        N(DRUM, '-48'),
        N(DRUM, 'C3 F2 F1 E3 F2 C1' + '+2 C3 F1 E3 F3 ' + 'C3 F2 F1 E3 F2 C1' + '+2 C3 F1 E3 F3 '),
    ];
    M.mintro = [
        N(BASS_GUITAR, '-48 '),
        N(BASS_GUITAR, 'D5 A4 D3 ' + 'E5 A4 E3 ' + 'D3 -9 ' + '-12 '),
        N(BASS_GUITAR, 'D5 A4 D3 ' + 'E5 A4 E3 ' + 'D3 -9 ' + '+3 E3 F3 F#3 '),
        N(BASS_GUITAR, 'G5 G4 -3 ' + 'Eb5 Eb4 -3 ' + 'G5 G4 D3 ' + 'G3 -9 '),
        N(BASS_GUITAR, 'G5 G4 -3 ' + 'Eb5 Eb4 -3 ' + 'A3 -9 ' + '-9 C#3 '),
    ];
    M.mbass = [
        N(BASS_GUITAR, '-48 '),
        N(BASS_GUITAR, 'A5 A4 -3 ' + 'Bb5 Bb4 -3 ' + 'A3 A3 G2 F3 D1 ' + '+2 A4 G3 F3 '),
        N(BASS_GUITAR, 'D5 A4 D3 ' + 'E5 A4 E3 ' + 'F3 F3 E2 F1 E2 D1 ' + '+2 A4 G3 F3 '),
        N(BASS_GUITAR, 'D5 A4 D3 ' + 'E5 A4 E3 ' + 'F3 F3 E2 F1 E3 ' + 'D3 E3 F3 F#3 '),
        N(BASS_GUITAR, 'G5 G4 -3 ' + 'Eb5 Eb4 -3 ' + 'G3 G3 Eb2 D3 G1 ' + '+3 D3 E3 F#3 '),
        N(BASS_GUITAR, 'G5 G4 -3 ' + 'Eb5 Eb4 -3 ' + 'A3 A3 Bb2 Bb3 A1 ' + '+3 -6 E3 '),
        N(BASS_GUITAR, 'A5 A4 -3 ' + 'G#5 G#4 -3 ' + 'A3 A3 Bb2 Bb3 A1 ' + '+2 E4 F#3 G#3 '),
        N(BASS_GUITAR, 'A5 A4 -3 ' + 'Bb5 Bb4 -3 ' + 'B5 B4 -3 ' + 'c#3 A3 B3 c#3 '),
        N(BASS_GUITAR, 'A5 A4 -3 ' + 'Bb5 Bb4 -3 ' + 'B5 B4 -3 ' + 'Bb5 Bb4 -3 '),
    ];
    M.mmale = [
        N(MALE_VOICE, '-48 '),
        N(MALE_VOICE, '-24 ' + '-12 -8 F1 G2 F1 '),
        N(MALE_VOICE, 'A3! -3 -2 F1 G2 F1 ' + 'A2! A1 A2 G2 F2 F2 F1 ' + 'A2! A1 A2 G3 F3 D1 ' + '+2 A4! G3 F3'),
        N(MALE_VOICE, 'G3 F2 A3 -1 d3 ' + 'e2 f3 -1 -5 A1 ' + 'f3 f3 e3 d2 A1 ' + '+2 -1 -5 c1 c2 Bb1 '),
        N(MALE_VOICE, 'd2 d3 -1 -6 ' + 'c2 Bb1 c2 c#1 c2 -1 Bb3' + 'd2! d3 c3 Bb1 c2 d1! ' + '+3 -6 D3 '),
        N(MALE_VOICE, 'd2! d3 c4 Bb3 ' + 'c#2 c#3 c4 Bb3 ' + '-1 A3 A2 G3 G3 ' + 'E3 -5 F1 F2 F1 '),
        N(MALE_VOICE, 'E2 E3 -4 E2 E1 ' + 'F2 F4 -5 F1 ' + 'E3 E3 F3 F1 F2 ' + 'E3 -6 E3 '),
        N(MALE_VOICE, 'E3 A2 A3 -3 E1 ' + 'F3 Bb2 Bb2 -5 ' + '-2 E1 E2 E1 B3 c2 B1 ' + '+3 A3 F3 G3 '),
        N(MALE_VOICE, 'A3 d3 -2 e2 f2 ' + 'e3 A3 -3 d2 e1 ' + 'f3 f3 e2 e3 d1 ' + '+2 A3 -1 -2 A1 G2 F1 '),
        N(MALE_VOICE, 'A3 D3 -3 d3 ' + 'a2! g#3 g2 -2 f2 g1 ' + '-3 a2! g3 f3 e1 ' + '+2 d3 -1 -3 d3 '),
        N(MALE_VOICE, 'd3! d3 d3 D2 c#1 ' + '+2 c#3 c3! -1 Bb2 Bb1 ' + 'd3! d3 c3 Bb2 d1! ' + '+2 -1 -6 D3 '),
        N(MALE_VOICE, 'd2! d3 c4 Bb3 ' + 'c#2 c#1 c#2 c3 -1 Bb2 Bb1 ' + 'A3 A3 G1 G3 -2 ' + 'E3 -6 -2 A1 '),
        N(MALE_VOICE, 'A2 d3 e3! -1 e2 f1 ' + 'e2 d3 -1 -3 d3 ' + 'e3 d3 A2 F3 G#1 ' + 'G3 -6 A3'),
        N(MALE_VOICE, 'A3 d3 e3 f3 ' + 'g#2! g#3! g2 -2 f3 ' + 'a3! a3! g2 f3 d1 ' + '+3 -5 F1 G2 F1 '),
    ];
    M.mviolin = [
        N(UKELELE, '-48 '),
        N(UKELELE, 'D5 F3 F1 D2 -1 ' + 'D5 F3 F1 D2 -1 ' + 'C#3 C#3 D2 E3 F1 ' + '+2 C#4 D3 E3 '),
        N(UKELELE, 'F5 A3 A1 F2 -1 ' + 'C#5 E3 E1 C#2 -1 ' + 'F3 A3 C#2 E3 D1' + '-2 C#4 D3 E3 '),
        N(UKELELE, 'F5 A3 A1 F2 -1 ' + 'C#5 E3 E1 C#2 -1 ' + 'F3 A3 C#2 E4 ' + 'F#3 G3 G#3 A3 '),
        N(UKELELE, 'Bb5 Bb3 G1 Bb2 -1 ' + 'G5 G3 Bb1 G2 -1 ' + 'Bb3 Bb3 G2 F#3 -1 ' + 'Bb3 F#3 G3 A3 '),
        N(UKELELE, 'Bb5 Bb3 G1 Bb2 -1 ' + 'G5 G3 Bb1 G2 -1 ' + 'E3 E3 D2 D3 C#1 ' + '+3 -5 E1 D#2 D1 '),
        N(UKELELE, 'C#5 E3 E1 C#2 -1 ' + 'D5 F3 F1 D2 -1 ' + 'C#3 C#3 D2 D3 C#1 ' + '+2 C#4 D3 E3 '),
        N(UKELELE, 'C#5 E3 E1 C#2 -1 ' + 'D5 F3 F1 D2 -1 ' + 'E5 E3 E1 E2 -1 ' + '-3 C#3 D3 E3 '),
        N(UKELELE, 'D5 F3 F1 D2 -1 ' + 'D5 F3 F1 D2 -1 ' + 'D5 F3 F1 D2 -1 ' + 'D5 F3 F1 D2 -1 '),
    ];

    // VICTORY
    M.vbass = [N(BASS_GUITAR, '-32 '), N(BASS_GUITAR, 'c4 Bb4 ' + 'A4 E4 ' + 'D4 G4 ' + 'E2 Eb2 E4 ')];
    M.vflute = [N(FLUTE, '-32 '), N(FLUTE, 'E1 E2 G3 G1 G#1 ' + 'A2 G1 E3 Eb2 ' + 'D1 E1 D1 G2 A1 B2 ' + 'c2 F#2 G4 ')];
    M.vukelele = [N(UKELELE, '-32 '), N(UKELELE, 'c2 -2 c1 c1 c1 -1 ' + 'c#2 -2 c#1 c#1 c#1 -1 ' + 'c2 -2 B1 B1 d1 -1 ' + 'G2 -B2 c4 ')];

    // PROCpugwash
    M.pbass = [
        N(PUGWASH_LOW, 'F3 A3 F3 A3 F3 A3 F3 A3 '),
        N(PUGWASH_LOW, 'C3 E3 C3 E3 C3 E3 C3 E3 '),
        N(PUGWASH_LOW, 'F3 A3 F3 A3 F3 A3 F3 A3 '),
        N(PUGWASH_LOW, 'C3 E3 C3 E3 F3 A3 F3 A3 '),
        N(PUGWASH_LOW, 'F3 A3 F3 A3 Bb3 d3 Bb3 d3 '),
        N(PUGWASH_LOW, 'Bb3 d3 Bb3 d3 C3 E3 C3 G3 '),
        N(PUGWASH_LOW, 'F3 A3 Eb3 A3 D3 D3 Db3 F3 '),
        N(PUGWASH_LOW, 'C3 E3 C3 G3 F3 A3 F6 '),
    ];
    M.pmid = [
        N(PUGWASH_LOW, '-3 c3 -3 c3 -3 c3 -3 c3 '),
        N(PUGWASH_LOW, '-3 G3 -3 G3 -3 G3 -3 G3 '),
        N(PUGWASH_LOW, '-3 c3 -3 c3 -3 c3 -3 c3 '),
        N(PUGWASH_LOW, '-3 G3 -3 G3 -3 c3 -3 c3 '),
        N(PUGWASH_LOW, '-3 c3 -3 c3 -3 f3 -3 f3 '),
        N(PUGWASH_LOW, '-3 f3 -3 f3 -3 G3 -3 Bb3 '),
        N(PUGWASH_LOW, '-3 c3 -3 c3 -3 F3 -3 Ab3 '),
        N(PUGWASH_LOW, '-3 G3 -3 Bb3 -3 c3 -3 -3 '),
    ];
    M.ptune = [
        N(PUGWASH_HIGH, 'F1 F1 F1 F3 F1 F1 F1 F2 c1 A2 F1 A2 c1 f2 c1 A2 F1 '),
        N(PUGWASH_HIGH, 'C1 C1 C1 C3 C1 C1 C1 C2 G1 E2 C1 E2 G1 A#2 G1 E2 C1 '),
        N(PUGWASH_HIGH, 'F1 F1 F1 F3 F1 F1 F1 F2 c1 A2 F1 A2 c1 f3 F3 '),
        N(PUGWASH_HIGH, 'C2 f1 e2 d1 c2 A#1 A2 G1 F3 A3 F3 A2 A#1 '),
        N(PUGWASH_HIGH, 'c1 c1 c1 c3 c1 c1 c1 c3 d2 e1 f2 e1 d2 c1 A#2 A1'),
        N(PUGWASH_HIGH, 'A#2 c1 d2 c1 A#2 A1 G2 F1 E2 F1 G2 F1 E2 C1 D2 E1'),
        N(PUGWASH_HIGH, 'F1 F1 F1 F3 F1 F1 F1 F3 F1 F1 F1 F3 F1 F1 F1 F3 '),
        N(PUGWASH_HIGH, 'C2 f1 e2 d1 c2 A#1 A2 G1 F3 A3 F6'),
    ];

    M.tracks = [];
    M.voices = [];
    StartMusic(MUSIC_NONE, false);
}

function PlayMusic(which) {
    StopMusic();
    if (G.MusicOption !== 0) {
        StartMusic(which, false);
    } else {
        G.music_currentIndex = which;
    }
}

function StopMusic() {
    for (const v of M.voices) {
        if (v.handle) { audio_stop_sound(v.handle); v.handle = null; }
    }
    M.voices = [];
    M.tracks = [];
    M.totallength = 0;
    M.introlength = 0;
}

function StartMusic(musicIndex, skipIntro) {
    G.music_currentIndex = musicIndex;

    let tempo = 100;            // bpm
    let clicksPerBeat = 4;      // quarter beats
    let totalBeats = 0, introBeats = 0;
    const T = [];
    const poly = (G.MusicOption !== 1);

    switch (musicIndex) {
        case MUSIC_FRAKTHEME:
            tempo = 120;
            T.push(TrackSetup(M.fbass, CENTRE, '412341234123412341234'));
            if (poly) {
                T.push(TrackSetup(M.fdrums, LEFTISH, '012341234123412341234'));
                T.push(TrackSetup(M.fslide, RIGHTISH, '512341234000512341234'));
                T.push(TrackSetup(M.fukelele, LEFTISH, '000001230000000000000'));
                T.push(TrackSetup(M.fmalevoice, RIGHTISH, '000000000123400000000'));
                T.push(TrackSetup(M.fviol, LEFT, '000000000000012340000'));
                T.push(TrackSetup(M.ffemalevoice, RIGHT, '000000000000000001234'));
            }
            totalBeats = (1 + 5 * 4) * 8;
            introBeats = 8;     // i.e. the first 2 bars are the intro
            break;

        case MUSIC_LEVELSCREEN:
            tempo = 120;
            T.push(TrackSetup(M.fintro, CENTRE, '1234'));
            if (poly) T.push(TrackSetup(M.fdrums, LEFTISH, '1234'));
            totalBeats = 4 * 8;
            break;

        case MUSIC_ALITTLEBAGOFWEED:
            tempo = 112; clicksPerBeat = 6;
            T.push(TrackSetup(M.wbass, CENTRE, '123478795656'));
            if (poly) {
                T.push(TrackSetup(M.wdrums, LEFTISH, '010101010101'));
                T.push(TrackSetup(M.wmale, RIGHTISH, '123400005657'));
                T.push(TrackSetup(M.wtrump, RIGHT, '000012130000'));
                T.push(TrackSetup(M.wpiano, CENTRE, '000000001212'));
                T.push(TrackSetup(M.wukelele, RIGHT, '000000000102'));
                T.push(TrackSetup(M.wviolin, RIGHT, '001200340000'));
            }
            totalBeats = 12 * 8;
            break;

        case MUSIC_INTROSCREEN:
            tempo = 112; clicksPerBeat = 6;
            T.push(TrackSetup(M.wintro, CENTRE, '1213'));
            if (poly) T.push(TrackSetup(M.wdrums, LEFTISH, '0101'));
            totalBeats = 4 * 8;
            break;

        case MUSIC_THEMANWHOONCEWASI:
            tempo = 112; clicksPerBeat = 6;
            T.push(TrackSetup(M.mbass, CENTRE, '1234567234581'));
            if (poly) {
                T.push(TrackSetup(M.mdrums, LEFTISH, '1111111111111'));
                T.push(TrackSetup(M.mmale, RIGHTISH, '123456789ABCD'));
                T.push(TrackSetup(M.mviolin, LEFT, '1234567234581'));
            }
            totalBeats = (1 + 12) * 8;
            introBeats = 8;
            break;

        case MUSIC_SELECTSCREEN:
            tempo = 112; clicksPerBeat = 6;
            T.push(TrackSetup(M.mintro, CENTRE, '1234'));
            if (poly) T.push(TrackSetup(M.mdrums, LEFTISH, '1111'));
            totalBeats = 4 * 8;
            break;

        case MUSIC_VICTORYTHEME:
            tempo = 120;
            T.push(TrackSetup(M.vflute, LEFTISH, '100'));
            if (poly) {
                T.push(TrackSetup(M.vbass, CENTRE, '100'));
                T.push(TrackSetup(M.vukelele, RIGHTISH, '100'));
            }
            totalBeats = 3 * 8;
            break;

        case MUSIC_PUGWASH:
            tempo = 112; clicksPerBeat = 6;
            T.push(TrackSetup(M.ptune, CENTRE, '01234567'));
            if (poly) {
                T.push(TrackSetup(M.pbass, LEFTISH, '01234567'));
                T.push(TrackSetup(M.pmid, RIGHTISH, '01234567'));
            }
            totalBeats = 4 * 8;
            break;
    }

    M.tracks = T;
    M.totallength = totalBeats * clicksPerBeat;
    M.introlength = introBeats * clicksPerBeat;
    M.ticksPerQuarterbeat = Math.ceil((60 * 60) / (tempo * clicksPerBeat));
    M.ticks = 0;    // number of 1/60th second ticks that have elapsed so far
    M.voices = T.map(t => ({
        adsr: ADSR_WAITING,
        adsrTicks: 0,
        handle: null,
        stereo: t.stereo,
        pos: 0,
        left: 0,
        pitch: NOTE_c * 8,
        pitchenv: PITCHENV_NONE,
        pitchstate: PITCHSTATE_DONE,
        pitchstart: 0,
        lastpitch: 0,
        instrument: null,
        silent: !!skipIntro,
    }));

    if (skipIntro) {
        // Fast-forward through the intro without making any sound
        const ticks = M.introlength * M.ticksPerQuarterbeat;
        for (let i = 0; i < ticks; i++) StepMusic(true);
        for (const v of M.voices) v.silent = false;
    }
}

function StepMusic(silent) {
    if (!M.totallength || !M.tracks.length) return;

    const doTickAction = (M.ticks % M.ticksPerQuarterbeat === 0);
    const beats = Math.floor(M.ticks / M.ticksPerQuarterbeat);
    if (beats >= M.totallength) {
        const cur = G.music_currentIndex;
        StopMusic();
        StartMusic(cur, true);
        return;
    }

    for (let i = 0; i < M.tracks.length; i++) {
        const v = M.voices[i];
        const track = M.tracks[i];
        const ticks = M.ticks - v.pitchstart;
        let pe = M.pitchenvs[v.pitchenv];
        let pitchoff = 0;

        switch (v.pitchstate) {
            case PITCHSTATE_RATE1:
                if (ticks < pe.d1) {
                    pitchoff = pe.o1 + gmlRound(pe.r1 * ticks);
                } else {
                    v.pitchstate = PITCHSTATE_RATE2;
                    v.pitchstart = M.ticks;
                    pitchoff = pe.o2;
                }
                break;
            case PITCHSTATE_RATE2:
                if (ticks < pe.d2) {
                    pitchoff = pe.o2 + gmlRound(pe.r2 * ticks);
                } else {
                    if (pe.d3 > 0) {
                        v.pitchstate = PITCHSTATE_RATE3;
                        pitchoff = pe.o3;
                    } else {
                        v.pitchstate = PITCHSTATE_RATE1;
                        pitchoff = pe.o1;
                    }
                    v.pitchstart = M.ticks;
                }
                break;
            case PITCHSTATE_RATE3:
                if (ticks < pe.d3) {
                    pitchoff = pe.o3 + gmlRound(pe.r3 * ticks);
                } else if (pe.doRepeat) {
                    v.pitchstate = PITCHSTATE_RATE1;
                    v.pitchstart = M.ticks;
                    pitchoff = pe.o1;
                } else {
                    v.pitchstate = PITCHSTATE_DONE;
                    pitchoff = 0;
                }
                break;
        }

        if (v.handle) {
            const p = v.pitch + pitchoff;
            if (v.lastpitch !== p) {
                v.lastpitch = p;
                audio_sound_pitch(v.handle, noteRatio(p));
            }
        }

        if (doTickAction) {
            if (v.left !== 0) {
                v.left--;
            } else {
                // Grab the next note
                const note = track.notes[v.pos] || { pitch: NOTE_REST, voice: 0, duration: 1, env: 0 };
                v.left = note.duration - 1;
                v.pitchenv = note.env;
                v.pitchstate = (note.env === PITCHENV_NONE) ? PITCHSTATE_DONE : PITCHSTATE_RATE1;
                v.pitchstart = M.ticks;
                v.pos++;
                pe = M.pitchenvs[v.pitchenv];

                if (note.pitch === NOTE_REST || note.pitch < 0) {
                    if (v.adsr !== ADSR_WAITING && v.adsr !== ADSR_RELEASE) {
                        v.adsr = ADSR_RELEASE;
                        const ins = v.instrument;
                        const gain = 127.0 * audio_sound_get_gain(v.handle) / ins.volume;
                        const csec = gain / -ins.ar;
                        audio_sound_gain(v.handle, 0, 10.0 * csec);
                        v.adsrTicks = Math.ceil(csec * 60.0 / 100.0);
                    }
                } else {
                    if (v.handle) { audio_stop_sound(v.handle); v.handle = null; }
                    const ins = M.sounds[note.voice];
                    v.instrument = ins;
                    v.pitch = (ins.octave * 12 + (note.pitch - NOTE_C)) * 8;
                    if (!silent && !v.silent) {
                        v.handle = audio_play_sound_at(ins.sfx, v.stereo, true);
                    }
                    const p = v.pitch + pe.o1;
                    v.lastpitch = p;
                    audio_sound_pitch(v.handle, noteRatio(p));
                    audio_sound_gain(v.handle, 0, 0);
                    v.adsr = ADSR_ATTACK;
                    const csec = (ins.step * ins.ala) / ins.aa;
                    audio_sound_gain(v.handle, ins.volume * ins.ala / 127.0, 10.0 * csec);
                    v.adsrTicks = Math.ceil(csec * 60.0 / 100.0);
                }
            }
        }

        const ins = v.instrument;
        switch (v.adsr) {
            case ADSR_ATTACK:
                if (--v.adsrTicks <= 0) {
                    v.adsr = ADSR_DECAY;
                    const csec = (ins.step * (ins.ald - ins.ala)) / -ins.ad;
                    audio_sound_gain(v.handle, ins.volume * ins.ald / 127.0, 10.0 * csec);
                    v.adsrTicks = Math.ceil(csec * 60.0 / 100.0);
                }
                break;
            case ADSR_DECAY:
                if (--v.adsrTicks <= 0) {
                    v.adsr = ADSR_SUSTAIN;
                    const csec = (ins.step * ins.ald) / -ins.as;
                    audio_sound_gain(v.handle, 0, 10.0 * csec);
                    v.adsrTicks = Math.ceil(csec * 60.0 / 100.0);
                }
                break;
            case ADSR_SUSTAIN:
                if (--v.adsrTicks <= 0) {
                    v.adsr = ADSR_WAITING;
                    v.adsrTicks = 0;
                }
                break;
            case ADSR_RELEASE:
                if (--v.adsrTicks <= 0) {
                    if (v.handle) { audio_stop_sound(v.handle); v.handle = null; }
                    v.adsr = ADSR_WAITING;
                    v.adsrTicks = 0;
                }
                break;
        }
    }

    M.ticks++;
}

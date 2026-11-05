// Frak! HTML5 - start-up
'use strict';

(function () {
    const status = document.getElementById('status');

    function fail(err) {
        status.textContent = 'Sorry, Frak! failed to start: ' + (err && err.message ? err.message : err);
        status.classList.add('error');
        console.error(err);
    }

    function boot() {
        screenInit();
        inputInit(audioResume);
        window.addEventListener('resize', screenUpdateSize);

        // Stop held music notes droning on while the tab is hidden
        document.addEventListener('visibilitychange', () => {
            if (!Snd.ctx) return;
            if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume();
        });

        // Touch devices get on-screen Back (= Backspace) and Full screen buttons
        const bar = document.getElementById('touchbar');
        window.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') bar.classList.add('show');
        }, true);
        const tap = (id, fn) => {
            const el = document.getElementById(id);
            el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioResume(); fn(); });
        };
        tap('btn-back', () => injectKeyPress(vk_backspace));
        tap('btn-fullscreen', () => {
            const d = document;
            if (d.fullscreenElement || d.webkitFullscreenElement) {
                (d.exitFullscreen || d.webkitExitFullscreen).call(d);
            } else {
                const el = d.documentElement;
                const req = el.requestFullscreen || el.webkitRequestFullscreen;
                if (req) req.call(el);
            }
        });

        Promise.all([loadSprites(), audioInit()]).then(() => {
            // First-time game-state setup (oBaseRoom Create in the original)
            FrakSave_SetDefault();
            FrakSave_Load();
            SetupMusic();
            G.music_currentIndex = MUSIC_NONE;
            G.current_levelIndex = G.replay_levelIndex;
            G.yFlip = false;
            G.hasWon = false;
            G.isdead = false;

            status.remove();
            startRoom('_StartRoom');
            runMainLoop();
        }).catch(fail);
    }

    try {
        boot();
    } catch (e) {
        fail(e);
    }
})();

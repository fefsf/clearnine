import { GOALS } from '../game/goals';
import {
  dailyPlayStreak,
  getDailyBest,
  type GameMode,
  type Profile,
} from '../game/stats';
import {
  THEMES,
  isThemeUnlocked,
  themeUnlockHint,
} from '../game/themes';
import { todayKey } from '../game/rng';
import { APP_VERSION } from '../app/version';

export { APP_VERSION };
export type ContinueInfo = { mode: GameMode; score: number };

export type ScreenHandlers = {
  onClassic: () => void;
  onDaily: () => void;
  onContinue: () => void;
  onRecords: () => void;
  onGoals: () => void;
  onThemes: () => void;
  onHowTo: () => void;
  onSettings: () => void;
  onBackHome: () => void;
  onSelectTheme: (id: string) => void;
  onToggleMute: () => void;
  onToggleHaptics: () => void;
  onCheckUpdate: () => void;
};

function backButton(): string {
  return `<button type="button" class="text-btn back-btn" id="btn-back">← Back to menu</button>`;
}

export function renderHome(
  root: HTMLElement,
  profile: Profile,
  h: ScreenHandlers,
  continueInfo: ContinueInfo | null,
): void {
  const dailyBest = getDailyBest(profile);
  const continueBtn = continueInfo
    ? `<button type="button" class="menu-btn continue" id="btn-continue">
          <span class="menu-title">Continue</span>
          <span class="menu-meta">${continueInfo.mode === 'daily' ? 'Today’s Puzzle' : 'Play'} · ${continueInfo.score} points so far</span>
        </button>`
    : '';

  root.innerHTML = `
    <div class="screen home-screen">
      <div class="home-atmosphere" aria-hidden="true">
        <span class="float-block fb1"></span>
        <span class="float-block fb2"></span>
        <span class="float-block fb3"></span>
        <span class="float-block fb4"></span>
        <span class="float-block fb5"></span>
      </div>
      <div class="home-content">
        <div class="home-hero">
          <img class="home-logo" src="./clearnine-logo.png" alt="ClearNine" width="160" height="160" />
          <p class="home-kicker">Block puzzle</p>
          <h1 class="home-title">ClearNine</h1>
          <div class="home-title-rule" aria-hidden="true"></div>
          <p class="home-sub">Simple. Calm. No ads.</p>
          <p class="home-version">v${APP_VERSION}</p>
        </div>

        ${continueBtn}

        <button type="button" class="menu-btn primary" id="btn-classic">
          <span class="menu-title">${continueInfo?.mode === 'classic' ? 'New Play game' : 'Play'}</span>
          <span class="menu-meta">Relaxing game · Best score: ${profile.bestClassic}</span>
        </button>

        <button type="button" class="menu-btn" id="btn-daily">
          <span class="menu-title">${continueInfo?.mode === 'daily' ? 'New Today’s Puzzle' : 'Today’s Puzzle'}</span>
          <span class="menu-meta">One special game each day · Today’s best: ${dailyBest}</span>
        </button>

        <div class="menu-row">
          <button type="button" class="menu-btn secondary" id="btn-records">
            <span class="menu-title">My Scores</span>
          </button>
          <button type="button" class="menu-btn secondary" id="btn-goals">
            <span class="menu-title">Awards</span>
          </button>
        </div>

        <div class="menu-row">
          <button type="button" class="menu-btn secondary" id="btn-themes">
            <span class="menu-title">Colors</span>
          </button>
          <button type="button" class="menu-btn secondary" id="btn-settings">
            <span class="menu-title">Settings</span>
          </button>
        </div>

        <button type="button" class="menu-btn secondary howto-home-btn" id="btn-howto">
          <span class="menu-title">How to Play</span>
        </button>
      </div>
    </div>
  `;
  root.querySelector('#btn-continue')?.addEventListener('click', h.onContinue);
  root.querySelector('#btn-classic')!.addEventListener('click', h.onClassic);
  root.querySelector('#btn-daily')!.addEventListener('click', h.onDaily);
  root.querySelector('#btn-records')!.addEventListener('click', h.onRecords);
  root.querySelector('#btn-goals')!.addEventListener('click', h.onGoals);
  root.querySelector('#btn-themes')!.addEventListener('click', h.onThemes);
  root.querySelector('#btn-settings')!.addEventListener('click', h.onSettings);
  root.querySelector('#btn-howto')!.addEventListener('click', h.onHowTo);
}

export function renderHowTo(root: HTMLElement, h: ScreenHandlers): void {
  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">How to Play</h2>
      <div class="panel-body howto-body">
        <ol class="howto-list">
          <li>
            <strong>Drag a shape</strong>
            <span>From the bottom of the screen onto the big board.</span>
          </li>
          <li>
            <strong>Fill a full line</strong>
            <span>Complete any full row, column, or 3×3 box. Those blocks disappear.</span>
          </li>
          <li>
            <strong>Keep going</strong>
            <span>When your three shapes are used, you get three new ones.</span>
          </li>
          <li>
            <strong>Game over</strong>
            <span>When none of your shapes can fit, the game ends. Your score is saved.</span>
          </li>
          <li>
            <strong>Undo</strong>
            <span>Tap <em>Undo</em> if you make a mistake (limited times per game).</span>
          </li>
        </ol>
        <button type="button" class="primary-btn" id="btn-start-play">Start playing</button>
      </div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
  root.querySelector('#btn-start-play')!.addEventListener('click', h.onClassic);
}

export function renderRecords(root: HTMLElement, profile: Profile, h: ScreenHandlers): void {
  const today = todayKey();
  const streak = dailyPlayStreak(profile);
  const s = profile.stats;
  const recent = profile.recentGames
    .slice(0, 12)
    .map(
      (g) =>
        `<li>
          <span class="rec-mode">${g.mode === 'daily' ? 'Today’s Puzzle' : 'Play'}</span>
          <span class="rec-score">${g.score} points</span>
          <span class="rec-date">${g.date}</span>
        </li>`,
    )
    .join('');

  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">My Scores</h2>
      <div class="panel-body">
        <div class="stat-grid">
          <div class="stat-card"><span class="stat-label">Best Play score</span><span class="stat-num">${profile.bestClassic}</span></div>
          <div class="stat-card"><span class="stat-label">Best today</span><span class="stat-num">${getDailyBest(profile, today)}</span></div>
          <div class="stat-card"><span class="stat-label">Days in a row</span><span class="stat-num">${streak}</span></div>
          <div class="stat-card"><span class="stat-label">Games finished</span><span class="stat-num">${s.gamesPlayed}</span></div>
        </div>
        <h3 class="section-title">Recent games</h3>
        <ul class="recent-list">${recent || '<li class="empty-note">No games yet — tap Play on the menu!</li>'}</ul>
      </div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
}

export function renderGoals(root: HTMLElement, profile: Profile, h: ScreenHandlers): void {
  const items = GOALS.map((g) => {
    const done = profile.unlockedGoals.includes(g.id);
    return `
      <li class="goal-item ${done ? 'done' : ''}">
        <span class="goal-check" aria-hidden="true">${done ? '✓' : ''}</span>
        <div>
          <div class="goal-title">${g.title}</div>
          <div class="goal-desc">${g.description}</div>
          <div class="goal-status">${done ? 'Completed' : 'Not yet'}</div>
        </div>
      </li>`;
  }).join('');

  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">Awards</h2>
      <p class="panel-lead">Little goals to unlock as you play.</p>
      <div class="panel-body">
        <ul class="goal-list">${items}</ul>
      </div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
}

export function renderThemes(root: HTMLElement, profile: Profile, h: ScreenHandlers): void {
  const cards = THEMES.map((t) => {
    const unlocked = isThemeUnlocked(profile, t.id);
    const active = profile.themeId === t.id;
    return `
      <button type="button" class="theme-card ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}"
        data-theme="${t.id}" ${unlocked ? '' : 'disabled'}>
        <span class="theme-swatch" style="background:linear-gradient(135deg,${t.vars['--bg-top']},${t.vars['--accent']})"></span>
        <span class="theme-name">${t.name}</span>
        <span class="theme-hint">${unlocked ? (active ? 'Using now' : 'Tap to use this color') : themeUnlockHint(t.id)}</span>
      </button>`;
  }).join('');

  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">Colors</h2>
      <p class="panel-lead">Pick a look that is easy on your eyes.</p>
      <div class="panel-body theme-grid">${cards}</div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
  root.querySelectorAll<HTMLButtonElement>('.theme-card:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => h.onSelectTheme(btn.dataset.theme!));
  });
}

export function renderSettings(root: HTMLElement, profile: Profile, h: ScreenHandlers): void {
  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">Settings</h2>
      <p class="panel-lead">Tune sound and feel.</p>
      <div class="panel-body settings-list">
        <button type="button" class="menu-btn settings-row" id="btn-toggle-sound">
          <span class="menu-title">Sound</span>
          <span class="menu-meta" id="sound-state">${profile.mute ? 'Off' : 'On'}</span>
        </button>
        <button type="button" class="menu-btn settings-row" id="btn-toggle-haptics">
          <span class="menu-title">Vibration</span>
          <span class="menu-meta" id="haptics-state">${profile.haptics ? 'On' : 'Off'}</span>
        </button>
        <button type="button" class="menu-btn settings-row" id="btn-open-themes">
          <span class="menu-title">Colors</span>
          <span class="menu-meta">Change theme</span>
        </button>
        <button type="button" class="menu-btn settings-row" id="btn-check-update">
          <span class="menu-title">Check for updates</span>
          <span class="menu-meta">GitHub releases</span>
        </button>
        <p class="settings-version">ClearNine v${APP_VERSION}</p>
      </div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
  root.querySelector('#btn-toggle-sound')!.addEventListener('click', () => {
    h.onToggleMute();
    const sound = root.querySelector('#sound-state');
    if (sound) sound.textContent = profile.mute ? 'Off' : 'On';
  });
  root.querySelector('#btn-toggle-haptics')!.addEventListener('click', () => {
    h.onToggleHaptics();
    const hap = root.querySelector('#haptics-state');
    if (hap) hap.textContent = profile.haptics ? 'On' : 'Off';
  });
  root.querySelector('#btn-open-themes')!.addEventListener('click', h.onThemes);
  root.querySelector('#btn-check-update')!.addEventListener('click', h.onCheckUpdate);
}

export function showTutorial(onDone: () => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'overlay show tutorial-overlay';
  wrap.innerHTML = `
    <div class="dialog tutorial-dialog" role="dialog" aria-modal="true">
      <h2>Welcome to ClearNine</h2>
      <ol class="tutorial-steps">
        <li><strong>Drag</strong> a piece from the tray onto the board.</li>
        <li><strong>Clear</strong> full rows, columns, or 3×3 boxes.</li>
        <li><strong>Relax</strong> — no timer, no ads. Just play.</li>
      </ol>
      <button type="button" class="primary-btn" id="tutorial-go">Got it — let’s play</button>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#tutorial-go')!.addEventListener('click', () => {
    wrap.classList.remove('show');
    setTimeout(() => {
      wrap.remove();
      onDone();
    }, 220);
  });
}

export function showSplash(onDone: () => void): void {
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `
    <img class="splash-logo" src="./clearnine-logo.png" alt="" width="120" height="120" />
    <div class="splash-title">ClearNine</div>
    <div class="splash-sub">Simple. Calm. No ads.</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => {
      el.remove();
      onDone();
    }, 320);
  }, 900);
}

export function transitionScreen(root: HTMLElement, render: () => void): void {
  root.classList.add('screen-exit');
  setTimeout(() => {
    render();
    root.classList.remove('screen-exit');
    root.classList.add('screen-enter');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('screen-enter'));
    });
  }, 160);
}

export function showToast(message: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/** Large Yes / No dialog (replaces browser confirm). */
export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay show confirm-overlay';
    wrap.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>Please confirm</h2>
        <p class="confirm-msg">${message}</p>
        <button type="button" class="primary-btn" id="confirm-yes">Yes</button>
        <button type="button" class="secondary-btn" id="confirm-no">No, go back</button>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v: boolean) => {
      wrap.remove();
      resolve(v);
    };
    wrap.querySelector('#confirm-yes')!.addEventListener('click', () => done(true));
    wrap.querySelector('#confirm-no')!.addEventListener('click', () => done(false));
  });
}

export type UpdateDialogChoice = 'download' | 'later' | 'skip';

export function askUpdateAvailable(opts: {
  version: string;
  notes?: string;
}): Promise<UpdateDialogChoice> {
  return new Promise((resolve) => {
    const note = opts.notes
      ? `<p class="confirm-msg update-notes">${escapeHtml(opts.notes.slice(0, 280))}${opts.notes.length > 280 ? '…' : ''}</p>`
      : `<p class="confirm-msg">A newer ClearNine is ready on GitHub. Download the APK and install over this app.</p>`;
    const wrap = document.createElement('div');
    wrap.className = 'overlay show confirm-overlay';
    wrap.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>Update available</h2>
        <p class="confirm-msg"><strong>ClearNine v${escapeHtml(opts.version)}</strong> is out (you have v${APP_VERSION}).</p>
        ${note}
        <button type="button" class="primary-btn" id="update-download">Download update</button>
        <button type="button" class="secondary-btn" id="update-later">Remind me later</button>
        <button type="button" class="secondary-btn" id="update-skip">Skip this version</button>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v: UpdateDialogChoice) => {
      wrap.remove();
      resolve(v);
    };
    wrap.querySelector('#update-download')!.addEventListener('click', () => done('download'));
    wrap.querySelector('#update-later')!.addEventListener('click', () => done('later'));
    wrap.querySelector('#update-skip')!.addEventListener('click', () => done('skip'));
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import { GOALS } from '../game/goals';
import {
  dailyPlayStreak,
  getDailyBest,
  getWeeklyBest,
  type GameMode,
  type Profile,
} from '../game/stats';
import {
  THEMES,
  getActiveSeason,
  isThemeUnlocked,
  seasonRangeLabel,
  themeUnlockHint,
} from '../game/themes';
import { EXPERT_BLURB, EXPERT_FEATURE_LINES, getWeeklyMandate, weekKey } from '../game/expert';
import { todayKey } from '../game/rng';
import { APP_VERSION } from '../app/version';
import type { BoardRow, BoardTab } from '../app/leaderboard';
import {
  applyBackup,
  BACKUP_PROFILE_KEY,
  backupSummary,
  buildBackup,
  formatBackupSummary,
  MAX_BACKUP_CHARS,
  parseBackup,
  serializeBackup,
} from '../app/backup';

export { APP_VERSION };
export type ContinueInfo = { mode: GameMode; score: number; expert?: boolean };

export type ScreenHandlers = {
  onClassic: () => void;
  onDaily: () => void;
  onWeekly: () => void;
  onBlitz: () => void;
  onContinue: () => void;
  onRecords: () => void;
  onGoals: () => void;
  onThemes: () => void;
  onHowTo: () => void;
  onSettings: () => void;
  onBoard: () => void;
  onBackHome: () => void;
  onSelectTheme: (id: string) => void;
  onSelectSeason: () => void;
  onToggleSeasonal: () => void;
  onToggleBlockStyle: () => void;
  onToggleMute: () => void;
  onToggleHaptics: () => void;
  onToggleExpert: () => void;
  onToggleLeaderboard: () => void;
  onSaveLeaderboardName: (name: string) => void;
  onCheckUpdate: () => void;
  onShowTips: () => void;
};

function backButton(): string {
  return `<button type="button" class="text-btn back-btn" id="btn-back">← Back to menu</button>`;
}

function modeLabel(mode: GameMode): string {
  if (mode === 'daily') return 'Today’s Puzzle';
  if (mode === 'weekly') return 'Weekly';
  if (mode === 'blitz') return 'Endgame Sprint';
  return 'Play';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function homeDayLine(profile: Profile, date = new Date()): string {
  const weekday = WEEKDAYS[date.getDay()] ?? 'Today';
  const done = profile.stats.dailyDates.includes(todayKey(date));
  return done
    ? `${weekday} · Today’s Puzzle done ✓`
    : `${weekday} · Today’s Puzzle is ready`;
}

export function homeSeasonLine(profile: Profile, date = new Date()): string {
  if (profile.seasonal === 'off') return '';
  const season = getActiveSeason(date);
  return season ? `${season.name} season` : '';
}

export function renderHome(
  root: HTMLElement,
  profile: Profile,
  h: ScreenHandlers,
  continueInfo: ContinueInfo | null,
): void {
  const expert = profile.expertMode;
  const dailyBest = getDailyBest(profile, todayKey(), expert);
  const week = weekKey();
  const mandate = getWeeklyMandate(week);
  const classicBest = expert ? profile.bestClassicExpert : profile.bestClassic;
  const continueBtn = continueInfo
    ? `<button type="button" class="menu-btn continue" id="btn-continue">
          <span class="menu-title">Continue</span>
          <span class="menu-meta">${continueInfo.expert ? 'Expert · ' : ''}${modeLabel(continueInfo.mode)} · ${continueInfo.score} points so far</span>
        </button>`
    : '';

  const dayLine = homeDayLine(profile);
  const seasonLine = homeSeasonLine(profile);
  const expertBadge = expert
    ? `<p class="home-expert-badge">Expert Mode on</p>`
    : '';

  const expertModes = expert
    ? `
        <div class="menu-row expert-modes-row">
          <button type="button" class="menu-btn compact-mode" id="btn-weekly">
            <span class="menu-title">${mandate.name}</span>
            <span class="menu-meta">Weekly · ${mandate.blurb} · Best: ${getWeeklyBest(profile, week)}</span>
          </button>
          <button type="button" class="menu-btn compact-mode" id="btn-blitz">
            <span class="menu-title">Endgame</span>
            <span class="menu-meta">Crowded · Best: ${profile.bestBlitz}</span>
          </button>
        </div>`
    : '';

  root.innerHTML = `
    <div class="screen home-screen" data-mode="${expert ? 'expert' : 'standard'}">
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
          <h1 class="home-title">ClearNine</h1>
          <div class="home-title-rule" aria-hidden="true"></div>
          <p class="home-sub">Simple. Calm. No ads.</p>
          <p class="home-dayline">${dayLine}</p>
          ${seasonLine ? `<p class="home-season">${seasonLine}</p>` : ''}
          ${expertBadge}
        </div>

        ${continueBtn}

        <button type="button" class="menu-btn primary" id="btn-classic">
          <span class="menu-title">${continueInfo?.mode === 'classic' ? 'New Play game' : 'Play'}</span>
          <span class="menu-meta">${expert ? 'Expert · Hold + rising pressure' : 'Relaxing game'} · Best: ${classicBest}</span>
        </button>

        <button type="button" class="menu-btn" id="btn-daily">
          <span class="menu-title">${continueInfo?.mode === 'daily' ? 'New Today’s Puzzle' : expert ? 'Expert Daily' : 'Today’s Puzzle'}</span>
          <span class="menu-meta">${expert ? 'Harder seeded daily' : 'Seeded daily with starter blocks'} · Best: ${dailyBest}</span>
        </button>

        ${expertModes}

        <div class="menu-row">
          <button type="button" class="menu-btn secondary" id="btn-records">
            <span class="menu-title">My Scores</span>
          </button>
          <button type="button" class="menu-btn secondary" id="btn-board">
            <span class="menu-title">Leaderboard</span>
          </button>
        </div>

        <button type="button" class="menu-btn secondary" id="btn-goals">
          <span class="menu-title">Awards</span>
        </button>

        <button type="button" class="menu-btn secondary" id="btn-settings">
          <span class="menu-title">Settings</span>
        </button>

        <button type="button" class="text-btn howto-link" id="btn-howto">
          ${expert ? 'How to Play Expert Mode' : 'How to Play'}
        </button>
      </div>
    </div>
  `;
  root.querySelector('#btn-continue')?.addEventListener('click', h.onContinue);
  root.querySelector('#btn-classic')!.addEventListener('click', h.onClassic);
  root.querySelector('#btn-daily')!.addEventListener('click', h.onDaily);
  root.querySelector('#btn-weekly')?.addEventListener('click', h.onWeekly);
  root.querySelector('#btn-blitz')?.addEventListener('click', h.onBlitz);
  root.querySelector('#btn-records')!.addEventListener('click', h.onRecords);
  root.querySelector('#btn-board')!.addEventListener('click', h.onBoard);
  root.querySelector('#btn-goals')!.addEventListener('click', h.onGoals);
  root.querySelector('#btn-settings')!.addEventListener('click', h.onSettings);
  root.querySelector('#btn-howto')!.addEventListener('click', h.onHowTo);
}

export function renderHowTo(root: HTMLElement, h: ScreenHandlers, expert = false): void {
  const weekMandate = getWeeklyMandate(weekKey());
  if (expert) {
    root.innerHTML = `
      <div class="screen panel-screen">
        <header class="panel-head">
          ${backButton()}
        </header>
        <h2 class="panel-title">Expert Mode</h2>
        <p class="panel-lead">A full guide to the harder ClearNine.</p>
        <div class="panel-body howto-body">
          <section class="howto-section">
            <h3 class="howto-h">What is Expert Mode?</h3>
            <p class="howto-p">${EXPERT_BLURB}</p>
            <p class="howto-p">Turn it on or off anytime in <strong>Settings → Expert Mode</strong>. Off returns the app to the calm original game.</p>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Basics (same as normal)</h3>
            <ol class="howto-list">
              <li>
                <strong>Drag a shape</strong>
                <span>From the tray onto the board. Drag far enough — a light tap will not place it.</span>
              </li>
              <li>
                <strong>Clear lines</strong>
                <span>Fill a full row, column, or 3×3 box to clear those blocks and score.</span>
              </li>
              <li>
                <strong>Combos & streaks</strong>
                <span>Clear more than one line at once for a combo. Clear on back-to-back turns for a streak.</span>
              </li>
              <li>
                <strong>Game over</strong>
                <span>When nothing in your tray (or Hold) can fit, the run ends.</span>
              </li>
            </ol>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Hold (Play & Weekly)</h3>
            <ol class="howto-list">
              <li>
                <strong>Select</strong>
                <span><em>Tap</em> a tray piece (don’t drag). It highlights and you’ll see a short tip.</span>
              </li>
              <li>
                <strong>Park</strong>
                <span>Tap the <em>Hold</em> button to move that piece into Hold.</span>
              </li>
              <li>
                <strong>Place later</strong>
                <span>Drag the parked piece from Hold onto the board — you don’t have to swap it back first.</span>
              </li>
              <li>
                <strong>Swap</strong>
                <span>Tap another tray piece, then tap Hold again to swap.</span>
              </li>
            </ol>
            <p class="howto-p">Hold is not available in Expert Daily, Endgame Sprint, or Lone Wolf Weekly Mandates.</p>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Expert Play</h3>
            <ul class="howto-bullets">
              <li><strong>Hold slot</strong> — park one awkward piece.</li>
              <li><strong>Rising pressure</strong> — as your score climbs, larger / tougher pieces show up more often.</li>
              <li><strong>Separate best score</strong> — Expert Play bests don’t overwrite your calm-mode best.</li>
              <li><strong>Beat-your-best</strong> — a target under the scoreboard shows how close you are to your Expert best.</li>
            </ul>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Expert Daily</h3>
            <ul class="howto-bullets">
              <li>Same idea as Today’s Puzzle, but <strong>harder</strong>: denser starter blocks and tougher piece deals.</li>
              <li>Seeded by the date — everyone on Expert gets the same hard puzzle that day.</li>
              <li>Has its own <strong>Expert Daily best</strong> (separate from the normal Daily).</li>
            </ul>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Weekly Mandate</h3>
            <ul class="howto-bullets">
              <li>Each week has a <strong>named Mandate</strong> (Gridlock, Titans, Precision, Lone Wolf, Rising Tide, or Thrifty) — same for everyone.</li>
              <li>Rules rotate: crowded starts, huge/small piece deals, no Hold, rising pressure, or no undos.</li>
              <li>This week: <strong>${weekMandate.name}</strong> — ${weekMandate.howto}</li>
              <li>Tracks a <strong>Weekly best</strong> for that week.</li>
            </ul>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Endgame Sprint</h3>
            <ul class="howto-bullets">
              <li>Starts on a <strong>crowded</strong> board — less empty space from the first move.</li>
              <li>Great for short, intense runs. Tracks an <strong>Endgame best</strong>.</li>
            </ul>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Scores, awards & sharing</h3>
            <ul class="howto-bullets">
              <li><strong>My Scores</strong> adds Expert Play / Daily / Weekly / Endgame bests, plus best combo and streak.</li>
              <li><strong>Awards</strong> include high-skill trophies (8,000 points, Combo ×5, long streaks, Weekly, Endgame, and more).</li>
              <li>When a run ends, <strong>Share score</strong> copies or shares a short summary.</li>
            </ul>
          </section>

          <section class="howto-section">
            <h3 class="howto-h">Tips for high scorers</h3>
            <ul class="howto-bullets">
              <li>Use Hold for pieces that don’t fit your current plan — don’t force a bad place.</li>
              <li>Early Expert Play is calmer; pressure ramps up after big scores.</li>
              <li>Weekly and Endgame reward planning over speed — there’s still no timer.</li>
              <li>Turn Expert Mode off in Settings anytime you want the original calm game back.</li>
            </ul>
          </section>

          <button type="button" class="primary-btn" id="btn-start-play">Start Expert Play</button>
          <button type="button" class="secondary-btn" id="btn-start-daily">Try Expert Daily</button>
        </div>
      </div>
    `;
    root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
    root.querySelector('#btn-start-play')!.addEventListener('click', h.onClassic);
    root.querySelector('#btn-start-daily')!.addEventListener('click', h.onDaily);
    return;
  }

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
        <p class="howto-p howto-expert-hint">Want more challenge? Turn on <strong>Expert Mode</strong> in Settings for Hold, harder Daily, Weekly, and Endgame.</p>
        <button type="button" class="primary-btn" id="btn-start-play">Start playing</button>
      </div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
  root.querySelector('#btn-start-play')!.addEventListener('click', h.onClassic);
}

export function renderRecords(root: HTMLElement, profile: Profile, h: ScreenHandlers): void {
  const today = todayKey();
  const week = weekKey();
  const streak = dailyPlayStreak(profile);
  const s = profile.stats;
  const expert = profile.expertMode;
  const recent = profile.recentGames
    .slice(0, 12)
    .map((g) => {
      const label = modeLabel(g.mode);
      const tag = g.expert ? ' · Expert' : '';
      return `<li>
          <span class="rec-mode">${label}${tag}</span>
          <span class="rec-score">${g.score} points</span>
          <span class="rec-date">${g.date}</span>
        </li>`;
    })
    .join('');

  const expertStats = expert
    ? `
          <div class="stat-card"><span class="stat-label">Expert Play best</span><span class="stat-num">${profile.bestClassicExpert}</span></div>
          <div class="stat-card"><span class="stat-label">Expert Daily best</span><span class="stat-num">${getDailyBest(profile, today, true)}</span></div>
          <div class="stat-card"><span class="stat-label">Weekly best</span><span class="stat-num">${getWeeklyBest(profile, week)}</span></div>
          <div class="stat-card"><span class="stat-label">Endgame best</span><span class="stat-num">${profile.bestBlitz}</span></div>
          <div class="stat-card"><span class="stat-label">Best combo</span><span class="stat-num">×${s.maxCombo}</span></div>
          <div class="stat-card"><span class="stat-label">Best streak</span><span class="stat-num">${s.maxStreak}</span></div>`
    : '';

  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">My Scores</h2>
      <div class="panel-body">
        <div class="stat-grid">
          <div class="stat-card"><span class="stat-label">Best Play score</span><span class="stat-num">${profile.bestClassic}</span></div>
          <div class="stat-card"><span class="stat-label">Best today</span><span class="stat-num">${getDailyBest(profile, today, false)}</span></div>
          <div class="stat-card"><span class="stat-label">Days in a row</span><span class="stat-num">${streak}</span></div>
          <div class="stat-card"><span class="stat-label">Games finished</span><span class="stat-num">${s.gamesPlayed}</span></div>
          ${expertStats}
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
  const season = getActiveSeason(new Date());
  const seasonOn = !!season && profile.seasonal !== 'off';
  const seasonCard = season
    ? `<button type="button" class="theme-card season-card ${seasonOn ? 'active' : ''}" data-season="${season.id}">
        <span class="theme-swatch" style="background:linear-gradient(135deg,${season.vars['--bg-top']},${season.vars['--accent']})"></span>
        <span class="theme-name">${seasonRangeLabel(season)}</span>
        <span class="theme-hint">${seasonOn ? 'Using now' : 'This season'}</span>
      </button>`
    : '';
  const cards = THEMES.map((t) => {
    const unlocked = isThemeUnlocked(profile, t.id);
    const active = !seasonOn && profile.themeId === t.id;
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
      <div class="panel-body theme-grid">${seasonCard}${cards}</div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
  root.querySelectorAll<HTMLButtonElement>('.theme-card:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.season) h.onSelectSeason();
      else h.onSelectTheme(btn.dataset.theme!);
    });
  });
}

export function renderSettings(root: HTMLElement, profile: Profile, h: ScreenHandlers): void {
  const features = EXPERT_FEATURE_LINES.map((line) => `<li>${line}</li>`).join('');
  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">Settings</h2>
      <p class="panel-lead">Tune sound, feel, and challenge.</p>
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
        <button type="button" class="menu-btn settings-row" id="btn-toggle-seasonal">
          <span class="menu-title">Seasonal colors</span>
          <span class="menu-meta" id="seasonal-state">${profile.seasonal === 'off' ? 'Off' : 'On'}</span>
        </button>
        <button type="button" class="menu-btn settings-row" id="btn-toggle-blocks">
          <span class="menu-title">Block colors</span>
          <span class="menu-meta" id="blocks-state">${profile.blockStyle === 'varied' ? 'Varied' : 'Single'}</span>
        </button>
        <button type="button" class="menu-btn settings-row expert-toggle ${profile.expertMode ? 'expert-on' : ''}" id="btn-toggle-expert">
          <span class="menu-title">Expert Mode</span>
          <span class="menu-meta" id="expert-state">${profile.expertMode ? 'On' : 'Off'}</span>
        </button>
        <p class="expert-blurb">Harder puzzles, a Hold slot, and extra modes. Off returns the calm game.</p>
        <details class="expert-details">
          <summary>What Expert Mode adds</summary>
          <ul class="expert-feature-list">${features}</ul>
          <p class="expert-note">Turn Expert Mode off anytime — Play and Daily go back to the original calm rules.</p>
        </details>
        <button type="button" class="menu-btn settings-row" id="btn-check-update">
          <span class="menu-title">Check for updates</span>
          <span class="menu-meta">GitHub releases</span>
        </button>
        <button type="button" class="menu-btn settings-row" id="btn-show-tips">
          <span class="menu-title">Show tips again</span>
          <span class="menu-meta">How to play</span>
        </button>
        <button type="button" class="menu-btn settings-row ${profile.leaderboardOn ? 'expert-on' : ''}" id="btn-toggle-board">
          <span class="menu-title">Join the Leaderboard</span>
          <span class="menu-meta" id="board-state">${profile.leaderboardOn ? 'On' : 'Off'}</span>
        </button>
        <label class="settings-name">
          <span class="settings-name-label">Leaderboard name</span>
          <input type="text" id="board-name" maxlength="20" autocomplete="nickname" spellcheck="false"
            placeholder="Shown on the leaderboard"
            value="${escapeHtml(profile.leaderboardName)}" />
        </label>
        <p class="settings-name-hint">Optional. Play stays on your phone. The leaderboard only gets a name and score if this is On.</p>
        <p class="settings-backup-label">Backup</p>
        <button type="button" class="menu-btn settings-row" id="btn-export-backup">
          <span class="menu-title">Export progress</span>
          <span class="menu-meta">Save a copy</span>
        </button>
        <button type="button" class="menu-btn settings-row" id="btn-import-backup">
          <span class="menu-title">Import progress</span>
          <span class="menu-meta">Restore a copy</span>
        </button>
        <p class="settings-name-hint">A copy stays on this device. Nothing is uploaded.</p>
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
  root.querySelector('#btn-toggle-expert')!.addEventListener('click', () => {
    h.onToggleExpert();
  });
  root.querySelector('#btn-open-themes')!.addEventListener('click', h.onThemes);
  root.querySelector('#btn-toggle-seasonal')!.addEventListener('click', () => {
    h.onToggleSeasonal();
  });
  root.querySelector('#btn-toggle-blocks')!.addEventListener('click', () => {
    h.onToggleBlockStyle();
  });
  root.querySelector('#btn-check-update')!.addEventListener('click', h.onCheckUpdate);
  root.querySelector('#btn-show-tips')!.addEventListener('click', h.onShowTips);
  root.querySelector('#btn-toggle-board')!.addEventListener('click', () => {
    h.onToggleLeaderboard();
    const st = root.querySelector('#board-state');
    const btn = root.querySelector('#btn-toggle-board');
    if (st) st.textContent = profile.leaderboardOn ? 'On' : 'Off';
    btn?.classList.toggle('expert-on', profile.leaderboardOn);
  });
  const nameInput = root.querySelector<HTMLInputElement>('#board-name');
  nameInput?.addEventListener('change', () => {
    h.onSaveLeaderboardName(nameInput.value);
  });
  root.querySelector('#btn-export-backup')!.addEventListener('click', () => {
    void exportProgress();
  });
  root.querySelector('#btn-import-backup')!.addEventListener('click', () => {
    openImportDialog();
  });
}

const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: 'classic', label: 'Play' },
  { id: 'classic-expert', label: 'Expert' },
  { id: 'daily', label: 'Daily' },
  { id: 'daily-expert', label: 'Ex Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'blitz', label: 'Endgame' },
];

export function renderBoard(
  root: HTMLElement,
  profile: Profile,
  h: ScreenHandlers,
  state: {
    tab: BoardTab;
    loading: boolean;
    error: string | null;
    rows: BoardRow[];
    onTab: (tab: BoardTab) => void;
  },
): void {
  const tabs = BOARD_TABS.map(
    (t) =>
      `<button type="button" class="board-tab ${state.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`,
  ).join('');
  let body: string;
  if (state.loading) {
    body = `<p class="empty-note">Loading the leaderboard…</p>`;
  } else if (state.error) {
    body = `<p class="empty-note">${escapeHtml(state.error)}</p>`;
  } else if (!state.rows.length) {
    body = `<p class="empty-note">No scores yet. Turn on Join the Leaderboard in Settings, then finish a game.</p>`;
  } else {
    body = `<ol class="board-list">${state.rows
      .map(
        (r) => `<li class="${r.you ? 'you' : ''}">
          <span class="board-rank">${r.rank}</span>
          <span class="board-name">${escapeHtml(r.name)}${r.you ? ' · you' : ''}</span>
          <span class="board-score">${r.score}</span>
        </li>`,
      )
      .join('')}</ol>`;
  }
  const joined = profile.leaderboardOn
    ? `Playing as ${profile.leaderboardName || '—'} · scores post when a game ends`
    : 'Off — turn on Join the Leaderboard in Settings';

  root.innerHTML = `
    <div class="screen panel-screen">
      <header class="panel-head">
        ${backButton()}
      </header>
      <h2 class="panel-title">Leaderboard</h2>
      <p class="panel-lead">${escapeHtml(joined)}</p>
      <div class="board-tabs">${tabs}</div>
      <div class="panel-body">${body}</div>
    </div>
  `;
  root.querySelector('#btn-back')!.addEventListener('click', h.onBackHome);
  root.querySelectorAll<HTMLButtonElement>('.board-tab').forEach((btn) => {
    btn.addEventListener('click', () => state.onTab(btn.dataset.tab as BoardTab));
  });
}

/** Shown once, the first time Hold is on the board. */
export function showHoldCoach(onDone: () => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'overlay show tutorial-overlay';
  wrap.innerHTML = `
    <div class="dialog tutorial-dialog" role="dialog" aria-modal="true">
      <h2>Hold</h2>
      <p>Tap a tray piece, then tap Hold to park it. Drag the parked piece onto the board when you want it.</p>
      <button type="button" class="primary-btn" id="hold-coach-ok" data-back>Got it</button>
    </div>`;
  document.body.appendChild(wrap);
  const done = () => {
    wrap.remove();
    onDone();
  };
  wrap.querySelector('#hold-coach-ok')!.addEventListener('click', done);
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
      <button type="button" class="primary-btn" id="tutorial-go" data-back>Got it — let’s play</button>
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

let transitionGen = 0;

export function transitionScreen(root: HTMLElement, render: () => void): void {
  transitionGen += 1;
  const gen = transitionGen;
  root.classList.add('screen-exit');
  setTimeout(() => {
    if (gen !== transitionGen) return;
    render();
    root.classList.remove('screen-exit');
    root.classList.add('screen-enter');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== transitionGen) return;
        root.classList.remove('screen-enter');
      });
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
        <button type="button" class="secondary-btn" id="confirm-no" data-back>No, go back</button>
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

export type UpdateDialogChoice = 'download' | 'github' | 'later' | 'skip';

export function askUpdateAvailable(opts: {
  version: string;
  notes?: string;
}): Promise<UpdateDialogChoice> {
  return new Promise((resolve) => {
    const how =
      `<p class="confirm-msg">Download APK installs from inside ClearNine. Open GitHub uses the release page in your browser — use that if a download ever stalls.</p>`;
    const note = opts.notes
      ? `<p class="confirm-msg update-notes">${escapeHtml(opts.notes.slice(0, 280))}${opts.notes.length > 280 ? '…' : ''}</p>`
      : '';
    const wrap = document.createElement('div');
    wrap.className = 'overlay show confirm-overlay';
    wrap.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>Update available</h2>
        <p class="confirm-msg"><strong>ClearNine v${escapeHtml(opts.version)}</strong> is out (you have v${APP_VERSION}).</p>
        ${note}
        ${how}
        <button type="button" class="primary-btn" id="update-download">Download APK</button>
        <button type="button" class="secondary-btn" id="update-github">Open GitHub</button>
        <button type="button" class="secondary-btn" id="update-later" data-back>Remind me later</button>
        <button type="button" class="secondary-btn" id="update-skip">Skip this version</button>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v: UpdateDialogChoice) => {
      wrap.remove();
      resolve(v);
    };
    wrap.querySelector('#update-download')!.addEventListener('click', () => done('download'));
    wrap.querySelector('#update-github')!.addEventListener('click', () => done('github'));
    wrap.querySelector('#update-later')!.addEventListener('click', () => done('later'));
    wrap.querySelector('#update-skip')!.addEventListener('click', () => done('skip'));
  });
}

export type UpdateDownloadProgressUi = {
  setProgress: (received: number, total: number) => void;
  close: () => void;
};

export function showUpdateDownloadProgress(opts: {
  onOpenGithub: () => void;
  onBack?: () => void;
}): UpdateDownloadProgressUi {
  const wrap = document.createElement('div');
  wrap.className = 'overlay show confirm-overlay';
  wrap.setAttribute('data-back-listen', '');
  wrap.innerHTML = `
    <div class="dialog" role="alertdialog" aria-modal="true">
      <h2>Downloading update</h2>
      <p class="confirm-msg" id="update-dl-status">Starting…</p>
      <div class="update-dl-bar" aria-hidden="true"><div class="update-dl-bar-fill" id="update-dl-fill"></div></div>
      <button type="button" class="secondary-btn" id="update-dl-github">Open GitHub instead</button>
    </div>`;
  document.body.appendChild(wrap);
  const status = wrap.querySelector('#update-dl-status') as HTMLParagraphElement;
  const fill = wrap.querySelector('#update-dl-fill') as HTMLDivElement;
  wrap.querySelector('#update-dl-github')!.addEventListener('click', () => opts.onOpenGithub());
  wrap.addEventListener('cn-android-back', () => {
    (opts.onBack ?? opts.onOpenGithub)();
  });

  return {
    setProgress(received, total) {
      if (total > 0) {
        const pct = Math.max(0, Math.min(100, (received / total) * 100));
        fill.style.width = `${pct}%`;
        status.textContent = `${formatMb(received)} / ${formatMb(total)}`;
      } else {
        fill.style.width = received > 0 ? '40%' : '8%';
        status.textContent = received > 0 ? formatMb(received) : 'Starting…';
      }
    },
    close() {
      wrap.remove();
    },
  };
}

/** Dismiss the topmost dialog. Returns true if a modal consumed the back press. */
export function handleOverlayBack(): boolean {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>('.overlay.show'));
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  const btn = top.querySelector<HTMLElement>('[data-back]');
  if (btn) {
    btn.click();
    return true;
  }
  if (top.hasAttribute('data-back-listen')) {
    top.dispatchEvent(new Event('cn-android-back'));
    return true;
  }
  return false;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function closeBackupDialogs(): void {
  document.querySelectorAll('.backup-overlay').forEach((el) => el.remove());
}

function backupFileName(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `ClearNine-backup-${y}-${m}-${d}.json`;
}

async function copyBackupText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Web Share with a File when the WebView supports it. Cancel stays quiet. */
async function shareBackupFile(text: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (typeof navigator.share !== 'function') return 'unavailable';
  try {
    const file = new File([text], backupFileName(), { type: 'application/json' });
    const payload: ShareData = { files: [file], title: 'ClearNine backup' };
    if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
      return 'unavailable';
    }
    await navigator.share(payload);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}

function showBackupCopyDialog(text: string): void {
  closeBackupDialogs();
  const wrap = document.createElement('div');
  wrap.className = 'overlay show confirm-overlay backup-overlay';
  wrap.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="backup-copy-title">
      <h2 id="backup-copy-title">Copy your backup</h2>
      <p class="confirm-msg">Press and hold the text to copy it.</p>
      <textarea class="backup-text" id="backup-copy-text" readonly spellcheck="false" aria-label="Backup text"></textarea>
      <button type="button" class="primary-btn" id="backup-copy-btn">Copy</button>
      <button type="button" class="secondary-btn" id="backup-copy-close" data-back>Close</button>
    </div>`;
  document.body.appendChild(wrap);
  const area = wrap.querySelector<HTMLTextAreaElement>('#backup-copy-text')!;
  area.value = text;
  const close = () => wrap.remove();
  wrap.querySelector('#backup-copy-close')!.addEventListener('click', close);
  wrap.querySelector('#backup-copy-btn')!.addEventListener('click', () => {
    void (async () => {
      if (await copyBackupText(text)) {
        close();
        showToast('Backup copied. Paste it somewhere safe.');
        return;
      }
      area.focus();
      area.select();
      showToast('Press and hold the text to copy.');
    })();
  });
}

async function confirmAndApply(text: string, close: () => void): Promise<void> {
  const parsed = parseBackup(text);
  if (!parsed.ok) {
    showToast(parsed.error);
    return;
  }
  const line = formatBackupSummary(backupSummary(parsed.backup));
  close();
  const yes = await askConfirm(`This replaces your current progress on this device. ${line}`);
  if (!yes) return;
  const applied = applyBackup(parsed.backup);
  if (!applied.ok) {
    showToast(applied.error);
    return;
  }
  showToast('Progress restored.');
  // Block input until reload so a Settings toggle cannot write the old in-memory
  // profile over the restored one.
  const shield = document.createElement('div');
  shield.setAttribute('aria-hidden', 'true');
  shield.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent;';
  document.body.appendChild(shield);
  window.setTimeout(() => window.location.reload(), 700);
}

async function importFromFile(file: File, close: () => void): Promise<void> {
  if (file.size > MAX_BACKUP_CHARS) {
    showToast('That backup is too large.');
    return;
  }
  try {
    await confirmAndApply(await file.text(), close);
  } catch {
    showToast('That backup could not be read.');
  }
}

function openImportDialog(): void {
  closeBackupDialogs();
  const wrap = document.createElement('div');
  wrap.className = 'overlay show confirm-overlay backup-overlay';
  wrap.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="backup-import-title">
      <h2 id="backup-import-title">Import progress</h2>
      <p class="confirm-msg">Choose a file, or paste the backup text.</p>
      <button type="button" class="secondary-btn" id="backup-choose">Choose a file</button>
      <input class="backup-file-input" id="backup-file" type="file" accept=".json,application/json" />
      <textarea class="backup-text" id="backup-paste" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Paste backup here" aria-label="Pasted backup"></textarea>
      <button type="button" class="primary-btn" id="backup-restore">Restore</button>
      <button type="button" class="secondary-btn" id="backup-cancel" data-back>Cancel</button>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('#backup-cancel')!.addEventListener('click', close);
  const input = wrap.querySelector<HTMLInputElement>('#backup-file')!;
  wrap.querySelector('#backup-choose')!.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void importFromFile(file, close);
  });
  const paste = wrap.querySelector<HTMLTextAreaElement>('#backup-paste')!;
  wrap.querySelector('#backup-restore')!.addEventListener('click', () => {
    const text = paste.value.trim();
    if (!text) {
      showToast('Paste a backup first.');
      return;
    }
    void confirmAndApply(text, close);
  });
}

async function exportProgress(): Promise<void> {
  try {
    const backup = buildBackup();
    if (backup.data[BACKUP_PROFILE_KEY] == null) {
      showToast('Could not read your progress.');
      return;
    }
    const text = serializeBackup(backup);
    const shared = await shareBackupFile(text);
    if (shared === 'shared' || shared === 'cancelled') return;
    if (await copyBackupText(text)) {
      showToast('Backup copied. Paste it somewhere safe.');
      return;
    }
    showBackupCopyDialog(text);
  } catch {
    showToast('Could not export your progress.');
  }
}

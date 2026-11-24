// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real play screen: boots the app, continues a seeded Play game and
 * drags tray pieces with pointer events. The saved game is read back from
 * storage, so a move that was not counted shows up as a score that did not move.
 */

const dot = { id: 'dot', cells: [{ r: 0, c: 0 }], weight: 6 };
const SAVE = 'clearnine-save-classic';

function seed(): void {
  const board = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
  // Row 0 needs only (0,8). One far block keeps that clear from emptying the board.
  for (let c = 0; c < 8; c++) board[0]![c] = 1;
  board[8]![0] = 1;
  localStorage.clear();
  localStorage.setItem(
    'clearnine-profile',
    JSON.stringify({ schemaVersion: 1, seenTutorial: true, mute: true, haptics: false }),
  );
  localStorage.setItem(
    SAVE,
    JSON.stringify({
      mode: 'classic',
      board,
      tray: [dot, dot, dot],
      hold: null,
      score: 0,
      streak: 0,
      gameOver: false,
      undosLeft: 3,
      undoStack: [],
      rng: { seed: 7, counter: 0 },
      clearsThisGame: 0,
      expert: false,
    }),
  );
}

type Rect = { left: number; top: number; width: number; height: number; right: number; bottom: number; x: number; y: number };

function rect(l: number, t: number, w: number, h: number): Rect {
  return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t };
}

const proto = Element.prototype as unknown as {
  setPointerCapture: (id: number) => void;
  getBoundingClientRect: () => Rect;
};
const realRect = proto.getBoundingClientRect;
const realCapture = proto.setPointerCapture;

/** happy-dom has no layout, so the board gets a fixed 44px grid starting at (100,100). */
function fakeLayout(): void {
  proto.setPointerCapture = () => {};
  proto.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList?.contains('cell')) {
      return rect(100 + Number(this.dataset.c) * 44, 100 + Number(this.dataset.r) * 44, 40, 40);
    }
    if (this.id === 'board') return rect(96, 96, 400, 400);
    return rect(0, 0, 0, 0);
  };
}

function ev(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true });
}

/** Finger position that floats a one-cell piece over board cell (r,c). */
function aim(r: number, c: number): { x: number; y: number } {
  return { x: 100 + c * 44 + 20, y: 100 + r * 44 + 40 + 55 };
}

function slot(i: number): HTMLElement {
  return document.querySelector<HTMLElement>(`#tray .tray-slot[data-index="${i}"]`)!;
}

function saved(): { score: number; tray: unknown[] } {
  return JSON.parse(localStorage.getItem(SAVE)!) as { score: number; tray: unknown[] };
}

function dragTo(el: HTMLElement, r: number, c: number, pointerId = 1): void {
  const to = aim(r, c);
  el.dispatchEvent(ev('pointerdown', 10, 600, pointerId));
  el.dispatchEvent(ev('pointermove', to.x, to.y, pointerId));
  el.dispatchEvent(ev('pointerup', to.x, to.y, pointerId));
}

async function bootToPlay(): Promise<void> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  seed();
  fakeLayout();
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  await import('./main');
  await vi.advanceTimersByTimeAsync(2500);
  document.querySelector<HTMLElement>('#btn-continue')!.click();
  await vi.advanceTimersByTimeAsync(600);
}

describe('dragging pieces on the play screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    proto.getBoundingClientRect = realRect;
    proto.setPointerCapture = realCapture;
  });

  it('scores a clear and the move after it', async () => {
    await bootToPlay();
    dragTo(slot(0), 0, 8);
    expect(saved().score).toBe(19); // 1 cell + 18 for the row
    await vi.advanceTimersByTimeAsync(1000);
    dragTo(slot(1), 4, 4);
    expect(saved().score).toBe(20);
  });

  it('shows the tray as it really is straight after a clear', async () => {
    await bootToPlay();
    dragTo(slot(0), 0, 8);
    // No waiting for the clear animation: the used slot is empty at once.
    expect(slot(0).classList.contains('empty')).toBe(true);
    expect(slot(1).classList.contains('empty')).toBe(false);
  });

  it('counts a piece picked up while the clear animation is still running', async () => {
    await bootToPlay();
    dragTo(slot(0), 0, 8);
    expect(saved().score).toBe(19);

    await vi.advanceTimersByTimeAsync(100);
    const grabbed = slot(1);
    const to = aim(4, 4);
    grabbed.dispatchEvent(ev('pointerdown', 10, 600));
    grabbed.dispatchEvent(ev('pointermove', to.x, to.y));

    // The clear animation ends while the piece is in the air.
    await vi.advanceTimersByTimeAsync(700);
    expect(grabbed.isConnected).toBe(true);

    grabbed.dispatchEvent(ev('pointermove', to.x, to.y));
    grabbed.dispatchEvent(ev('pointerup', to.x, to.y));
    expect(saved().score).toBe(20);
    expect(document.querySelector('#drag-ghost')!.classList.contains('active')).toBe(false);
  });

  it('does not let a second finger take over the piece in hand', async () => {
    await bootToPlay();
    const first = slot(0);
    const to = aim(4, 4);
    first.dispatchEvent(ev('pointerdown', 10, 600, 1));
    first.dispatchEvent(ev('pointermove', to.x, to.y, 1));
    // A thumb lands on another tray piece and lifts again.
    slot(1).dispatchEvent(ev('pointerdown', 200, 600, 2));
    slot(1).dispatchEvent(ev('pointerup', 200, 600, 2));
    first.dispatchEvent(ev('pointerup', to.x, to.y, 1));
    expect(saved().score).toBe(1);
    expect(saved().tray[0]).toBeNull();
    expect(saved().tray[1]).not.toBeNull();
  });

  it('never places a piece when the touch is cancelled', async () => {
    await bootToPlay();
    const first = slot(0);
    const to = aim(4, 4);
    first.dispatchEvent(ev('pointerdown', 10, 600));
    first.dispatchEvent(ev('pointermove', to.x, to.y));
    first.dispatchEvent(ev('pointercancel', to.x, to.y));
    expect(saved().score).toBe(0);
    expect(saved().tray[0]).not.toBeNull();
    expect(document.querySelector('#drag-ghost')!.classList.contains('active')).toBe(false);

    // The game is not left stuck: the next drag works.
    dragTo(slot(0), 4, 4);
    expect(saved().score).toBe(1);
  });

  it('clears a drag whose release never reached its tray slot', async () => {
    await bootToPlay();
    const first = slot(0);
    const to = aim(4, 4);
    first.dispatchEvent(ev('pointerdown', 10, 600));
    first.dispatchEvent(ev('pointermove', to.x, to.y));
    // The release lands on the board instead of the slot.
    document.querySelector('#board')!.dispatchEvent(ev('pointerup', to.x, to.y));
    expect(document.querySelector('#drag-ghost')!.classList.contains('active')).toBe(false);
    dragTo(slot(1), 4, 4);
    expect(saved().score).toBe(1);
  });
});

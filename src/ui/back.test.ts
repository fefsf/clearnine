import { describe, expect, it } from 'vitest';
import { handleOverlayBack } from './screens';

describe('handleOverlayBack', () => {
  it('clicks the data-back control on the topmost overlay', () => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay show';
    wrap.innerHTML = '<button type="button" data-back>No, go back</button>';
    document.body.appendChild(wrap);
    let clicked = false;
    wrap.querySelector('button')!.addEventListener('click', () => {
      clicked = true;
    });
    expect(handleOverlayBack()).toBe(true);
    expect(clicked).toBe(true);
    wrap.remove();
  });

  it('returns false when no overlay is showing', () => {
    expect(handleOverlayBack()).toBe(false);
  });
});

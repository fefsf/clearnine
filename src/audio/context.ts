/** One AudioContext for effects. Phone WebViews dislike a second one. */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

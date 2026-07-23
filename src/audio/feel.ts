import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

async function impact(style: ImpactStyle): Promise<void> {
  if (!enabled) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    navigator.vibrate?.(style === ImpactStyle.Heavy ? 24 : style === ImpactStyle.Medium ? 14 : 8);
  } catch {
    /* ignore */
  }
}

export function hapticTap(): void {
  void impact(ImpactStyle.Light);
}

export function hapticPlace(): void {
  void impact(ImpactStyle.Light);
}

export function hapticClear(combo = 1): void {
  void impact(combo >= 3 ? ImpactStyle.Heavy : ImpactStyle.Medium);
}

export function hapticBad(): void {
  if (!enabled) return;
  void (async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.notification({ type: NotificationType.Warning });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      navigator.vibrate?.([12, 40, 12]);
    } catch {
      /* ignore */
    }
  })();
}

export function hapticUndo(): void {
  void impact(ImpactStyle.Medium);
}

export function hapticCheer(): void {
  void impact(ImpactStyle.Heavy);
}

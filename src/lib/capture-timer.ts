export const TIMER_SECONDS = [3, 5, 10] as const;
export type TimerSeconds = (typeof TIMER_SECONDS)[number];
export const TIMER_PREFERENCE_KEY = "incsoul-timer-seconds-v1";

export function readTimerPreference(): TimerSeconds {
  try {
    const value = Number(localStorage.getItem(TIMER_PREFERENCE_KEY));
    return TIMER_SECONDS.find((seconds) => seconds === value) ?? 3;
  } catch {
    return 3;
  }
}

export function saveTimerPreference(seconds: TimerSeconds) {
  try {
    localStorage.setItem(TIMER_PREFERENCE_KEY, String(seconds));
  } catch {
    // A blocked/full store must never prevent taking photos.
  }
}

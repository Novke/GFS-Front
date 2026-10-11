export const RAZMAK_DODIRA_MS = 300;

/** Drugi dodir istog dugmeta pre `razmak` ms se ignoriše (odskok prsta, "ghost click"). */
export function prihvatiDodir(poslednjiMs: number | undefined, sadaMs: number, razmak = RAZMAK_DODIRA_MS): boolean {
  return poslednjiMs === undefined || sadaMs - poslednjiMs >= razmak;
}

/** Kratka vibracija gde postoji (Android); nikad ne baca. */
export function vibriraj(nav: { vibrate?: (ms: number) => boolean } | undefined = globalThis.navigator, ms = 12): void {
  try {
    nav?.vibrate?.(ms);
  } catch {
    // vibracija je samo dodatak
  }
}

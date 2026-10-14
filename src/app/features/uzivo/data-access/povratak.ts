/**
 * Povratak na stranicu: telefon (ili laptop) je spavao, tab je bio u pozadini ili je mreža ponovo tu. Zove
 * `naPovratak(skrivenoMs)` kad stranica ponovo postane vidljiva (koliko je bila skrivena; stranica otvorena skrivena se meri
 * od poziva), i `naPovratak(Infinity)` na `online` (veza je sigurno pala). Vraća odjavu (za `DestroyRef.onDestroy`).
 */
export function pratiPovratak(
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  naPovratak: (skrivenoMs: number) => void,
  sada: () => number = Date.now,
): () => void {
  let skrivenoOd: number | null = doc.visibilityState === 'hidden' ? sada() : null;

  const naVidljivost = (): void => {
    if (doc.visibilityState === 'hidden') {
      skrivenoOd ??= sada();
    } else if (skrivenoOd !== null) {
      const skriveno = sada() - skrivenoOd;
      skrivenoOd = null;
      naPovratak(skriveno);
    }
  };
  const naMrezu = (): void => naPovratak(Infinity);

  doc.addEventListener('visibilitychange', naVidljivost);
  win.addEventListener('online', naMrezu);
  return () => {
    doc.removeEventListener('visibilitychange', naVidljivost);
    win.removeEventListener('online', naMrezu);
  };
}

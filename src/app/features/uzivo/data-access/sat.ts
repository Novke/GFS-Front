/** Pomak serverskog sata: telefon sa pogrešnim satom ipak odbrojava do roka po serverskom vremenu. */
export class ServerskiSat {
  private pomakMs = 0;
  azuriraj(serverVremeMs: number, sadaMs: number = Date.now()): void { this.pomakMs = serverVremeMs - sadaMs; }
  sada(sadaMs: number = Date.now()): number { return sadaMs + this.pomakMs; }
  preostalo(rokMs: number, sadaMs: number = Date.now()): number { return Math.max(0, rokMs - this.sada(sadaMs)); }
}

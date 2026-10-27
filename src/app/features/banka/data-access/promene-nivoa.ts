/**
 * Evidencija promena nivoa varijanti koje su u letu (optimistična izmena: prikaz se menja odmah, a zahtevi idu redom). Po varijanti
 * pamti nivo koji je server poslednji potvrdio (ili nivo pre prve promene) i koliko zahteva čeka. Kad poslednji završi, prikaz treba
 * da pokazuje potvrđeni nivo: uspeh ga ažurira iz odgovora, a greška ga ostavlja, pa se optimistična promena vraća.
 */
export class PromeneNivoa {
  private readonly uToku = new Map<number, { potvrdjen: number; zahteva: number }>();

  /** Nova promena varijante koja trenutno prikazuje `trenutni` nivo. */
  pocni(id: number, trenutni: number): void {
    const u = this.uToku.get(id) ?? { potvrdjen: trenutni, zahteva: 0 };
    u.zahteva++;
    this.uToku.set(id, u);
  }

  /** Za varijantu čeka bar jedan zahtev (odgovor drugog poziva sa starim nivoom ne sme da pregazi prikaz). */
  imaUToku(id: number): boolean {
    return this.uToku.has(id);
  }

  /** Server je potvrdio `nivo` za varijantu. */
  potvrdi(id: number, nivo: number): void {
    const u = this.uToku.get(id);
    if (u) {
      u.potvrdjen = nivo;
    }
  }

  /** Zahtev je završen (uspehom ili greškom); kad je poslednji za varijantu, vraća nivo koji prikaz treba da pokaže, inače `null`. */
  zavrsi(id: number): number | null {
    const u = this.uToku.get(id);
    if (!u || --u.zahteva > 0) {
      return null;
    }
    this.uToku.delete(id);
    return u.potvrdjen;
  }
}

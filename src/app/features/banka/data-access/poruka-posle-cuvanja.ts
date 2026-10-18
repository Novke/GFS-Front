import { Injectable } from '@angular/core';

/**
 * Poruka koju editor nove varijante ostavlja editoru iste varijante kad posle prvog čuvanja pređe na njega (`replaceUrl`,
 * nova instanca stranice): jednokratna, po id-ju varijante, samo u memoriji. Ne ide u `history.state`, jer bi se ruter
 * vratio sa njom na osvežavanje i na Nazad/Napred, pa bi zastarela poruka ponovo iskočila.
 */
@Injectable({ providedIn: 'root' })
export class PorukaPosleCuvanja {
  private readonly poruke = new Map<number, string>();

  ostavi(varijantaId: number, poruka: string): void {
    this.poruke.set(varijantaId, poruka);
  }

  /** Poruka za varijantu (i briše je) ili `null`. */
  preuzmi(varijantaId: number): string | null {
    const poruka = this.poruke.get(varijantaId) ?? null;
    this.poruke.delete(varijantaId);
    return poruka;
  }
}

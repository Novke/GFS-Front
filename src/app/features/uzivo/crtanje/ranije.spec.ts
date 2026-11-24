import { Subject } from 'rxjs';
import { RanijiCrtez } from './crtanje.models';
import { RanijiCrtezi } from './ranije';

const r = (pozadina: RanijiCrtez['pozadina'], n = 1): RanijiCrtez => ({
  izvodjenjeId: 3, pocetak: '2026-11-12T10:00:00', grupa: 'G1', pozadina,
  elementi: Array.from({ length: n }, () => ({ tip: 'LINIJA', boja: '#121A2A', debljina: 3, tacke: [0, 0, 10, 10] })),
});

describe('RanijiCrtezi', () => {
  it('jednom po slajdu, samo uz uključen prekidač; filter po pozadini bez praznih', () => {
    const zahtevi: { id: number; odgovor: Subject<RanijiCrtez[]> }[] = [];
    const ranije = new RanijiCrtezi(id => { const odgovor = new Subject<RanijiCrtez[]>(); zahtevi.push({ id, odgovor }); return odgovor; });
    ranije.postavi(5, false);
    expect(zahtevi.length).toBe(0);
    ranije.postavi(5, true);
    ranije.postavi(5, true);
    expect(zahtevi.map(z => z.id)).toEqual([5]);
    zahtevi[0].odgovor.next([r('SLAJD'), r('BELA'), r('BELA', 0)]);
    expect(ranije.naSlajdu().length).toBe(3);
    expect(ranije.za('BELA').length).toBe(1);
    expect(ranije.za('SLAJD').length).toBe(1);
    ranije.postavi(5, false);
    expect(ranije.naSlajdu()).toEqual([]);
    ranije.postavi(null, true);
    expect(ranije.naSlajdu()).toEqual([]);
  });
});

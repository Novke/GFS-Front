import { ServerskiSat } from './sat';

describe('ServerskiSat', () => {
  it('bez usklađivanja serversko vreme je lokalno', () => {
    const sat = new ServerskiSat();
    expect(sat.sada(5_000)).toBe(5_000);
    expect(sat.preostalo(8_000, 5_000)).toBe(3_000);
  });

  it('pomak +120 s: preostalo se računa po serverskom vremenu', () => {
    const sat = new ServerskiSat();
    const lokalno = 1_000_000;
    // Server je 120 s ispred telefona.
    sat.azuriraj(lokalno + 120_000, lokalno);
    expect(sat.sada(lokalno)).toBe(lokalno + 120_000);
    // Rok je 30 s po serverskom satu; 10 s kasnije na telefonu ostaje 20 s.
    const rok = lokalno + 120_000 + 30_000;
    expect(sat.preostalo(rok, lokalno)).toBe(30_000);
    expect(sat.preostalo(rok, lokalno + 10_000)).toBe(20_000);
  });

  it('pomak je negativan kad telefon žuri', () => {
    const sat = new ServerskiSat();
    sat.azuriraj(1_000_000, 1_300_000);
    expect(sat.sada(1_300_000)).toBe(1_000_000);
    expect(sat.preostalo(1_020_000, 1_310_000)).toBe(10_000);
  });

  it('isteklo vreme daje 0, nikad negativno', () => {
    const sat = new ServerskiSat();
    sat.azuriraj(500_000, 500_000);
    expect(sat.preostalo(499_000, 500_000)).toBe(0);
    expect(sat.preostalo(500_000, 500_000)).toBe(0);
    expect(sat.preostalo(400_000, 700_000)).toBe(0);
  });

  it('novo usklađivanje prepisuje stari pomak', () => {
    const sat = new ServerskiSat();
    sat.azuriraj(2_000, 1_000);
    sat.azuriraj(1_000, 1_000);
    expect(sat.sada(1_000)).toBe(1_000);
  });
});

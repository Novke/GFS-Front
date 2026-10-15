import {
  CRTEZ_KAO_VEKTOR, NAJKRACI_POTEZ_MS, duzinaPoteza, kadroviPoteza, planIscrtavanja, putanjaPoteza,
} from './crtez-potezi';

describe('crtez-potezi: putanja i dužina poteza', () => {
  it('kapija W1: crtež se podrazumevano crta kao vektor', () => {
    expect(CRTEZ_KAO_VEKTOR).toBe(true);
    expect(NAJKRACI_POTEZ_MS).toBe(16);
  });

  it.each([
    { tacke: [0, 0, 10, 5], d: 'M0 0 L10 5' },
    { tacke: [3, 4], d: 'M3 4 L3 4' },
    { tacke: [], d: '' },
    { tacke: [1.25, 2, 3], d: 'M1.3 2 L1.3 2' },
    { tacke: [0.04, -1.26, 2.5, 3, 7, 8.95], d: 'M0 -1.3 L2.5 3 L7 9' },
  ])('putanjaPoteza($tacke) -> "$d"', ({ tacke, d }) => {
    expect(putanjaPoteza(tacke)).toBe(d);
  });

  it('dužina je zbir duži; ponovljena tačka ne dodaje ništa, jedna tačka je 0', () => {
    expect(duzinaPoteza([0, 0, 3, 4, 3, 4])).toBe(5);
    expect(duzinaPoteza([0, 0, 3, 4, 3, 0])).toBe(9);
    expect(duzinaPoteza([7, 7])).toBe(0);
    expect(duzinaPoteza([])).toBe(0);
  });
});

describe('crtez-potezi: plan iscrtavanja', () => {
  it('ULAZ: redom zapisa, 16 ms svakom plus ostatak srazmerno dužini', () => {
    expect(planIscrtavanja([10, 30], 1000, 'ULAZ')).toEqual([
      { indeks: 0, pocetakMs: 0, trajanjeMs: 258 },
      { indeks: 1, pocetakMs: 258, trajanjeMs: 742 },
    ]);
  });

  it('IZLAZ: obrnutim redom (poslednji potez se briše prvi)', () => {
    expect(planIscrtavanja([10, 30], 1000, 'IZLAZ')).toEqual([
      { indeks: 1, pocetakMs: 0, trajanjeMs: 742 },
      { indeks: 0, pocetakMs: 742, trajanjeMs: 258 },
    ]);
  });

  it('trajanje 0 (prefers-reduced-motion): sve nule', () => {
    expect(planIscrtavanja([10, 30, 5], 0, 'ULAZ')).toEqual([
      { indeks: 0, pocetakMs: 0, trajanjeMs: 0 },
      { indeks: 1, pocetakMs: 0, trajanjeMs: 0 },
      { indeks: 2, pocetakMs: 0, trajanjeMs: 0 },
    ]);
  });

  it('prazan crtež: prazan plan', () => {
    expect(planIscrtavanja([], 1000, 'ULAZ')).toEqual([]);
  });

  it('100 poteza u 1000 ms (manje od 16 ms po potezu): svaki 10 ms, uzastopno, poslednji počinje u 990', () => {
    const plan = planIscrtavanja(Array.from({ length: 100 }, () => 1), 1000, 'ULAZ');
    expect(plan).toHaveLength(100);
    plan.forEach((d, i) => {
      expect(d).toEqual({ indeks: i, pocetakMs: i * 10, trajanjeMs: 10 });
    });
    expect(plan[99].pocetakMs).toBe(990);
  });

  it('svi potezi dužine 0 dele ostatak ravnomerno', () => {
    expect(planIscrtavanja([0, 0], 100, 'ULAZ')).toEqual([
      { indeks: 0, pocetakMs: 0, trajanjeMs: 50 },
      { indeks: 1, pocetakMs: 50, trajanjeMs: 50 },
    ]);
  });

  it.each([
    { duzine: [10, 30], trajanje: 1000 },
    { duzine: [1, 1, 1], trajanje: 100 },
    { duzine: [3.3, 0, 7.1, 12.9, 0.2], trajanje: 777 },
    { duzine: Array.from({ length: 37 }, (_, i) => (i * 7.3) % 11), trajanje: 500 },
    { duzine: [0, 5, 0], trajanje: 1 },
  ])('zbir trajanja = trajanjeMs i delovi idu jedan za drugim ($trajanje ms)', ({ duzine, trajanje }) => {
    for (const vrsta of ['ULAZ', 'IZLAZ'] as const) {
      const plan = planIscrtavanja(duzine, trajanje, vrsta);
      expect(plan.reduce((a, d) => a + d.trajanjeMs, 0)).toBe(trajanje);
      plan.forEach((d, i) => {
        expect(d.pocetakMs).toBe(i === 0 ? 0 : plan[i - 1].pocetakMs + plan[i - 1].trajanjeMs);
        expect(d.trajanjeMs).toBeGreaterThanOrEqual(0);
      });
      expect(plan.map((d) => d.indeks).sort((a, b) => a - b)).toEqual([...duzine.keys()]);
    }
  });
});

describe('crtez-potezi: kadrovi poteza (pathLength = 1)', () => {
  it('ULAZ: nevidljiv pre svog dela, pa se crta od početka do kraja', () => {
    const k = kadroviPoteza('ULAZ');
    expect(k[0]).toMatchObject({ opacity: 0, strokeDashoffset: '1', offset: 0 });
    expect(k[1]).toMatchObject({ opacity: 1, strokeDashoffset: '1' });
    expect(k.at(-1)).toMatchObject({ opacity: 1, strokeDashoffset: '0', offset: 1 });
    expect(k.every((f) => f['strokeDasharray'] === '1 1')).toBe(true);
  });

  it('IZLAZ obrnuto: ceo potez pre svog dela, briše se od kraja i na kraju je nevidljiv', () => {
    const k = kadroviPoteza('IZLAZ');
    expect(k[0]).toMatchObject({ opacity: 1, strokeDashoffset: '0', offset: 0 });
    expect(k.at(-2)).toMatchObject({ opacity: 1, strokeDashoffset: '1' });
    expect(k.at(-1)).toMatchObject({ opacity: 0, strokeDashoffset: '1', offset: 1 });
    expect(k.every((f) => f['strokeDasharray'] === '1 1')).toBe(true);
  });
});

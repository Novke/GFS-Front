import type { SmerPrelaza } from '../data-access/uzivo.models';
import { kadroviPrelaza, NAZIVI_PRELAZA, NAZIVI_SMERA_PRELAZA } from './prelaz-slajda';

describe('prelaz-slajda: nazivi', () => {
  it('efekti (odluka 11): Postepeno, Guranje, Brisanje', () => {
    expect(NAZIVI_PRELAZA).toEqual({ FADE: 'Postepeno', GURANJE: 'Guranje', BRISANJE: 'Brisanje' });
  });

  it('smer je strana sa koje dolazi novi slajd', () => {
    expect(NAZIVI_SMERA_PRELAZA).toEqual({ DESNO: 'Zdesna', LEVO: 'Sleva', DOLE: 'Odozdo', GORE: 'Odozgo' });
  });

  it('redosled ključeva je redosled u izborniku forme', () => {
    expect(Object.keys(NAZIVI_PRELAZA)).toEqual(['FADE', 'GURANJE', 'BRISANJE']);
    expect(Object.keys(NAZIVI_SMERA_PRELAZA)).toEqual(['DESNO', 'LEVO', 'DOLE', 'GORE']);
  });
});

/** Kadrovi omotača ulaznog i odlaznog slajda (odluka 11); smer = strana sa koje dolazi novi slajd. */
describe('prelaz-slajda: kadroviPrelaza', () => {
  it('FADE: samo ulazni, providnost 0 -> 1', () => {
    expect(kadroviPrelaza({ efekat: 'FADE', smer: null, trajanjeMs: 500 })).toEqual({
      ulazni: [{ opacity: 0 }, { opacity: 1 }], odlazni: null,
    });
  });

  it.each<[SmerPrelaza, string, string]>([
    ['DESNO', 'translate(100%, 0)', 'translate(-100%, 0)'],
    ['LEVO', 'translate(-100%, 0)', 'translate(100%, 0)'],
    ['DOLE', 'translate(0, 100%)', 'translate(0, -100%)'],
    ['GORE', 'translate(0, -100%)', 'translate(0, 100%)'],
  ])('GURANJE %s: ulazni dolazi sa te strane, odlazni ide na suprotnu', (smer, sa, ka) => {
    expect(kadroviPrelaza({ efekat: 'GURANJE', smer, trajanjeMs: 600 })).toEqual({
      ulazni: [{ transform: sa }, { transform: 'translate(0, 0)' }],
      odlazni: [{ transform: 'translate(0, 0)' }, { transform: ka }],
    });
  });

  it.each<[SmerPrelaza, string]>([
    ['DESNO', 'inset(0 0 0 100%)'],
    ['LEVO', 'inset(0 100% 0 0)'],
    ['DOLE', 'inset(100% 0 0 0)'],
    ['GORE', 'inset(0 0 100% 0)'],
  ])('BRISANJE %s: ulazni se otkriva od te strane, odlazni miruje', (smer, od) => {
    expect(kadroviPrelaza({ efekat: 'BRISANJE', smer, trajanjeMs: 500 })).toEqual({
      ulazni: [{ clipPath: od }, { clipPath: 'inset(0 0 0 0)' }], odlazni: null,
    });
  });

  it('GURANJE i BRISANJE bez smera: DESNO', () => {
    expect(kadroviPrelaza({ efekat: 'GURANJE', smer: null, trajanjeMs: 500 }))
      .toEqual(kadroviPrelaza({ efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 500 }));
    expect(kadroviPrelaza({ efekat: 'BRISANJE', smer: null, trajanjeMs: 500 }).ulazni[0]).toEqual({ clipPath: 'inset(0 0 0 100%)' });
  });
});

import { NAZIVI_PRELAZA, NAZIVI_SMERA_PRELAZA } from './prelaz-slajda';

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

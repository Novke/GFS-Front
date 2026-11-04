import { bojePredmeta, meseciDatuma, mrezaMeseca } from './kalendar-casova';

describe('kalendar časova', () => {
  it('mreža počinje ponedeljkom i pokriva ceo mesec; dani van meseca i vikend su označeni', () => {
    const nedelje = mrezaMeseca('2026-11'); // 1. 11. 2026. je nedelja, 30. 11. ponedeljak
    expect(nedelje.length).toBe(6);
    expect(nedelje.every(n => n.length === 7)).toBe(true);
    expect(nedelje[0][0]).toEqual({ iso: '2026-10-26', broj: 26, uMesecu: false, vikend: false });
    expect(nedelje[0][6]).toEqual({ iso: '2026-11-01', broj: 1, uMesecu: true, vikend: true });
    expect(nedelje[5][0]).toEqual({ iso: '2026-11-30', broj: 30, uMesecu: true, vikend: false });
    expect(nedelje[5][6].iso).toBe('2026-12-06');
  });

  it('mesec koji počinje ponedeljkom i završava nedeljom nema dana van meseca', () => {
    const nedelje = mrezaMeseca('2027-02'); // 1. 2. 2027. je ponedeljak, 28. 2. nedelja
    expect(nedelje.length).toBe(4);
    expect(nedelje.flat().every(d => d.uMesecu)).toBe(true);
  });

  it('neispravan mesec daje praznu mrežu', () => {
    expect(mrezaMeseca('2026-13')).toEqual([]);
  });

  it('meseci su jedinstveni i po redu', () => {
    expect(meseciDatuma(['2026-12-02', '2026-11-30', '2026-11-02', '2027-01-04'])).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('predmet ima istu boju bez obzira na redosled termina, a posle pete boje se ponavljaju', () => {
    expect(bojePredmeta(['Čas', 'Algebra', 'Čas'])).toEqual(bojePredmeta(['Algebra', 'Čas']));
    expect(bojePredmeta(['Algebra', 'Čas']).get('Algebra')).toBe('var(--predmet-1)');
    expect(bojePredmeta(['A', 'B', 'C', 'D', 'E', 'F']).get('F')).toBe('var(--predmet-1)');
  });
});

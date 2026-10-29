import { cmdIzForme, danaUPeriodu, formaIzRasporeda, imeStudenta, iznadPraga, kopijaRasporeda, odIliDanas, poDatumu, pomeriOd, vaziNaDan } from './raspored.pravila';
import { RasporedDetails, TerminInfo } from './raspored.models';

const RASPORED: RasporedDetails = {
  id: 3, naziv: 'Zimski semestar 2026/27', vaziOd: '2026-10-01', vaziDo: '2027-01-31', pragNajava: 5,
  stavke: [{
    id: 11, predmet: { id: 1, naziv: 'Geodezija 1' }, grupa: { id: 2, naziv: 'GD-2026', godinaUpisa: 2026, brojStudenata: null },
    dan: 3, pocetak: '10:00:00', kraj: '13:00:00',
  }],
};

const termin = (p: Partial<TerminInfo>): TerminInfo => ({
  stavkaId: 1, rasporedId: 3, datum: '2026-11-04', pocetak: '10:00:00', kraj: '13:00:00', predmet: { id: 1, naziv: 'G' },
  grupa: { id: 2, naziv: 'GD', godinaUpisa: 2026, brojStudenata: null }, otkazan: false, napomena: null, poceo: false,
  brojNajava: 0, prag: 5, najave: [], predavanjeId: null, ...p,
});

describe('raspored.pravila', () => {
  it('forma iz rasporeda i kopija (bez id-jeva i datuma, naziv sa „(kopija)“)', () => {
    const f = formaIzRasporeda(RASPORED);
    expect(f.stavke).toEqual([{ id: 11, predmet: 1, grupa: 2, dan: 3, pocetak: '10:00', kraj: '13:00' }]);
    const k = kopijaRasporeda(RASPORED);
    expect(k.naziv).toBe('Zimski semestar 2026/27 (kopija)');
    expect([k.vaziOd, k.vaziDo]).toEqual(['', '']);
    expect(k.stavke[0].id).toBeNull();
    expect(k.pragNajava).toBe(5);
    expect(kopijaRasporeda({ ...RASPORED, naziv: 'x'.repeat(100) }).naziv.length).toBe(100);
  });

  it('zahtev iz forme', () => {
    expect(cmdIzForme({ ...formaIzRasporeda(RASPORED), naziv: '  Leto ' })).toEqual({
      naziv: 'Leto', vaziOd: '2026-10-01', vaziDo: '2027-01-31', pragNajava: 5,
      stavke: [{ id: 11, predmetId: 1, grupaId: 2, dan: 3, pocetak: '10:00', kraj: '13:00' }],
    });
  });

  it('dani perioda, važi na dan, prag', () => {
    expect(danaUPeriodu('2026-10-01', '2026-10-01')).toBe(1);
    expect(danaUPeriodu('2026-10-01', '2027-01-31')).toBe(123);
    expect(danaUPeriodu('2026-03-28', '2026-03-30')).toBe(3);
    expect(danaUPeriodu('', '2026-10-01')).toBe(0);
    expect(vaziNaDan(RASPORED, '2026-10-01')).toBe(true);
    expect(vaziNaDan(RASPORED, '2027-02-01')).toBe(false);
    expect(iznadPraga({ brojNajava: 5, prag: 5 })).toBe(false);
    expect(iznadPraga({ brojNajava: 6, prag: 5 })).toBe(true);
  });

  it('termini po datumu, prozor i ime studenta', () => {
    const g = poDatumu([termin({}), termin({ stavkaId: 2 }), termin({ datum: '2026-11-05' })]);
    expect(g.map(x => [x.datum, x.termini.length])).toEqual([['2026-11-04', 2], ['2026-11-05', 1]]);
    expect(odIliDanas('2026-11-04', '2026-10-29')).toBe('2026-11-04');
    expect(odIliDanas('nije', '2026-10-29')).toBe('2026-10-29');
    expect(odIliDanas(null, '2026-10-29')).toBe('2026-10-29');
    expect(pomeriOd('2026-11-04', -28)).toBe('2026-10-07');
    expect(imeStudenta({ ime: 'Ana', prezime: 'Anić', indeks: 'GD5', godina: 2026 })).toBe('Ana Anić (GD5/2026)');
    expect(imeStudenta({ ime: null, prezime: null, indeks: null, godina: null })).toBe('Student');
  });
});

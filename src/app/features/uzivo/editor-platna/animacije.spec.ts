import type { Animacija, Efekat, Okidac, Platno, Smer, TekstSloj } from '../data-access/platno.models';
import { animacija, pasus, platno, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { proveriKaoServer } from '../data-access/platno-provera';
import {
  NAZIVI_EFEKATA, NAZIVI_OKIDACA, NAZIVI_SMEROVA, PODRAZUMEVANO_TRAJANJE, SMEROVI, brojeviGrupa, dodajAnimaciju,
  dodajPoPasusima, efektiZa, grupeNaSlojevima, izmeniAnimaciju, obrisiAnimaciju, podrazumevaniSmer, premestiAnimaciju,
  trajanjeGrupe,
} from './animacije';

/** Platno test podataka (6 slojeva, 4 animacije) bez animacija. */
const bez = (): Platno => ({ ...platno(), animacije: [] });
const sloj = (p: Platno, id: string) => p.slojevi.find((s) => s.id === id)!;
const tekstSa = (p: Platno, tekstovi: string[]): Platno => ({
  ...p,
  slojevi: p.slojevi.map((s) => (s.id === 'tekst' ? { ...(s as TekstSloj), pasusi: tekstovi.map(pasus) } : s)),
});
const okidaci = (o: Okidac[]) => platnoSaAnimacijama(o.map((okidac, i) => animacija(`a${i + 1}`, 's1', { okidac })));

describe('animacije (F17)', () => {
  it('nazivi efekata, smerova i okidača; smerovi po efektu', () => {
    expect(NAZIVI_EFEKATA).toEqual({
      POJAVI: 'Pojavi', FADE: 'Postepeno', ULET: 'Ulet', PODELI: 'Podeli', BRISANJE: 'Brisanje', ZUM: 'Zum', ISCRTAJ: 'Iscrtaj',
    });
    expect(Object.values(NAZIVI_SMEROVA)).toEqual(['Sleva', 'Zdesna', 'Odozgo', 'Odozdo', 'Vodoravno', 'Uspravno']);
    expect(Object.values(NAZIVI_OKIDACA)).toEqual(['Na klik', 'Sa prethodnim', 'Posle prethodnog']);
    for (const e of ['ULET', 'BRISANJE', 'ISCRTAJ'] as const) expect(SMEROVI[e]).toEqual(['LEVO', 'DESNO', 'GORE', 'DOLE']);
    expect(SMEROVI.PODELI).toEqual(['HORIZONTALNO', 'VERTIKALNO']);
    for (const e of ['POJAVI', 'FADE', 'ZUM'] as const) expect(SMEROVI[e]).toEqual([]);
    expect(PODRAZUMEVANO_TRAJANJE).toBe(500);
  });

  it.each<[Efekat, Smer | null]>([
    ['ULET', 'DOLE'], ['BRISANJE', 'LEVO'], ['ISCRTAJ', 'LEVO'], ['PODELI', 'VERTIKALNO'], ['FADE', null], ['POJAVI', null],
    ['ZUM', null],
  ])('podrazumevaniSmer(%s) = %s', (e, s) => {
    expect(podrazumevaniSmer(e)).toBe(s);
  });

  it('efektiZa: ISCRTAJ samo za CRTEZ', () => {
    const p = platno();
    expect(efektiZa(sloj(p, 'crtez'))).toContain('ISCRTAJ');
    expect(efektiZa(sloj(p, 'tekst'))).not.toContain('ISCRTAJ');
    expect(efektiZa(sloj(p, 'tekst'))).toEqual(['POJAVI', 'FADE', 'ULET', 'PODELI', 'BRISANJE', 'ZUM']);
  });

  describe('dodajAnimaciju', () => {
    it('podrazumevano FADE, KLIK, 500 ms, bez smera; id a<n> slobodan i među id-jevima slojeva', () => {
      // id-jevi slojeva su zauzeti i za animacije (server traži jedinstvenost preko oba)
      const p: Platno = { ...bez(), slojevi: bez().slojevi.map((s, i) => (i === 0 ? { ...s, id: 'a1' } : s)) };
      const { platno: r, id } = dodajAnimaciju(p, 'slika', 'ULAZ');
      expect(id).toBe('a2');
      expect(r.animacije).toEqual([{
        id: 'a2', slojId: 'slika', pasus: null, vrsta: 'ULAZ', efekat: 'FADE', smer: null, okidac: 'KLIK', trajanjeMs: 500,
        kasnjenjeMs: 0,
      }]);
      expect(proveriKaoServer(r)).toBeNull();
      // postojeća animacija a1 (drugi dokument): sledeći slobodan
      expect(dodajAnimaciju(platno(), 'tekst', 'IZLAZ').id).toBe('a5');
    });

    it('ULET -> smer DOLE; POJAVI -> trajanje 0; nastavlja se na kraj liste', () => {
      const p = dodajAnimaciju(bez(), 'oblik', 'ULAZ', 'ULET').platno;
      expect(p.animacije[0]).toMatchObject({ efekat: 'ULET', smer: 'DOLE', trajanjeMs: 500 });
      const q = dodajAnimaciju(p, 'oblik', 'IZLAZ', 'POJAVI').platno;
      expect(q.animacije.map((a) => a.efekat)).toEqual(['ULET', 'POJAVI']);
      expect(q.animacije[1]).toMatchObject({ vrsta: 'IZLAZ', trajanjeMs: 0, smer: null });
      expect(proveriKaoServer(q)).toBeNull();
    });

    it('pasus teksta; nepostojeći sloj ili pasus i pasus van TEKST-a ne menjaju dokument', () => {
      const p = bez();
      const r = dodajAnimaciju(p, 'tekst', 'ULAZ', 'FADE', 1).platno;
      expect(r.animacije[0].pasus).toBe(1);
      expect(proveriKaoServer(r)).toBeNull();
      expect(dodajAnimaciju(p, 'tekst', 'ULAZ', 'FADE', 2).platno).toBe(p);
      expect(dodajAnimaciju(p, 'oblik', 'ULAZ', 'FADE', 0).platno).toBe(p);
      expect(dodajAnimaciju(p, 'nema', 'ULAZ').platno).toBe(p);
    });
  });

  it('dodajPoPasusima: po jedna KLIK animacija za svaki neprazan pasus, slobodni id-jevi', () => {
    const p = tekstSa(bez(), ['Prvi', ' ', 'Treći']);
    const { platno: r, ids } = dodajPoPasusima(p, 'tekst', 'ULAZ', 'ULET');
    expect(ids).toEqual(['a1', 'a2']);
    expect(r.animacije.map((a) => [a.id, a.pasus, a.okidac, a.efekat, a.smer])).toEqual([
      ['a1', 0, 'KLIK', 'ULET', 'DOLE'], ['a2', 2, 'KLIK', 'ULET', 'DOLE'],
    ]);
    expect(proveriKaoServer(r)).toBeNull();
    // ne-TEKST i tekst bez sadržaja: isti dokument
    expect(dodajPoPasusima(p, 'oblik', 'ULAZ').platno).toBe(p);
    const prazan = tekstSa(bez(), ['', '']);
    expect(dodajPoPasusima(prazan, 'tekst', 'ULAZ')).toEqual({ platno: prazan, ids: [] });
  });

  describe('izmeniAnimaciju (Review Focus 2: rezultat uvek prolazi proveriKaoServer)', () => {
    const sa = (a: Partial<Animacija>) => ({ ...bez(), animacije: [animacija('a1', 'crtez', a)] });
    it.each<[string, Partial<Animacija>, Partial<Animacija>, Partial<Animacija>]>([
      ['FADE -> ULET daje smer DOLE', {}, { efekat: 'ULET' }, { smer: 'DOLE', trajanjeMs: 500 }],
      ['ULET (LEVO) -> PODELI daje VERTIKALNO', { efekat: 'ULET', smer: 'LEVO' }, { efekat: 'PODELI' }, { smer: 'VERTIKALNO' }],
      ['ULET (GORE) -> BRISANJE zadržava GORE', { efekat: 'ULET', smer: 'GORE' }, { efekat: 'BRISANJE' }, { smer: 'GORE' }],
      ['PODELI -> FADE daje null', { efekat: 'PODELI', smer: 'HORIZONTALNO' }, { efekat: 'FADE' }, { smer: null }],
      ['FADE -> POJAVI daje trajanje 0', { trajanjeMs: 800 }, { efekat: 'POJAVI' }, { trajanjeMs: 0 }],
      ['POJAVI -> FADE daje 500', { efekat: 'POJAVI', trajanjeMs: 0 }, { efekat: 'FADE' }, { trajanjeMs: 500 }],
      ['POJAVI -> ZUM sa trajanjem', { efekat: 'POJAVI', trajanjeMs: 0 }, { efekat: 'ZUM', trajanjeMs: 1200 }, { trajanjeMs: 1200 }],
      ['trajanje POJAVI ostaje 0', { efekat: 'POJAVI', trajanjeMs: 0 }, { trajanjeMs: 900 }, { trajanjeMs: 0 }],
      ['smer koji efekat nema -> podrazumevani', { efekat: 'ULET', smer: 'DOLE' }, { smer: 'HORIZONTALNO' }, { smer: 'DOLE' }],
      ['ISCRTAJ (DESNO)', {}, { efekat: 'ISCRTAJ', smer: 'DESNO' }, { smer: 'DESNO' }],
      ['trajanje 12 000 -> 10 000', {}, { trajanjeMs: 12_000 }, { trajanjeMs: 10_000 }],
      ['trajanje -5 -> 0', {}, { trajanjeMs: -5 }, { trajanjeMs: 0 }],
      ['trajanje 333.7 -> 334', {}, { trajanjeMs: 333.7 }, { trajanjeMs: 334 }],
      ['kašnjenje 10 001 -> 10 000', {}, { kasnjenjeMs: 10_001 }, { kasnjenjeMs: 10_000 }],
      ['kašnjenje -1 -> 0', {}, { kasnjenjeMs: -1 }, { kasnjenjeMs: 0 }],
      ['okidač i vrsta', {}, { okidac: 'POSLE_PRETHODNOG', vrsta: 'IZLAZ' }, { okidac: 'POSLE_PRETHODNOG', vrsta: 'IZLAZ' }],
    ])('%s', (_, pocetak, izmena, ocekivano) => {
      const r = izmeniAnimaciju(sa(pocetak), 'a1', izmena);
      expect(r.animacije[0]).toMatchObject(ocekivano);
      expect(proveriKaoServer(r)).toBeNull();
    });

    it('bez stvarne promene i za nepostojeći id: isti dokument (nema praznog koraka)', () => {
      const p = sa({ efekat: 'ULET', smer: 'LEVO' });
      expect(izmeniAnimaciju(p, 'a1', { efekat: 'ULET' })).toBe(p);
      expect(izmeniAnimaciju(p, 'a1', { trajanjeMs: 500.2 })).toBe(p);
      expect(izmeniAnimaciju(p, 'nema', { efekat: 'FADE' })).toBe(p);
    });
  });

  it('obrisiAnimaciju i premestiAnimaciju (isti indeks i nepostojeći id: isti dokument)', () => {
    const p = platno();
    expect(obrisiAnimaciju(p, 'a2').animacije.map((a) => a.id)).toEqual(['a1', 'a3', 'a4']);
    expect(obrisiAnimaciju(p, 'nema')).toBe(p);
    expect(premestiAnimaciju(p, 'a4', 0).animacije.map((a) => a.id)).toEqual(['a4', 'a1', 'a2', 'a3']);
    expect(premestiAnimaciju(p, 'a1', 2).animacije.map((a) => a.id)).toEqual(['a2', 'a3', 'a1', 'a4']);
    expect(premestiAnimaciju(p, 'a1', 99).animacije.map((a) => a.id)).toEqual(['a2', 'a3', 'a4', 'a1']);
    expect(premestiAnimaciju(p, 'a2', 1)).toBe(p);
    expect(premestiAnimaciju(p, 'nema', 0)).toBe(p);
  });

  it('brojeviGrupa: [SA_PRETHODNIM, KLIK, POSLE_PRETHODNOG, KLIK] -> 0, 1, 1, 2', () => {
    const g = brojeviGrupa(okidaci(['SA_PRETHODNIM', 'KLIK', 'POSLE_PRETHODNOG', 'KLIK']));
    expect([...g]).toEqual([['a1', 0], ['a2', 1], ['a3', 1], ['a4', 2]]);
  });

  it('grupeNaSlojevima: rastući jedinstveni brojevi grupa po sloju', () => {
    const p = platnoSaAnimacijama([
      animacija('a1', 's2', { okidac: 'SA_PRETHODNIM' }), animacija('a2', 's1'), animacija('a3', 's1', { okidac: 'SA_PRETHODNIM' }),
      animacija('a4', 's2'), animacija('a5', 's2', { pasus: 1, okidac: 'KLIK' }),
    ]);
    expect(grupeNaSlojevima(p)).toEqual(new Map([['s2', [0, 2, 3]], ['s1', [1]]]));
    expect(grupeNaSlojevima(platnoSaAnimacijama([]))).toEqual(new Map());
  });

  it('trajanjeGrupe: FADE 500 pa POSLE_PRETHODNOG 300 sa kašnjenjem 100 -> 900; prazna ili nepostojeća grupa -> 0', () => {
    const p = platnoSaAnimacijama([
      animacija('a1', 's1'), animacija('a2', 's1', { okidac: 'POSLE_PRETHODNOG', trajanjeMs: 300, kasnjenjeMs: 100 }),
      animacija('a3', 's1', { trajanjeMs: 700 }), animacija('a4', 's1', { okidac: 'SA_PRETHODNIM', trajanjeMs: 200, kasnjenjeMs: 600 }),
    ]);
    expect(trajanjeGrupe(p, 1)).toBe(900);
    expect(trajanjeGrupe(p, 2)).toBe(800);
    expect(trajanjeGrupe(p, 0)).toBe(0);
    expect(trajanjeGrupe(p, 5)).toBe(0);
  });
});

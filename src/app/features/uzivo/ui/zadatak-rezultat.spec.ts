import { TestBed } from '@angular/core/testing';
import { RezultatPolja, RezultatVarijante, TipPoljaZadatka, ZadatakRezultat } from '../data-access/uzivo.models';
import { PrikazZadatka, ZadatakRezultatComponent, cipoviPolja, kolone, oznakaVidljiva, tacnoTekst } from './zadatak-rezultat.component';

const tekst = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Polje `a` (BROJ) sa grupisanim vrednostima i tačnim odgovorom; izmene prepisuju polja. */
function polje(izmene: Partial<RezultatPolja> = {}): RezultatPolja {
  return {
    kljuc: 'a', oznaka: 'Vrednost u dekadnom sistemu', tip: 'BROJ', jedinica: null, opcije: null,
    vrednosti: [
      { kljuc: '11', tekst: '11', broj: 3, sakriven: false, tacan: true },
      { kljuc: '13', tekst: '13', broj: 1, sakriven: false, tacan: false },
    ],
    tacno: { broj: 11, prihvatljivi: null, tacna: null, tacne: null },
    ...izmene,
  };
}

function varijanta(id: number, izmene: Partial<RezultatVarijante> = {}): RezultatVarijante {
  return {
    varijantaId: id, naziv: `V${id}`, svgId: `svg-${id}`, resenjeSvgId: `res-${id}`, dodeljeno: 4, odgovorilo: 4, tacnih: 3,
    polja: [polje()], ...izmene,
  };
}

/** Javni rezultat sa svim prekidačima uključenim (rezultati, `TACAN`, `RESENJE`). */
function rezultat(n = 2, izmene: Partial<ZadatakRezultat> = {}): ZadatakRezultat {
  return { ukupno: 4 * n, varijante: Array.from({ length: n }, (_, i) => varijanta(i + 1)), odgovoriPrikazani: true, ...izmene };
}

/** Samo rešenje: bez brojeva i traka, bez `tacno` i `tacnih`. */
const samoResenje = (n = 2): ZadatakRezultat => ({
  ukupno: 0, odgovoriPrikazani: false,
  varijante: Array.from({ length: n }, (_, i) => varijanta(i + 1, {
    dodeljeno: 0, odgovorilo: 0, tacnih: null,
    polja: [polje({ vrednosti: null, tacno: null })],
  })),
});

async function prikazi(r: ZadatakRezultat, prikaz: PrikazZadatka = 'sve') {
  const fixture = TestBed.createComponent(ZadatakRezultatComponent);
  fixture.componentRef.setInput('rezultat', r);
  fixture.componentRef.setInput('prikaz', prikaz);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('kolone', () => {
  it('do 4 varijante 2 kolone, do 9 tri, inače 4', () => {
    expect([1, 2, 3, 4].map(kolone)).toEqual([2, 2, 2, 2]);
    expect([5, 6, 9].map(kolone)).toEqual([3, 3, 3]);
    expect([10, 16, 50].map(kolone)).toEqual([4, 4, 4]);
  });
});

describe('tacnoTekst', () => {
  const o = (id: number, t: string) => ({ id, tekst: t, broj: 0, tacna: null });

  it('BROJ: vrednost (decimalni zarez) i jedinica', () => {
    expect(tacnoTekst(polje())).toBe('11');
    expect(tacnoTekst(polje({ jedinica: 'm', tacno: { broj: 45, prihvatljivi: null, tacna: null, tacne: null } }))).toBe('45 m');
    expect(tacnoTekst(polje({ tacno: { broj: 2.5, prihvatljivi: null, tacna: null, tacne: null } }))).toBe('2,5');
  });

  it('BROJ: sve decimale, bez zaokruživanja na dve (binarni razlomci)', () => {
    const sa = (broj: number, jedinica: string | null = null) => polje({ jedinica, tacno: { broj, prihvatljivi: null, tacna: null, tacne: null } });
    expect(tacnoTekst(sa(0.0625))).toBe('0,0625');
    expect(tacnoTekst(sa(0.625))).toBe('0,625');
    expect(tacnoTekst(sa(0.1015625, 'm'))).toBe('0,1015625 m');
  });

  it('TEKST: prihvatljivi odgovori spojeni zarezom', () => {
    const p = polje({ tip: 'TEKST', tacno: { broj: null, prihvatljivi: ['1011', 'jedanaest'], tacna: null, tacne: null } });
    expect(tacnoTekst(p)).toBe('1011, jedanaest');
  });

  it('JEDAN_TACAN: tekst izabrane opcije', () => {
    const p = polje({
      tip: 'JEDAN_TACAN', vrednosti: null, opcije: [o(1, '9'), o(2, '$11$'), o(3, '13')],
      tacno: { broj: null, prihvatljivi: null, tacna: 2, tacne: null },
    });
    expect(tacnoTekst(p)).toBe('$11$');
  });

  it('VISE_TACNIH: tekstovi tačnih opcija spojeni zarezom, redom opcija', () => {
    const p = polje({
      tip: 'VISE_TACNIH', vrednosti: null, opcije: [o(1, 'a'), o(2, 'b'), o(3, 'c')],
      tacno: { broj: null, prihvatljivi: null, tacna: null, tacne: [3, 1] },
    });
    expect(tacnoTekst(p)).toBe('a, c');
  });

  it('bez tačnog odgovora (ili nepoznata opcija): prazan tekst', () => {
    expect(tacnoTekst(polje({ tacno: null }))).toBe('');
    const p = polje({ tip: 'JEDAN_TACAN', vrednosti: null, opcije: [o(1, 'x')], tacno: { broj: null, prihvatljivi: null, tacna: 9, tacne: null } });
    expect(tacnoTekst(p)).toBe('');
  });
});

describe('ZadatakRezultatComponent', () => {
  it('kartica po varijanti: slika zadatka i rešenja (api/public/mediji), alt sa nazivom, kolone po broju', async () => {
    const { el } = await prikazi(rezultat(2));
    const kartice = el.querySelectorAll('.uz-zr-kartica');
    expect(kartice.length).toBe(2);
    expect(el.querySelector<HTMLElement>('.uz-zr-mreza')!.dataset['kolone']).toBe('2');
    const zadatak = kartice[0].querySelector<HTMLImageElement>('img[alt="Zadatak, varijanta V1"]')!;
    expect(zadatak.getAttribute('src')).toBe('api/public/mediji/svg-1');
    const resenje = kartice[0].querySelector<HTMLImageElement>('img[alt="Rešenje, varijanta V1"]')!;
    expect(resenje.getAttribute('src')).toBe('api/public/mediji/res-1');
  });

  it('naziv varijante bez imena: V<redni broj>', async () => {
    const { el } = await prikazi(rezultat(2, { varijante: [varijanta(7, { naziv: null }), varijanta(8)] }));
    expect(el.querySelector('img[alt="Zadatak, varijanta V1"]')).not.toBeNull();
    expect(el.querySelector('img[alt="Zadatak, varijanta V8"]')).not.toBeNull();
  });

  it('10 varijanti: 4 kolone', async () => {
    const { el } = await prikazi(rezultat(10));
    expect(el.querySelectorAll('.uz-zr-kartica').length).toBe(10);
    expect(el.querySelector<HTMLElement>('.uz-zr-mreza')!.dataset['kolone']).toBe('4');
  });

  it('odgovoriPrikazani: dodeljeno · odgovorilo · tačno i čipovi vrednosti, tačan prvi i označen, broj u zagradi tek preko 1', async () => {
    const { el } = await prikazi(rezultat(1));
    expect(tekst(el.querySelector('.uz-zr-brojevi'))).toBe('dodeljeno 4 · odgovorilo 4 · tačno 3');
    const cipovi = el.querySelectorAll('.uz-co-cip');
    expect(cipovi.length).toBe(2);
    expect(tekst(cipovi[0])).toBe('✓tačno: 11 (3)');
    expect(cipovi[0].classList).toContain('uz-co-cip--tacno');
    expect(tekst(cipovi[1])).toBe('✗netačno: 13');
    expect(cipovi[1].classList).toContain('uz-co-cip--netacno');
    expect(el.querySelector('.uz-rez-traka')).toBeNull();
  });

  it('jedno polje: oznaka se ne prikazuje; više polja: oznaka uz svako', async () => {
    let { el } = await prikazi(rezultat(1));
    expect(el.querySelector('.uz-zr-oznaka')).toBeNull();
    expect(tekst(el)).not.toContain('Vrednost u dekadnom sistemu');
    const dva = rezultat(1, { varijante: [varijanta(1, { polja: [polje({ oznaka: 'a) dekadno' }), polje({ kljuc: 'b', oznaka: 'b) oktalno' })] })] });
    ({ el } = await prikazi(dva));
    expect([...el.querySelectorAll('.uz-zr-oznaka')].map(tekst)).toEqual(['a) dekadno', 'b) oktalno']);
  });

  it('tačno: <vrednost> po polju kad tacno postoji, sa jedinicom', async () => {
    const r = rezultat(1, { varijante: [varijanta(1, { polja: [polje({ jedinica: 'm', tacno: { broj: 45, prihvatljivi: null, tacna: null, tacne: null } })] })] });
    const { el } = await prikazi(r);
    expect(tekst(el.querySelector('.uz-zr-tacno'))).toBe('✓ tačno: 45 m');
  });

  it('bez tacno nema "tačno:" (ni znaka), bez resenjeSvgId nema slike rešenja', async () => {
    const r = rezultat(1, { varijante: [varijanta(1, { resenjeSvgId: null, polja: [polje({ tacno: null })] })] });
    const { el } = await prikazi(r);
    expect(el.querySelector('.uz-zr-tacno')).toBeNull();
    expect(tekst(el)).not.toContain('tačno:');
    expect(el.querySelector('img[alt^="Rešenje"]')).toBeNull();
    expect(el.querySelectorAll('img').length).toBe(1);
  });

  it('tacnih null (TACAN nije vidljiv): red brojeva bez "tačno"', async () => {
    const r = rezultat(1, { varijante: [varijanta(1, { tacnih: null, polja: [polje({ tacno: null })] })] });
    const { el } = await prikazi(r);
    expect(tekst(el.querySelector('.uz-zr-brojevi'))).toBe('dodeljeno 4 · odgovorilo 4');
  });

  it('odgovoriPrikazani false: nema brojeva ni traka, a "tačno:" i slika rešenja se vide', async () => {
    const r = samoResenje(1);
    r.varijante[0].polja = [polje({ vrednosti: null })];
    const { el } = await prikazi(r);
    expect(el.querySelector('.uz-zr-brojevi')).toBeNull();
    expect(el.querySelector('.uz-co-cip')).toBeNull();
    expect(tekst(el.querySelector('.uz-zr-tacno'))).toBe('✓ tačno: 11');
    expect(el.querySelector('img[alt="Rešenje, varijanta V1"]')).not.toBeNull();
  });

  it('samo rešenje (bez brojeva i tačnih): slike zadatka i rešenja, ništa drugo', async () => {
    const { el } = await prikazi(samoResenje(2));
    expect(el.querySelectorAll('img').length).toBe(4);
    expect(tekst(el)).not.toContain('tačno:');
    expect(el.querySelector('.uz-zr-brojevi')).toBeNull();
    expect(el.querySelector('.uz-zr-polje')).toBeNull();
  });

  it('još nema odgovora: poruka umesto čipova', async () => {
    const r = rezultat(1, { varijante: [varijanta(1, { odgovorilo: 0, tacnih: 0, polja: [polje({ vrednosti: [], tacno: null })] })] });
    const { el } = await prikazi(r);
    expect(tekst(el.querySelector('.uz-zr-polje'))).toContain('Još nema odgovora.');
  });

  it('opcije: samo izabrane (broj > 0), tekst kroz app-tekst-formule; tačna opcija označena', async () => {
    const opcije = polje({
      tip: 'JEDAN_TACAN' as TipPoljaZadatka, oznaka: 'Izaberi', vrednosti: null,
      opcije: [{ id: 1, tekst: '$11$', broj: 3, tacna: true }, { id: 2, tekst: 'Trinaest', broj: 1, tacna: false }, { id: 3, tekst: 'Devet', broj: 0, tacna: false }],
      tacno: { broj: null, prihvatljivi: null, tacna: 1, tacne: null },
    });
    const { el } = await prikazi(rezultat(1, { varijante: [varijanta(1, { polja: [opcije] })] }));
    const cipovi = el.querySelectorAll('.uz-co-cip');
    expect(cipovi.length).toBe(2);
    expect(cipovi[0].querySelector('app-tekst-formule span.uz-formula')?.textContent).toBe('$11$');
    expect(cipovi[1].querySelector('app-tekst-formule')?.textContent).toBe('Trinaest');
    expect(cipovi[0].classList).toContain('uz-co-cip--tacno');
    expect(tekst(el.querySelector('.uz-zr-tacno'))).toContain('tačno:');
  });

  it('opcije bez prikazanih odgovora (broj 0): bez čipova', async () => {
    const opcije = polje({
      tip: 'JEDAN_TACAN', vrednosti: null, tacno: null,
      opcije: [{ id: 1, tekst: 'A', broj: 0, tacna: null }, { id: 2, tekst: 'B', broj: 0, tacna: null }],
    });
    const { el } = await prikazi({ ukupno: 0, odgovoriPrikazani: false, varijante: [varijanta(1, { dodeljeno: 0, odgovorilo: 0, tacnih: null, resenjeSvgId: null, polja: [opcije] })] });
    expect(el.querySelector('.uz-co-cip')).toBeNull();
  });

  it('rad na papiru (grupa bez polja): dodeljeno · rad na papiru, bez odgovorilo', async () => {
    const { el } = await prikazi(rezultat(1, { varijante: [varijanta(1, { polja: [], tacnih: null })] }));
    expect(tekst(el.querySelector('.uz-zr-brojevi'))).toBe('dodeljeno 4 · rad na papiru');
  });

  describe('tabla: odgovori (Space bez rešenja)', () => {
    it('bez slika i reda "tačno": naziv varijante i krupni čipovi', async () => {
      const { el } = await prikazi(rezultat(2), 'odgovori');
      expect(el.querySelectorAll('img').length).toBe(0);
      expect(el.querySelector('.uz-zr-tacno')).toBeNull();
      expect(el.querySelector('.uz-zr-brojevi')).toBeNull();
      expect([...el.querySelectorAll('.uz-zr-naziv')].map(tekst)).toEqual(['V1', 'V2']);
      expect([...el.querySelectorAll('.uz-zr-kartica')[0].querySelectorAll('.uz-co-cip')].map(tekst)).toEqual(['✓tačno: 11 (3)', '✗netačno: 13']);
    });

    it('pre TACAN sve neutralno, najčešće prvo', async () => {
      const p = polje({
        tacno: null,
        vrednosti: [
          { kljuc: '199', tekst: '199', broj: 2, sakriven: false, tacan: null },
          { kljuc: '198', tekst: '198', broj: 1, sakriven: false, tacan: null },
          { kljuc: '51', tekst: '51', broj: 1, sakriven: false, tacan: null },
        ],
      });
      const { el } = await prikazi(rezultat(1, { varijante: [varijanta(1, { tacnih: null, polja: [p] })] }), 'odgovori');
      expect([...el.querySelectorAll('.uz-co-cip')].map(tekst)).toEqual(['199 (2)', '198', '51']);
      expect(el.querySelector('.uz-co-cip--tacno, .uz-co-cip--netacno')).toBeNull();
    });

    it('varijanta bez odgovora i rad na papiru se ne crtaju; ako nema nijedne, jedna poruka', async () => {
      const r = rezultat(3, {});
      r.varijante[1] = varijanta(2, { odgovorilo: 0, tacnih: 0, polja: [polje({ vrednosti: [] })] });
      r.varijante[2] = varijanta(3, { polja: [] });
      let { el } = await prikazi(r, 'odgovori');
      expect([...el.querySelectorAll('.uz-zr-naziv')].map(tekst)).toEqual(['V1']);
      ({ el } = await prikazi(rezultat(1, { varijante: [varijanta(1, { odgovorilo: 0, polja: [polje({ vrednosti: [] })] })] }), 'odgovori'));
      expect(el.querySelector('.uz-zr-kartica')).toBeNull();
      expect(tekst(el.querySelector('.uz-zr-prazno-sve'))).toBe('Još nema odgovora.');
    });
  });

  it('tabla: rešenje (Shift+R) bez čipova, sa slikama i redom "tačno"', async () => {
    const { el } = await prikazi(rezultat(1), 'resenje');
    expect(el.querySelector('.uz-co-cip')).toBeNull();
    expect(el.querySelectorAll('img').length).toBe(2);
    expect(tekst(el.querySelector('.uz-zr-tacno'))).toBe('✓ tačno: 11');
  });
});

describe('cipoviPolja', () => {
  it('niko nije uneo tačno: dodaje se tačan čip sa brojem 0, prvi', () => {
    const p = polje({ vrednosti: [{ kljuc: '13', tekst: '13', broj: 2, sakriven: false, tacan: false }] });
    expect(cipoviPolja(p).map(c => [c.tekst, c.broj, c.stanje])).toEqual([['11', 0, 'tacno'], ['13', 2, 'netacno']]);
  });

  it('BROJ sa jedinicom; bez prikazanih vrednosti prazno', () => {
    expect(cipoviPolja(polje({ jedinica: 'm', tacno: null })).map(c => c.tekst)).toEqual(['11 m', '13 m']);
    expect(cipoviPolja(polje({ vrednosti: null, tacno: null }))).toEqual([]);
  });

  it('VISE_TACNIH posle TACAN: tačne opcije prve (i sa 0 glasova), pa izabrane netačne po broju', () => {
    const p = polje({
      tip: 'VISE_TACNIH', vrednosti: null, tacno: { broj: null, prihvatljivi: null, tacna: null, tacne: [1, 3] },
      opcije: [{ id: 1, tekst: 'a', broj: 1, tacna: true }, { id: 2, tekst: 'b', broj: 4, tacna: false }, { id: 3, tekst: 'c', broj: 0, tacna: true }, { id: 4, tekst: 'd', broj: 0, tacna: false }],
    });
    expect(cipoviPolja(p).map(c => c.tekst)).toEqual(['a', 'c', 'b']);
  });
});

describe('oznakaVidljiva', () => {
  it('samo kad varijanta ima više polja', () => {
    expect(oznakaVidljiva({ polja: [polje()] })).toBe(false);
    expect(oznakaVidljiva({ polja: [polje(), polje({ kljuc: 'b' })] })).toBe(true);
  });
});

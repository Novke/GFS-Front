import { TestBed } from '@angular/core/testing';
import { RezultatPolja, RezultatVarijante, TipPoljaZadatka, ZadatakRezultat } from '../data-access/uzivo.models';
import { ZadatakRezultatComponent, kolone, tacnoTekst } from './zadatak-rezultat.component';

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

async function prikazi(r: ZadatakRezultat) {
  const fixture = TestBed.createComponent(ZadatakRezultatComponent);
  fixture.componentRef.setInput('rezultat', r);
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

  it('odgovoriPrikazani: dodeljeno · odgovorilo · tačno i trake vrednosti sa brojem, tačna vrednost označena', async () => {
    const { el } = await prikazi(rezultat(1));
    expect(tekst(el.querySelector('.uz-zr-brojevi'))).toBe('dodeljeno 4 · odgovorilo 4 · tačno 3');
    const redovi = el.querySelectorAll('.uz-zr-red');
    expect(redovi.length).toBe(2);
    expect(tekst(redovi[0])).toContain('11');
    expect(tekst(redovi[0].querySelector('.uz-zr-red-broj'))).toBe('3');
    expect(redovi[0].classList).toContain('uz-zr-red--tacna');
    expect(redovi[0].querySelector('.uz-sr')?.textContent).toContain('tačno');
    expect(redovi[1].classList).not.toContain('uz-zr-red--tacna');
    expect(redovi[0].querySelectorAll('.uz-rez-traka').length).toBe(1);
    expect(redovi[0].querySelector<HTMLElement>('.uz-rez-ispuna')!.style.getPropertyValue('--uz-udeo')).toBe('75%');
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
    expect(el.querySelector('.uz-zr-red')).toBeNull();
    expect(el.querySelector('.uz-rez-traka')).toBeNull();
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

  it('još nema odgovora: poruka umesto traka', async () => {
    const r = rezultat(1, { varijante: [varijanta(1, { odgovorilo: 0, tacnih: 0, polja: [polje({ vrednosti: [], tacno: null })] })] });
    const { el } = await prikazi(r);
    expect(tekst(el.querySelector('.uz-zr-polje'))).toContain('Još nema odgovora.');
  });

  it('opcije: tekst kroz app-tekst-formule, broj i traka; tačna opcija označena', async () => {
    const opcije = polje({
      tip: 'JEDAN_TACAN' as TipPoljaZadatka, oznaka: 'Izaberi', vrednosti: null,
      opcije: [{ id: 1, tekst: '$11$', broj: 3, tacna: true }, { id: 2, tekst: 'Trinaest', broj: 1, tacna: false }],
      tacno: { broj: null, prihvatljivi: null, tacna: 1, tacne: null },
    });
    const { el } = await prikazi(rezultat(1, { varijante: [varijanta(1, { polja: [opcije] })] }));
    const redovi = el.querySelectorAll('.uz-zr-red');
    expect(redovi.length).toBe(2);
    expect(redovi[0].querySelector('app-tekst-formule span.uz-formula')?.textContent).toBe('$11$');
    expect(redovi[1].querySelector('app-tekst-formule')?.textContent).toBe('Trinaest');
    expect(redovi[0].classList).toContain('uz-zr-red--tacna');
    expect(tekst(el.querySelector('.uz-zr-tacno'))).toContain('tačno:');
  });

  it('opcije bez prikazanih odgovora (broj 0): bez traka i brojeva', async () => {
    const opcije = polje({
      tip: 'JEDAN_TACAN', vrednosti: null, tacno: null,
      opcije: [{ id: 1, tekst: 'A', broj: 0, tacna: null }, { id: 2, tekst: 'B', broj: 0, tacna: null }],
    });
    const { el } = await prikazi({ ukupno: 0, odgovoriPrikazani: false, varijante: [varijanta(1, { dodeljeno: 0, odgovorilo: 0, tacnih: null, resenjeSvgId: null, polja: [opcije] })] });
    expect(el.querySelector('.uz-zr-red')).toBeNull();
    expect(el.querySelector('.uz-rez-traka')).toBeNull();
  });

  it('rad na papiru (grupa bez polja): dodeljeno · rad na papiru, bez odgovorilo', async () => {
    const { el } = await prikazi(rezultat(1, { varijante: [varijanta(1, { polja: [], tacnih: null })] }));
    expect(tekst(el.querySelector('.uz-zr-brojevi'))).toBe('dodeljeno 4 · rad na papiru');
  });
});

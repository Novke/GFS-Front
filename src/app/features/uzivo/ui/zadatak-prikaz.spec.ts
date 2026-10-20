import { TestBed } from '@angular/core/testing';
import { naZadatku, rezultatVarijante, varijantaRunde, zadatakSlajd } from '../data-access/izvodjenje-podaci.testing';
import { ServerskiSat } from '../data-access/sat';
import { NastavnickiZadatak, NastavnickoStanje, ZadatakRezultat } from '../data-access/uzivo.models';
import { ZadatakPrikazComponent } from './zadatak-prikaz.component';

const tekst = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function prikazi(ulazi: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ZadatakPrikazComponent);
  for (const [k, v] of Object.entries(ulazi)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Ulazi prikaza iz nastavničkog snimka, kao što ih daje `ulaziSlajda` (samo ono što projektor sme da čita). */
const ulaziIz = (s: NastavnickoStanje, izmene: Record<string, unknown> = {}) => ({
  slajd: s.trenutniSlajd, zadatak: s.zadatak ?? null, faza: s.faza, brojOdgovora: null, tajmer: null, ...izmene,
});

/** Javni rezultat dve varijante, svi prekidači uključeni (rezultati, `TACAN`, `RESENJE`). */
function javni(izmene: Partial<ZadatakRezultat> = {}): ZadatakRezultat {
  const v = [varijantaRunde(11), varijantaRunde(12)];
  return { ukupno: 0, odgovoriPrikazani: true, varijante: v.map(x => rezultatVarijante(x)), ...izmene };
}

describe('ZadatakPrikazComponent', () => {
  it('CEKA: "Zadatak", naziv grupe i "2 različitih varijanti" (brojZaOtvaranje), bez tajmera i rezultata', async () => {
    const { el } = await prikazi(ulaziIz(naZadatku('CEKA')));
    expect(tekst(el.querySelector('.uz-slajd-naslov'))).toBe('Zadatak');
    expect(tekst(el.querySelector('.uz-zad-grupa'))).toBe('2 → 10');
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('2 različitih varijanti');
    expect(el.querySelector('app-tajmer')).toBeNull();
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
    expect(el.dataset['faza']).toBe('CEKA');
  });

  it('brojZaOtvaranje 4: "4 različitih varijanti"', async () => {
    const { el } = await prikazi(ulaziIz(naZadatku('CEKA', { zadatak: { brojZaOtvaranje: 4 } })));
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('4 različitih varijanti');
  });

  it('OTVORENO: broj izvučenih varijanti, broj odgovora i tajmer', async () => {
    const s = naZadatku('OTVORENO', { zadatak: { brojZaOtvaranje: 5 } });
    const sat = new ServerskiSat();
    const { el } = await prikazi(ulaziIz(s, { brojOdgovora: 3, tajmer: { rokMs: 1_030_000, preostaloMs: null, sat } }));
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('2 različitih varijanti');
    expect(tekst(el.querySelector('.uz-zad-odgovori'))).toBe('Odgovora: 3');
    expect(el.querySelector('app-tajmer')).not.toBeNull();
  });

  it('bez javniRezultat nema slike zadatka ni rešenja, ni kad nastavnički snimak ima sve (varijante i rezultat)', async () => {
    const s = naZadatku('ZATVORENO', { zadatak: { resenjePrikazano: true } });
    expect(s.zadatak!.rezultat).not.toBeNull();
    expect(s.zadatak!.varijante).not.toBeNull();
    const { el } = await prikazi(ulaziIz(s));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
    expect(tekst(el)).not.toContain('tačno');
  });

  it('javniRezultat prisutan: mreža rezultata umesto opisa, a zaglavlje (naziv grupe, odgovori, tajmer) ostaje', async () => {
    const s = naZadatku('ZATVORENO', { zadatak: { javniRezultat: javni() } });
    const { el } = await prikazi(ulaziIz(s, { brojOdgovora: 2 }));
    expect(el.querySelector('[data-zadatak]')).toBeNull();
    expect(el.querySelectorAll('app-zadatak-rezultat .uz-zr-kartica').length).toBe(2);
    expect(tekst(el.querySelector('.uz-zad-grupa'))).toBe('2 → 10');
    expect(tekst(el.querySelector('.uz-zad-odgovori'))).toBe('Odgovora: 2');
  });

  it('projektor čita samo javniRezultat: nastavnički rezultat sa tačnim vrednostima se ne crta', async () => {
    const s = naZadatku('ZATVORENO', {
      zadatak: { javniRezultat: javni({ odgovoriPrikazani: false, varijante: [{ ...rezultatVarijante(varijantaRunde(11, false)), tacnih: null, polja: [] }] }) },
    });
    // konzolin rezultat ima `tačno: 45` za svako polje; javni ga nema
    expect(s.zadatak!.rezultat!.varijante[0].polja[0].tacno).not.toBeNull();
    const { el } = await prikazi(ulaziIz(s));
    expect(tekst(el)).not.toContain('tačno:');
    expect(el.querySelectorAll('img').length).toBe(1);
  });

  it('nikad ime učesnika, ni kad ih snimak ima', async () => {
    const s = naZadatku('ZATVORENO', {
      zadatak: { javniRezultat: javni() },
      stanje: {
        ucesnici: [
          { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: true, varijantaId: 11, tacno: true },
          { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: false, varijantaId: 12, tacno: null },
        ],
      },
    });
    const { el } = await prikazi(ulaziIz(s, { brojOdgovora: 1 }));
    expect(tekst(el)).not.toMatch(/Ana|Bojan/);
    expect(el.querySelectorAll('app-zadatak-rezultat').length).toBe(1);
  });

  it('bez stanja izvođenja (pregled u editoru): statična kartica sa opisom sa slajda', async () => {
    const { el } = await prikazi({ slajd: zadatakSlajd({ brojVarijanti: 3 }), zadatak: null, faza: null, brojOdgovora: null, tajmer: null });
    expect(tekst(el.querySelector('.uz-slajd-naslov'))).toBe('Zadatak');
    expect([...el.querySelectorAll('[data-zadatak] p')].map(p => tekst(p))).toEqual(['2 → 10', 'Različitih: 3']);
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
  });

  it('bez stanja: obrisana grupa i grupa bez naziva', async () => {
    const { fixture, el } = await prikazi({ slajd: zadatakSlajd({ grupaId: null, grupaNaziv: null, putanja: [] }), zadatak: null });
    expect(tekst(el.querySelector('[data-zadatak] p'))).toBe('Grupa nije izabrana');
    fixture.componentRef.setInput('slajd', zadatakSlajd({ grupaId: 3, grupaNaziv: null, putanja: [] }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(tekst(el.querySelector('[data-zadatak] p'))).toBe('Grupa zadataka');
  });

  it('stanje: obrisana grupa (CEKA): "Grupa nije izabrana"', async () => {
    const s = naZadatku('CEKA');
    const zadatak: NastavnickiZadatak = { ...s.zadatak!, slajd: { ...s.zadatak!.slajd, grupaId: null, grupaNaziv: null } };
    const { el } = await prikazi(ulaziIz(s, { zadatak }));
    expect(tekst(el.querySelector('.uz-zad-grupa'))).toBe('Grupa nije izabrana');
  });
});

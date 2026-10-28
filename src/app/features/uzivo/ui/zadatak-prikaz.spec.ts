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
  return { ukupno: 2, odgovoriPrikazani: true, varijante: v.map(x => ({ ...rezultatVarijante(x), odgovorilo: 1 })), ...izmene };
}

describe('ZadatakPrikazComponent', () => {
  it('CEKA: "Zadatak", naziv grupe i uputstvo (bez broja varijanti), bez tajmera i rezultata', async () => {
    const { el } = await prikazi(ulaziIz(naZadatku('CEKA')));
    expect(tekst(el.querySelector('.uz-slajd-naslov'))).toBe('Zadatak');
    expect(tekst(el.querySelector('.uz-zad-grupa'))).toBe('2 → 10');
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('Zadatak stiže na telefone');
    expect(el.querySelector('app-tajmer')).toBeNull();
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
    expect(el.dataset['faza']).toBe('CEKA');
  });

  it('tabla nikad ne pokazuje broj varijanti (ni brojZaOtvaranje ni broj izvučenih)', async () => {
    const { el } = await prikazi(ulaziIz(naZadatku('CEKA', { zadatak: { brojZaOtvaranje: 4 } })));
    expect(tekst(el)).not.toMatch(/\d+ različit|varijant/);
    const z = await prikazi(ulaziIz(naZadatku('ZATVORENO')));
    expect(tekst(z.el.querySelector('[data-zadatak]'))).toBe('Odgovaranje je završeno');
    expect(tekst(z.el)).not.toMatch(/varijant/);
  });

  it('OTVORENO: uputstvo i tajmer; "Odgovorilo x od y" tek uz prekidač rezultata', async () => {
    const s = naZadatku('OTVORENO', { zadatak: { brojZaOtvaranje: 5 } });
    const sat = new ServerskiSat();
    const { fixture, el } = await prikazi(ulaziIz(s, { brojOdgovora: 3, odgovoriliOd: 20, tajmer: { rokMs: 1_030_000, preostaloMs: null, sat } }));
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('Svako ima svoj zadatak na telefonu');
    expect(el.querySelector('[data-odgovorilo]')).toBeNull();
    expect(el.querySelector('app-tajmer')).not.toBeNull();
    fixture.componentRef.setInput('prikaziRezultat', true);
    fixture.detectChanges();
    expect(tekst(el.querySelector('[data-odgovorilo]'))).toBe('Odgovorilo 3 od 20');
  });

  it('OTVORENO uz Space: samo koliko je odgovorilo, bez kartica, ni kad snimak nosi javniRezultat', async () => {
    const s = naZadatku('OTVORENO', { zadatak: { javniRezultat: javni() } });
    const { el } = await prikazi(ulaziIz(s, { brojOdgovora: 2, odgovoriliOd: 5, prikaziRezultat: true }));
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('Svako ima svoj zadatak na telefonu');
    expect(tekst(el.querySelector('[data-odgovorilo]'))).toBe('Odgovorilo 2 od 5');
  });

  it('imenilac nikad manji od broja odgovora', async () => {
    const { el } = await prikazi(ulaziIz(naZadatku('OTVORENO'), { brojOdgovora: 4, odgovoriliOd: 3, prikaziRezultat: true }));
    expect(tekst(el.querySelector('[data-odgovorilo]'))).toBe('Odgovorilo 4 od 4');
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

  it('ZATVORENO uz javniRezultat: mreža rezultata umesto opisa, a zaglavlje (naziv grupe, odgovori, tajmer) ostaje', async () => {
    const s = naZadatku('ZATVORENO', { zadatak: { javniRezultat: javni() } });
    const { el } = await prikazi(ulaziIz(s, { brojOdgovora: 2, odgovoriliOd: 3, prikaziRezultat: true }));
    expect(el.querySelector('[data-zadatak]')).toBeNull();
    expect(el.querySelectorAll('app-zadatak-rezultat .uz-zr-kartica').length).toBe(2);
    expect(tekst(el.querySelector('.uz-zad-grupa'))).toBe('2 → 10');
    expect(tekst(el.querySelector('[data-odgovorilo]'))).toBe('Odgovorilo 2 od 3');
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

  it('dva slučaja table: odgovori (Space bez rešenja) bez slika, rešenje (Shift+R) ima prednost i vraća slike', async () => {
    const s = naZadatku('ZATVORENO', { zadatak: { javniRezultat: javni() } });
    let { el } = await prikazi(ulaziIz(s, { brojOdgovora: 2, prikaziRezultat: true }));
    expect(el.querySelector('app-zadatak-rezultat')!.getAttribute('data-prikaz')).toBe('odgovori');
    expect(el.querySelectorAll('img').length).toBe(0);

    const sResenjem = naZadatku('ZATVORENO', { zadatak: { javniRezultat: javni(), resenjePrikazano: true } });
    ({ el } = await prikazi(ulaziIz(sResenjem, { brojOdgovora: 2, prikaziRezultat: true })));
    expect(el.querySelector('app-zadatak-rezultat')!.getAttribute('data-prikaz')).toBe('resenje');
    expect(el.querySelectorAll('img').length).toBeGreaterThan(0);

    const samoTacno = naZadatku('ZATVORENO', { zadatak: { javniRezultat: javni({ odgovoriPrikazani: false }) } });
    ({ el } = await prikazi(ulaziIz(samoTacno)));
    expect(el.querySelector('app-zadatak-rezultat')!.getAttribute('data-prikaz')).toBe('resenje');
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

  it('editor (primer): slika jedne varijante sa grupom i brojem različitih; bez primera ili bez ulaza opis kao ranije', async () => {
    const slajd = zadatakSlajd({ brojVarijanti: 3, primerSvgId: 'svg-primer' });
    const { fixture, el } = await prikazi({ slajd, zadatak: null, primer: true });
    const img = el.querySelector<HTMLImageElement>('[data-primer] img')!;
    expect(img.getAttribute('src')).toBe('api/public/mediji/svg-primer');
    expect(img.getAttribute('alt')).toBe('Primer zadatka: 2 → 10');
    expect(tekst(el.querySelector('.uz-zad-grupa'))).toBe('2 → 10');
    expect(tekst(el.querySelector('[data-primer] figcaption'))).toBe('Primer jedne varijante · različitih: 3');
    expect(el.querySelector('[data-zadatak]')).toBeNull();

    fixture.componentRef.setInput('primer', false);
    fixture.detectChanges();
    expect(el.querySelector('[data-primer]')).toBeNull();
    expect(tekst(el.querySelector('[data-zadatak]'))).toContain('Različitih: 3');

    fixture.componentRef.setInput('primer', true);
    fixture.componentRef.setInput('slajd', zadatakSlajd({ primerSvgId: null }));
    fixture.detectChanges();
    expect(el.querySelector('[data-primer]')).toBeNull();
    expect(tekst(el.querySelector('[data-zadatak]'))).toContain('Različitih: sve');
  });

  it('primer se nikad ne crta uz stanje izvođenja (projektor, konzola), ni kad je ulaz uključen', async () => {
    const s = naZadatku('CEKA');
    const slajd = { ...s.trenutniSlajd!, zadatak: { ...s.trenutniSlajd!.zadatak!, primerSvgId: 'svg-primer' } };
    const { el } = await prikazi({ ...ulaziIz(s), slajd, primer: true });
    expect(el.querySelector('[data-primer]')).toBeNull();
    expect(el.innerHTML).not.toContain('svg-primer');
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

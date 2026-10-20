import { ComponentFixture, TestBed } from '@angular/core/testing';
import { naZadatku, varijantaRunde } from '../data-access/izvodjenje-podaci.testing';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { KomandaZahtev } from './konzola-kontrole.component';
import { ZadatakPanelComponent } from './zadatak-panel.component';

describe('ZadatakPanelComponent (konzola, Zadatak slajd)', () => {
  let poslato: KomandaZahtev[];

  function prikazi(s: NastavnickoStanje): ComponentFixture<ZadatakPanelComponent> {
    const f = TestBed.createComponent(ZadatakPanelComponent);
    f.componentRef.setInput('stanje', s);
    poslato = [];
    f.componentInstance.komanda.subscribe(k => poslato.push(k));
    f.detectChanges();
    return f;
  }

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const tekst = (f: ComponentFixture<unknown>) => (el(f).textContent ?? '').replace(/\s+/g, ' ');
  const izbor = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLSelectElement>('select');
  const opcije = (f: ComponentFixture<unknown>) => Array.from(izbor(f)!.options).map(o => o.textContent!.trim());
  /** Izbor opcije kao korisnik: vrednost pa `change` (pre toga taster ili miš, kao u pregledaču). */
  function izaberi(f: ComponentFixture<unknown>, oznaka: string, uvod?: 'mousedown' | 'keydown'): HTMLSelectElement {
    const s = izbor(f)!;
    if (uvod === 'mousedown') s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    if (uvod === 'keydown') s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    s.value = Array.from(s.options).find(o => o.textContent!.trim() === oznaka)!.value;
    s.dispatchEvent(new Event('change'));
    f.detectChanges();
    return s;
  }

  it('CEKA: putanja, "Različitih: N od M" i izbor kao na slajdu, sve i 1..M', () => {
    const f = prikazi(naZadatku('CEKA'));
    expect(el(f).querySelector('[data-putanja]')?.textContent?.trim()).toBe('Konverzije brojeva (demo) › 2 → 10');
    expect(tekst(f)).toContain('Različitih: 2 od 2');
    expect(izbor(f)?.labels?.[0]?.textContent).toContain('Broj različitih zadataka');
    expect(opcije(f)).toEqual(['Kao na slajdu (sve)', 'Sve (2)', '1', '2']);
    // bez izmene iz konzole izabrano je "Kao na slajdu"
    expect(izbor(f)!.selectedOptions[0].textContent!.trim()).toBe('Kao na slajdu (sve)');
    expect(el(f).querySelector('img')).toBeNull();
  });

  it('izbor "Sve" šalje 0, broj šalje broj, "Kao na slajdu" šalje null', () => {
    const f = prikazi(naZadatku('CEKA', { zadatak: { izmenaBrojaVarijanti: 1, brojZaOtvaranje: 1 } }));
    expect(izbor(f)!.selectedOptions[0].textContent!.trim()).toBe('1');
    izaberi(f, 'Sve (2)');
    izaberi(f, '2');
    izaberi(f, 'Kao na slajdu (sve)');
    expect(poslato).toEqual([
      { tip: 'BROJ_VARIJANTI', vrednost: 0 }, { tip: 'BROJ_VARIJANTI', vrednost: 2 }, { tip: 'BROJ_VARIJANTI', vrednost: null },
    ]);
  });

  it('izbor prikazuje stanje servera: posle slanja ostaje staro dok ne stigne novo stanje', () => {
    const f = prikazi(naZadatku('CEKA'));
    const s = izaberi(f, 'Sve (2)');
    expect(s.selectedOptions[0].textContent!.trim()).toBe('Kao na slajdu (sve)');
    f.componentRef.setInput('stanje', naZadatku('CEKA', { zadatak: { izmenaBrojaVarijanti: 0 } }));
    f.detectChanges();
    expect(s.selectedOptions[0].textContent!.trim()).toBe('Sve (2)');
  });

  it('slajd sa brojem: "Kao na slajdu (N)"; ponuda ide do min(M, 50), a izmena van nje ostaje izabrana', () => {
    let s = naZadatku('CEKA', { zadatak: { brojZaOtvaranje: 1 } });
    s = { ...s, zadatak: { ...s.zadatak!, slajd: { ...s.zadatak!.slajd, brojVarijanti: 1 } } };
    let f = prikazi(s);
    expect(opcije(f)[0]).toBe('Kao na slajdu (1)');
    expect(tekst(f)).toContain('Različitih: 1 od 2');
    f.destroy();

    s = naZadatku('CEKA', { zadatak: { brojZaOtvaranje: 50 } });
    s = { ...s, zadatak: { ...s.zadatak!, slajd: { ...s.zadatak!.slajd, brojAktivnihVarijanti: 60 } } };
    f = prikazi(s);
    expect(opcije(f).length).toBe(2 + 50);
    expect(opcije(f).at(-1)).toBe('50');
    f.destroy();

    // izabrano 5, pa je arhivirano: ostalo 3 aktivne
    s = naZadatku('CEKA', { zadatak: { izmenaBrojaVarijanti: 5, brojZaOtvaranje: 3 } });
    s = { ...s, zadatak: { ...s.zadatak!, slajd: { ...s.zadatak!.slajd, brojAktivnihVarijanti: 3 } } };
    f = prikazi(s);
    expect(opcije(f)).toEqual(['Kao na slajdu (sve)', 'Sve (3)', '1', '2', '3', '5']);
    expect(izbor(f)!.selectedOptions[0].textContent!.trim()).toBe('5');
  });

  it('posle izbora mišem fokus napušta izbor (O odmah otvara); sa tastature ostaje', () => {
    const f = prikazi(naZadatku('CEKA'));
    document.body.appendChild(el(f));
    izbor(f)!.focus();
    izaberi(f, '1', 'mousedown');
    expect(document.activeElement).not.toBe(izbor(f));
    izbor(f)!.focus();
    izaberi(f, '2', 'keydown');
    expect(document.activeElement).toBe(izbor(f));
    el(f).remove();
  });

  it('bez aktivnih varijanti: upozorenje servera, bez izbora broja', () => {
    let s = naZadatku('CEKA', { zadatak: { brojZaOtvaranje: 0 } });
    s = {
      ...s,
      zadatak: {
        ...s.zadatak!,
        slajd: {
          ...s.zadatak!.slajd, brojAktivnihVarijanti: 0,
          upozorenja: ['Tema je isključena.', 'Grupa nema aktivnih varijanti; odobri nacrte u banci pre časa.'],
        },
      },
    };
    const f = prikazi(s);
    const status = el(f).querySelector('[role="status"]');
    expect(status?.textContent).toContain('Tema je isključena.');
    expect(status?.textContent).toContain('Grupa nema aktivnih varijanti; odobri nacrte u banci pre časa.');
    expect(tekst(f)).toContain('Različitih: 0 od 0');
    expect(izbor(f)).toBeNull();
  });

  it('posle otvaranja: kartice izvučenih varijanti (slika zadatka, naziv, brojevi), bez izbora broja', () => {
    const v11 = { ...varijantaRunde(11), dodeljeno: 2, odgovorilo: 1, tacnih: 1 };
    const v12 = { ...varijantaRunde(12), naziv: null };
    const f = prikazi(naZadatku('OTVORENO', { varijante: [v11, v12] }));
    expect(izbor(f)).toBeNull();
    const kartice = Array.from(el(f).querySelectorAll('li'));
    expect(kartice.length).toBe(2);
    const slike = Array.from(el(f).querySelectorAll('img'));
    expect(slike.map(i => i.getAttribute('src'))).toEqual(['api/public/mediji/svg-V11', 'api/public/mediji/svg-V12']);
    // naziv ili redni broj izvučene
    expect(slike.map(i => i.getAttribute('alt'))).toEqual(['Zadatak, varijanta V11', 'Zadatak, varijanta V2']);
    expect(kartice[0].textContent!.replace(/\s+/g, ' ')).toContain('dodeljeno 2 · odgovorilo 1 · tačno 1');
    expect(tekst(f)).not.toContain('Rešenje prikazano');
  });

  it('rešenje uključeno: oznaka "Rešenje prikazano"', () => {
    const f = prikazi(naZadatku('ZATVORENO', { zadatak: { resenjePrikazano: true } }));
    expect(tekst(f)).toContain('Rešenje prikazano');
  });

  it('rad na papiru: umesto odgovora i tačnih piše "rad na papiru"', () => {
    const f = prikazi(naZadatku('ZATVORENO', { polja: [] }));
    const kartica = el(f).querySelector('li')!.textContent!.replace(/\s+/g, ' ');
    expect(kartica).toContain('dodeljeno 1 · rad na papiru');
    expect(kartica).not.toContain('tačno');
  });

  it('bez zadatka u stanju (stari server) ne prikazuje ništa', () => {
    const f = prikazi(naZadatku('CEKA', { stanje: { zadatak: null } }));
    expect(tekst(f).trim()).toBe('');
  });
});

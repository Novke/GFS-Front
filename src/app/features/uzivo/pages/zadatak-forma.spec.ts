import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { CvorIzbora } from '../../../core/api/banka-izbor.api';
import { poljeBroj, zadatakInfo } from '../data-access/izvodjenje-podaci.testing';
import type { ZadatakSlajdaInfo } from '../data-access/uzivo.models';
import { IzborGrupeOtvarac } from './izbor-grupe-otvarac';
import { ZadatakForma, ZadatakFormaComponent, zadatakForma, zadatakIzForme } from './zadatak-forma.component';

describe('zadatakIzForme / zadatakForma', () => {
  it('prazno polje je null (bez tajmera, sve aktivne), broj je broj (razmaci se ne broje)', () => {
    const f = zadatakForma({ grupaId: 2, vremeSekunde: null, brojVarijanti: null, nivo: null });
    expect(f.getRawValue()).toEqual({ grupaId: 2, vremeSekunde: '', brojVarijanti: '', nivo: null });
    expect(zadatakIzForme(f)).toEqual({ grupaId: 2, vremeSekunde: null, brojVarijanti: null, nivo: null });
    f.controls.vremeSekunde.setValue(' 120 ');
    f.controls.brojVarijanti.setValue('4');
    expect(zadatakIzForme(f)).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: 4, nivo: null });
  });

  it('neispravan unos je NaN (greška iz greskeSlajda), ne null: "bez ograničenja" se ne dobija slučajno', () => {
    const f = zadatakForma({ grupaId: 2, vremeSekunde: 60, brojVarijanti: 3, nivo: 2 });
    expect(f.getRawValue()).toEqual({ grupaId: 2, vremeSekunde: '60', brojVarijanti: '3', nivo: 2 });
    for (const s of ['abc', '4,5', '-3', '1e2']) {
      f.controls.vremeSekunde.setValue(s);
      expect(zadatakIzForme(f).vremeSekunde, s).toBeNaN();
    }
  });

  it('bez zadatka (slajd bez grupe): grupa null, polja prazna', () => {
    expect(zadatakForma(null).getRawValue()).toEqual({ grupaId: null, vremeSekunde: '', brojVarijanti: '', nivo: null });
  });
});

describe('ZadatakFormaComponent', () => {
  let fixture: ComponentFixture<ZadatakFormaComponent>;
  let forma: ZadatakForma;
  let izaberi: ReturnType<typeof vi.fn>;

  async function napravi(info: ZadatakSlajdaInfo | null, odgovor: CvorIzbora | undefined = undefined): Promise<HTMLElement> {
    izaberi = vi.fn(() => of(odgovor));
    TestBed.configureTestingModule({
      imports: [ZadatakFormaComponent],
      providers: [
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: IzborGrupeOtvarac, useValue: { izaberi } },
      ],
    });
    forma = zadatakForma(info);
    fixture = TestBed.createComponent(ZadatakFormaComponent);
    fixture.componentRef.setInput('forma', forma);
    fixture.componentRef.setInput('info', info);
    fixture.componentRef.setInput('predmetId', 1);
    await osvezi();
    return fixture.nativeElement as HTMLElement;
  }

  async function osvezi(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const tekst = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ') ?? '';
  const dugme = (el: HTMLElement, t: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === t)!;
  const veza = (el: HTMLElement) => [...el.querySelectorAll('a')].find(a => a.textContent?.trim() === 'Otvori u banci');

  it('list: putanja, "Aktivnih varijanti: N", polja (oznaka i tip), vreme i broj sa uputstvom; bez upozorenja nema veze na banku', async () => {
    const el = await napravi(zadatakInfo({ polja: [poljeBroj({ oznaka: 'Vrednost u dekadnom sistemu' })] }));
    expect(el.querySelector('[data-putanja]')?.textContent?.trim()).toBe('Konverzije brojeva (demo) › 2 → 10');
    expect(tekst(el)).toContain('Aktivnih varijanti: 2');
    expect(tekst(el)).toContain('Vrednost u dekadnom sistemu (broj)');
    expect(tekst(el)).toContain('Prazno = bez ograničenja.');
    expect(tekst(el)).toContain('Prazno = sve aktivne (2). Menja se i u konzoli pre otvaranja.');
    const labele = [...el.querySelectorAll('mat-label')].map(l => l.textContent?.trim());
    expect(labele).toEqual(['Vreme (s)', 'Broj različitih zadataka']);
    expect(el.querySelector('[role="status"]')!.textContent?.trim()).toBe('');
    expect(veza(el)).toBeUndefined();
  });

  describe('nivo', () => {
    const radio = (el: HTMLElement, n: string) => el.querySelector<HTMLButtonElement>(`[data-zadatak-nivo] [role=radio][data-nivo="${n}"]`)!;

    it('Svi/1/2/3 uz broj kandidata po nivou; izabran je nivo slajda; "Svi" nosi zbir', async () => {
      const el = await napravi(zadatakInfo({ nivo: 3, brojAktivnihPoNivou: [1, 4, 2] }));
      expect(radio(el, '3').getAttribute('aria-checked')).toBe('true');
      expect(radio(el, 'svi').getAttribute('aria-checked')).toBe('false');
      expect(radio(el, '1').getAttribute('aria-label')).toBe('Nivo 1 od 3 (lakši), 1 varijanta');
      expect(radio(el, '2').getAttribute('aria-label')).toBe('Nivo 2 od 3 (srednji), 4 varijante');
      expect(radio(el, 'svi').getAttribute('aria-label')).toBe('Svi nivoi, 7 varijanti');
      expect(el.querySelector('[data-zadatak-nivo]')!.textContent!.replace(/\s+/g, '')).toBe('NivoSvi7142');
    });

    it('napomena "Prazno = sve aktivne (N)" broji kandidate nivoa iz forme, ne sačuvanog', async () => {
      const el = await napravi(zadatakInfo({ nivo: 3, brojAktivnihVarijanti: 2, brojAktivnihPoNivou: [1, 4, 2] }));
      const napomena = () => [...el.querySelectorAll('mat-hint')].map(h => h.textContent!.trim()).find(t => t.startsWith('Prazno = sve aktivne'));
      expect(napomena()).toContain('(2)');
      radio(el, '2').click();
      await osvezi();
      expect(napomena()).toContain('(4)');
      radio(el, 'svi').click();
      await osvezi();
      expect(napomena()).toContain('(7)');
    });

    it('lokalni opis bez brojeva po nivoima (nov slajd pre odgovora servera): bez brojeva uz nivoe, napomena nosi ukupan broj', async () => {
      const el = await napravi(zadatakInfo({ nivo: null, brojAktivnihVarijanti: 5, brojAktivnihPoNivou: null }));
      expect(el.querySelector('[data-zadatak-nivo] .nivo-broj')).toBeNull();
      expect([...el.querySelectorAll('mat-hint')].some(h => h.textContent!.includes('Prazno = sve aktivne (5)'))).toBe(true);
    });

    it('izbor nivoa menja formu (zadatakIzForme.nivo), "Svi" vraća null, a prikaz prati formu', async () => {
      const el = await napravi(zadatakInfo({ nivo: null }));
      expect(radio(el, 'svi').getAttribute('aria-checked')).toBe('true');
      radio(el, '2').click();
      await osvezi();
      expect(zadatakIzForme(forma).nivo).toBe(2);
      expect(forma.dirty).toBe(true);
      expect(radio(el, '2').getAttribute('aria-checked')).toBe('true');
      radio(el, 'svi').click();
      await osvezi();
      expect(zadatakIzForme(forma).nivo).toBeNull();
      forma.controls.nivo.setValue(1);
      await osvezi();
      expect(radio(el, '1').getAttribute('aria-checked')).toBe('true');
    });
  });

  it('unutrašnji čvor: "Aktivnih varijanti u podgrupama: N"; list bez polja je rad na papiru', async () => {
    let el = await napravi(zadatakInfo({ grupaId: 1, grupaNaziv: 'Konverzije brojeva (demo)', putanja: [{ id: 1, naziv: 'Konverzije brojeva (demo)' }], list: false, brojAktivnihVarijanti: 3, polja: null }));
    expect(tekst(el)).toContain('Aktivnih varijanti u podgrupama: 3');
    expect(tekst(el)).not.toContain('Polja odgovora');
    TestBed.resetTestingModule();
    el = await napravi(zadatakInfo({ polja: [] }));
    expect(tekst(el)).toContain('rad na papiru');
  });

  it('upozorenja servera u role=status; bez aktivnih: veza "Otvori u banci" na čvor u banci predavanja', async () => {
    const upozorenja = ['Tema je isključena.', 'Grupa nema aktivnih varijanti; odobri nacrte u banci pre časa.'];
    const el = await napravi(zadatakInfo({ brojAktivnihVarijanti: 0, iskljucena: true, upozorenja }));
    const status = el.querySelector('[role="status"]')!;
    expect([...status.querySelectorAll('p')].map(p => p.textContent?.trim())).toEqual(upozorenja);
    const a = veza(el)!;
    expect(a).toBeDefined();
    expect(a.getAttribute('href')).toBe('/banka?predmet=1&namena=PREDAVANJE&grupa=2');
  });

  it('"Promeni grupu…": izbor iz dijaloga (trenutna grupa izabrana unapred) menja grupaId i prikaz dok server ne odgovori', async () => {
    const novi: CvorIzbora = { id: 3, naziv: '16 → 2', list: true, brojAktivnih: 0, iskljucena: false, deca: [] };
    const el = await napravi(zadatakInfo(), novi);
    const promene: (number | null)[] = [];
    forma.controls.grupaId.valueChanges.subscribe(v => promene.push(v));
    dugme(el, 'Promeni grupu…').click();
    await osvezi();
    expect(izaberi).toHaveBeenCalledWith({ predmetId: 1, grupaId: 2 });
    expect(promene).toEqual([3]);
    expect(el.querySelector('[data-putanja]')?.textContent?.trim()).toBe('16 → 2');
    expect(tekst(el)).toContain('Aktivnih varijanti: 0');
    // čvor bez aktivnih: veza na banku i pre odgovora servera
    expect(veza(el)!.getAttribute('href')).toBe('/banka?predmet=1&namena=PREDAVANJE&grupa=3');

    // lokalni prikaz posle izmene (slajdIzCmd: prazan opis za drugu grupu) ne briše izabran čvor
    fixture.componentRef.setInput('info', { ...zadatakInfo(), grupaId: 3, grupaNaziv: null, putanja: [], list: false, brojAktivnihVarijanti: 0, polja: null });
    await osvezi();
    expect(el.querySelector('[data-putanja]')?.textContent?.trim()).toBe('16 → 2');
    // odgovor servera za novu grupu: njegova putanja, broj i upozorenja
    fixture.componentRef.setInput('info', zadatakInfo({
      grupaId: 3, grupaNaziv: '16 → 2', putanja: [{ id: 1, naziv: 'Konverzije brojeva (demo)' }, { id: 3, naziv: '16 → 2' }],
      brojAktivnihVarijanti: 1, upozorenja: [],
    }));
    await osvezi();
    expect(el.querySelector('[data-putanja]')?.textContent?.trim()).toBe('Konverzije brojeva (demo) › 16 → 2');
    expect(tekst(el)).toContain('Aktivnih varijanti: 1');
    expect(veza(el)).toBeUndefined();
  });

  it('"Promeni grupu…" pa Otkaži (ili ista grupa): forma se ne menja', async () => {
    const el = await napravi(zadatakInfo());
    const promene: unknown[] = [];
    forma.valueChanges.subscribe(v => promene.push(v));
    dugme(el, 'Promeni grupu…').click();
    await osvezi();
    expect(izaberi).toHaveBeenCalledTimes(1);
    izaberi.mockReturnValue(of({ id: 2, naziv: '2 → 10', list: true, brojAktivnih: 2, iskljucena: false, deca: [] }));
    dugme(el, 'Promeni grupu…').click();
    await osvezi();
    expect(promene).toEqual([]);
    expect(forma.controls.grupaId.value).toBe(2);
  });

  it('obrisana grupa (grupaId null sa servera): upozorenje, bez putanje i broja, "Izaberi grupu…"', async () => {
    const el = await napravi(zadatakInfo({
      grupaId: null, grupaNaziv: null, putanja: [], list: false, brojAktivnihVarijanti: 0, polja: null,
      upozorenja: ['Grupa zadataka je obrisana; izaberi drugu.'],
    }));
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Grupa zadataka je obrisana; izaberi drugu.');
    expect(el.querySelector('[data-putanja]')?.textContent?.trim()).toBe('Nije izabrana');
    expect(tekst(el)).not.toContain('Aktivnih varijanti');
    expect(veza(el)).toBeUndefined();
    expect(dugme(el, 'Izaberi grupu…')).toBeDefined();
  });
});

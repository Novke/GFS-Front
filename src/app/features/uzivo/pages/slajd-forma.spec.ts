import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { platno } from '../data-access/platno-podaci.testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { zadatakSlajd } from '../data-access/izvodjenje-podaci.testing';
import { PORUKE } from '../data-access/slajd-pravila';
import { Prelaz, SlajdCmd, SlajdDetails } from '../data-access/uzivo.models';
import { IzborGrupeOtvarac } from './izbor-grupe-otvarac';
import { SlajdFormaComponent } from './slajd-forma.component';
import { ZadatakFormaComponent } from './zadatak-forma.component';

function platnoSlajd(): SlajdDetails {
  return {
    id: 4, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: 'Stare', postepeno: false,
    pitanje: null, platno: platno(), prelaz: null,
  };
}

describe('SlajdFormaComponent: PLATNO', () => {
  let fixture: ComponentFixture<SlajdFormaComponent>;
  let emitovano: SlajdCmd[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SlajdFormaComponent],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    fixture = TestBed.createComponent(SlajdFormaComponent);
    fixture.componentRef.setInput('slajd', platnoSlajd());
    emitovano = [];
    fixture.componentInstance.izmena.subscribe(c => emitovano.push(c));
    fixture.detectChanges();
  });

  it('prikazuje samo beleške (slojeve uređuje editor platna iznad forme, bez stare napomene)', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('textarea').length).toBe(1);
    expect(el.querySelector('input')).toBeNull();
    expect(el.textContent).not.toContain('se za sada ne uređuju ovde');
  });

  it('izmena beleški emituje PLATNO komandu sa istim platnom i novim beleškama', () => {
    const polje = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    polje.value = 'Nove beleške';
    polje.dispatchEvent(new Event('input'));
    expect(emitovano.length).toBe(1);
    expect(emitovano[0].tip).toBe('PLATNO');
    expect(emitovano[0].beleske).toBe('Nove beleške');
    expect(emitovano[0].platno).toEqual(platno());
    expect(emitovano[0].pitanje).toBeNull();
  });
});

describe('SlajdFormaComponent: Pretvori u platno (F10)', () => {
  const slajd = (tip: SlajdDetails['tip']): SlajdDetails => ({
    id: 5, rb: 1, tip, naslov: tip === 'INFO' ? 'Uvod' : null, sadrzaj: null, slika: null, beleske: null, postepeno: false,
    pitanje: tip === 'PITANJE' ? {
      id: 9, tip: 'JEDAN_TACAN', tekst: 'Koliko?', slika: null, vremeSekunde: null,
      opcije: [{ id: 1, rb: 1, tekst: 'Jedan', tacna: true }, { id: 2, rb: 2, tekst: 'Dva', tacna: false }],
      brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
      prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
    } : null,
    platno: tip === 'PLATNO' ? platno() : null, prelaz: null,
  });

  function napravi(tip: SlajdDetails['tip']): ComponentFixture<SlajdFormaComponent> {
    TestBed.configureTestingModule({
      imports: [SlajdFormaComponent],
      providers: [provideHttpClient(), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    const f = TestBed.createComponent(SlajdFormaComponent);
    f.componentRef.setInput('slajd', slajd(tip));
    f.detectChanges();
    return f;
  }

  const dugme = (f: ComponentFixture<SlajdFormaComponent>) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.trim() === 'Pretvori u platno');

  it('INFO: dugme "Pretvori u platno" (sa opisom) emituje pretvori, bez izmene forme', () => {
    const f = napravi('INFO');
    const pretvori = vi.fn();
    const izmena = vi.fn();
    f.componentInstance.pretvori.subscribe(pretvori);
    f.componentInstance.izmena.subscribe(izmena);
    const b = dugme(f)!;
    expect(b).toBeDefined();
    expect(b.type).toBe('button');
    const opis = document.getElementById(b.getAttribute('aria-describedby')!)!;
    expect(opis.textContent).toContain('Slajd postaje platno sa slojevima (naslov, tekst, slika)');
    b.click();
    expect(pretvori).toHaveBeenCalledTimes(1);
    expect(izmena).not.toHaveBeenCalled();
  });

  it.each(['PITANJE', 'PLATNO'] as const)('%s: nema dugmeta "Pretvori u platno"', tip => {
    expect(dugme(napravi(tip))).toBeUndefined();
  });
});

describe('SlajdFormaComponent: prelaz (F16)', () => {
  const pitanje = {
    id: 9, tip: 'JEDAN_TACAN' as const, tekst: 'Koliko?', slika: null, vremeSekunde: null,
    opcije: [{ id: 1, rb: 1, tekst: 'Jedan', tacna: true }, { id: 2, rb: 2, tekst: 'Dva', tacna: false }],
    brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
    prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
  };
  const slajd = (tip: SlajdDetails['tip'], prelaz: Prelaz | null = null): SlajdDetails => ({
    id: 6, rb: 1, tip, naslov: tip === 'INFO' ? 'Uvod' : null, sadrzaj: null, slika: null, beleske: 'Stare', postepeno: false,
    pitanje: tip === 'PITANJE' ? pitanje : null, platno: tip === 'PLATNO' ? platno() : null, prelaz,
  });

  let f: ComponentFixture<SlajdFormaComponent>;
  let emitovano: SlajdCmd[];
  const el = () => f.nativeElement as HTMLElement;
  const polje = (oznaka: string) => [...el().querySelectorAll<HTMLElement>('mat-form-field')]
    .find(p => p.querySelector('mat-label')?.textContent?.trim() === oznaka);
  const vrednostIzbora = (oznaka: string) => polje(oznaka)?.querySelector('.mat-mdc-select-value')?.textContent?.trim();
  const pregled = () => [...el().querySelectorAll('button')].find(b => b.textContent?.trim() === 'Pregledaj prelaz');
  const poslednji = () => emitovano[emitovano.length - 1];

  async function napravi(s: SlajdDetails, stanje = DeferBlockState.Complete): Promise<void> {
    TestBed.configureTestingModule({
      imports: [SlajdFormaComponent],
      providers: [provideHttpClient(), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
      // polja prelaza su u `@defer (on immediate)` (lenji chunk): blok se iscrtava ručno, posle pravljenja forme
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
    f = TestBed.createComponent(SlajdFormaComponent);
    f.componentRef.setInput('slajd', s);
    emitovano = [];
    f.componentInstance.izmena.subscribe(c => emitovano.push(c));
    f.detectChanges();
    const blokovi = await f.getDeferBlocks();
    expect(blokovi.length).toBe(1);
    await blokovi[0].render(stanje);
    await f.whenStable();
  }

  async function izaberi(oznaka: string, tekst: string): Promise<void> {
    polje(oznaka)!.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await f.whenStable();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find(o => o.textContent!.trim() === tekst)!.click();
    await f.whenStable();
  }

  async function sekunde(v: string): Promise<void> {
    const input = polje('Trajanje (s)')!.querySelector('input')!;
    input.value = v;
    input.dispatchEvent(new Event('input'));
    await f.whenStable();
  }

  it('INFO bez prelaza: "Bez prelaza", bez polja Smer i Trajanje i bez dugmeta pregleda; grupa je iznad beleški', async () => {
    await napravi(slajd('INFO'));
    const grupa = el().querySelector('fieldset.uz-ed-prelaz')!;
    expect(grupa.querySelector('legend')!.textContent!.trim()).toBe('Prelaz na ovaj slajd');
    expect(vrednostIzbora('Efekat')).toBe('Bez prelaza');
    expect(polje('Smer')).toBeUndefined();
    expect(polje('Trajanje (s)')).toBeUndefined();
    expect(pregled()).toBeUndefined();
    const beleske = el().querySelector('textarea[formcontrolname=beleske]')!;
    expect(grupa.compareDocumentPosition(beleske) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(emitovano).toEqual([]);
  });

  it('"Guranje": Smer je vidljiv (Zdesna), izmena emituje {GURANJE, DESNO, 500}', async () => {
    await napravi(slajd('INFO'));
    await izaberi('Efekat', 'Guranje');
    expect(vrednostIzbora('Smer')).toBe('Zdesna');
    expect(polje('Trajanje (s)')!.querySelector('input')!.value).toBe('0,5');
    expect(poslednji().prelaz).toEqual({ efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 500 });
    expect(poslednji().naslov).toBe('Uvod');
    await izaberi('Smer', 'Odozgo');
    expect(poslednji().prelaz).toEqual({ efekat: 'GURANJE', smer: 'GORE', trajanjeMs: 500 });
  });

  it('"Postepeno" + 0,8 s emituje {FADE, null, 800}, bez polja Smer; "Bez prelaza" emituje null', async () => {
    await napravi(slajd('INFO'));
    await izaberi('Efekat', 'Postepeno');
    expect(polje('Smer')).toBeUndefined();
    await sekunde('0.8');
    expect(poslednji().prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 800 });
    await izaberi('Efekat', 'Brisanje');
    expect(poslednji().prelaz).toEqual({ efekat: 'BRISANJE', smer: 'DESNO', trajanjeMs: 800 });
    await izaberi('Efekat', 'Bez prelaza');
    expect(poslednji().prelaz).toBeNull();
    expect(polje('Trajanje (s)')).toBeUndefined();
  });

  it('postojeći prelaz se učitava, a izmena beleški ga šalje nepromenjenog (PUT ga ne briše)', async () => {
    const p: Prelaz = { efekat: 'BRISANJE', smer: 'LEVO', trajanjeMs: 1200 };
    await napravi(slajd('INFO', p));
    expect(vrednostIzbora('Efekat')).toBe('Brisanje');
    expect(vrednostIzbora('Smer')).toBe('Sleva');
    expect(polje('Trajanje (s)')!.querySelector('input')!.value).toBe('1,2');
    const beleske = el().querySelector('textarea[formcontrolname=beleske]') as HTMLTextAreaElement;
    beleske.value = 'Nove';
    beleske.dispatchEvent(new Event('input'));
    expect(poslednji().beleske).toBe('Nove');
    expect(poslednji().prelaz).toEqual(p);
  });

  it('FADE iz servera (smer null) prikazuje Postepeno bez Smera; promena na Guranje daje DESNO', async () => {
    await napravi(slajd('INFO', { efekat: 'FADE', smer: null, trajanjeMs: 700 }));
    expect(vrednostIzbora('Efekat')).toBe('Postepeno');
    expect(polje('Smer')).toBeUndefined();
    await izaberi('Efekat', 'Guranje');
    expect(poslednji().prelaz).toEqual({ efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 700 });
  });

  it('trajanje van 0,1-5 s: greška servera ispod forme (slajd se ne čuva)', async () => {
    await napravi(slajd('INFO', { efekat: 'FADE', smer: null, trajanjeMs: 500 }));
    await sekunde('0.05');
    expect(poslednji().prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 50 });
    expect(el().querySelector('.uz-ed-greske')!.textContent).toContain(PORUKE.prelaz);
    await sekunde('5');
    expect(poslednji().prelaz!.trajanjeMs).toBe(5000);
    expect(el().querySelector('.uz-ed-greske')).toBeNull();
    await sekunde('5.1');
    expect(el().querySelector('.uz-ed-greske')!.textContent).toContain(PORUKE.prelaz);
  });

  it('decimalni zarez: "0,8" daje 800 ms (tekstualno polje, ne type=number), "1.25" 1250; prazno i "abc" daju 0 ms i grešku', async () => {
    await napravi(slajd('INFO', { efekat: 'FADE', smer: null, trajanjeMs: 500 }));
    const input = polje('Trajanje (s)')!.querySelector('input')!;
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('decimal');
    await sekunde('0,8');
    expect(poslednji().prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 800 });
    expect(el().querySelector('.uz-ed-greske')).toBeNull();
    await sekunde(' 1.25 ');
    expect(poslednji().prelaz!.trajanjeMs).toBe(1250);
    for (const v of ['', 'abc', '1,2,3', '-1']) {
      await sekunde(v);
      expect(poslednji().prelaz!.trajanjeMs, v).toBe(0);
      expect(el().querySelector('.uz-ed-greske')!.textContent, v).toContain(PORUKE.prelaz);
    }
  });

  it('greška trajanja je i na samom polju: mat-error i aria-invalid, i nestaju kad je trajanje ispravno', async () => {
    await napravi(slajd('INFO', { efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 500 }));
    const input = () => polje('Trajanje (s)')!.querySelector('input')!;
    expect(input().getAttribute('aria-invalid')).toBe('false');
    expect(polje('Trajanje (s)')!.querySelector('mat-error')).toBeNull();
    await sekunde('9');
    f.detectChanges();
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(polje('Trajanje (s)')!.querySelector('mat-error')!.textContent).toContain('Unesi od 0,1 do 5 (npr. 0,8).');
    await sekunde('0,1');
    f.detectChanges();
    expect(input().getAttribute('aria-invalid')).toBe('false');
    expect(polje('Trajanje (s)')!.querySelector('mat-error')).toBeNull();
  });

  it('chunk polja prelaza ne stigne (@error): poruka umesto polja, a izmena beleški i dalje nosi prelaz', async () => {
    const p: Prelaz = { efekat: 'BRISANJE', smer: 'GORE', trajanjeMs: 900 };
    await napravi(slajd('INFO', p), DeferBlockState.Error);
    expect(el().querySelector('fieldset.uz-ed-prelaz')).toBeNull();
    const poruka = el().querySelector('.uz-ed-greska')!;
    expect(poruka.getAttribute('role')).toBe('alert');
    expect(poruka.textContent).toContain('Polja prelaza nisu učitana. Osveži stranicu i pokušaj ponovo.');
    const beleske = el().querySelector('textarea[formcontrolname=beleske]') as HTMLTextAreaElement;
    beleske.value = 'Nove';
    beleske.dispatchEvent(new Event('input'));
    expect(poslednji().prelaz).toEqual(p);
  });

  it('"Pregledaj prelaz" emituje pregledPrelaza, bez izmene slajda', async () => {
    await napravi(slajd('INFO', { efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 500 }));
    const pregledano = vi.fn();
    f.componentInstance.pregledPrelaza.subscribe(pregledano);
    const b = pregled()!;
    expect(b.type).toBe('button');
    b.click();
    expect(pregledano).toHaveBeenCalledTimes(1);
    expect(emitovano).toEqual([]);
  });

  it('PLATNO (forma samo beleške) ima i polja prelaza; izmena nosi isto platno i nov prelaz', async () => {
    await napravi(slajd('PLATNO'));
    expect(el().querySelector('fieldset.uz-ed-prelaz')).not.toBeNull();
    await izaberi('Efekat', 'Brisanje');
    await izaberi('Smer', 'Odozdo');
    expect(poslednji()).toEqual(expect.objectContaining({
      tip: 'PLATNO', platno: platno(), beleske: 'Stare', prelaz: { efekat: 'BRISANJE', smer: 'DOLE', trajanjeMs: 500 },
    }));
  });

  it('PITANJE ima polja prelaza i izmena pitanja nosi postojeći prelaz', async () => {
    const p: Prelaz = { efekat: 'GURANJE', smer: 'GORE', trajanjeMs: 900 };
    await napravi(slajd('PITANJE', p));
    expect(vrednostIzbora('Efekat')).toBe('Guranje');
    const tekst = [...el().querySelectorAll<HTMLTextAreaElement>('textarea')][0];
    tekst.value = 'Koliko je sati?';
    tekst.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(poslednji().pitanje!.tekst).toBe('Koliko je sati?');
    expect(poslednji().prelaz).toEqual(p);
  });
});

describe('SlajdFormaComponent: ZADATAK', () => {
  let f: ComponentFixture<SlajdFormaComponent>;
  let emitovano: SlajdCmd[];
  let izaberi: ReturnType<typeof vi.fn>;
  const el = () => f.nativeElement as HTMLElement;
  const poslednji = () => emitovano[emitovano.length - 1];
  const polje = (oznaka: string) => [...el().querySelectorAll<HTMLElement>('mat-form-field')]
    .find(p => p.querySelector('mat-label')?.textContent?.trim() === oznaka)!.querySelector('input')!;

  async function napravi(s: SlajdDetails): Promise<void> {
    izaberi = vi.fn(() => of({ id: 3, naziv: '16 → 2', list: true, brojAktivnih: 1, iskljucena: false, deca: [] }));
    TestBed.configureTestingModule({
      imports: [SlajdFormaComponent],
      providers: [
        provideHttpClient(), provideRouter([]), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: IzborGrupeOtvarac, useValue: { izaberi } },
      ],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
    f = TestBed.createComponent(SlajdFormaComponent);
    f.componentRef.setInput('slajd', s);
    f.componentRef.setInput('predmetId', 1);
    emitovano = [];
    f.componentInstance.izmena.subscribe(c => emitovano.push(c));
    f.detectChanges();
    await f.whenStable();
  }

  async function upisi(oznaka: string, v: string): Promise<void> {
    const input = polje(oznaka);
    input.value = v;
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    await f.whenStable();
  }

  it('forma zadatka umesto pitanja (predmet, opis sa servera), beleške ostaju', async () => {
    await napravi(zadatakSlajd());
    expect(el().querySelector('app-pitanje-forma')).toBeNull();
    const forma = f.debugElement.query(d => d.componentInstance instanceof ZadatakFormaComponent).componentInstance as ZadatakFormaComponent;
    expect(forma.predmetId()).toBe(1);
    expect(forma.info()?.grupaNaziv).toBe('2 → 10');
    expect(el().querySelector('textarea[formcontrolname=beleske]')).not.toBeNull();
    expect(el().querySelector('.uz-ed-greske')).toBeNull();
  });

  it('vreme i broj različitih: komanda nosi zadatak (ostala polja null), neispravno daje poruku servera ispod forme', async () => {
    await napravi({ ...zadatakSlajd({ vremeSekunde: null }), beleske: 'Na tabli' });
    await upisi('Broj različitih zadataka', '4');
    expect(poslednji()).toEqual({
      tip: 'ZADATAK', naslov: null, sadrzaj: null, slikaId: null, beleske: 'Na tabli', postepeno: false, pitanje: null,
      platno: null, prelaz: null, zadatak: { grupaId: 2, vremeSekunde: null, brojVarijanti: 4, nivo: null },
    });
    await upisi('Vreme (s)', '4');
    expect(poslednji().zadatak).toEqual({ grupaId: 2, vremeSekunde: 4, brojVarijanti: 4, nivo: null });
    expect(el().querySelector('.uz-ed-greske')!.textContent).toContain(PORUKE.vreme);
    await upisi('Vreme (s)', '');
    await upisi('Broj različitih zadataka', '51');
    expect(poslednji().zadatak).toEqual({ grupaId: 2, vremeSekunde: null, brojVarijanti: 51, nivo: null });
    expect(el().querySelector('.uz-ed-greske')!.textContent).toContain(PORUKE.brojVarijanti);
    expect(el().querySelector('.uz-ed-greske')!.textContent).not.toContain(PORUKE.vreme);
  });

  it('nivo: izbor "★★★" ide u komandu zadatka, "Svi" ga vraća na null', async () => {
    await napravi(zadatakSlajd({ nivo: 1 }));
    expect(el().querySelector('[data-zadatak-nivo] [role=radio][data-nivo="1"]')!.getAttribute('aria-checked')).toBe('true');
    el().querySelector<HTMLButtonElement>('[data-zadatak-nivo] [role=radio][data-nivo="3"]')!.click();
    await f.whenStable();
    expect(poslednji().zadatak).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: null, nivo: 3 });
    el().querySelector<HTMLButtonElement>('[data-zadatak-nivo] [role=radio][data-nivo="svi"]')!.click();
    await f.whenStable();
    expect(poslednji().zadatak!.nivo).toBeNull();
  });

  it('"Promeni grupu…" emituje komandu sa novom grupom (vreme i broj ostaju)', async () => {
    await napravi(zadatakSlajd({ vremeSekunde: 120, brojVarijanti: 2 }));
    [...el().querySelectorAll('button')].find(b => b.textContent?.trim() === 'Promeni grupu…')!.click();
    await f.whenStable();
    expect(izaberi).toHaveBeenCalledWith({ predmetId: 1, grupaId: 2 });
    expect(poslednji().zadatak).toEqual({ grupaId: 3, vremeSekunde: 120, brojVarijanti: 2, nivo: null });
  });

  it('INFO: komanda nosi zadatak null', async () => {
    await napravi({
      id: 5, rb: 1, tip: 'INFO', naslov: 'Uvod', sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
      platno: null, prelaz: null,
    });
    const naslov = el().querySelector('input[formcontrolname=naslov]') as HTMLInputElement;
    naslov.value = 'Novi';
    naslov.dispatchEvent(new Event('input'));
    expect(poslednji()).toEqual(expect.objectContaining({ tip: 'INFO', naslov: 'Novi', zadatak: null }));
  });
});

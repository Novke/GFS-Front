import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { naPitanju, stanje } from '../data-access/izvodjenje-podaci.testing';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { PublikaPage, scenaPosle } from './publika.page';

const zavrseno = (s: NastavnickoStanje): NastavnickoStanje =>
  ({ ...s, verzija: s.verzija + 1, izvodjenje: { ...s.izvodjenje, status: 'ZAVRSENO' } });

const kraj = stanje({
  prikaz: 'KRAJ', indeks: 3, takmicenje: true, verzija: 8,
  javnaRangLista: [{ mesto: 1, ucesnikId: null, ime: 'Ana', poeni: 1800 }, { mesto: 2, ucesnikId: null, ime: 'Bojan', poeni: 900 }],
});

describe('scenaPosle', () => {
  it('aktivno: uvek trenutni snimak', () => {
    const s = naPitanju('OTVORENO');
    expect(scenaPosle(s, kraj)).toBe(s);
    expect(scenaPosle(null, kraj)).toBeNull();
  });

  it('završeno posle KRAJ: ostaje poslednji KRAJ (postolje)', () => {
    // bez čuvanja server briše učesnike, pa završeni snimak više nema rang-listu
    const kasnije = zavrseno({ ...kraj, javnaRangLista: [], ucesnici: [] });
    expect(scenaPosle(kasnije, kraj)).toBe(kraj);
    // i sledeći završeni snimak ga zadržava
    expect(scenaPosle(zavrseno(kasnije), kraj)).toBe(kraj);
  });

  it('završeno iz drugog prikaza, tek učitano ili drugo izvođenje: bez scene', () => {
    const slajd = naPitanju('ZATVORENO');
    expect(scenaPosle(zavrseno(slajd), slajd)).toBeNull();
    expect(scenaPosle(zavrseno(kraj), null)).toBeNull();
    const drugo = zavrseno({ ...kraj, izvodjenje: { ...kraj.izvodjenje, id: 99 } });
    expect(scenaPosle(drugo, kraj)).toBeNull();
  });
});

describe('PublikaPage', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal(''),
    sat: signal(null),
    dozvoljene: signal(new Set()),
    init: vi.fn(),
    komanda: vi.fn(),
  };

  async function prikazi() {
    TestBed.configureTestingModule({
      providers: [{ provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
    });
    TestBed.overrideComponent(PublikaPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
    const fixture = TestBed.createComponent(PublikaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const osvezi = async (f: Awaited<ReturnType<typeof prikazi>>) => {
    f.detectChanges();
    await f.whenStable();
  };

  afterEach(() => {
    window.name = '';
    lazniStore.stanje.set(null);
  });

  it('"Završi" dok je postolje na platnu: postolje ostaje', async () => {
    lazniStore.stanje.set(kraj);
    const f = await prikazi();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-postolje')?.textContent).toContain('Ana');

    lazniStore.stanje.set(zavrseno({ ...kraj, javnaRangLista: [], ucesnici: [] }));
    await osvezi(f);
    expect(el.querySelector('app-postolje')?.textContent).toContain('Ana');
    expect(el.textContent).not.toContain('Izvođenje je završeno.');
  });

  it('"Završi" sa slajda: poruka o kraju', async () => {
    const slajd = naPitanju('ZATVORENO');
    lazniStore.stanje.set(slajd);
    const f = await prikazi();
    lazniStore.stanje.set(zavrseno(slajd));
    await osvezi(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-publika-scena')).toBeNull();
    expect(el.textContent).toContain('Izvođenje je završeno. Hvala!');
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { animacija } from '../data-access/platno-podaci.testing';
import { infoSlajd, naPitanju, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import type { CrtezSloj, Potez } from '../data-access/platno.models';
import { PoteziCrteza } from '../data-access/potezi-crteza';
import { NastavnickoStanje, SlajdDetails } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import type { SlajdZaPrikaz } from '../ui/slajd-za-prikaz';
import { SledecePanelComponent } from './sledece-panel.component';

async function prikazi(s: NastavnickoStanje) {
  const fixture = TestBed.createComponent(SledecePanelComponent);
  fixture.componentRef.setInput('stanje', s);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const prikazi1 = (f: Awaited<ReturnType<typeof prikazi>>) =>
  f.debugElement.queryAll(By.directive(SlajdPrikazComponent)).map((d) => d.componentInstance as SlajdPrikazComponent);
const tekst = (f: Awaited<ReturnType<typeof prikazi>>) => (f.nativeElement as HTMLElement).textContent ?? '';

describe('SledecePanelComponent', () => {
  it('INFO postepeno, korak 1/3: naslov "korak 2/3", isti slajd na koraku 2', async () => {
    const sl = infoSlajd({ postepeno: true });
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: sl, korak: 1, brojStavki: 3 }));
    expect(f.nativeElement.querySelector('h2').textContent).toContain('Sledeće · korak 2/3');
    const p = prikazi1(f);
    expect(p.length).toBe(1);
    expect(p[0].korak()).toBe(2);
    expect(p[0].slajd()).toBe(sl);
    expect(p[0].postepeno()).toBe(true);
  });

  it('PLATNO korak 0/2: korak 1, bez animacije, tema prezentacije, prvi klik je vidljiv', async () => {
    // druga KLIK animacija uvodi sloj tabele (u fabričkom platnu je to izlaz oblika)
    const pl = platnoSlajd();
    pl.platno!.animacije[3] = animacija('a4', 'tabela');
    const f = await prikazi(stanje({
      prikaz: 'SLAJD', indeks: 0, trenutniSlajd: pl, korak: 0, brojStavki: 2, tema: 'TAMNA',
    }));
    const p = prikazi1(f)[0];
    expect(p.korak()).toBe(1);
    expect(p.animacija()).toBeNull();
    expect(p.tema()).toBe('TAMNA');
    const sloj = (id: string) => f.nativeElement.querySelector(`[data-sloj="${id}"]`) as HTMLElement;
    expect(sloj('tekst').style.visibility).toBe('');
    expect(sloj('slika').style.visibility).toBe('');
    expect(sloj('tabela').style.visibility).toBe('hidden');
  });

  it('pitanje CEKA: radnja "otvara" i pregled slajda posle pitanja', async () => {
    const f = await prikazi(naPitanju('CEKA', { sledeciSlajd: infoSlajd({ rb: 3 }), indeks: 1 }));
    expect(tekst(f)).toContain('Sledeći klik otvara pitanje.');
    expect(tekst(f)).toContain('Zatim: slajd 3/3');
    const p = prikazi1(f);
    expect(p.length).toBe(1);
    expect(p[0].korak()).toBe(0);
  });

  it('pitanje OTVORENO bez sledećeg: "zatvara" i kraj prezentacije', async () => {
    const f = await prikazi(naPitanju('OTVORENO', { sledeciSlajd: null }));
    expect(tekst(f)).toContain('Sledeći klik zatvara pitanje.');
    expect(tekst(f)).toContain('Zatim: kraj prezentacije.');
    expect(prikazi1(f).length).toBe(0);
  });

  it('prijava: sledeći slajd 1/3 na koraku 0', async () => {
    const f = await prikazi(stanje());
    expect(f.nativeElement.querySelector('h2').textContent).toContain('Sledeće · slajd 1/3');
    expect(prikazi1(f)[0].korak()).toBe(0);
  });

  it('KRAJ: tekst o kraju; NISTA: Završi', async () => {
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 2, trenutniSlajd: infoSlajd(), sledeciSlajd: null }));
    expect(tekst(f)).toContain('Sledeći klik prikazuje kraj');
    const g = await prikazi(stanje({ prikaz: 'KRAJ', sledeciSlajd: null }));
    expect(tekst(g)).toContain('Završi izvođenje dugmetom „Završi“.');
  });
});

/** Panel čita keš poteza prozora (konzola: publika-scena ga puni za trenutni i sledeći), a sam ništa ne traži. */
describe('SledecePanelComponent (potezi crteža iz keša)', () => {
  const potezi: Potez[] = [{ boja: '#C00000', debljina: 3, tacke: [10, 5, 20, 10] }];
  const crtezSlajda = (sl: SlajdZaPrikaz) => sl.platno!.slojevi.find((x) => x.tip === 'CRTEZ') as CrtezSloj;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Puni keš kao publika-scena konzole (jedan GET po slajdu, odgovor sa potezima crteža). */
  function napuni(...slajdovi: SlajdDetails[]) {
    const kes = TestBed.inject(PoteziCrteza);
    for (const sl of slajdovi) {
      kes.ucitaj(sl);
      http.expectOne(`api/slajdovi/${sl.id}/potezi`)
        .flush([{ slojId: 'crtez', medijId: crtezSlajda(sl).medijId, sirina: 200, visina: 100, potezi }]);
    }
  }

  it('bez keša: slajd iz snimka (slika), panel ne šalje zahtev', async () => {
    const sl = platnoSlajd({ id: 31 });
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), sledeciSlajd: sl }));
    expect(prikazi1(f)[0].slajd()).toBe(sl);
  });

  it('SLAJD (sledeći PLATNO): potezi iz keša', async () => {
    const sl = platnoSlajd({ id: 31 });
    napuni(sl);
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), sledeciSlajd: sl }));
    expect(crtezSlajda(prikazi1(f)[0].slajd()).potezi).toEqual(potezi);
  });

  it('KORAK (isti PLATNO slajd, korak 1): potezi iz keša', async () => {
    const sl = platnoSlajd({ id: 30 });
    napuni(sl);
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: sl, korak: 0, brojStavki: 2 }));
    expect(prikazi1(f)[0].korak()).toBe(1);
    expect(crtezSlajda(prikazi1(f)[0].slajd()).potezi).toEqual(potezi);
  });

  it('PITANJE pa "Zatim" PLATNO: potezi iz keša', async () => {
    const sl = platnoSlajd({ id: 32 });
    napuni(sl);
    const f = await prikazi(naPitanju('CEKA', { sledeciSlajd: sl }));
    expect(crtezSlajda(prikazi1(f)[0].slajd()).potezi).toEqual(potezi);
  });
});

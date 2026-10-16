import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { animacija, platno } from '../data-access/platno-podaci.testing';
import { infoSlajd, platnoSlajd } from '../data-access/izvodjenje-podaci.testing';
import type { SlajdDetails } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { otvoriPregledPrelaza, PregledPrelazaPodaci, PrelazPregledDialog } from './prelaz-pregled.dialog';

interface Lazna { finished: Promise<unknown>; cancel: ReturnType<typeof vi.fn>; zavrsi(): void; }

/** Lažni `matchMedia` sa `prefers-reduced-motion: reduce` (i slušaocima, koje CDK `BreakpointObserver` zove). */
const smanjenoKretanjeUSistemu = vi.fn((q: string) => ({
  matches: q === '(prefers-reduced-motion: reduce)', media: q,
  addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined,
}));

describe('PrelazPregledDialog', () => {
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animate = vi.fn((): Lazna => {
      let zavrsi!: () => void;
      let odbij!: (e: unknown) => void;
      const finished = new Promise<unknown>((r, o) => { zavrsi = () => r(undefined); odbij = o; });
      finished.catch(() => undefined);
      return { finished, cancel: vi.fn(() => odbij(new DOMException('Prekinuto', 'AbortError'))), zavrsi };
    });
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    vi.unstubAllGlobals();
  });

  const GURANJE = { efekat: 'GURANJE', smer: 'GORE', trajanjeMs: 700 } as const;
  const slajd = platnoSlajd({
    id: 31, prelaz: GURANJE,
    platno: { ...platno(), animacije: [animacija('a0', 'tabela', { okidac: 'SA_PRETHODNIM' }), ...platno().animacije] },
  });

  async function dijalog(podaci: Partial<PregledPrelazaPodaci> = {}) {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { pre: infoSlajd({ id: 20 }), slajd, tema: 'NACRT', ...podaci } }],
    });
    const fixture = TestBed.createComponent(PrelazPregledDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const prikazi = () => fixture.debugElement.queryAll(By.directive(SlajdPrikazComponent)).map(d => d.componentInstance as SlajdPrikazComponent);
    const naOmotacu = (klasa: string) => animate.mock.calls
      .map((poziv, i) => ({ kadrovi: poziv[0] as Keyframe[], opcije: poziv[1], el: animate.mock.contexts[i] as Element, a: animate.mock.results[i].value as Lazna }))
      .filter(p => p.el.classList.contains(klasa));
    const dugme = (tekst: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === tekst)!;
    const osvezi = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, el, prikazi, naOmotacu, dugme, osvezi };
  }

  it('otvaranje: prelaz kreće odmah (ulazni i odlazni omotač), naslov i fokus na "Ponovi"', async () => {
    const d = await dijalog();
    expect(d.el.querySelector('h2')!.textContent).toContain('Pregled prelaza');
    expect(d.prikazi().map(p => p.slajd().id)).toEqual([20, 31]);
    const [ul] = d.naOmotacu('uz-scena-ulazni');
    expect(ul.kadrovi).toEqual([{ transform: 'translate(0, -100%)' }, { transform: 'translate(0, 0)' }]);
    expect(ul.opcije).toEqual({ duration: 700, easing: 'ease-in-out', fill: 'both' });
    expect(d.naOmotacu('uz-scena-odlazni').map(p => p.kadrovi)).toEqual([[{ transform: 'translate(0, 0)' }, { transform: 'translate(0, 100%)' }]]);
    expect(document.activeElement).toBe(d.dugme('Ponovi'));
    // PLATNO: stanje pre grupe 0 dok prelaz traje, pa grupa 0 (kao projektor)
    expect(d.prikazi()[1].korak()).toBe(-1);
    expect(d.prikazi()[1].animacija()).toBeNull();

    ul.a.zavrsi();
    await ul.a.finished;
    await Promise.resolve();
    await d.osvezi();
    expect(d.prikazi().map(p => p.slajd().id)).toEqual([31]);
    expect(d.prikazi()[0].korak()).toBe(0);
    expect(d.prikazi()[0].animacija()).toEqual({ kljuc: 1, grupa: 0 });
    expect(ul.a.cancel).toHaveBeenCalled();
  });

  it('"Ponovi": drugi animate na ulaznom omotaču (nov ključ), i usred prelaza', async () => {
    const d = await dijalog();
    d.dugme('Ponovi').click();
    await d.osvezi();
    const ulazni = d.naOmotacu('uz-scena-ulazni');
    expect(ulazni.length).toBe(2);
    expect(ulazni[0].a.cancel).toHaveBeenCalled();
    expect(d.prikazi().length).toBe(2);
  });

  it('bez prethodnog slajda: nema odlaznog, ulazni dolazi preko pozadine', async () => {
    const d = await dijalog({ pre: null });
    expect(d.el.querySelector('.uz-scena-odlazni')).toBeNull();
    expect(d.naOmotacu('uz-scena-ulazni').length).toBe(1);
    expect(d.prikazi().length).toBe(1);
  });

  it('PLATNO kao prethodni: crta se posle svih koraka (stanje u kom se sa njega odlazi)', async () => {
    const d = await dijalog({ pre: platnoSlajd({ id: 21 }), slajd: infoSlajd({ id: 22, prelaz: { efekat: 'FADE', smer: null, trajanjeMs: 500 } }) });
    expect(d.prikazi()[0].korak()).toBe(2);
    expect(d.prikazi()[1].korak()).toBe(0);
    expect(d.naOmotacu('uz-scena-ulazni').map(p => p.kadrovi)).toEqual([[{ opacity: 0 }, { opacity: 1 }]]);
    expect(d.naOmotacu('uz-scena-odlazni')).toEqual([]);
  });

  it('trajanje van granica (forma sa greškom) se ograničava na 0,1-5 s', async () => {
    const d = await dijalog({ slajd: { ...slajd, prelaz: { ...GURANJE, trajanjeMs: 50_000 } } as SlajdDetails });
    expect(d.naOmotacu('uz-scena-ulazni')[0].opcije).toMatchObject({ duration: 5000 });
  });

  it('prefers-reduced-motion: bez animacije omotača, poruka o smanjenom kretanju, samo nov slajd', async () => {
    vi.stubGlobal('matchMedia', smanjenoKretanjeUSistemu);
    const d = await dijalog();
    expect(d.naOmotacu('uz-scena-ulazni')).toEqual([]);
    expect(d.el.textContent).toContain('Prelazi su isključeni u podešavanjima sistema (smanjeno kretanje).');
    expect(d.prikazi().map(p => p.slajd().id)).toEqual([31]);
  });

  it('otvoriPregledPrelaza: autoFocus false, podaci idu u dijalog', () => {
    const open = vi.fn();
    const podaci: PregledPrelazaPodaci = { pre: null, slajd, tema: 'NACRT' };
    otvoriPregledPrelaza({ open } as unknown as MatDialog, podaci);
    expect(open).toHaveBeenCalledWith(PrelazPregledDialog, expect.objectContaining({ data: podaci, autoFocus: false }));
  });
});

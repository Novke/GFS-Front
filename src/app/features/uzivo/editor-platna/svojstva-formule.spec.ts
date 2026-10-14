import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { MatDialog } from '@angular/material/dialog';
import { type Observable, of } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import type { FormulaSloj } from '../data-access/platno.models';
import { novaFormula } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { FormulaOtvarac } from './formula/formula-otvarac';
import type { FormulaUnos } from './formula/formula-pravila';
import type { FormulaPodaci } from './formula/formula.dialog';
import { OtpremanjeSlike } from './otpremanje-slike';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type LazniSat, dugme, polje, provajderiSvojstava, upisi } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore, OtpremanjeSlike],
  imports: [PanelSvojstvaComponent],
  template: `<app-panel-svojstva tema="NACRT" />`,
})
class DomacinComponent {}

const SLIKA = '00000000-0000-0000-0000-0000000000aa';
const NAPOMENA = 'Ova formula je uvezena kao slika iz PowerPointa. Posle čuvanja crta se iz LaTeX-a.';

describe('SvojstvaFormuleComponent (kroz panel Svojstva)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let poruke: Poruka[];
  let otvori: ReturnType<typeof vi.fn<(d: MatDialog, p: FormulaPodaci) => Promise<Observable<FormulaUnos | undefined>>>>;
  let ishod: (p: FormulaPodaci) => FormulaUnos | undefined;
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const panel = () => el().querySelector<HTMLElement>('app-svojstva-formule')!;
  const sloj = () => store.platno().slojevi.find((s) => s.id === 's1') as FormulaSloj;
  const uvezena = (): FormulaSloj => ({ ...novaFormula('s1', 'NACRT', 'x^2'), slikaIzvora: SLIKA });

  async function pocni(s: FormulaSloj): Promise<void> {
    store.inicijalizuj(platnoSaAnimacijama([], [s]));
    store.izaberi(['s1']);
    await fixture.whenStable();
  }

  /** Jedan korak: jedno poništavanje vraća početni sloj. */
  function jedanKorak(pocetak: FormulaSloj): void {
    expect(store.mozeNazad()).toBe(true);
    store.ponisti();
    expect(sloj()).toEqual(pocetak);
    expect(store.mozeNazad()).toBe(false);
  }

  beforeEach(async () => {
    sat.t = 0;
    localStorage.clear();
    ishod = () => undefined;
    otvori = vi.fn((_d: MatDialog, p: FormulaPodaci) => Promise.resolve(of(ishod(p))));
    TestBed.configureTestingModule({
      providers: [
        ...provajderiSvojstava(sat),
        { provide: PrezentacijeApi, useValue: {} },
        { provide: FormulaOtvarac, useValue: { otvori } },
      ],
    });
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    store.postaviIzlaz(vi.fn());
  });

  it('naslov, "Uredi formulu", boja, veličina i poravnanje; napomena samo kad je formula uvezena kao slika', async () => {
    await pocni(uvezena());
    expect(panel().querySelector('h3')!.textContent!.trim()).toBe('Formula');
    expect(dugme(panel(), 'Uredi formulu')).not.toBeNull();
    expect(panel().querySelector('app-izbor-boje')).not.toBeNull();
    expect(polje(panel(), 'Veličina')!.value).toBe('28');
    expect(panel().querySelector('mat-button-toggle-group[aria-label="Poravnanje"]')).not.toBeNull();
    expect(panel().textContent).toContain(NAPOMENA);
    await pocni(novaFormula('s1', 'NACRT', 'x^2'));
    expect(panel().textContent).not.toContain(NAPOMENA);
  });

  it('"Veličina" 28 -> 32: velicina 32 i slikaIzvora null, jedan korak', async () => {
    const pocetak = uvezena();
    await pocni(pocetak);
    await upisi(fixture, polje(panel(), 'Veličina')!, '32');
    expect(sloj()).toMatchObject({ velicina: 32, slikaIzvora: null });
    jedanKorak(pocetak);
  });

  it('"Veličina" van 1-400 se odbija (polje vraća staru vrednost)', async () => {
    await pocni(uvezena());
    await upisi(fixture, polje(panel(), 'Veličina')!, '401');
    expect(sloj().velicina).toBe(28);
    expect(sloj().slikaIzvora).toBe(SLIKA);
  });

  it('"Boja" iz palete: boja i slikaIzvora null, jedan korak', async () => {
    const pocetak = uvezena();
    await pocni(pocetak);
    const okidac = Array.from(panel().querySelectorAll<HTMLButtonElement>('app-izbor-boje button'))
      .find((b) => b.getAttribute('aria-label')!.startsWith('Boja: '))!;
    okidac.click();
    await fixture.whenStable();
    const paleta = document.querySelector<HTMLElement>('.uz-ep-paleta[aria-label="Boja"]')!;
    dugme(paleta, 'Akcent 1, #2456A6')!.click();
    await fixture.whenStable();
    expect(sloj()).toMatchObject({ boja: '#2456A6', slikaIzvora: null });
    jedanKorak(pocetak);
  });

  it('"Poravnanje" Levo: poravnanje i slikaIzvora null, jedan korak', async () => {
    const pocetak = uvezena();
    await pocni(pocetak);
    panel().querySelector<HTMLButtonElement>('mat-button-toggle-group[aria-label="Poravnanje"] button[aria-label="Levo"]')!.click();
    await fixture.whenStable();
    expect(sloj()).toMatchObject({ poravnanje: 'LEVO', slikaIzvora: null });
    jedanKorak(pocetak);
  });

  it('"Uredi formulu": dijalog dobija sloj (izSlike, tema); "Sačuvaj" je jedan korak koji briše sliku izvora', async () => {
    const pocetak = uvezena();
    await pocni(pocetak);
    ishod = (p) => ({ ...p.pocetak, latex: '\\frac{a}{b}' });
    dugme(panel(), 'Uredi formulu')!.click();
    await fixture.whenStable();
    expect(otvori).toHaveBeenCalledTimes(1);
    expect(otvori.mock.calls[0][1]).toEqual({
      pocetak: { latex: 'x^2', boja: pocetak.boja, velicina: 28, poravnanje: 'CENTAR' }, tema: 'NACRT', izSlike: true,
    });
    expect(sloj()).toMatchObject({ latex: '\\frac{a}{b}', slikaIzvora: null });
    jedanKorak(pocetak);
  });

  it('"Uredi formulu" pa Otkaži: ništa', async () => {
    const pocetak = uvezena();
    await pocni(pocetak);
    dugme(panel(), 'Uredi formulu')!.click();
    await fixture.whenStable();
    expect(otvori).toHaveBeenCalledTimes(1);
    expect(sloj()).toBe(store.platno().slojevi[0]);
    expect(sloj()).toEqual(pocetak);
    expect(store.mozeNazad()).toBe(false);
  });

  it('zaključana formula: sve kontrole onemogućene', async () => {
    await pocni({ ...uvezena(), zakljucan: true });
    expect(dugme(panel(), 'Uredi formulu')!.disabled).toBe(true);
    expect(polje(panel(), 'Veličina')!.disabled).toBe(true);
    expect(panel().querySelector<HTMLButtonElement>('app-izbor-boje button')!.disabled).toBe(true);
    expect(panel().querySelector<HTMLButtonElement>('button[aria-label="Levo"]')!.disabled).toBe(true);
    expect(poruke).toEqual([]);
  });

  it('neuspelo učitavanje dijaloga (stari chunk): poruka, dokument netaknut', async () => {
    otvori.mockImplementation(() => Promise.reject(new Error('chunk')));
    await pocni(uvezena());
    dugme(panel(), 'Uredi formulu')!.click();
    await fixture.whenStable();
    await Promise.resolve();
    expect(poruke.map((p) => p.tekst)).toEqual(['Dijalog formule nije učitan. Osveži stranicu i pokušaj ponovo.']);
    expect(store.mozeNazad()).toBe(false);
  });
});

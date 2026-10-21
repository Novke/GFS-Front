import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import type { Platno, TabelaSloj } from '../data-access/platno.models';
import { novaTabela } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { OtpremanjeSlike } from './otpremanje-slike';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type LazniSat, dugme, polje, provajderiSvojstava, upisi } from './svojstva.testing';
import { PREVELIKA_TABELA } from './tabela';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore, OtpremanjeSlike],
  imports: [PanelSvojstvaComponent],
  template: `<app-panel-svojstva tema="NACRT" />`,
})
class DomacinComponent {}

describe('SvojstvaTabeleComponent (kroz panel Svojstva)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let poruke: Poruka[];
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const panel = () => el().querySelector<HTMLElement>('app-svojstva-tabele')!;
  const tabela = () => store.platno().slojevi[0] as TabelaSloj;

  async function pocni(t: TabelaSloj, celija: { r: number; k: number } | null = null) {
    store.inicijalizuj(platnoSaAnimacijama([], [t]));
    store.izaberi([t.id]);
    if (celija) store.izaberiCeliju(celija);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sat.t = 0;
    TestBed.configureTestingModule({
      providers: [...provajderiSvojstava(sat), { provide: PrezentacijeApi, useValue: {} }],
    });
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    await fixture.whenStable();
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  it('izabrana tabela: panel Tabela i ispod panel teksta (bez odeljka okvira)', async () => {
    await pocni(novaTabela('T', 'NACRT', 3, 3));
    expect(panel()).not.toBeNull();
    expect(el().querySelector('app-svojstva-teksta')).not.toBeNull();
    expect(el().querySelector('app-svojstva-teksta')!.textContent).not.toContain('Raspored u okviru');
  });

  it('"Ubaci red ispod" sa izabranom ćelijom (1, 1): 4 reda, nov red na indeksu 2, jedan korak istorije', async () => {
    const p0 = await pocni(novaTabela('T', 'NACRT', 3, 3), { r: 1, k: 1 }).then(() => store.platno());
    dugme(panel(), 'Ubaci red ispod')!.click();
    await fixture.whenStable();
    expect(tabela().redovi).toHaveLength(4);
    expect(tabela().visina).toBe(160);
    store.ponisti();
    expect(store.platno()).toBe(p0);
    expect(store.mozeNazad()).toBe(false);
  });

  it('tabela visoka 2800 + "Ubaci red ispod": poruka o 2880, dokument isti', async () => {
    const t = novaTabela('T', 'NACRT', 2, 2);
    await pocni({ ...t, redovi: [1400, 1400], visina: 2800 }, { r: 1, k: 0 });
    const pre: Platno = store.platno();
    dugme(panel(), 'Ubaci red ispod')!.click();
    await fixture.whenStable();
    expect(poruke.map((p) => p.tekst)).toEqual([PREVELIKA_TABELA]);
    expect(PREVELIKA_TABELA).toBe('Tabela ne može biti šira ni viša od 2880.');
    expect(store.platno()).toBe(pre);
  });

  it('"Spoji ćelije" je onemogućeno za jednu ćeliju; polja opsega 1-2 / 1-2 + "Spoji ćelije" -> spojeno', async () => {
    await pocni(novaTabela('T', 'NACRT', 3, 3), { r: 0, k: 0 });
    expect(dugme(panel(), 'Spoji ćelije')!.getAttribute('aria-disabled')).toBe('true');
    expect(dugme(panel(), 'Razdvoji')!.getAttribute('aria-disabled')).toBe('true');
    await upisi(fixture, polje(panel(), 'Do reda')!, '2');
    await upisi(fixture, polje(panel(), 'Do kolone')!, '2');
    expect(store.opsegCelijaIzbora()).toEqual({ r1: 0, k1: 0, r2: 1, k2: 1 });
    dugme(panel(), 'Spoji ćelije')!.focus();
    dugme(panel(), 'Spoji ćelije')!.click();
    await fixture.whenStable();
    expect(tabela().celije[0][0]).toMatchObject({ spojDesno: 1, spojDole: 1 });
    // Fix m2: dugme postaje onemogućeno, a fokus ostaje na njemu (ne pada na body)
    expect(dugme(panel(), 'Spoji ćelije')!.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(dugme(panel(), 'Spoji ćelije'));
    expect(tabela().celije[1][1].pokrivena).toBe(true);
    expect(dugme(panel(), 'Razdvoji')!.getAttribute('aria-disabled')).not.toBe('true');
    dugme(panel(), 'Razdvoji')!.click();
    await fixture.whenStable();
    expect(tabela().celije[0][0]).toMatchObject({ spojDesno: 0, spojDole: 0 });
  });

  it('"Obriši red" na tabeli od jednog reda (i "Obriši kolonu" na jednoj koloni) je onemogućeno', async () => {
    await pocni(novaTabela('T', 'NACRT', 1, 2), { r: 0, k: 0 });
    expect(dugme(panel(), 'Obriši red')!.getAttribute('aria-disabled')).toBe('true');
    expect(dugme(panel(), 'Obriši kolonu')!.getAttribute('aria-disabled')).not.toBe('true');
    dugme(panel(), 'Obriši kolonu')!.click();
    await fixture.whenStable();
    expect(tabela().kolone).toHaveLength(1);
    expect(dugme(panel(), 'Obriši kolonu')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('31. red: poruka o 30 redova', async () => {
    await pocni({ ...novaTabela('T', 'NACRT', 30, 1), redovi: Array.from({ length: 30 }, () => 20), visina: 600 }, { r: 0, k: 0 });
    dugme(panel(), 'Ubaci red iznad')!.click();
    await fixture.whenStable();
    expect(poruke.map((p) => p.tekst)).toEqual(['Tabela može imati najviše 30 redova.']);
    expect(tabela().redovi).toHaveLength(30);
  });

  it('širina kolone i sidro menjaju samo opseg; ivice SPOLJNE se primenjuju na opseg', async () => {
    await pocni(novaTabela('T', 'NACRT', 2, 2), { r: 0, k: 1 });
    await upisi(fixture, polje(panel(), 'Širina kolone')!, '300');
    expect(tabela().kolone[1]).toBe(300);
    expect(tabela().sirina).toBe(620);
    dugme(panel(), 'Dno')!.click();
    await fixture.whenStable();
    expect(tabela().celije[0][1].sidro).toBe('DNO');
    expect(tabela().celije[0][0].sidro).toBe('SREDINA');
    dugme(panel(), 'Primeni ivice')!.click();
    await fixture.whenStable();
    expect(tabela().celije[0][1].ivice.gore).toMatchObject({ debljina: 1, crtica: 'PUNA' });
  });

  it('panel teksta bez uređivanja menja samo ćelije opsega (B)', async () => {
    await pocni(novaTabela('T', 'NACRT', 2, 2), { r: 1, k: 1 });
    dugme(el().querySelector('app-svojstva-teksta')!, 'Podebljano')!.click();
    await fixture.whenStable();
    expect(tabela().celije[1][1].pasusi[0].delovi[0].podebljano).toBe(true);
    expect(tabela().celije[1][0].pasusi[0].delovi[0].podebljano).toBe(false);
  });

  it('Fix m3: ponovljeno "Primeni ivice" sa istim vrednostima ne pravi korak ni izlaz', async () => {
    await pocni(novaTabela('T', 'NACRT', 2, 2), { r: 0, k: 0 });
    const izlaz = vi.fn();
    store.postaviIzlaz(izlaz);
    dugme(panel(), 'Primeni ivice')!.click();
    await fixture.whenStable();
    const posle = izlaz.mock.calls.length;
    sat.t = 5000;
    dugme(panel(), 'Primeni ivice')!.click();
    await fixture.whenStable();
    expect(izlaz.mock.calls.length).toBe(posle);
  });

  it('Fix m5: isto polje panela teksta na drugom opsegu ćelija u roku od 1 s je novi korak', async () => {
    const t0 = novaTabela('T', 'NACRT', 2, 2);
    await pocni(t0, { r: 0, k: 0 });
    const velicina = () => polje(el().querySelector('app-svojstva-teksta')!, 'Veličina')!;
    await upisi(fixture, velicina(), '30');
    store.izaberiCeliju({ r: 1, k: 1 });
    await fixture.whenStable();
    sat.t = 200;
    await upisi(fixture, velicina(), '40');
    expect(tabela().celije[1][1].pasusi[0].delovi[0].velicina).toBe(40);
    store.ponisti();
    expect(tabela().celije[1][1].pasusi[0].delovi[0].velicina).toBe(18);
    expect(tabela().celije[0][0].pasusi[0].delovi[0].velicina).toBe(30);
  });

  /*
   * Završni talas 4b: `disabledInteractive` ne blokira klik, pa handler proverava isti uslov kao `[disabled]`. Klik na
   * onemogućeno dugme: bez poruke (ne "2880" ni "zaključan"), isti dokument, bez koraka istorije.
   */
  const SVA_DUGMAD = ['Ubaci red iznad', 'Ubaci red ispod', 'Ubaci kolonu levo', 'Ubaci kolonu desno', 'Obriši red',
    'Obriši kolonu', 'Spoji ćelije', 'Razdvoji', 'Primeni ivice'];
  it.each([
    { slucaj: 'zaključana tabela', zakljucan: true, celija: { r: 0, k: 0 } as { r: number; k: number } | null, dugmad: SVA_DUGMAD },
    { slucaj: 'opseg = cela tabela (bez izbora ćelija)', zakljucan: false, celija: null, dugmad: ['Obriši red', 'Obriši kolonu', 'Razdvoji'] },
    { slucaj: 'jedna ćelija bez spajanja', zakljucan: false, celija: { r: 1, k: 1 }, dugmad: ['Spoji ćelije', 'Razdvoji'] },
  ])('klik na onemogućeno dugme ne radi ništa: $slucaj', async ({ zakljucan, celija, dugmad }) => {
    await pocni({ ...novaTabela('T', 'NACRT', 2, 2), zakljucan }, celija);
    const pre = store.platno();
    for (const ime of dugmad) {
      const b = dugme(panel(), ime)!;
      expect([ime, b.getAttribute('aria-disabled')]).toEqual([ime, 'true']);
      b.click();
      await fixture.whenStable();
    }
    expect(poruke.map((p) => p.tekst)).toEqual([]);
    expect(store.platno()).toBe(pre);
    expect(store.mozeNazad()).toBe(false);
  });

  it('zaključana tabela: dugmad onemogućena', async () => {
    await pocni({ ...novaTabela('T', 'NACRT', 2, 2), zakljucan: true }, { r: 0, k: 0 });
    expect(dugme(panel(), 'Ubaci red ispod')!.getAttribute('aria-disabled')).toBe('true');
    expect(dugme(panel(), 'Primeni ivice')!.getAttribute('aria-disabled')).toBe('true');
  });
});

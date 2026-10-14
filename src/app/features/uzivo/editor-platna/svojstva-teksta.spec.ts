import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import type { Pasus, Platno, TekstSloj } from '../data-access/platno.models';
import { noviTekst } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PlatnoEditorStore } from './platno-editor.store';
import { SvojstvaTekstaComponent } from './svojstva-teksta.component';
import { type LazniSat, dugme, polje, provajderiSvojstava, upisi } from './svojstva.testing';
import type { StanjeSelekcije } from './tekst/stil-teksta';
import type { KomandeTeksta } from './tekst/tekst-uredjivac.component';
import { deo, pasusSa } from './tekst/pm.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore],
  imports: [SvojstvaTekstaComponent],
  template: `<app-svojstva-teksta tema="NACRT" />`,
})
class DomacinComponent {}

const STANJE: StanjeSelekcije = {
  font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false,
  polozaj: 'OBICAN', poravnanje: 'LEVO', lista: 'BEZ', nivo: 0, proredProcenat: 100, razmakPre: 0, razmakPosle: 0,
  polozaji: ['OBICAN'], liste: ['BEZ'],
};

/** Tekst sa dva pasusa: "Prvi" (Carlito) + "drugi" (Tinos) i "Treći" (Carlito). */
function tekst(id: string, izmene: Partial<TekstSloj> = {}): TekstSloj {
  return {
    ...noviTekst(id, 'NACRT', { x: 100, y: 100, sirina: 400, visina: 120 }),
    pasusi: [pasusSa([deo('Prvi '), deo('drugi', { font: 'Tinos' })]), pasusSa([deo('Treći')])],
    ...izmene,
  };
}

const listaZnak = (p: Pasus): Pasus => ({ ...p, lista: { vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null } });

describe('SvojstvaTekstaComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let izlaz: Mock<(p: Platno) => void>;
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const sloj = (id: string) => store.platno().slojevi.find((s) => s.id === id) as TekstSloj;
  const delovi = (id: string) => sloj(id).pasusi.flatMap((p) => p.delovi);
  const opcije = () => Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
  const stavkeMenija = () => Array.from(document.querySelectorAll<HTMLElement>('[mat-menu-item]'));

  async function pocni(slojevi: Platno['slojevi'], izbor: string[]) {
    store.inicijalizuj(platnoSaAnimacijama([], slojevi));
    store.izaberi(izbor);
    await fixture.whenStable();
  }

  async function izaberiFont(naziv: string) {
    el().querySelector<HTMLElement>('app-izbor-fonta .mat-mdc-select-trigger')!.click();
    await fixture.whenStable();
    opcije().find((o) => o.textContent!.trim() === naziv)!.click();
    await fixture.whenStable();
  }

  async function klik(ime: string) {
    const b = dugme(el(), ime);
    expect(b, ime).not.toBeNull();
    b!.click();
    await fixture.whenStable();
  }

  /** Lažni uređivač (sesija teksta): komande su špijuni, presek nema izmena. */
  function lazni(stanje: StanjeSelekcije = STANJE): KomandeTeksta {
    return {
      presek: vi.fn(() => null), odbaciPresek: vi.fn(), postaviStil: vi.fn(), prebaciStil: vi.fn(), postaviPasus: vi.fn(),
      prebaciListu: vi.fn(), promeniNivo: vi.fn(), stanje: signal(stanje), fokus: vi.fn(),
      ponisti: vi.fn(() => false), ponovi: vi.fn(() => false), istorija: signal({ nazad: false, napred: false }),
    };
  }

  beforeEach(() => {
    sat.t = 0;
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  describe('bez uređivanja (ceo sloj)', () => {
    it('mešani fontovi: polje fonta je prazno; izbor "Tinos" -> svi delovi sloja Tinos, jedan korak (ključ tekst-font)', async () => {
      const pre = tekst('t1');
      await pocni([pre], ['t1']);
      expect(el().querySelector('app-izbor-fonta .mat-mdc-select-placeholder')).not.toBeNull();
      await izaberiFont('Tinos');
      expect(delovi('t1').map((d) => d.font)).toEqual(['Tinos', 'Tinos', 'Tinos']);
      sat.t = 500;
      await izaberiFont('Arimo');
      expect(delovi('t1').map((d) => d.font)).toEqual(['Arimo', 'Arimo', 'Arimo']);
      // isti ključ u roku od 1 s: jedan korak istorije
      store.ponisti();
      expect(sloj('t1')).toEqual(pre);
      expect(store.mozeNazad()).toBe(false);
      expect(izlaz).toHaveBeenCalledTimes(3);
    });

    it('B -> podebljano svima (i u drugom izabranom sloju), aria-pressed prati stanje; ponovo B -> isključeno', async () => {
      await pocni([tekst('t1'), tekst('t2', { pasusi: [pasusSa([deo('x', { podebljano: true })])] })], ['t1', 't2']);
      const b = dugme(el(), 'Podebljano')!;
      expect(b.getAttribute('aria-pressed')).toBe('mixed');
      await klik('Podebljano');
      expect([...delovi('t1'), ...delovi('t2')].every((d) => d.podebljano)).toBe(true);
      expect(b.getAttribute('aria-pressed')).toBe('true');
      await klik('Podebljano');
      expect([...delovi('t1'), ...delovi('t2')].some((d) => d.podebljano)).toBe(false);
      expect(b.getAttribute('aria-pressed')).toBe('false');
    });

    it('Indeks pa Eksponent pa Eksponent: položaj INDEKS -> EKSPONENT -> OBICAN', async () => {
      await pocni([tekst('t1')], ['t1']);
      await klik('Indeks');
      expect(new Set(delovi('t1').map((d) => d.polozaj))).toEqual(new Set(['INDEKS']));
      await klik('Eksponent');
      expect(new Set(delovi('t1').map((d) => d.polozaj))).toEqual(new Set(['EKSPONENT']));
      await klik('Eksponent');
      expect(new Set(delovi('t1').map((d) => d.polozaj))).toEqual(new Set(['OBICAN']));
    });

    it('polje veličine 401 -> ostaje stara vrednost (dokument isti); 30 -> svi delovi 30', async () => {
      await pocni([tekst('t1')], ['t1']);
      const p = store.platno();
      const v = polje(el(), 'Veličina')!;
      expect(v.value).toBe('18');
      await upisi(fixture, v, '401');
      expect(store.platno()).toBe(p);
      expect(v.value).toBe('18');
      expect(izlaz).not.toHaveBeenCalled();
      await upisi(fixture, v, '30');
      expect(delovi('t1').map((d) => d.velicina)).toEqual([30, 30, 30]);
    });

    it('meni veličina: 14 veličina, izbor 48 -> svi delovi 48', async () => {
      await pocni([tekst('t1')], ['t1']);
      await klik('Veličine slova');
      expect(stavkeMenija().map((s) => Number(s.textContent!.trim()))).toEqual([10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72]);
      stavkeMenija().find((s) => s.textContent!.trim() === '48')!.click();
      await fixture.whenStable();
      expect(delovi('t1').map((d) => d.velicina)).toEqual([48, 48, 48]);
    });

    it('poravnanje (radiogroup), lista i nivo, prored i razmaci menjaju sve pasuse', async () => {
      await pocni([tekst('t1')], ['t1']);
      const grupa = el().querySelector('mat-button-toggle-group[aria-label="Poravnanje"]')!;
      expect(grupa.getAttribute('role')).toBe('radiogroup');
      grupa.querySelector<HTMLButtonElement>('button[aria-label="Centar"]')!.click();
      await fixture.whenStable();
      expect(sloj('t1').pasusi.map((p) => p.poravnanje)).toEqual(['CENTAR', 'CENTAR']);
      await klik('Lista sa znakovima');
      expect(sloj('t1').pasusi.map((p) => [p.lista?.znak, p.uvlacenje.levo])).toEqual([['•', 18], ['•', 18]]);
      expect(dugme(el(), 'Lista sa znakovima')!.getAttribute('aria-pressed')).toBe('true');
      await klik('Povećaj nivo');
      expect(sloj('t1').pasusi.map((p) => [p.nivo, p.uvlacenje.levo])).toEqual([[1, 54], [1, 54]]);
      await upisi(fixture, polje(el(), 'Prored')!, '150');
      await upisi(fixture, polje(el(), 'Razmak pre')!, '6');
      await upisi(fixture, polje(el(), 'Razmak posle')!, '12');
      expect(sloj('t1').pasusi.map((p) => [p.proredProcenat, p.razmakPre, p.razmakPosle])).toEqual([[150, 6, 12], [150, 6, 12]]);
    });

    it('boja teksta iz palete teme -> svi delovi', async () => {
      await pocni([tekst('t1')], ['t1']);
      dugme(el(), 'Boja teksta: #000000')!.click();
      await fixture.whenStable();
      const paleta = document.querySelector<HTMLElement>('.uz-ep-paleta[aria-label="Boja teksta"]')!;
      const akcent = Array.from(paleta.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label')!.startsWith('Akcent 1'))!;
      const boja = akcent.getAttribute('aria-label')!.split(', ')[1];
      akcent.click();
      await fixture.whenStable();
      expect(new Set(delovi('t1').map((d) => d.boja))).toEqual(new Set([boja]));
    });

    it('okvir: sidro, margine i prelom reda', async () => {
      await pocni([tekst('t1')], ['t1']);
      el().querySelector<HTMLButtonElement>('mat-button-toggle-group[aria-label="Sidro teksta"] button[aria-label="Dno"]')!.click();
      await fixture.whenStable();
      await upisi(fixture, polje(el(), 'Margina levo')!, '20');
      await upisi(fixture, polje(el(), 'Margina dole')!, '250');
      el().querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
      await fixture.whenStable();
      expect(sloj('t1').okvir).toMatchObject({ sidro: 'DNO', unutraLevo: 20, unutraDole: 200, prelom: false });
    });

    it('"Smanjenje fonta" samo kad je skala < 1; "Vrati 100%" -> okvir.skala 1 (i prored 100%)', async () => {
      const t = tekst('t1');
      await pocni([t, tekst('t2')], ['t2']);
      expect(el().textContent).not.toContain('Smanjenje fonta');
      await pocni([{ ...t, okvir: { ...t.okvir, skala: 0.8, skalaProreda: 0.9 } }], ['t1']);
      expect(el().textContent).toContain('Smanjenje fonta: 80%');
      await klik('Vrati 100%');
      expect(sloj('t1').okvir).toMatchObject({ skala: 1, skalaProreda: 1 });
      expect(el().textContent).not.toContain('Smanjenje fonta');
    });

    it('sidro ima ključ (tekst-sidro): uzastopne promene u roku od 1 s su jedan korak', async () => {
      const pre = tekst('t1');
      await pocni([pre], ['t1']);
      const sidro = (ime: string) =>
        el().querySelector<HTMLButtonElement>(`mat-button-toggle-group[aria-label="Sidro teksta"] button[aria-label="${ime}"]`)!;
      sidro('Sredina').click();
      await fixture.whenStable();
      sat.t = 400;
      sidro('Dno').click();
      await fixture.whenStable();
      expect(sloj('t1').okvir.sidro).toBe('DNO');
      store.ponisti();
      expect(sloj('t1')).toEqual(pre);
      expect(store.mozeNazad()).toBe(false);
    });

    it('mešane boje: dugme boje vidljivo kaže "Različito" (ne "Bez")', async () => {
      await pocni([tekst('t1', { pasusi: [pasusSa([deo('a'), deo('b', { boja: '#C00000' })])] })], ['t1']);
      const b = dugme(el(), 'Boja teksta: Različito');
      expect(b).not.toBeNull();
      expect(b!.textContent).toContain('Različito');
      expect(b!.textContent).not.toContain('Bez');
    });

    it('rr m3: sloj bez ijednog dela teksta: boja nije "Različito" (podrazumevana boja, kao osnova izmene)', async () => {
      await pocni([tekst('t1', { pasusi: [pasusSa([])] })], ['t1']);
      expect(dugme(el(), 'Boja teksta: Različito')).toBeNull();
      expect(el().querySelector('app-izbor-boje')!.textContent).not.toContain('Različito');
    });

    it('aria-pressed mixed samo za vrednost prisutnu u izboru (OBICAN + INDEKS: Indeks mixed, Eksponent false)', async () => {
      await pocni([tekst('t1', { pasusi: [pasusSa([deo('a'), deo('b', { polozaj: 'INDEKS' })]), pasusSa([deo('c')])] })], ['t1']);
      expect(dugme(el(), 'Indeks')!.getAttribute('aria-pressed')).toBe('mixed');
      expect(dugme(el(), 'Eksponent')!.getAttribute('aria-pressed')).toBe('false');
      // lista: jedan pasus sa znakovima, drugi bez -> Znakovi mixed, Numerisana false
      const t = sloj('t1');
      store.inicijalizuj(platnoSaAnimacijama([], [{ ...t, pasusi: [listaZnak(t.pasusi[0]), t.pasusi[1]] }]));
      store.izaberi(['t1']);
      await fixture.whenStable();
      expect(dugme(el(), 'Lista sa znakovima')!.getAttribute('aria-pressed')).toBe('mixed');
      expect(dugme(el(), 'Numerisana lista')!.getAttribute('aria-pressed')).toBe('false');
    });

    it('title sa prečicom samo tokom uređivanja (Ctrl+B radi samo u tekstu)', async () => {
      await pocni([tekst('t1')], ['t1']);
      expect(dugme(el(), 'Podebljano')!.title).toBe('Podebljano');
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni());
      await fixture.whenStable();
      expect(dugme(el(), 'Podebljano')!.title).toBe('Podebljano (Ctrl+B)');
    });

    it('dva sloja: prazan pasus na početku drugog dobija stil teksta SVOG sloja (ne prethodnog sloja)', async () => {
      await pocni([
        tekst('t1', { pasusi: [pasusSa([deo('a', { font: 'Arimo' })])] }),
        tekst('t2', { pasusi: [pasusSa([]), pasusSa([deo('b', { font: 'Tinos', velicina: 40 })])] }),
      ], ['t1', 't2']);
      await klik('Kurziv');
      expect(sloj('t2').pasusi[0].delovi).toEqual([deo('', { font: 'Tinos', velicina: 40, kurziv: true })]);
    });

    it('zaključan sloj: kontrole onemogućene, dokument se ne menja', async () => {
      await pocni([tekst('t1', { zakljucan: true })], ['t1']);
      expect(dugme(el(), 'Podebljano')!.disabled).toBe(true);
      expect(polje(el(), 'Veličina')!.disabled).toBe(true);
    });
  });

  describe('tokom uređivanja (lažni KomandeTeksta)', () => {
    async function uredjuj(stanje: StanjeSelekcije = STANJE) {
      await pocni([tekst('t1')], ['t1']);
      store.pocniUredjivanje('t1');
      const k = lazni(stanje);
      store.registrujUredjivac(k);
      await fixture.whenStable();
      return k;
    }

    it('vrednosti dolaze iz stanja uređivača', async () => {
      await uredjuj({ ...STANJE, font: 'Tinos', velicina: 32, podebljano: true });
      expect(el().querySelector('app-izbor-fonta .mat-mdc-select-value')!.textContent!.trim()).toBe('Tinos');
      expect(polje(el(), 'Veličina')!.value).toBe('32');
      expect(dugme(el(), 'Podebljano')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('B zove prebaciStil("podebljano"), a dokument se ne menja', async () => {
      const k = await uredjuj();
      const p = store.platno();
      await klik('Podebljano');
      expect(vi.mocked(k.prebaciStil)).toHaveBeenCalledWith('podebljano');
      expect(store.platno()).toBe(p);
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('mousedown na B ima defaultPrevented (fokus i izbor ostaju u tekstu)', async () => {
      await uredjuj();
      const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      dugme(el(), 'Podebljano')!.querySelector('mat-icon')!.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('font, veličina, položaj, poravnanje, lista i nivo idu uređivaču', async () => {
      const k = await uredjuj();
      await izaberiFont('Cousine');
      await upisi(fixture, polje(el(), 'Veličina')!, '40');
      await klik('Eksponent');
      el().querySelector<HTMLButtonElement>('mat-button-toggle-group[aria-label="Poravnanje"] button[aria-label="Desno"]')!.click();
      await fixture.whenStable();
      await klik('Numerisana lista');
      await klik('Smanji nivo');
      await upisi(fixture, polje(el(), 'Prored')!, '120');
      expect(vi.mocked(k.postaviStil).mock.calls).toEqual([[{ font: 'Cousine' }], [{ velicina: 40 }], [{ polozaj: 'EKSPONENT' }]]);
      expect(vi.mocked(k.postaviPasus).mock.calls).toEqual([[{ poravnanje: 'DESNO' }], [{ proredProcenat: 120 }]]);
      expect(vi.mocked(k.prebaciListu)).toHaveBeenCalledWith('BROJ');
      expect(vi.mocked(k.promeniNivo)).toHaveBeenCalledWith(-1);
      expect(store.platno().slojevi[0]).toEqual(tekst('t1'));
    });

    it('okvir se menja u dokumentu i sesija ostaje otvorena', async () => {
      await uredjuj();
      await upisi(fixture, polje(el(), 'Margina gore')!, '10');
      expect(sloj('t1').okvir.unutraGore).toBe(10);
      expect(store.uredjivanje()).not.toBeNull();
    });

    it('"Vrati 100%" tokom uređivanja: skala 1 i nova sesija istog sloja (uređivač sa novom skalom)', async () => {
      const t = tekst('t1');
      await pocni([{ ...t, okvir: { ...t.okvir, skala: 0.7 } }], ['t1']);
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni());
      await fixture.whenStable();
      const sesija = store.uredjivanje();
      await klik('Vrati 100%');
      expect(sloj('t1').okvir.skala).toBe(1);
      expect(store.uredjivanje()).toEqual({ slojId: 't1', celija: null });
      expect(store.uredjivanje()).not.toBe(sesija);
    });
  });
});

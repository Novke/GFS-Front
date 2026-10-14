import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import type { OblikSloj, Platno, SlikaSloj, TabelaSloj, TekstSloj } from '../data-access/platno.models';
import { TEME } from '../ui/teme';
import { novaSlika, novoPlatno } from '../data-access/platno-novo';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { MedijInfo } from '../data-access/uzivo.models';
import { FokusPlatna } from './fokus-platna';
import { OtpremanjeSlike } from './otpremanje-slike';
import { PlatnoEditorStore } from './platno-editor.store';
import { DIMENZIJE_SLIKE, SlikeEditora } from './slike-editora';
import { type LazniSat, dugme, provajderiSvojstava } from './svojstva.testing';
import { TrakaAlataComponent } from './traka-alata.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore, FokusPlatna, OtpremanjeSlike, SlikeEditora],
  imports: [TrakaAlataComponent],
  template: `<app-traka-alata tema="NACRT" /><div #okvir class="uz-ep-platno" tabindex="0"></div>`,
})
class DomacinComponent {
  private readonly okvir = viewChild.required<ElementRef<HTMLElement>>('okvir');
  private readonly fokus = inject(FokusPlatna);
  constructor() {
    afterNextRender(() => this.fokus.postavi(this.okvir().nativeElement));
  }
}

const medij = (id: string): MedijInfo => ({ id, naziv: 'slika.png', mime: 'image/png', velicina: 4 });
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'slika.png', { type: 'image/png' });

describe('TrakaAlataComponent: oblici i slike (F7)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let upload: ReturnType<typeof vi.fn<(f: File) => ReturnType<PrezentacijeApi['upload']>>>;
  let poruke: Poruka[];
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;
  let dimenzije: ReturnType<typeof vi.fn<(f: Blob) => Promise<{ sirina: number; visina: number }>>>;
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const okvir = () => el().querySelector<HTMLElement>('.uz-ep-platno')!;
  const poslednji = () => store.platno().slojevi.at(-1)!;

  async function ubaciOblik(naziv: string) {
    dugme(el(), 'Oblik')!.click();
    await fixture.whenStable();
    const stavke = Array.from(document.body.querySelectorAll<HTMLElement>('.mat-mdc-menu-item'));
    stavke.find((s) => s.textContent!.trim() === naziv)!.click();
    await fixture.whenStable();
  }

  async function izaberiFajl(f: File) {
    const polje = el().querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(polje, 'files', { configurable: true, value: [f] });
    polje.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r)); // merenje dimenzija (mikrotask) pre otpremanja
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sat.t = 0;
    dimenzije = vi.fn<(f: Blob) => Promise<{ sirina: number; visina: number }>>(() => Promise.resolve({ sirina: 1920, visina: 1080 }));
    upload = vi.fn<(f: File) => ReturnType<PrezentacijeApi['upload']>>(() => of(medij('m1')));
    TestBed.configureTestingModule({
      providers: [
        ...provajderiSvojstava(sat),
        { provide: PrezentacijeApi, useValue: { upload } },
        { provide: DIMENZIJE_SLIKE, useFactory: () => dimenzije },
      ],
    });
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
    store.inicijalizuj(novoPlatno('NACRT', 'PRAZNO'));
    await fixture.whenStable();
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  it.each([
    ['Pravougaonik', 'PRAVOUGAONIK', 'PUNA'],
    ['Zaobljeni pravougaonik', 'ZAOBLJENI_PRAVOUGAONIK', 'PUNA'],
    ['Elipsa', 'ELIPSA', 'PUNA'],
    ['Krug', 'ELIPSA', 'PUNA'],
    ['Trougao', 'TROUGAO', 'PUNA'],
    ['Linija', 'LINIJA', 'PUNA'],
    ['Strelica', 'STRELICA', 'PUNA'],
    ['Dvostruka strelica', 'DVOSTRUKA_STRELICA', 'PUNA'],
    ['Isprekidana linija', 'LINIJA', 'ISPREKIDANA'],
    ['Isprekidana strelica', 'STRELICA', 'ISPREKIDANA'],
  ])('stavka "%s" dodaje oblik %s sa crticom %s, izabran, a fokus je na okviru platna', async (naziv, vrsta, crtica) => {
    await ubaciOblik(naziv);
    const s = poslednji() as OblikSloj;
    expect(s.tip).toBe('OBLIK');
    expect(s.oblik).toBe(vrsta);
    expect(s.ivica!.crtica).toBe(crtica);
    if (naziv === 'Krug') expect(s.sirina).toBe(s.visina);
    expect(store.izbor()).toEqual([s.id]);
    expect(document.activeElement).toBe(okvir());
  });

  it('dva ista oblika zaredom: drugi je pomeren za 12', async () => {
    await ubaciOblik('Elipsa');
    const prvi = poslednji();
    await ubaciOblik('Elipsa');
    const drugi = poslednji();
    expect(drugi.id).not.toBe(prvi.id);
    expect(drugi.x).toBe(prvi.x + 12);
    expect(drugi.y).toBe(prvi.y + 12);
  });

  it('"Slika": SLIKA m1, 480 x 270, centrirana, izabrana, fokus na okviru', async () => {
    await izaberiFajl(png());
    expect(upload).toHaveBeenCalledTimes(1);
    const s = poslednji() as SlikaSloj;
    expect(s).toMatchObject({ tip: 'SLIKA', medijId: 'm1', sirina: 480, visina: 270, x: 240, y: 135 });
    expect(store.izbor()).toEqual([s.id]);
    expect(document.activeElement).toBe(okvir());
  });

  it('dok otpremanje traje: dugme je onemogućeno i stoji "Slika se otprema…"', async () => {
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    expect(dugme(el(), 'Slika')!.getAttribute('aria-disabled')).toBe('true');
    expect(el().querySelector('[role="status"]')!.textContent).toContain('Slika se otprema…');
    odgovor.next(medij('m1'));
    odgovor.complete();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(dugme(el(), 'Slika')!.getAttribute('aria-disabled')).not.toBe('true');
    expect(el().querySelector('[role="status"]')!.textContent!.trim()).toBe('');
    expect(poslednji().tip).toBe('SLIKA');
  });

  it('završni talas (F18 m4): otpremanje započeto pre Pregleda je vidljivo i u Pregledu, pa sloj stiže', async () => {
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    store.postaviRezim('PREGLED');
    await fixture.whenStable();
    const stanje = () => el().querySelector('.uz-ep-traka [role="status"]')!.textContent!.trim();
    expect(dugme(el(), 'Slika')).toBeFalsy(); // alati su u Pregledu sklonjeni
    expect(stanje()).toBe('Slika se otprema…');
    odgovor.next(medij('m1'));
    odgovor.complete();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(stanje()).toBe('');
    expect(poslednji().tip).toBe('SLIKA');
  });

  it('greška otpremanja 413 sa razlogom: snackbar sa razlogom, bez sloja', async () => {
    upload.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 413, error: { reason: 'Fajl je prevelik.' } })));
    await izaberiFajl(png());
    expect(poruke.map((p) => p.tekst)).toEqual(['Fajl je prevelik.']);
    expect(store.platno().slojevi).toHaveLength(0);
  });

  it('platno sa 300 slojeva: poruka i `upload` nije pozvan', async () => {
    const puno = { ...novoPlatno('NACRT', 'PRAZNO'), slojevi: Array.from({ length: 300 }, (_, i) => novaSlika(`s${i + 1}`, 'x', 10, 10)) };
    store.inicijalizuj(puno);
    await izaberiFajl(png());
    expect(upload).not.toHaveBeenCalled();
    expect(poruke.map((p) => p.tekst)).toEqual(['Slajd može imati najviše 300 slojeva.']);
    expect(store.platno().slojevi).toHaveLength(300);
  });

  it('meni "Oblik" odbijen (300 slojeva): poruka, a fokus je na okviru platna (ne na body)', async () => {
    const puno = { ...novoPlatno('NACRT', 'PRAZNO'), slojevi: Array.from({ length: 300 }, (_, i) => novaSlika(`s${i + 1}`, 'x', 10, 10)) };
    store.inicijalizuj(puno);
    await ubaciOblik('Elipsa');
    expect(store.platno().slojevi).toHaveLength(300);
    expect(poruke.map((p) => p.tekst)).toEqual(['Slajd može imati najviše 300 slojeva.']);
    expect(document.activeElement).toBe(okvir());
  });

  async function ubaciTabelu() {
    dugme(el(), 'Tabela')!.click();
    await fixture.whenStable();
    dugme(document.querySelector<HTMLElement>('.uz-ep-ubaci-tabelu')!, 'Ubaci')!.click();
    await fixture.whenStable();
  }

  it('"Tabela" > Ubaci: TABELA 3 x 3 iz teme na slobodnom mestu, izabrana, fokus na okviru platna', async () => {
    await ubaciTabelu();
    const t = poslednji() as TabelaSloj;
    expect(t).toMatchObject({ tip: 'TABELA', sirina: 640, visina: 120, x: 160, y: 210 });
    expect(t.celije[0][0].popuna).toBe(TEME.NACRT.tabelaZaglavlje);
    expect(store.izbor()).toEqual([t.id]);
    expect(document.activeElement).toBe(okvir());
    await ubaciTabelu();
    expect(poslednji().x).toBe(172);
  });

  it('"Tabela" odbijena (300 slojeva): poruka, fokus na okviru platna (ne na body)', async () => {
    const puno = { ...novoPlatno('NACRT', 'PRAZNO'), slojevi: Array.from({ length: 300 }, (_, i) => novaSlika(`s${i + 1}`, 'x', 10, 10)) };
    store.inicijalizuj(puno);
    await ubaciTabelu();
    expect(store.platno().slojevi).toHaveLength(300);
    expect(poruke.map((p) => p.tekst)).toEqual(['Slajd može imati najviše 300 slojeva.']);
    expect(document.activeElement).toBe(okvir());
  });

  it('"Tekst": TEKST 400 x 60 u centru u fontu i boji teme, izabran i odmah u uređivanju', async () => {
    dugme(el(), 'Tekst')!.click();
    await fixture.whenStable();
    const s = poslednji() as TekstSloj;
    expect(s).toMatchObject({ tip: 'TEKST', sirina: 400, visina: 60, x: 280, y: 240 });
    expect(s.pasusi[0].delovi[0]).toMatchObject({ tekst: '', font: TEME.NACRT.fontTela, boja: TEME.NACRT.tekst, velicina: 24 });
    expect(store.izbor()).toEqual([s.id]);
    expect(store.uredjivanje()).toEqual({ slojId: s.id, celija: null });
    expect(izlaz).toHaveBeenCalledTimes(1);
  });

  it('"Tekst" dvaput: drugi je pomeren za 12, a prva sesija je završena', async () => {
    dugme(el(), 'Tekst')!.click();
    const prvi = poslednji();
    dugme(el(), 'Tekst')!.click();
    expect(poslednji().x).toBe(prvi.x + 12);
    expect(store.uredjivanje()?.slojId).toBe(poslednji().id);
  });

  describe('editor se zatvara usred ubacivanja slike (ispravka 1)', () => {
    const odloženo = <T>() => {
      let resolve!: (v: T) => void;
      const obecanje = new Promise<T>((r) => (resolve = r));
      return { obecanje, resolve };
    };

    it('uništen editor pre kraja merenja: upload nije pozvan, izlaz nije pozvan, stigla poruka', async () => {
      const d = odloženo<{ sirina: number; visina: number }>();
      dimenzije.mockReturnValue(d.obecanje);
      await izaberiFajl(png());
      expect(dimenzije).toHaveBeenCalledTimes(1);
      expect(upload).not.toHaveBeenCalled(); // dimenzije se mere PRE otpremanja
      izlaz.mockClear();
      fixture.destroy();
      d.resolve({ sirina: 100, visina: 100 });
      await new Promise((r) => setTimeout(r));
      expect(upload).not.toHaveBeenCalled();
      expect(izlaz).not.toHaveBeenCalled();
      expect(poruke.map((p) => p.tekst)).toEqual(['Slika nije primenjena: slajd je zatvoren.']);
    });

    it('merenje pada (oštećen fajl): poruka, bez otpremanja', async () => {
      dimenzije.mockRejectedValue(new Error('x'));
      await izaberiFajl(png());
      expect(upload).not.toHaveBeenCalled();
      expect(poruke.map((p) => p.tekst)).toEqual(['Slika se ne može pročitati.']);
      expect(store.platno().slojevi).toHaveLength(0);
    });

    it('uništenje usred otpremanja: poruka iz F6, nema upisa u dokument', async () => {
      upload.mockReturnValue(new Subject<MedijInfo>());
      await izaberiFajl(png());
      expect(upload).toHaveBeenCalledTimes(1);
      izlaz.mockClear();
      fixture.destroy();
      await new Promise((r) => setTimeout(r));
      expect(poruke.map((p) => p.tekst)).toEqual(['Slika nije primenjena: slajd je zatvoren.']);
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('druga slika dok prva još ide: poruka "Sačekaj…", drugi upload nije pozvan', async () => {
      upload.mockReturnValue(new Subject<MedijInfo>());
      await izaberiFajl(png());
      await izaberiFajl(png());
      expect(upload).toHaveBeenCalledTimes(1);
      expect(poruke.map((p) => p.tekst)).toEqual(['Sačekaj da se prethodna slika otpremi.']);
    });
  });
});

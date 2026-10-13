import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import type { OblikSloj, SlikaSloj } from '../data-access/platno.models';
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
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sat.t = 0;
    upload = vi.fn<(f: File) => ReturnType<PrezentacijeApi['upload']>>(() => of(medij('m1')));
    TestBed.configureTestingModule({
      providers: [
        ...provajderiSvojstava(sat),
        { provide: PrezentacijeApi, useValue: { upload } },
        { provide: DIMENZIJE_SLIKE, useValue: () => Promise.resolve({ sirina: 1920, visina: 1080 }) },
      ],
    });
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.injector.get(PlatnoEditorStore);
    store.postaviIzlaz(vi.fn());
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

  it('strelica posle ubacivanja pomera nov sloj za 1 (fokus je na okviru)', async () => {
    await ubaciOblik('Pravougaonik');
    const x = poslednji().x;
    store.pomeriIzabrane(1, 0);
    expect(poslednji().x).toBe(x + 1);
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
    await fixture.whenStable();
    expect(dugme(el(), 'Slika')!.getAttribute('aria-disabled')).not.toBe('true');
    expect(el().querySelector('[role="status"]')!.textContent!.trim()).toBe('');
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
});

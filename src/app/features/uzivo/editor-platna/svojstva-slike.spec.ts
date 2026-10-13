import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import type { Platno, SlikaSloj } from '../data-access/platno.models';
import { novaSlika } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { MedijInfo } from '../data-access/uzivo.models';
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

const medij = (id: string): MedijInfo => ({ id, naziv: 'slika.png', mime: 'image/png', velicina: 4 });
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'slika.png', { type: 'image/png' });

describe('SvojstvaSlikeComponent (kroz panel Svojstva)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let upload: ReturnType<typeof vi.fn<(f: File) => ReturnType<PrezentacijeApi['upload']>>>;
  let poruke: Poruka[];
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const sloj = () => store.platno().slojevi.find((s) => s.id === 's1') as SlikaSloj;
  const fajlPolje = () => el().querySelector<HTMLInputElement>('app-svojstva-slike input[type="file"]')!;

  /** Bira fajl u skrivenom `<input type="file">` (jsdom ne dozvoljava upis u `files`, pa se svojstvo zamenjuje). */
  async function izaberiFajl(f: File) {
    Object.defineProperty(fajlPolje(), 'files', { configurable: true, value: [f] });
    fajlPolje().dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sat.t = 0;
    upload = vi.fn<(f: File) => ReturnType<PrezentacijeApi['upload']>>(() => of(medij('novi-uuid')));
    TestBed.configureTestingModule({
      providers: [...provajderiSvojstava(sat), { provide: PrezentacijeApi, useValue: { upload } }],
    });
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    store.postaviIzlaz(vi.fn());
    store.inicijalizuj(platnoSaAnimacijama([], [{ ...novaSlika('s1', 'stari-uuid', 400, 200), rotacija: 15 }]));
    store.izaberi(['s1']);
    await fixture.whenStable();
  });

  it('isečak u %: levo 10 -> 0.1; levo 60 + desno 50 -> poruka i bez izmene', async () => {
    expect(polje(el(), 'Levo')!.value).toBe('0');
    await upisi(fixture, polje(el(), 'Levo')!, '10');
    expect(sloj().isecak).toEqual({ levo: 0.1, gore: 0, desno: 0, dole: 0 });
    await upisi(fixture, polje(el(), 'Levo')!, '60');
    expect(sloj().isecak.levo).toBe(0.6);
    await upisi(fixture, polje(el(), 'Desno')!, '50');
    expect(poruke.map((p) => p.tekst)).toEqual(['Isečak slike nije ispravan.']);
    expect(sloj().isecak).toEqual({ levo: 0.6, gore: 0, desno: 0, dole: 0 });
    expect(polje(el(), 'Desno')!.value).toBe('0');
    await upisi(fixture, polje(el(), 'Dole')!, '150');
    expect(sloj().isecak.dole).toBe(0.99);
  });

  it('"Zameni sliku": novi medijId, kutija ista', async () => {
    const pre = sloj();
    await izaberiFajl(png());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(sloj().medijId).toBe('novi-uuid');
    expect(sloj()).toMatchObject({ x: pre.x, y: pre.y, sirina: pre.sirina, visina: pre.visina, rotacija: 15 });
  });

  it('dok otpremanje traje: dugme onemogućeno i status "Slika se otprema…"', async () => {
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    expect(dugme(el(), 'Zameni sliku')!.disabled).toBe(true);
    expect(el().querySelector('app-svojstva-slike [role="status"]')!.textContent).toContain('Slika se otprema…');
    odgovor.next(medij('m2'));
    odgovor.complete();
    await fixture.whenStable();
    expect(dugme(el(), 'Zameni sliku')!.disabled).toBe(false);
    expect(sloj().medijId).toBe('m2');
    // status region stalno postoji (čitači ekrana najavljuju promenu teksta), prazan kad se ne šalje
    expect(el().querySelector('app-svojstva-slike [role="status"]')!.textContent!.trim()).toBe('');
  });

  it('promena izbora usred otpremanja: slika se ipak primeni na ciljni sloj', async () => {
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    store.ponistiIzbor();
    await fixture.whenStable();
    expect(el().querySelector('app-svojstva-slike')).toBeNull();
    odgovor.next(medij('m2'));
    odgovor.complete();
    await fixture.whenStable();
    expect(sloj().medijId).toBe('m2');
    expect(poruke).toEqual([]);
  });

  it('izbor drugog (zaključanog) sloja slike ne smeta: rezultat ide u ciljni sloj', async () => {
    store.inicijalizuj(platnoSaAnimacijama([], [
      novaSlika('s1', 'stari-uuid', 400, 200), { ...novaSlika('s2', 'drugi', 400, 200), zakljucan: true },
    ]));
    store.izaberi(['s1']);
    await fixture.whenStable();
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    store.izaberi(['s2']);
    await fixture.whenStable();
    odgovor.next(medij('m3'));
    odgovor.complete();
    await fixture.whenStable();
    expect(sloj().medijId).toBe('m3');
    expect(poruke).toEqual([]);
  });

  it('ciljni sloj obrisan pre odgovora: poruka, dokument nepromenjen', async () => {
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    store.obrisiIzabrane();
    await fixture.whenStable();
    const pre = store.platno();
    odgovor.next(medij('m4'));
    odgovor.complete();
    await fixture.whenStable();
    expect(store.platno()).toBe(pre);
    expect(poruke.map((p) => p.tekst)).toEqual(['Slika nije primenjena: sloj je obrisan.']);
  });

  it('ciljni sloj zaključan pre odgovora: poruka, slika ostaje', async () => {
    const odgovor = new Subject<MedijInfo>();
    upload.mockReturnValue(odgovor);
    await izaberiFajl(png());
    store.zakljucaj('s1', true);
    await fixture.whenStable();
    odgovor.next(medij('m5'));
    odgovor.complete();
    await fixture.whenStable();
    expect(sloj().medijId).toBe('stari-uuid');
    expect(poruke.map((p) => p.tekst)).toEqual(['Slika nije primenjena: sloj je zaključan.']);
  });

  it('greška otpremanja -> NotificationStore.greska sa razlogom servera, slika ostaje', async () => {
    upload.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 413, error: { reason: 'Fajl je prevelik.' } })));
    await izaberiFajl(png());
    expect(poruke).toEqual([expect.objectContaining({ tip: 'greska', tekst: 'Fajl je prevelik.' })]);
    expect(sloj().medijId).toBe('stari-uuid');
  });

  it('fajl koji nije slika se odbija pre otpremanja', async () => {
    await izaberiFajl(new File(['x'], 'tekst.txt', { type: 'text/plain' }));
    expect(upload).not.toHaveBeenCalled();
    expect(poruke.map((p) => p.tekst)).toEqual(['Dozvoljene su samo slike PNG, JPEG, GIF i WebP.']);
  });

  it('zaključana slika: "Zameni sliku" i isečak su onemogućeni', async () => {
    store.zakljucaj('s1', true);
    await fixture.whenStable();
    expect(dugme(el(), 'Zameni sliku')!.disabled).toBe(true);
    expect(polje(el(), 'Levo')!.disabled).toBe(true);
  });
});

describe('SvojstvaSlikeComponent: izlaz posle otpremanja', () => {
  it('predaje dokument sa novom slikom tačno jednom', async () => {
    const sat: LazniSat = { t: 0 };
    // OtpremanjeSlike je u providers domaćina (kao u PlatnoEditorComponent)
    TestBed.configureTestingModule({
      providers: [...provajderiSvojstava(sat), { provide: PrezentacijeApi, useValue: { upload: () => of(medij('m9')) } }],
    });
    const fixture = TestBed.createComponent(DomacinComponent);
    const store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    const izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
    store.inicijalizuj(platnoSaAnimacijama([], [novaSlika('s1', 'stari', 100, 100)]));
    store.izaberi(['s1']);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [png()] });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(izlaz).toHaveBeenCalledTimes(1);
    expect((izlaz.mock.calls[0][0].slojevi[0] as SlikaSloj).medijId).toBe('m9');
  });
});

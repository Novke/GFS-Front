import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NesacuvaneIzmene } from '../../../core/state/nesacuvane-izmene';
import { NotificationStore } from '../../../core/state/notification.store';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { MedijInfo, PrezentacijaDetails, UvozSlajdovaCmd } from '../data-access/uzivo.models';
import { PORUKE_FAJLA, PRIHVACENI_FAJLOVI } from './ime-fajla';
import { GRANICE_PAKETA } from './paket';
import { kodirajPng } from './png';
import { napraviPptx, oblik, pasus, PNG_1X1, timing, type EfekatFabrike } from './pptx-fabrika.testing';
import { OSVEZI_PREZENTACIJU, OZNAKA_UVOZA, otvoriUvozPptx, type IshodUvoza, type UvozPptxPodaci } from './uvoz-pptx.dialog';

// --- fajlovi (sintetički, fabrika F1) -----------------------------------------------------------------------------

const SLIKA = { id: 'rIdI', tip: 'image', cilj: '../media/image1.png' };
const fade = (spid: number): EfekatFabrike => ({ spid, klasa: 'entr', preset: 10, filter: 'fade', okidac: 'clickEffect' });

/** 2 slajda, ista slika na oba, 3 animacije (jedna preset 6), beleške na slajdu 2. */
function dvaSlajda(): Uint8Array {
  return napraviPptx({
    slajdovi: [
      {
        spTree: oblik.slika(2, 'rIdI', 0, 0, 1270000, 1270000)
          + oblik.tekst(3, 1270000, 1270000, 5080000, 1270000, pasus('Prvi pasus')),
        veze: [SLIKA],
        timing: timing([fade(3), { spid: 2, klasa: 'entr', preset: 6, filter: 'circle(in)', okidac: 'clickEffect' }]),
      },
      {
        spTree: oblik.slika(2, 'rIdI', 0, 0, 1270000, 1270000),
        veze: [SLIKA],
        timing: timing([fade(2)]),
        beleske: pasus('Podsetnik za predavača'),
      },
    ],
    delovi: { 'ppt/media/image1.png': PNG_1X1 },
  });
}

/** 1 slajd sa 3 različite slike (3 slanja). */
function triSlike(): Uint8Array {
  const png = (n: number) => kodirajPng({ sirina: 1, visina: 1, piksli: Uint8Array.from([n, 0, 0, 255]) });
  return napraviPptx({
    slajdovi: [{
      spTree: [1, 2, 3].map((i) => oblik.slika(10 + i, `rIdI${i}`, i * 1270000, 0, 1270000, 1270000)).join(''),
      veze: [1, 2, 3].map((i) => ({ id: `rIdI${i}`, tip: 'image', cilj: `../media/image${i}.png` })),
    }],
    delovi: Object.fromEntries([1, 2, 3].map((i) => [`ppt/media/image${i}.png`, png(i * 40)])),
  });
}

const fajl = (b: Uint8Array, ime = 'predavanje.pptx') => new File([b as Uint8Array<ArrayBuffer>], ime);

// --- lažni API ----------------------------------------------------------------------------------------------------

const DETALJI = { id: 7, slajdovi: [] } as unknown as PrezentacijaDetails;

class LazniApi {
  uploadOdgovor: () => Observable<MedijInfo> = () => of({ id: crypto.randomUUID(), naziv: 'x', mime: 'image/png', velicina: 1 });
  uveziOdgovor: () => Observable<PrezentacijaDetails> = () => of(DETALJI);
  obrisiOdgovor: () => Observable<void> = () => of(undefined);
  readonly upload = vi.fn<(f: File) => Observable<MedijInfo>>(() => this.uploadOdgovor());
  readonly uvezi = vi.fn<(id: number, cmd: UvozSlajdovaCmd) => Observable<PrezentacijaDetails>>(() => this.uveziOdgovor());
  readonly obrisi = vi.fn<(id: number) => Observable<void>>(() => this.obrisiOdgovor());
}

// --- pomoćne ------------------------------------------------------------------------------------------------------

const koren = () => document.querySelector<HTMLElement>(`[data-oznaka="${OZNAKA_UVOZA}"]`);
const tekst = () => (koren()?.textContent ?? '').replace(/\s+/g, ' ');

/** Pravi tajmeri: pretvaranje popušta nit `setTimeout`-om; čeka uslov i usput pokreće detekciju promena. */
async function doK(uslov: () => boolean, opis = 'uslov'): Promise<void> {
  const kraj = Date.now() + 5000;
  for (;;) {
    TestBed.tick();
    if (uslov()) return;
    if (Date.now() > kraj) throw new Error(`Nije ispunjeno: ${opis}. Tekst dijaloga: ${tekst()}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function dugme(natpis: string): HTMLButtonElement {
  const b = [...(koren()?.querySelectorAll('button') ?? [])].find((x) => x.textContent?.trim() === natpis);
  if (!b) throw new Error(`Nema dugmeta "${natpis}". Tekst dijaloga: ${tekst()}`);
  return b;
}

function radio(natpis: string): HTMLInputElement {
  const r = [...(koren()?.querySelectorAll('mat-radio-button') ?? [])].find((x) => x.textContent?.trim().startsWith(natpis));
  if (!r) throw new Error(`Nema radio dugmeta "${natpis}". Tekst dijaloga: ${tekst()}`);
  return r.querySelector('input')!;
}

function upisi(oznaka: string, vrednost: string): void {
  const polje = koren()?.querySelector<HTMLInputElement>(`input[aria-label="${oznaka}"]`);
  if (!polje) throw new Error(`Nema polja "${oznaka}"`);
  polje.value = vrednost;
  polje.dispatchEvent(new Event('input'));
}

const uPregledu = () => doK(() => !!koren()?.querySelector('[data-faza="pregled"]'), 'pregled');

describe('UvozPptxDialog', () => {
  let api: LazniApi;
  let rezultat: { vrednost: IshodUvoza; zatvoren: boolean };

  beforeEach(() => {
    api = new LazniApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PrezentacijeApi, useValue: api },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.restoreAllMocks();
  });

  function otvori(podaci: Partial<UvozPptxPodaci> = {}): void {
    rezultat = { vrednost: undefined, zatvoren: false };
    otvoriUvozPptx(TestBed.inject(MatDialog), {
      prezentacijaId: 7, brojSlajdova: 5, izabraniId: 41, izabraniRb: 4, ...podaci,
    }).subscribe((v) => {
      rezultat.vrednost = v;
      rezultat.zatvoren = true;
    });
    TestBed.tick();
  }


  it('analizaPokazujeBrojeve: posle izbora fajla broj slajdova, animacija, beleški i upozorenje o efektu', async () => {
    otvori();
    expect(tekst()).toContain('Izaberi .pptx fajl');
    expect(tekst()).toContain('Fajl se čita u tvom pregledaču; na server idu samo slike i gotovi slajdovi.');
    const polje = koren()!.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(polje.accept).toBe(PRIHVACENI_FAJLOVI);
    Object.defineProperty(polje, 'files', { value: [fajl(dvaSlajda())] });
    polje.dispatchEvent(new Event('change'));
    await uPregledu();
    expect(tekst()).toContain('2 slajda');
    expect(tekst()).toContain('3 animacije');
    expect(tekst()).toContain('1 beleška');
    expect(tekst()).toContain('Efekat 6');
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('uvozOpsega: Od 2 do 2 posle slajda 4 -> 1 slika, uvezi sa 1 slajdom, izveštaj i kopiranje', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    radio('Od').click();
    TestBed.tick();
    upisi('Od slajda', '2');
    upisi('Do slajda', '2');
    radio('Posle slajda 4').click();
    TestBed.tick();
    expect(dugme('Uvezi').disabled).toBe(false);
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Uvezeno slajdova: 1'), 'izveštaj');
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.uvezi).toHaveBeenCalledTimes(1);
    const [id, cmd] = api.uvezi.mock.calls[0];
    expect(id).toBe(7);
    expect(cmd.posle).toBe(41);
    expect(cmd.slajdovi).toHaveLength(1);
    expect(cmd.slajdovi[0].beleske).toBe('Podsetnik za predavača');

    dugme('Kopiraj izveštaj').click();
    await doK(() => uspeh.mock.calls.length > 0, 'kopiranje');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/^Uvoz: predavanje\.pptx\n/);
    expect(uspeh).toHaveBeenCalledWith('Izveštaj je kopiran.');

    dugme('Zatvori').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBe(DETALJI);
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('kopiranje ne uspe -> tekst izveštaja u polju samo za čitanje, izabran', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('ne')) } });
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Uvezeno slajdova: 2'), 'izveštaj');
    dugme('Kopiraj izveštaj').click();
    await doK(() => !!koren()?.querySelector('textarea[readonly]'), 'polje izveštaja');
    const polje = koren()!.querySelector<HTMLTextAreaElement>('textarea[readonly]')!;
    expect(polje.value).toMatch(/^Uvoz: predavanje\.pptx\n/);
    expect(document.activeElement).toBe(polje);
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('Review Focus 2: stari.ppt -> poruka o .ppt, nijedan API poziv', async () => {
    otvori({ fajl: fajl(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'stari.ppt') });
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    expect(koren()!.querySelector('[role=alert]')!.textContent).toContain(PORUKE_FAJLA.ppt);
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.uvezi).not.toHaveBeenCalled();
    expect(api.obrisi).not.toHaveBeenCalled();
    expect(() => dugme('Pokušaj ponovo')).toThrow();
    // poruka je role="alert" (najava), fokus ide na dugme akcije, ne na poruku
    expect(document.activeElement).toBe(dugme('Izaberi drugi fajl'));
  });

  it('oštećen fajl -> poruka GreskaUvoza, ne sirova greška', async () => {
    otvori({ fajl: fajl(new Uint8Array([1, 2, 3, 4]), 'pokvaren.pptx') });
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    expect(koren()!.querySelector('[role=alert]')!.textContent).not.toMatch(/TypeError|invalid zip/);
  });

  it('novaNeuspeh: uvezi 400 -> obrisi(7) jednom, poruka o brisanju, zatvaranje vraća undefined', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Nešto nije u redu.', time: '' } }));
    otvori({ fajl: fajl(dvaSlajda()), nova: true, brojSlajdova: 0, izabraniId: null, izabraniRb: null });
    await uPregledu();
    expect(tekst()).not.toContain('Posle slajda');
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Prazna prezentacija je obrisana.'), 'poruka');
    expect(api.obrisi).toHaveBeenCalledTimes(1);
    expect(api.obrisi).toHaveBeenCalledWith(7);
    expect(koren()!.querySelector('[role=alert]')!.textContent!.trim()).toMatch(/Prazna prezentacija je obrisana\.$/);
    expect(() => dugme('Pokušaj ponovo')).toThrow();
    dugme('Zatvori').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBeUndefined();
    expect(api.obrisi).toHaveBeenCalledTimes(1);
  });

  it('nova: neuspelo brisanje -> poruka da se obriše ručno', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Ne.', time: '' } }));
    api.obrisiOdgovor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    otvori({ fajl: fajl(dvaSlajda()), nova: true, brojSlajdova: 0, izabraniId: null, izabraniRb: null });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Praznu prezentaciju obriši ručno.'), 'poruka');
  });

  it('greška slanja bez nove prezentacije: Pokušaj ponovo vraća na pregled', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Slajd 1: Font nije podržan.', time: '' } }));
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    expect(koren()!.querySelector('[role=alert]')!.textContent).toContain('PowerPoint slajd 1: Font nije podržan.');
    dugme('Pokušaj ponovo').click();
    await uPregledu();
    expect(api.obrisi).not.toHaveBeenCalled();
  });

  it('neočekivana greška slanja -> opšta poruka, nikad sirov TypeError', async () => {
    api.uveziOdgovor = () => throwError(() => new TypeError('x is undefined'));
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    const poruka = koren()!.querySelector('[role=alert]')!.textContent!;
    expect(poruka).not.toContain('TypeError');
    expect(poruka).not.toContain('undefined');
  });

  it('otkazivanjeTokomSlika: upload zadržan, Otkaži -> uvezi nije pozvan; nova -> obrisi', async () => {
    const zadrzano = new Subject<MedijInfo>();
    api.uploadOdgovor = () => zadrzano;
    otvori({ fajl: fajl(triSlike()), nova: true, brojSlajdova: 0, izabraniId: null, izabraniRb: null });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Slike 0 od 3'), 'napredak slika');
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(dugme('Otkaži').disabled).toBe(false);
    dugme('Otkaži').click();
    await doK(() => tekst().includes('Prazna prezentacija je obrisana.'), 'brisanje');
    expect(zadrzano.observed).toBe(false);
    expect(api.uvezi).not.toHaveBeenCalled();
    expect(api.obrisi).toHaveBeenCalledTimes(1);
    expect(api.obrisi).toHaveBeenCalledWith(7);
  });

  it('registar: tokom slanja ima 1 nesačuvana izmena i dijalog se ne zatvara; posle 0', async () => {
    const nesacuvane = TestBed.inject(NesacuvaneIzmene);
    const uvoz = new Subject<PrezentacijaDetails>();
    api.uveziOdgovor = () => uvoz;
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    expect(nesacuvane.broj()).toBe(0);
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Pravim slajdove'), 'faza slajdova');
    expect(nesacuvane.broj()).toBe(1);
    expect(dugme('Otkaži').disabled).toBe(true);
    // Escape tokom slanja ne zatvara dijalog i ne prekida slanje
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    TestBed.tick();
    expect(rezultat.zatvoren).toBe(false);
    expect(uvoz.observed).toBe(true);
    uvoz.next(DETALJI);
    uvoz.complete();
    await doK(() => tekst().includes('Uvezeno slajdova'), 'izveštaj');
    expect(nesacuvane.broj()).toBe(0);
  });

  it('granica200: 199 postojećih i 2 slajda -> Uvezi onemogućeno uz poruku', async () => {
    otvori({ fajl: fajl(dvaSlajda()), brojSlajdova: 199 });
    await uPregledu();
    expect(dugme('Uvezi').disabled).toBe(true);
    expect(tekst()).toContain('Prezentacija bi imala više od 200 slajdova (ima 199, uvozi se 2). Izaberi manji opseg.');
    radio('Od').click();
    TestBed.tick();
    upisi('Do slajda', '1');
    TestBed.tick();
    expect(dugme('Uvezi').disabled).toBe(false);
  });

  it('opseg bez slajdova -> Uvezi onemogućeno uz poruku', async () => {
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    radio('Od').click();
    TestBed.tick();
    upisi('Od slajda', '2');
    upisi('Do slajda', '1');
    TestBed.tick();
    expect(dugme('Uvezi').disabled).toBe(true);
    expect(tekst()).toContain('Izabrani opseg nema nijedan slajd.');
  });

  it('Otkaži u pregledu zatvara sa undefined bez ijednog zahteva', async () => {
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    dugme('Otkaži').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBeUndefined();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.obrisi).not.toHaveBeenCalled();
  });
  it('nepoznat ishod (veza prekinuta): bez Pokušaj ponovo, zatvaranje traži osvežavanje editora', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 0 }));
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    expect(tekst()).toContain('možda ipak dodati');
    expect(() => dugme('Pokušaj ponovo')).toThrow();
    dugme('Zatvori').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBe(OSVEZI_PREZENTACIJU);
  });

  it('nepoznat ishod (5xx bez razloga) i nova: prezentacija se NE briše, poruka upućuje na listu', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 504, error: '<html>' }));
    otvori({ fajl: fajl(dvaSlajda()), nova: true, brojSlajdova: 0, izabraniId: null, izabraniRb: null });
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    expect(api.obrisi).not.toHaveBeenCalled();
    expect(tekst()).toContain('proveri listu prezentacija');
    expect(tekst()).not.toContain('obrisana');
    expect(() => dugme('Pokušaj ponovo')).toThrow();
    dugme('Zatvori').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBe(OSVEZI_PREZENTACIJU);
    expect(api.obrisi).not.toHaveBeenCalled();
  });

  it('fajl veći od 500 MB: poruka pre čitanja, nazad na izbor fajla', async () => {
    const f = fajl(dvaSlajda());
    Object.defineProperty(f, 'size', { value: GRANICE_PAKETA.fajl + 1 });
    const citanje = vi.spyOn(f, 'arrayBuffer');
    otvori({ fajl: f });
    await doK(() => !!koren()?.querySelector('[role=alert]'), 'greška');
    expect(koren()!.querySelector('[role=alert]')!.textContent).toContain('Fajl je veći od 500 MB.');
    expect(citanje).not.toHaveBeenCalled();
    dugme('Izaberi drugi fajl').click();
    await doK(() => !!koren()?.querySelector('[data-faza="izbor"]'), 'izbor');
  });

  it('naslov liste: "Upozorenja (n)" kad nema grešaka slajdova', async () => {
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    expect(tekst()).toContain('Upozorenja (1)');
    expect(tekst()).not.toContain('Greške i upozorenja');
  });

  it('naslov liste: "Greške i upozorenja (n)" kad slajd nije pročitan', async () => {
    otvori({ fajl: fajl(napraviPptx({ slajdovi: [{ spTree: '' }, { spTree: '' }], bezDelova: ['ppt/slides/slide2.xml'] })) });
    await uPregledu();
    expect(tekst()).toContain('Greške i upozorenja (1)');
  });

  it('navigacija: programska ne zatvara dijalog, popstate (nazad u pregledaču) je kao Otkaži', async () => {
    const router = TestBed.inject(Router);
    otvori({ fajl: fajl(dvaSlajda()) });
    await uPregledu();
    await router.navigateByUrl('/x');
    TestBed.tick();
    expect(rezultat.zatvoren).toBe(false);
    // isto što Router radi na `popstate` (Location -> navigateToSyncWithBrowser)
    (router as unknown as { navigateToSyncWithBrowser(u: string, s: string, st: object, e: object): void })
      .navigateToSyncWithBrowser('/y', 'popstate', {}, {});
    await doK(() => rezultat.zatvoren, 'zatvaranje posle popstate');
    expect(rezultat.vrednost).toBeUndefined();
  });
});

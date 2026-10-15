import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NesacuvaneIzmene } from '../../../core/state/nesacuvane-izmene';
import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja } from '../../../core/state/registar-cuvanja';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { MedijInfo, PrezentacijaDetails, UvozSlajdovaCmd } from '../data-access/uzivo.models';
import { TEME } from '../ui/teme';
import { PORUKE_PDF, type PdfDokument, type PdfJs, type PdfStrana, type Platno2d } from './pdf-crtac';
import { NAPRAVI_PLATNO_PDF, UCITAJ_PDFJS } from './pdf-token';
import { OTKAZANO_PDF } from './slanje-pdf';
import { MAX_PDF_BAJTOVA } from './strane';
import { OSVEZI_POSLE_PDF, OZNAKA_UVOZA_PDF, otvoriUvozPdf, type IshodUvozaPdf, type UvozPdfPodaci } from './uvoz-pdf.dialog';

// --- lažni pdf.js (bez pdfjs-dist i bez vi.mock: zamena kroz UCITAJ_PDFJS / NAPRAVI_PLATNO_PDF) --------------------

/** Strana 960 x 540 pt (16:9); crtanje i čišćenje ne rade ništa. */
const strana: PdfStrana = {
  getViewport: ({ scale }) => ({ width: 960 * scale, height: 540 * scale }),
  render: () => ({ promise: Promise.resolve() }),
  cleanup: () => undefined,
};
const dokument = (numPages: number): PdfDokument => ({ numPages, getPage: () => Promise.resolve(strana) });

interface Zadatak { promise: Promise<PdfDokument>; destroy: ReturnType<typeof vi.fn<() => Promise<void>>>; }

/** Odloženo obećanje (test ga razrešava kad hoće). */
function odlozeno<T>() {
  let razresi!: (v: T) => void;
  let odbij!: (e: unknown) => void;
  const promise = new Promise<T>((r, o) => {
    razresi = r;
    odbij = o;
  });
  return { promise, razresi, odbij };
}

class LazniPdf {
  /** Šta daje sledeći `getDocument` (podrazumevano dokument od 3 strane). */
  otvaranje: () => Promise<PdfDokument> = () => Promise.resolve(dokument(3));
  /** Šta daje `destroy` sledećeg zadatka (podrazumevano odmah). */
  gasenje: () => Promise<void> = () => Promise.resolve();
  readonly zadaci: Zadatak[] = [];
  readonly getDocument = vi.fn<PdfJs['getDocument']>(() => {
    const promise = this.otvaranje();
    promise.catch(() => undefined); // čita ga `otvoriPdf`; bez ovoga Node prijavi neobrađeno odbijanje pre toga
    const z: Zadatak = { promise, destroy: vi.fn(this.gasenje) };
    this.zadaci.push(z);
    return z;
  });
}

/** Platno: `uBlob` daje mali PNG sa drugačijim bajtom po strani (bez deduplikacije). */
function laznoPlatno() {
  let n = 0;
  return (): Platno2d => {
    const bajt = ++n;
    return {
      canvas: document.createElement('canvas'),
      uBlob: (tip) => Promise.resolve(new Blob([new Uint8Array([0x89, 0x50, 0x4e, bajt])], { type: tip })),
      oslobodi: () => undefined,
    };
  };
}

// --- lažni API ------------------------------------------------------------------------------------------------------

const DETALJI = { id: 7, slajdovi: [] } as unknown as PrezentacijaDetails;

class LazniApi {
  uploadOdgovor: () => Observable<MedijInfo> = () => of({ id: crypto.randomUUID(), naziv: 'x', mime: 'image/png', velicina: 1 });
  uveziOdgovor: () => Observable<PrezentacijaDetails> = () => of(DETALJI);
  readonly upload = vi.fn<(f: File) => Observable<MedijInfo>>(() => this.uploadOdgovor());
  readonly uvezi = vi.fn<(id: number, cmd: UvozSlajdovaCmd) => Observable<PrezentacijaDetails>>(() => this.uveziOdgovor());
}

// --- pomoćne --------------------------------------------------------------------------------------------------------

const koren = () => document.querySelector<HTMLElement>(`[data-oznaka="${OZNAKA_UVOZA_PDF}"]`);
const tekst = () => (koren()?.textContent ?? '').replace(/\s+/g, ' ');
const alert = () => koren()?.querySelector('[role=alert]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const pdf = (ime = 'Predavanje.pdf', tip = 'application/pdf') => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], ime, { type: tip });

/** Pravi tajmeri: čeka uslov i usput pokreće detekciju promena. */
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

function izaberi(f: File): void {
  const polje = koren()!.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(polje, 'files', { value: [f], configurable: true });
  polje.dispatchEvent(new Event('change'));
}

const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const uPregledu = () => doK(() => !!koren()?.querySelector('[data-faza="pregled"]'), 'pregled');

describe('UvozPdfDialog', () => {
  let api: LazniApi;
  let lazni: LazniPdf;
  let ucitaj: ReturnType<typeof vi.fn<() => Promise<PdfJs>>>;
  let handleError: ReturnType<typeof vi.fn>;
  let rezultat: { vrednost: IshodUvozaPdf; zatvoren: boolean };
  /** Greške u `ErrorHandler` osim ikona (spec ne registruje SVG ikone, pa ih `mat-icon` prijavljuje). */
  const greskeAplikacije = () => handleError.mock.calls.map(([e]) => e as unknown)
    .filter((e) => !String((e as Error | null)?.message).startsWith('Error retrieving icon'));

  beforeEach(() => {
    api = new LazniApi();
    lazni = new LazniPdf();
    ucitaj = vi.fn(() => Promise.resolve({ getDocument: lazni.getDocument } satisfies PdfJs));
    handleError = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PrezentacijeApi, useValue: api },
        { provide: UCITAJ_PDFJS, useValue: ucitaj },
        { provide: NAPRAVI_PLATNO_PDF, useValue: laznoPlatno() },
        { provide: ErrorHandler, useValue: { handleError } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.restoreAllMocks();
  });

  function otvori(podaci: Partial<UvozPdfPodaci> = {}): void {
    rezultat = { vrednost: undefined, zatvoren: false };
    otvoriUvozPdf(TestBed.inject(MatDialog), {
      prezentacijaId: 7, brojSlajdova: 5, izabraniId: 41, izabraniRb: 4, tema: 'TAMNA', ...podaci,
    }).subscribe((v) => {
      rezultat.vrednost = v;
      rezultat.zatvoren = true;
    });
    TestBed.tick();
  }

  async function doPregleda(podaci: Partial<UvozPdfPodaci> = {}, f = pdf()): Promise<void> {
    otvori(podaci);
    izaberi(f);
    await uPregledu();
  }

  it('izbor: naslov, polje za PDF, napomena o pregledaču, fokus na "Izaberi PDF"; pdf.js se ne učitava pre fajla', async () => {
    otvori();
    expect(koren()).not.toBeNull();
    expect(koren()!.getAttribute('data-oznaka')).toBe('gfs-uvoz-pdf');
    expect(tekst()).toContain('Uvoz iz PDF-a');
    expect(tekst()).toContain('PDF se čita samo u ovom pregledaču; na server idu samo slike strana.');
    expect(koren()!.querySelector<HTMLInputElement>('input[type=file]')!.accept).toBe('application/pdf,.pdf');
    await doK(() => document.activeElement === dugme('Izaberi PDF'), 'fokus na Izaberi PDF');
    expect(ucitaj).not.toHaveBeenCalled();
  });

  it('Predavanje.pdf -> "Strana u PDF-u: 3." -> Uvezi -> 3 upload, jedan uvezi posle izabranog, zatvaranje sa prezentacijom', async () => {
    const uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');
    await doPregleda();
    expect(tekst()).toContain('Predavanje.pdf');
    expect(tekst()).toContain('Strana u PDF-u: 3.');
    expect(alert()).toBeNull();
    expect(radio('Posle slajda 4').checked).toBe(true);
    expect(api.upload).not.toHaveBeenCalled();
    dugme('Uvezi').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBe(DETALJI);
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(api.upload.mock.calls.map(([f]) => f.name)).toEqual(
      ['Predavanje - str. 1.png', 'Predavanje - str. 2.png', 'Predavanje - str. 3.png']);
    expect(api.uvezi).toHaveBeenCalledTimes(1);
    const [id, cmd] = api.uvezi.mock.calls[0];
    expect(id).toBe(7);
    expect(cmd.posle).toBe(41);
    expect(cmd.slajdovi).toHaveLength(3);
    expect(cmd.slajdovi.map((s) => s.platno?.slojevi[0].naziv)).toEqual(
      ['Predavanje - str. 1', 'Predavanje - str. 2', 'Predavanje - str. 3']);
    expect(cmd.slajdovi[0].platno?.pozadina.boja).toBe(TEME.TAMNA.pozadina);
    expect(uspeh).toHaveBeenCalledWith('Uvezeno slajdova: 3.');
    // pdf.js je dobio bajtove fajla i lokalne putanje (nikad CDN), bez lozinke
    const p = lazni.getDocument.mock.calls[0][0];
    expect(p.standardFontDataUrl).toMatch(/assets\/pdfjs\/standard_fonts\/$/);
    expect(Object.keys(p)).not.toContain('password');
  });

  it('uspešan uvoz: zadatak.destroy tačno jednom, zatvaranje sa prezentacijom (ne greškom), bez sesije posle', async () => {
    await doPregleda();
    dugme('Uvezi').click();
    await doK(() => rezultat.zatvoren && !TestBed.inject(RegistarCuvanja).zauzet('uvoz-pdf-7'), 'zatvaranje i kraj sesije');
    expect(rezultat.vrednost).toBe(DETALJI);
    expect(lazni.zadaci).toHaveLength(1);
    expect(lazni.zadaci[0].destroy).toHaveBeenCalledTimes(1);
    expect(greskeAplikacije()).toEqual([]);
  });

  it('opseg "Strane od – do" 2-3 i "Na kraj prezentacije": 2 slike, posle = null', async () => {
    await doPregleda();
    radio('Strane od').click();
    TestBed.tick();
    upisi('Od strane', '2');
    upisi('Do strane', '3');
    radio('Na kraj prezentacije').click();
    TestBed.tick();
    expect(dugme('Uvezi').disabled).toBe(false);
    dugme('Uvezi').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(api.upload).toHaveBeenCalledTimes(2);
    const cmd = api.uvezi.mock.calls[0][1];
    expect(cmd.posle).toBeNull();
    expect(cmd.slajdovi.map((s) => s.platno?.slojevi[0].naziv)).toEqual(['Predavanje - str. 2', 'Predavanje - str. 3']);
  });

  it('bez izabranog slajda: mesto je samo "na kraj prezentacije"', async () => {
    await doPregleda({ izabraniId: null, izabraniRb: null });
    expect(tekst()).not.toContain('Posle slajda');
    expect(tekst()).toContain('Strane se dodaju na kraj prezentacije.');
    dugme('Uvezi').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(api.uvezi.mock.calls[0][1].posle).toBeNull();
  });

  it('199 slajdova i 3 strane -> poruka u role="alert", "Uvezi" onemogućeno; opseg od 1 strane ga pušta', async () => {
    await doPregleda({ brojSlajdova: 199 });
    expect(alert()).toBe('Broj slajdova koji još staju: 1. Izaberi manji opseg.');
    expect(dugme('Uvezi').disabled).toBe(true);
    expect(dugme('Uvezi').getAttribute('aria-describedby')).toBe('uz-pdf-prepreka');
    radio('Strane od').click();
    TestBed.tick();
    upisi('Do strane', '1');
    TestBed.tick();
    expect(alert()).toBeNull();
    expect(dugme('Uvezi').disabled).toBe(false);
  });

  it('neispravan opseg (prazno polje, do > broja strana) -> "Izaberi strane od 1 do 3."', async () => {
    await doPregleda();
    radio('Strane od').click();
    TestBed.tick();
    upisi('Do strane', '4');
    TestBed.tick();
    expect(alert()).toBe('Izaberi strane od 1 do 3.');
    expect(dugme('Uvezi').disabled).toBe(true);
    upisi('Do strane', '');
    TestBed.tick();
    expect(alert()).toBe('Izaberi strane od 1 do 3.');
  });

  it('Review Focus 5: PasswordException -> poruka o lozinci, window.prompt se ne poziva, nijedan zahtev', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    lazni.otvaranje = () => Promise.reject(Object.assign(new Error('need password'), { name: 'PasswordException' }));
    otvori();
    izaberi(pdf('Zakljucan.pdf'));
    await doK(() => alert() !== null, 'greška');
    expect(alert()).toBe(PORUKE_PDF.lozinka);
    expect(prompt).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.uvezi).not.toHaveBeenCalled();
    expect(lazni.zadaci[0].destroy).toHaveBeenCalledTimes(1);
    expect(greskeAplikacije()).toEqual([]);
    // fokus na akciju, ne na poruku
    expect(document.activeElement).toBe(dugme('Izaberi drugi fajl'));
    dugme('Izaberi drugi fajl').click();
    await doK(() => !!koren()?.querySelector('[data-faza="izbor"]'), 'izbor');
  });

  it('fajl koji nije PDF -> "Izaberi PDF fajl.", pdf.js se ne učitava; .pdf bez tipa prolazi', async () => {
    otvori();
    izaberi(pdf('beleske.txt', 'text/plain'));
    await doK(() => alert() !== null, 'greška');
    expect(alert()).toBe('Izaberi PDF fajl.');
    expect(ucitaj).not.toHaveBeenCalled();
    dugme('Izaberi drugi fajl').click();
    await doK(() => !!koren()?.querySelector('[data-faza="izbor"]'), 'izbor');
    izaberi(pdf('SKEN.PDF', ''));
    await uPregledu();
    expect(tekst()).toContain('Strana u PDF-u: 3.');
  });

  it('PDF veći od 100 MB -> poruka pre čitanja', async () => {
    const f = pdf();
    Object.defineProperty(f, 'size', { value: MAX_PDF_BAJTOVA + 1 });
    const citanje = vi.spyOn(f, 'arrayBuffer');
    otvori();
    izaberi(f);
    await doK(() => alert() !== null, 'greška');
    expect(alert()).toBe(PORUKE_PDF.prevelik);
    expect(citanje).not.toHaveBeenCalled();
    expect(ucitaj).not.toHaveBeenCalled();
  });

  it('odbijen import() pdf.js-a -> "Uvoz PDF-a nije učitan. …", greška u ErrorHandler; sledeći pokušaj radi', async () => {
    ucitaj.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'));
    otvori();
    izaberi(pdf());
    await doK(() => alert() !== null, 'greška');
    expect(alert()).toBe('Uvoz PDF-a nije učitan. Osveži stranicu i pokušaj ponovo.');
    expect(greskeAplikacije()).toEqual([expect.any(TypeError)]);
    expect(lazni.getDocument).not.toHaveBeenCalled();
    dugme('Izaberi drugi fajl').click();
    await doK(() => !!koren()?.querySelector('[data-faza="izbor"]'), 'izbor');
    izaberi(pdf());
    await uPregledu();
  });

  it('upload se ne završava, "Otkaži" -> OTKAZANO_PDF odmah, uvezi nije pozvan, zadatak.destroy pozvan, slanja odjavljena', async () => {
    const zadrzano = new Subject<MedijInfo>();
    api.uploadOdgovor = () => zadrzano;
    await doPregleda();
    dugme('Uvezi').click();
    await doK(() => api.upload.mock.calls.length === 3, '3 slanja');
    expect(tekst()).toContain('Strana 1 od 3');
    expect(koren()!.querySelector('mat-progress-bar[mode=determinate]')).not.toBeNull();
    expect(TestBed.inject(RegistarCuvanja).zauzet('uvoz-pdf-7')).toBe(true);
    // Escape tokom slanja ne radi ništa
    escape();
    TestBed.tick();
    expect(rezultat.zatvoren).toBe(false);
    expect(dugme('Otkaži').getAttribute('aria-disabled')).not.toBe('true');
    dugme('Otkaži').click();
    await doK(() => alert() !== null, 'poruka otkazivanja');
    expect(alert()).toBe(OTKAZANO_PDF);
    expect(zadrzano.observed).toBe(false);
    expect(api.uvezi).not.toHaveBeenCalled();
    await doK(() => lazni.zadaci[0].destroy.mock.calls.length === 1 && !TestBed.inject(RegistarCuvanja).zauzet('uvoz-pdf-7'),
      'gašenje i kraj sesije');
    expect(greskeAplikacije()).toEqual([]);
    dugme('Zatvori').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBeUndefined();
  });

  it('Pokušaj ponovo posle "Otkaži": isti fajl se čita iznova tek kad je prethodni dokument ugašen; opseg ostaje', async () => {
    const zadrzano = new Subject<MedijInfo>();
    api.uploadOdgovor = () => zadrzano;
    const gasenje = odlozeno<void>();
    lazni.gasenje = () => gasenje.promise;
    await doPregleda();
    radio('Strane od').click();
    TestBed.tick();
    upisi('Od strane', '2');
    TestBed.tick();
    dugme('Uvezi').click();
    await doK(() => api.upload.mock.calls.length === 2, '2 slanja');
    dugme('Otkaži').click();
    await doK(() => alert() === OTKAZANO_PDF, 'otkazano');
    lazni.gasenje = () => Promise.resolve();
    dugme('Pokušaj ponovo').click();
    await doK(() => !!koren()?.querySelector('[data-faza="otvaranje"]'), 'otvaranje');
    expect(tekst()).toContain('Čitam PDF…');
    await new Promise((r) => setTimeout(r, 20));
    expect(lazni.getDocument).toHaveBeenCalledTimes(1); // pdf.js 6: nov dokument tek posle kraja destroy()
    gasenje.razresi();
    await uPregledu();
    expect(lazni.getDocument).toHaveBeenCalledTimes(2);
    expect(radio('Strane od').checked).toBe(true);
    expect(koren()!.querySelector<HTMLInputElement>('input[aria-label="Od strane"]')!.value).toBe('2');
    api.uploadOdgovor = () => of({ id: crypto.randomUUID(), naziv: 'x', mime: 'image/png', velicina: 1 });
    dugme('Uvezi').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(api.uvezi.mock.calls[0][1].slajdovi).toHaveLength(2);
  });

  it('uvezi se ne završava (faza slajdovi): "Otkaži" onemogućeno i ne radi ništa, Escape ne zatvara; sesija dok traje', async () => {
    const nesacuvane = TestBed.inject(NesacuvaneIzmene);
    const registar = TestBed.inject(RegistarCuvanja);
    const uvoz = new Subject<PrezentacijaDetails>();
    api.uveziOdgovor = () => uvoz;
    await doPregleda();
    expect(registar.zauzet('uvoz-pdf-7')).toBe(false);
    dugme('Uvezi').click();
    await doK(() => tekst().includes('Pravim slajdove…'), 'faza slajdova');
    expect(registar.zauzet('uvoz-pdf-7')).toBe(true);
    expect(nesacuvane.broj()).toBe(1);
    const otkazi = dugme('Otkaži');
    expect(otkazi.getAttribute('aria-disabled')).toBe('true');
    otkazi.click();
    escape();
    TestBed.tick();
    expect(rezultat.zatvoren).toBe(false);
    expect(uvoz.observed).toBe(true);
    expect(alert()).toBeNull();
    uvoz.next(DETALJI);
    uvoz.complete();
    await doK(() => rezultat.zatvoren && !registar.zauzet('uvoz-pdf-7'), 'zatvaranje i kraj sesije');
    expect(rezultat.vrednost).toBe(DETALJI);
    expect(nesacuvane.broj()).toBe(0);
  });

  it('uvezi status 0 (nepoznat ishod) -> poruka, bez "Pokušaj ponovo", zatvaranje daje OSVEZI_POSLE_PDF', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 0 }));
    await doPregleda();
    dugme('Uvezi').click();
    await doK(() => alert() !== null, 'greška');
    expect(() => dugme('Pokušaj ponovo')).toThrow();
    expect(() => dugme('Izaberi drugi fajl')).toThrow();
    dugme('Zatvori').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBe(OSVEZI_POSLE_PDF);
    expect(OSVEZI_POSLE_PDF).toBe('osvezi');
  });

  it('greška servera sa razlogom -> poruka strane i "Pokušaj ponovo"; TypeError iz API-ja -> poruka faze 2, nikad sirov', async () => {
    api.uveziOdgovor = () => throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Slajd 2: Loše.', time: '' } }));
    await doPregleda();
    dugme('Uvezi').click();
    await doK(() => alert() !== null, 'greška');
    expect(alert()).toContain('Strana 2: Loše.');
    expect(greskeAplikacije()).toEqual([]);
    api.uveziOdgovor = () => throwError(() => new TypeError('x is undefined'));
    dugme('Pokušaj ponovo').click();
    await uPregledu();
    dugme('Uvezi').click();
    await doK(() => alert() !== null, 'greška');
    expect(alert()).not.toMatch(/TypeError|undefined/);
  });

  it('neočekivana greška pri otvaranju (getDocument baci) -> opšta poruka PDF-a i ErrorHandler', async () => {
    lazni.getDocument.mockImplementationOnce(() => {
      throw new TypeError('x is undefined');
    });
    otvori();
    izaberi(pdf());
    await doK(() => alert() !== null, 'greška');
    expect(alert()).toBe(PORUKE_PDF.neocekivano);
    expect(greskeAplikacije()).toEqual([expect.any(TypeError)]);
  });

  it('"Otkaži" u pregledu zatvara bez uvoza i gasi dokument; Escape isto', async () => {
    await doPregleda();
    dugme('Otkaži').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBeUndefined();
    expect(lazni.zadaci[0].destroy).toHaveBeenCalledTimes(1);
    expect(api.upload).not.toHaveBeenCalled();

    await doPregleda();
    escape();
    await doK(() => rezultat.zatvoren, 'zatvaranje posle Escape');
    expect(lazni.zadaci[1].destroy).toHaveBeenCalledTimes(1);
  });

  it('"Otkaži" dok se PDF čita: dijalog se zatvara, dokument koji stigne kasnije se gasi', async () => {
    const citanje = odlozeno<PdfDokument>();
    lazni.otvaranje = () => citanje.promise;
    otvori();
    izaberi(pdf());
    await doK(() => lazni.getDocument.mock.calls.length === 1, 'getDocument');
    expect(koren()!.querySelector('[role=status]')!.textContent).toBe('Čitam PDF…');
    dugme('Otkaži').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBeUndefined();
    citanje.razresi(dokument(3));
    await doK(() => lazni.zadaci[0].destroy.mock.calls.length === 1, 'gašenje');
  });

  it('popstate (nazad u pregledaču) u pregledu je kao "Otkaži"; tokom slanja ništa', async () => {
    const router = TestBed.inject(Router) as unknown as { navigateToSyncWithBrowser(u: string, s: string, st: object, e: object): void };
    await doPregleda();
    router.navigateToSyncWithBrowser('/y', 'popstate', {}, {});
    await doK(() => rezultat.zatvoren, 'zatvaranje posle popstate');
    expect(rezultat.vrednost).toBeUndefined();

    const zadrzano = new Subject<MedijInfo>();
    api.uploadOdgovor = () => zadrzano;
    await doPregleda();
    dugme('Uvezi').click();
    await doK(() => api.upload.mock.calls.length === 3, 'slanje');
    router.navigateToSyncWithBrowser('/z', 'popstate', {}, {});
    await new Promise((r) => setTimeout(r, 20));
    TestBed.tick();
    expect(rezultat.zatvoren).toBe(false);
    expect(zadrzano.observed).toBe(true);
    dugme('Otkaži').click();
    await doK(() => alert() === OTKAZANO_PDF, 'otkazano');
  });
});

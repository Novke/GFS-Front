import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CekiranjeInfo, linkCekiranja } from '../../../core/api/cekiranje.api';
import { PredavanjeDetails } from '../../../core/api/predavanja.models';
import { CEKIRANJE_MS, OSVEZAVANJE_MS, PredavanjeProjektor } from './predavanje-projektor';

const akt = (id: number, ime: string) => ({ id: 100 + id, student: { id, ime, prezime: 'Petrović', indeks: `GD${id}` }, tip: 'PRISUSTVO' as const, napomene: null });

const predavanje = (aktivnosti: PredavanjeDetails['aktivnosti'], zavrseno = false): PredavanjeDetails => ({
  id: 5,
  rb: 12,
  datum: '2025-10-14',
  tema: 'Petlje i uslovi',
  posecenost: aktivnosti.length,
  grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025 },
  predmet: { id: 4, naziv: 'Uvod u primenu računara' },
  aktivnosti,
  zavrseno,
});

const cekirani = (n: number): CekiranjeInfo['cekirani'] =>
  Array.from({ length: n }, (_, i) => ({ studentId: i + 1, ime: 'Ana', prezime: 'Anić', indeks: `GD${i + 1}`, vreme: '2025-10-14T10:00:00', kasnio: false, istiTelefonKao: null }));

const info = (token: string | null, n = 0, datumNijeDanas = false): CekiranjeInfo => ({
  token,
  vaziDoMs: token ? 1_000 : null,
  serverVremeMs: 0,
  datumNijeDanas,
  cekirani: cekirani(n),
});

describe('PredavanjeProjektor', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  let skriven = false;
  beforeEach(() => {
    skriven = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => skriven });
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    delete (document as unknown as Record<string, unknown>)['hidden'];
  });

  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const qrTekst = (f: { nativeElement: unknown }) => el(f).querySelector('app-qr-kod canvas')?.getAttribute('aria-label') ?? null;

  /** Otvori projektor za živo (ili završeno) predavanje 5 i odgovori na prvo učitavanje i studente grupe. */
  async function otvori(zavrseno = false) {
    const f = TestBed.createComponent(PredavanjeProjektor);
    f.componentRef.setInput('id', '5');
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('api/predavanja/5').flush(predavanje([akt(1, 'Ana')], zavrseno));
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush(grupaStudenata([1, 2]));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    return f;
  }

  const grupaStudenata = (ids: number[]) => ({
    content: ids.map(id => ({ id, ime: 'X', prezime: 'Y', indeks: `GD${id}`, godina: 2025, email: null, brojTelefona: null, grupa: null })),
    page: { size: 100, number: 0, totalElements: ids.length, totalPages: 1 },
  });

  /** Odgovori na sve upite čekiranja koji čekaju (za testove koji gledaju samo broj prisutnih). */
  const odgovoriCekiranje = () => http.match('api/predavanja/5/cekiranje').forEach(r => r.flush(info('5.aaaaaaaaaaaaaaaaaaaaaa')));

  it('tema, "Predavanje N · Predmet · Grupa" i broj prisutnih bez imena; osvežava se na 10 s', async () => {
    const f = TestBed.createComponent(PredavanjeProjektor);
    f.componentRef.setInput('id', '5');
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('api/predavanja/5').flush(predavanje([akt(1, 'Ana'), akt(2, 'Marko')]));
    // studenti grupe jednom (za isti broj kao u zaglavlju: iz grupe + stariji)
    http.expectOne(r => r.url === 'api/studenti/pretraga' && r.params.get('grupaId') === '4').flush(grupaStudenata([1, 2, 3, 4]));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Petlje i uslovi');
    expect(el.textContent).toContain('Predavanje 12 · Uvod u primenu računara · GD-2025');
    expect(el.querySelector('[data-prisutnih] .vrednost')?.textContent?.trim()).toBe('2');
    expect(el.querySelector('[data-prisutnih] .labela')?.textContent?.trim()).toBe('prisutno od 4');
    expect(el.querySelector('[data-stariji]')).toBeNull();
    expect(el.textContent).not.toContain('Ana');
    expect(el.textContent).not.toContain('GD1');

    odgovoriCekiranje();
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_MS);
    odgovoriCekiranje();
    // student 9 nije u grupi: stariji, kao "+1" (isto kao zaglavlje detalja)
    http.expectOne('api/predavanja/5').flush(predavanje([akt(1, 'Ana'), akt(2, 'Marko'), akt(3, 'Iva'), akt(9, 'Tamara')]));
    f.detectChanges();
    expect(el.querySelector('[data-prisutnih] .vrednost')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('[data-stariji]')?.textContent?.trim()).toBe('+1 stariji student');

    // neuspelo osvežavanje ostavlja poslednji broj
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_MS);
    odgovoriCekiranje();
    http.expectOne('api/predavanja/5').flush(null, { status: 0, statusText: 'Mreža' });
    f.detectChanges();
    expect(el.querySelector('[data-prisutnih] .vrednost')?.textContent?.trim()).toBe('3');
    odgovoriCekiranje();
    f.destroy();
  });

  it('crtaQrSaLinkomCekiranja: QR, adresa ispod njega i "Čekirano: N" bez imena', async () => {
    const f = await otvori();
    http.expectOne('api/predavanja/5/cekiranje').flush(info('5.AAAAAAAAAAAAAAAAAAAAAA', 2));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    const link = linkCekiranja('5.AAAAAAAAAAAAAAAAAAAAAA');
    expect(link).toMatch(/\/nalog\/cas\/5\.A{22}$/);
    expect(qrTekst(f)).toBe('QR kod: ' + link);
    expect(el(f).querySelector('[data-adresa-cekiranja]')?.textContent?.trim()).toBe(link);
    expect(el(f).querySelector('[data-cekirano]')?.textContent?.trim()).toBe('Čekirano: 2');
    expect(el(f).textContent).toContain('Skeniraj telefonom da potvrdiš prisustvo');
    expect(el(f).textContent).not.toContain('Anić');
    f.destroy();
  });

  it('menjaQrKadSeTokenPromeni: novi token na 3 s; neuspeo upit ostavlja poslednji QR', async () => {
    const f = await otvori();
    http.expectOne('api/predavanja/5/cekiranje').flush(info('5.AAAAAAAAAAAAAAAAAAAAAA', 1));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(CEKIRANJE_MS);
    http.expectOne('api/predavanja/5/cekiranje').flush(info('5.BBBBBBBBBBBBBBBBBBBBBB', 3));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(qrTekst(f)).toBe('QR kod: ' + linkCekiranja('5.BBBBBBBBBBBBBBBBBBBBBB'));
    expect(el(f).querySelector('[data-cekirano]')?.textContent?.trim()).toBe('Čekirano: 3');

    await vi.advanceTimersByTimeAsync(CEKIRANJE_MS);
    http.expectOne('api/predavanja/5/cekiranje').flush(null, { status: 0, statusText: 'Mreža' });
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(qrTekst(f)).toBe('QR kod: ' + linkCekiranja('5.BBBBBBBBBBBBBBBBBBBBBB'));
    f.destroy();
  });

  it('bezQrZaZavrseno: završeno predavanje ne pita za token i nema QR', async () => {
    const f = await otvori(true);
    await vi.advanceTimersByTimeAsync(CEKIRANJE_MS * 2);
    http.expectNone('api/predavanja/5/cekiranje');
    expect(el(f).querySelector('app-qr-kod')).toBeNull();
    f.destroy();
  });

  it('bez QR-a kad server vrati token null', async () => {
    const f = await otvori();
    http.expectOne('api/predavanja/5/cekiranje').flush(info(null));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(el(f).querySelector('app-qr-kod')).toBeNull();
    expect(el(f).querySelector('[data-cekirano]')).toBeNull();
    f.destroy();
  });

  it('upozorenjeZaDrugiDatum', async () => {
    const f = await otvori();
    http.expectOne('api/predavanja/5/cekiranje').flush(info('5.AAAAAAAAAAAAAAAAAAAAAA', 0, true));
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(el(f).querySelector('[data-drugi-datum]')?.textContent?.trim()).toBe('Ovo predavanje je od 14. 10. Da li si hteo novo predavanje?');
    f.destroy();
  });

  it('neZoveApiDokJeTabSkriven', async () => {
    skriven = true;
    const f = await otvori();
    await vi.advanceTimersByTimeAsync(CEKIRANJE_MS * 2);
    http.expectNone('api/predavanja/5/cekiranje');
    skriven = false;
    await vi.advanceTimersByTimeAsync(CEKIRANJE_MS);
    http.expectOne('api/predavanja/5/cekiranje').flush(info('5.AAAAAAAAAAAAAAAAAAAAAA'));
    f.destroy();
  });
});

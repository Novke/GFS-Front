import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TemaVezbanja, ZadatakVezbanja } from '../data-access/portal.models';
import { VezbanjePage } from './vezbanje.page';

const STABLO = 'api/public/nalog/predmeti/3/vezbanje';
const NOVI = 'api/public/nalog/vezbanje';

const TEME: TemaVezbanja[] = [{
  naziv: 'Konverzije',
  tipovi: [{ tipId: 5, naziv: 'Binarni u dekadni', putanja: ['Brojni sistemi'], poNivou: [2, 3, 0], ukupno: 5, papir: false, provereno: 4, tacno: 3 }],
}];

const ZADATAK: ZadatakVezbanja = {
  pokusajId: 41, tipId: 5, tip: 'Binarni u dekadni', tema: 'Konverzije', nivo: 2, svgId: 'svg-41',
  polja: [{ kljuc: 'a', oznaka: 'vrednost', tip: 'BROJ', odstupanje: null, odstupanjeTip: null, jedinica: null,
    zanemariVelicinu: null, zanemariRazmake: null, opcije: null }],
};

/** Vežbanje tipa (spec studentskog dela 5.4): bez bodova, tip mora biti otvoren grupi studenta. */
describe('VezbanjePage', () => {
  let fixture: ComponentFixture<VezbanjePage>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvori(tipId = '5', nivo: string | null = null): Promise<void> {
    fixture = TestBed.createComponent(VezbanjePage);
    fixture.componentRef.setInput('id', '3');
    fixture.componentRef.setInput('tipId', tipId);
    fixture.componentRef.setInput('nivo', nivo);
    fixture.detectChanges();
    await stabilno();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  it('otvoren tip: naziv, učinak, nivoi sa brojem; odmah izvuče zadatak svih nivoa', async () => {
    await otvori();
    http.expectOne(STABLO).flush(TEME);
    const req = http.expectOne(NOVI);
    expect(req.request.body).toEqual({ tipId: 5, nivo: null });
    req.flush(ZADATAK);
    await stabilno();
    expect(el().querySelector('h2')?.textContent).toBe('Binarni u dekadni');
    expect(el().querySelector('[data-ucinak]')?.textContent).toContain('3 od 4 tačno');
    expect(el().querySelector<HTMLButtonElement>('[data-nivo="3"]')!.disabled).toBe(true);
    expect(el().querySelector('img[data-svg="zadatak"]')).not.toBeNull();
  });

  it('tip koji nije otvoren grupi: poruka, bez zahteva za zadatak', async () => {
    await otvori('99');
    http.expectOne(STABLO).flush(TEME);
    await stabilno();
    expect(el().querySelector('[data-nije-otvoren]')?.textContent).toContain('nije otvoren za vežbanje');
    http.expectNone(NOVI);
  });

  it('neispravan id u ruti: poruka bez ijednog zahteva', async () => {
    await otvori('abc');
    http.expectNone(STABLO);
    expect(el().querySelector('[data-nije-otvoren]')).not.toBeNull();
  });

  it('nivo iz upita ide u zahtev; promena nivoa izvlači novi zadatak tog nivoa', async () => {
    await otvori('5', '1');
    http.expectOne(STABLO).flush(TEME);
    http.expectOne(NOVI).flush({ ...ZADATAK, nivo: 1 });
    await stabilno();
    el().querySelector<HTMLButtonElement>('[data-nivo="2"]')!.click();
    const req = http.expectOne(NOVI);
    expect(req.request.body).toEqual({ tipId: 5, nivo: 2 });
    req.flush({ ...ZADATAK, pokusajId: 42 });
  });

  it('provera i rešenje idu preko id-ja pokušaja; prva provera ulazi u učinak', async () => {
    await otvori();
    http.expectOne(STABLO).flush(TEME);
    http.expectOne(NOVI).flush(ZADATAK);
    await stabilno();
    const input = el().querySelector<HTMLInputElement>('input[data-polje="a"]')!;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('[data-proveri]')!.click();
    const p = http.expectOne('api/public/nalog/vezbanje/41/provera');
    expect(p.request.body).toEqual({ polja: { a: '42' } });
    p.flush({ tacno: true, ishod: { a: true } });
    await stabilno();
    expect(el().querySelector('[data-ucinak]')?.textContent).toContain('4 od 5 tačno');
    el().querySelector<HTMLButtonElement>('[data-resenje]')!.click();
    http.expectOne('api/public/nalog/vezbanje/41/resenje').flush({ resenjeSvgId: 'r-41', tacneVrednosti: {} });
    await stabilno();
    expect(el().querySelector('img[data-svg="resenje"]')).not.toBeNull();
  });

  it('"Sledeći zadatak" traži novo izvlačenje (novi: true); otvaranje strane ne', async () => {
    await otvori();
    http.expectOne(STABLO).flush(TEME);
    const prvi = http.expectOne(NOVI);
    expect(prvi.request.body).toEqual({ tipId: 5, nivo: null });
    prvi.flush(ZADATAK);
    await stabilno();
    el().querySelector<HTMLButtonElement>('[data-sledeci]')!.click();
    const req = http.expectOne(NOVI);
    expect(req.request.body).toEqual({ tipId: 5, nivo: null, novi: true });
    req.flush({ ...ZADATAK, pokusajId: 42 });
  });

  it('zadatak na času (409 na proveri): poruka servera, zadatak ostaje', async () => {
    await otvori();
    http.expectOne(STABLO).flush(TEME);
    http.expectOne(NOVI).flush(ZADATAK);
    await stabilno();
    el().querySelector<HTMLButtonElement>('[data-resenje]')!.click();
    http.expectOne('api/public/nalog/vezbanje/41/resenje')
      .flush({ reason: 'Ovaj zadatak je upravo na času; pokušaj posle.' }, { status: 409, statusText: 'Conflict' });
    await stabilno();
    expect(el().querySelector('[data-greska]')?.textContent).toContain('upravo na času');
    expect(el().querySelector('img[data-svg="zadatak"]')).not.toBeNull();
  });

  it('provera posle rešenja ne ulazi u učinak sesije', async () => {
    await otvori();
    http.expectOne(STABLO).flush(TEME);
    http.expectOne(NOVI).flush(ZADATAK);
    await stabilno();
    const pre = el().querySelector('[data-ucinak]')?.textContent;
    el().querySelector<HTMLButtonElement>('[data-resenje]')!.click();
    http.expectOne('api/public/nalog/vezbanje/41/resenje').flush({ resenjeSvgId: 'r-41', tacneVrednosti: {} });
    await stabilno();
    const input = el().querySelector<HTMLInputElement>('input[data-polje="a"]')!;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('[data-proveri]')!.click();
    http.expectOne('api/public/nalog/vezbanje/41/provera').flush({ tacno: true, ishod: { a: true } });
    await stabilno();
    expect(el().querySelector('[data-ucinak]')?.textContent).toBe(pre);
  });

  it('409 (nema zadataka tog nivoa): poruka servera i "Novi zadatak"', async () => {
    await otvori('5', '2');
    http.expectOne(STABLO).flush(TEME);
    http.expectOne(NOVI).flush({ reason: 'Za ovaj nivo nema zadataka.' }, { status: 409, statusText: 'Conflict' });
    await stabilno();
    expect(el().querySelector('[data-greska]')?.textContent).toContain('Za ovaj nivo nema zadataka.');
    expect(el().textContent).toContain('Novi zadatak');
  });

  it('404 na proveri (tip zatvoren u međuvremenu): poruka "nije otvoren"', async () => {
    await otvori();
    http.expectOne(STABLO).flush(TEME);
    http.expectOne(NOVI).flush(ZADATAK);
    await stabilno();
    el().querySelector<HTMLButtonElement>('[data-resenje]')!.click();
    http.expectOne('api/public/nalog/vezbanje/41/resenje').flush({ reason: 'Nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(el().querySelector('[data-nije-otvoren]')).not.toBeNull();
    expect(el().querySelector('img[data-svg="zadatak"]')).toBeNull();
  });
});

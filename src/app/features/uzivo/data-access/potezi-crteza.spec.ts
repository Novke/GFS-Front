import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { infoSlajd, platnoSlajd } from './izvodjenje-podaci.testing';
import { platnoSaAnimacijama } from './platno-podaci.testing';
import type { CrtezSloj, Potez, Sloj } from './platno.models';
import { PONOVI_POSLE_MS, PoteziCrteza, primeniPoteze, skalirajPoteze } from './potezi-crteza';
import type { PoteziSloja, SlajdDetails } from './uzivo.models';

const potez = (tacke: number[]): Potez => ({ boja: '#C00000', debljina: 3, tacke });

const crtez = (id: string, medijId: string, deo: Partial<CrtezSloj> = {}): CrtezSloj => ({
  id, naziv: null, x: 10, y: 10, sirina: 100, visina: 50, rotacija: 0, providnost: 1, zakljucan: false, senka: null,
  tip: 'CRTEZ', medijId, potezi: null, ...deo,
});

const slajdSa = (id: number, ...slojevi: Sloj[]): SlajdDetails => platnoSlajd({ id, platno: platnoSaAnimacijama([], slojevi) });

const unos = (slojId: string, medijId: string, potezi: Potez[] | null, sirina = 100, visina = 50): PoteziSloja =>
  ({ slojId, medijId, sirina, visina, potezi });

const kes = (...unosi: PoteziSloja[]) => new Map(unosi.map((e) => [`${e.slojId}|${e.medijId}`, e]));

const crtezi = (s: SlajdDetails | null) => (s?.platno?.slojevi ?? []).filter((sl): sl is CrtezSloj => sl.tip === 'CRTEZ');

describe('skalirajPoteze', () => {
  it('linearno na novu veličinu sloja (x po širini, y po visini)', () => {
    const rez = skalirajPoteze([potez([10, 5, 20, 10])], { sirina: 100, visina: 50 }, { sirina: 200, visina: 100 });
    expect(rez).toEqual([potez([20, 10, 40, 20])]);
  });

  it('ista veličina: isti niz (bez kopije)', () => {
    const potezi = [potez([10, 5, 20, 10])];
    expect(skalirajPoteze(potezi, { sirina: 100, visina: 50 }, { sirina: 100, visina: 50 })).toBe(potezi);
  });

  it('zaokružuje na desetinu, a nulta polazna veličina ne deli nulom', () => {
    expect(skalirajPoteze([potez([1, 1])], { sirina: 3, visina: 3 }, { sirina: 1, visina: 2 })[0].tacke).toEqual([0.3, 0.7]);
    expect(skalirajPoteze([potez([7, 8])], { sirina: 0, visina: 0 }, { sirina: 50, visina: 50 })[0].tacke).toEqual([7, 8]);
  });
});

describe('primeniPoteze', () => {
  const tacke = [potez([10, 5, 20, 10])];

  it('bez keša: isti objekat', () => {
    const s = slajdSa(52, crtez('c1', 'm1'));
    expect(primeniPoteze(s, undefined)).toBe(s);
  });

  it('CRTEZ bez poteza dobija poteze unosa istog slojId i medijId', () => {
    const s = slajdSa(52, crtez('c1', 'm1'));
    const rez = primeniPoteze(s, kes(unos('c1', 'm1', tacke)));
    expect(rez).not.toBe(s);
    expect(crtezi(rez)[0].potezi).toEqual(tacke);
    expect(crtezi(s)[0].potezi).toBeNull();   // snimak se ne menja
  });

  it('sloj u snimku promenjene veličine (200 x 100): skalirani potezi', () => {
    const s = slajdSa(52, crtez('c1', 'm1', { sirina: 200, visina: 100 }));
    const rez = primeniPoteze(s, kes(unos('c1', 'm1', tacke)));
    expect(crtezi(rez)[0].potezi).toEqual([potez([20, 10, 40, 20])]);
  });

  it('drugi crtež na istom id-ju (unos c1|m2): sloj ostaje bez poteza, isti objekat', () => {
    const s = slajdSa(52, crtez('c1', 'm1'));
    const rez = primeniPoteze(s, kes(unos('c1', 'm2', tacke)));
    expect(rez).toBe(s);
    expect(crtezi(rez)[0].potezi).toBeNull();
  });

  it('unos sa potezi: null (crtež bez vektora): ostaje slika', () => {
    const s = slajdSa(52, crtez('c1', 'm1'));
    expect(primeniPoteze(s, kes(unos('c1', 'm1', null)))).toBe(s);
  });

  it('sloj koji već ima poteze ostaje svoj; samo onaj bez poteza dobija iz keša', () => {
    const svoji = [potez([1, 2, 3, 4])];
    const s = slajdSa(52, crtez('c1', 'm1', { potezi: svoji }), crtez('c2', 'm2'));
    const rez = primeniPoteze(s, kes(unos('c1', 'm1', tacke), unos('c2', 'm2', tacke)));
    expect(crtezi(rez)[0].potezi).toBe(svoji);
    expect(crtezi(rez)[1].potezi).toEqual(tacke);
  });

  it('INFO slajd: isti objekat', () => {
    const s = infoSlajd();
    expect(primeniPoteze(s, kes(unos('c1', 'm1', tacke)))).toBe(s);
  });
});

describe('PoteziCrteza', () => {
  let http: HttpTestingController;
  let potezi: PoteziCrteza;
  const tacke = [potez([10, 5, 20, 10])];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    potezi = TestBed.inject(PoteziCrteza);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('jedan GET api/slajdovi/52/potezi (LOCAL_ERRORS); drugi ucitaj istog slajda ne šalje; odgovor -> saPotezima ima poteze', () => {
    const s = slajdSa(52, crtez('c1', 'm1'));
    potezi.ucitaj(s);
    potezi.ucitaj(s);
    const req = http.expectOne('api/slajdovi/52/potezi');
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(crtezi(potezi.saPotezima(s))[0].potezi).toBeNull();   // dok zahtev traje: slika
    req.flush([unos('c1', 'm1', tacke)]);
    expect(crtezi(potezi.saPotezima(s))[0].potezi).toEqual(tacke);
    potezi.ucitaj(s);
    http.expectNone('api/slajdovi/52/potezi');
  });

  it('null, INFO i PLATNO bez CRTEZ-a: bez zahteva; saPotezima(null) je null', () => {
    potezi.ucitaj(null);
    potezi.ucitaj(infoSlajd());
    potezi.ucitaj(slajdSa(53));
    http.expectNone(() => true);
    expect(potezi.saPotezima(null)).toBeNull();
  });

  it('CRTEZ koji već ima poteze (pun dokument): bez zahteva', () => {
    potezi.ucitaj(slajdSa(52, crtez('c1', 'm1', { potezi: tacke })));
    http.expectNone(() => true);
  });

  it('isti slajd sa novim CRTEZ c2: nov zahtev; keš zadržava oba unosa', () => {
    potezi.ucitaj(slajdSa(52, crtez('c1', 'm1')));
    http.expectOne('api/slajdovi/52/potezi').flush([unos('c1', 'm1', tacke)]);
    const posle = slajdSa(52, crtez('c1', 'm1'), crtez('c2', 'm2'));
    potezi.ucitaj(posle);
    http.expectOne('api/slajdovi/52/potezi').flush([unos('c1', 'm1', tacke), unos('c2', 'm2', tacke)]);
    expect(crtezi(potezi.saPotezima(posle)).map((c) => c.potezi)).toEqual([tacke, tacke]);
  });

  it('isti sloj sa drugim medijId (paste drugog crteža na isti id): nov zahtev, nikad tuđi potezi', () => {
    potezi.ucitaj(slajdSa(52, crtez('c1', 'm1')));
    http.expectOne('api/slajdovi/52/potezi').flush([unos('c1', 'm1', tacke)]);
    const drugi = slajdSa(52, crtez('c1', 'm2'));
    expect(crtezi(potezi.saPotezima(drugi))[0].potezi).toBeNull();
    potezi.ucitaj(drugi);
    http.expectOne('api/slajdovi/52/potezi');
  });

  it.each([
    [500, 'Internal Server Error'],
    [404, 'Not Found'],
  ])('odgovor %i: slika ostaje, odmah ponovljen ucitaj ne šalje, posle PONOVI_POSLE_MS šalje', (status, statusText) => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = slajdSa(52, crtez('c1', 'm1'));
    potezi.ucitaj(s);
    http.expectOne('api/slajdovi/52/potezi').flush({ reason: 'x' }, { status, statusText });
    expect(upozorenje).toHaveBeenCalledTimes(1);
    expect(crtezi(potezi.saPotezima(s))[0].potezi).toBeNull();
    potezi.ucitaj(s);
    http.expectNone('api/slajdovi/52/potezi');
    vi.advanceTimersByTime(PONOVI_POSLE_MS - 1);
    potezi.ucitaj(s);
    http.expectNone('api/slajdovi/52/potezi');
    vi.advanceTimersByTime(1);
    potezi.ucitaj(s);
    http.expectOne('api/slajdovi/52/potezi').flush([unos('c1', 'm1', tacke)]);
    expect(crtezi(potezi.saPotezima(s))[0].potezi).toEqual(tacke);
    expect(PONOVI_POSLE_MS).toBe(10_000);
    upozorenje.mockRestore();
  });

  it('odgovor bez traženog sloja (obrisan dok je zahtev trajao): nema novog zahteva za njega, ostaje slika', () => {
    const s = slajdSa(52, crtez('c1', 'm1'));
    potezi.ucitaj(s);
    http.expectOne('api/slajdovi/52/potezi').flush([]);
    potezi.ucitaj(s);
    http.expectNone('api/slajdovi/52/potezi');
    expect(potezi.saPotezima(s)).toBe(s);
  });

  it('keš je po slajdu: isti slojId|medijId na drugom slajdu traži sopstveni zahtev', () => {
    potezi.ucitaj(slajdSa(52, crtez('c1', 'm1')));
    http.expectOne('api/slajdovi/52/potezi').flush([unos('c1', 'm1', tacke)]);
    const drugi = slajdSa(60, crtez('c1', 'm1'));
    expect(crtezi(potezi.saPotezima(drugi))[0].potezi).toBeNull();
    potezi.ucitaj(drugi);
    http.expectOne('api/slajdovi/60/potezi');
  });
});

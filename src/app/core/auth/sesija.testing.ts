import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SesijaStore } from './sesija.store';

/**
 * Za specove koji idu kroz prave rute (`app.routes.ts`, čuvar `nastavnikGuard`): pravi `SesijaStore` dobija uspešan
 * `GET api/auth/ja`, pa je nastavnik prijavljen i čuvar više ne šalje zahteve. Traži `provideHttpClientTesting()`.
 */
export async function prijaviNastavnika(korisnik = 'nastavnik'): Promise<void> {
  const provera = TestBed.inject(SesijaStore).proveri();
  TestBed.inject(HttpTestingController).expectOne('api/auth/ja').flush({ uloga: 'NASTAVNIK', korisnik });
  await provera;
}

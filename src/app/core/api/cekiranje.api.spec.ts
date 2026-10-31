import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from './api-error';
import { CekiranjeApi, linkCekiranja } from './cekiranje.api';

describe('linkCekiranja', () => {
  it('javna ruta nalog/cas/<token> relativno na <base href>', () => {
    expect(linkCekiranja('5.AAAAAAAAAAAAAAAAAAAAAA', 'https://gfs.trif.rs/')).toBe('https://gfs.trif.rs/nalog/cas/5.AAAAAAAAAAAAAAAAAAAAAA');
    expect(linkCekiranja('17.b-_cdefghijklmnopqrstu', 'https://gfs.dev.trif.rs/')).toBe('https://gfs.dev.trif.rs/nalog/cas/17.b-_cdefghijklmnopqrstu');
    expect(linkCekiranja('5.x', 'http://novica-dev/gfs/')).toBe('http://novica-dev/gfs/nalog/cas/5.x');
  });
});

describe('CekiranjeApi', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('info: GET api/predavanja/{id}/cekiranje, uvek tiho', () => {
    TestBed.inject(CekiranjeApi).info(7).subscribe();
    const r = http.expectOne('api/predavanja/7/cekiranje');
    expect(r.request.method).toBe('GET');
    expect(r.request.context.get(LOCAL_ERRORS)).toBe(true);
    r.flush({ token: null, vaziDoMs: null, serverVremeMs: 0, datumNijeDanas: false, cekirani: [] });
    http.verify();
  });
});

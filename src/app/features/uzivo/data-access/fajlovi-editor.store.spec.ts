import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import { MAX_FAJL_BAJTOVA } from '../../../shared/util/fajlovi';
import { FajloviEditorStore, greskaFajla } from './fajlovi-editor.store';
import { fajlInfo } from './fajlovi.testing';
import { FajloviPrezentacijeApi } from './fajlovi-prezentacije.api';

describe('greskaFajla', () => {
  it('prihvata dozvoljene ekstenzije bez obzira na velika slova, odbija ostale, prazne i prevelike', () => {
    expect(greskaFajla({ name: 'A.DOCX', size: 10 })).toBeNull();
    expect(greskaFajla({ name: 'a.exe', size: 10 })).toContain('Dozvoljeni');
    expect(greskaFajla({ name: 'a.pdf', size: 0 })).toContain('prazan');
    expect(greskaFajla({ name: 'a.zip', size: MAX_FAJL_BAJTOVA })).toBeNull();
    expect(greskaFajla({ name: 'a.zip', size: MAX_FAJL_BAJTOVA + 1 })).toContain('10 MB');
  });
});

describe('FajloviEditorStore', () => {
  const api = {
    lista: vi.fn(), dodaj: vi.fn(), izmeni: vi.fn(), redosled: vi.fn(), obrisi: vi.fn(),
  };
  const poruke = { uspeh: vi.fn(), greska: vi.fn() };
  let store: InstanceType<typeof FajloviEditorStore>;

  beforeEach(() => {
    Object.values(api).forEach(f => f.mockReset());
    poruke.uspeh.mockReset();
    poruke.greska.mockReset();
    TestBed.configureTestingModule({
      providers: [FajloviEditorStore, { provide: FajloviPrezentacijeApi, useValue: api }, { provide: NotificationStore, useValue: poruke }],
    });
    store = TestBed.inject(FajloviEditorStore);
    api.lista.mockReturnValue(of([fajlInfo({ id: 1, slajdId: 11, slajdRb: 2 }), fajlInfo({ id: 2, slajdId: 11, slajdRb: 2 }), fajlInfo({ id: 3 })]));
    store.ucitaj(7);
  });

  it('učitava spisak i broji fajlove po slajdu (fajl uz celu prezentaciju se ne broji)', () => {
    expect(api.lista).toHaveBeenCalledWith(7);
    expect(store.fajlovi().length).toBe(3);
    expect(store.poSlajdu().get(11)).toBe(2);
    expect(store.poSlajdu().size).toBe(1);
  });

  it('greška učitavanja daje poruku u stanju', () => {
    api.lista.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { reason: 'Nije pronađeno.' } })));
    store.ucitaj(8);
    expect(store.greska()).toBe('Nije pronađeno.');
    expect(store.fajlovi()).toEqual([]);
  });

  it('dodaj: neispravan fajl se ne šalje, ispravan se dodaje na kraj', () => {
    store.dodaj(new File(['x'], 'virus.exe'), null);
    expect(api.dodaj).not.toHaveBeenCalled();
    expect(poruke.greska).toHaveBeenCalled();

    const novi = fajlInfo({ id: 9, naziv: 'nov.pdf', vrsta: 'PDF' });
    api.dodaj.mockReturnValue(of(novi));
    const fajl = new File(['x'], 'nov.pdf');
    store.dodaj(fajl, 11);
    expect(api.dodaj).toHaveBeenCalledWith(7, fajl, 11);
    expect(store.fajlovi().at(-1)).toBe(novi);
    expect(poruke.uspeh).toHaveBeenCalled();
  });

  it('izmeni: bez promene ne zove server; prazan naziv je greška; odgovor menja red', () => {
    const f = store.fajlovi()[0];
    store.izmeni(f, f.naziv, f.slajdId);
    store.izmeni(f, '   ', f.slajdId);
    expect(api.izmeni).not.toHaveBeenCalled();
    expect(poruke.greska).toHaveBeenCalledTimes(1);

    api.izmeni.mockReturnValue(of({ ...f, naziv: 'drugo.docx', slajdId: null, slajdRb: null }));
    store.izmeni(f, ' drugo.docx ', null);
    expect(api.izmeni).toHaveBeenCalledWith(f.id, { naziv: 'drugo.docx', slajdId: null });
    expect(store.fajlovi()[0].naziv).toBe('drugo.docx');
    expect(store.poSlajdu().get(11)).toBe(1);
  });

  it('pomeri šalje ceo novi redosled; na kraju liste ne šalje ništa', () => {
    store.pomeri(1, -1);
    expect(api.redosled).not.toHaveBeenCalled();
    const kopija = [...store.fajlovi()];
    api.redosled.mockReturnValue(of([kopija[1], kopija[0], kopija[2]]));
    store.pomeri(1, 1);
    expect(api.redosled).toHaveBeenCalledWith(7, [2, 1, 3]);
    expect(store.fajlovi().map(f => f.id)).toEqual([2, 1, 3]);
  });

  it('obriši uklanja fajl, a greška servera ide u red poruka i ostavlja listu', () => {
    api.obrisi.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    store.obrisi(2);
    expect(store.fajlovi().length).toBe(3);
    expect(poruke.greska).toHaveBeenCalledWith('Fajl nije obrisan.');
    api.obrisi.mockReturnValueOnce(of(undefined));
    store.obrisi(2);
    expect(store.fajlovi().map(f => f.id)).toEqual([1, 3]);
  });
});

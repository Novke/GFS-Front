import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationStore } from '../../../core/state/notification.store';
import { EditorStore, NijeSacuvano } from './editor.store';
import { PrezentacijaDetails, SlajdCmd, SlajdDetails } from './uzivo.models';
import { isprazniMikrozadatke, pomeriSat, saLaznimSatom } from '../lazni-sat.testing';

function slajd(id: number, rb: number, naslov = `Slajd ${id}`): SlajdDetails {
  return { id, rb, tip: 'INFO', naslov, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null };
}

function prezentacija(slajdovi: SlajdDetails[]): PrezentacijaDetails {
  return {
    id: 1, naziv: 'Statika', opis: null, predmet: { id: 7, naziv: 'Mehanika' }, brojSlajdova: slajdovi.length,
    brojPitanja: 0, izmenjeno: '2026-10-07T10:00:00', takmicenje: false, telefonPrikaz: 'DUGMAD',
    detaljiDozvoljeni: true, brojIzvodjenja: 0, aktivnoIzvodjenjeId: null, slajdovi,
  };
}

function info(naslov: string): SlajdCmd {
  return { tip: 'INFO', naslov, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null };
}

describe('EditorStore', () => {
  let store: InstanceType<typeof EditorStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function ucitaj(): void {
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush(prezentacija([slajd(11, 1), slajd(12, 2), slajd(13, 3)]));
  }

  const ids = () => store.slajdovi().map(s => s.id);

  it('ucitaj postavlja prezentaciju i bira prvi slajd', () => {
    ucitaj();
    expect(ids()).toEqual([11, 12, 13]);
    expect(store.izabraniId()).toBe(11);
    expect(store.cuvanje()).toBe('miruje');
  });

  it('pomeri(0, 2) menja redosled odmah i šalje PUT redosled sa novim id-jevima', () => {
    ucitaj();
    store.pomeri(0, 2);
    expect(ids()).toEqual([12, 13, 11]);
    expect(store.slajdovi().map(s => s.rb)).toEqual([1, 2, 3]);
    const req = http.expectOne('api/prezentacije/1/redosled');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ slajdIds: [12, 13, 11] });
    expect(store.cuvanje()).toBe('cuva');
    req.flush(prezentacija([slajd(12, 1), slajd(13, 2), slajd(11, 3)]));
    expect(ids()).toEqual([12, 13, 11]);
    expect(store.cuvanje()).toBe('sacuvano');
  });

  it('neuspeo redosled vraća stari redosled i pokazuje razlog', () => {
    ucitaj();
    store.pomeri(0, 2);
    http.expectOne('api/prezentacije/1/redosled').flush(
      { reason: 'Redosled mora sadržati tačno sve slajdove prezentacije.' }, { status: 400, statusText: 'Bad Request' });
    expect(ids()).toEqual([11, 12, 13]);
    expect(store.cuvanje()).toBe('greska');
    expect(store.greska()).toBe('Redosled mora sadržati tačno sve slajdove prezentacije.');
  });

  it('dve izmene istog slajda u 800 ms -> jedan PUT sa poslednjom izmenom', saLaznimSatom(async () => {
    ucitaj();
    store.izmeniSlajd(11, info('Prvo'));
    await pomeriSat(300);
    store.izmeniSlajd(11, info('Drugo'));
    expect(store.slajdovi()[0].naslov).toBe('Drugo');
    await pomeriSat(799);
    http.expectNone('api/slajdovi/11');
    await pomeriSat(1);
    const req = http.expectOne('api/slajdovi/11');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.naslov).toBe('Drugo');
    req.flush(slajd(11, 1, 'Drugo'));
    expect(store.cuvanje()).toBe('sacuvano');
  }));

  it('izmene različitih slajdova se čuvaju nezavisno', saLaznimSatom(async () => {
    ucitaj();
    store.izmeniSlajd(11, info('A'));
    store.izmeniSlajd(12, info('B'));
    await pomeriSat(800);
    http.expectOne('api/slajdovi/11').flush(slajd(11, 1, 'A'));
    http.expectOne('api/slajdovi/12').flush(slajd(12, 2, 'B'));
  }));

  it('promena izabranog slajda odmah šalje nesačuvanu izmenu', saLaznimSatom(async () => {
    ucitaj();
    store.izmeniSlajd(11, info('Izmena'));
    await pomeriSat(100);
    store.izaberi(12);
    const req = http.expectOne('api/slajdovi/11');
    expect(req.request.body.naslov).toBe('Izmena');
    req.flush(slajd(11, 1, 'Izmena'));
    expect(store.izabraniId()).toBe(12);
    await pomeriSat(800);
  }));

  it('sacuvajOdmah (Ctrl+S) šalje bez čekanja', saLaznimSatom(async () => {
    ucitaj();
    store.izmeniSlajd(12, info('Odmah'));
    store.sacuvajOdmah();
    http.expectOne('api/slajdovi/12').flush(slajd(12, 2, 'Odmah'));
    await pomeriSat(800);
  }));

  it('neispravan slajd se ne šalje, a greška kaže zašto', saLaznimSatom(async () => {
    ucitaj();
    store.izmeniSlajd(11, info(''));
    await pomeriSat(800);
    http.expectNone('api/slajdovi/11');
    expect(store.cuvanje()).toBe('greska');
    expect(store.greska()).toContain('Info slajd mora imati naslov, tekst ili sliku.');
  }));

  it('odgovor servera zamenjuje lokalni slajd (novi id-jevi opcija)', saLaznimSatom(async () => {
    ucitaj();
    const cmd: SlajdCmd = {
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false,
      pitanje: {
        tip: 'JEDAN_TACAN', tekst: 'Pitanje?', slikaId: null, vremeSekunde: null,
        opcije: [{ tekst: 'a', tacna: true }, { tekst: 'b', tacna: false }], brojTacno: null, brojOdstupanje: null,
        odstupanjeTip: null, jedinica: null, tekstPrikaz: null, prihvatljiviOdgovori: [], skalaMinOznaka: null,
        skalaMaxOznaka: null,
      },
    };
    store.izmeniSlajd(13, cmd);
    await pomeriSat(800);
    const odServera: SlajdDetails = {
      ...slajd(13, 3), tip: 'PITANJE', naslov: null,
      pitanje: {
        id: 5, tip: 'JEDAN_TACAN', tekst: 'Pitanje?', slika: null, vremeSekunde: null,
        opcije: [{ id: 901, rb: 1, tekst: 'a', tacna: true }, { id: 902, rb: 2, tekst: 'b', tacna: false }],
        brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
        prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
      },
    };
    http.expectOne('api/slajdovi/13').flush(odServera);
    expect(store.slajdovi()[2].pitanje?.opcije.map(op => op.id)).toEqual([901, 902]);
  }));

  it('dodaj pravi lokalni nacrt posle izabranog; prva ispravna izmena ga šalje kao POST posle tog slajda', saLaznimSatom(async () => {
    ucitaj();
    store.izaberi(11);
    store.dodaj('PITANJE', 'TACNO_NETACNO');
    http.expectNone(() => true);
    const nacrt = store.izabrani()!;
    expect(nacrt.id).toBeLessThan(0);
    expect(ids()).toEqual([11, nacrt.id, 12, 13]);
    expect(nacrt.pitanje?.opcije.map(op => [op.tekst, op.tacna])).toEqual([['Tačno', true], ['Netačno', false]]);

    const cmd: SlajdCmd = {
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false,
      pitanje: { ...nacrtPitanje(nacrt), tekst: 'Zemlja je okrugla.' },
    };
    store.izmeniSlajd(nacrt.id, cmd);
    await pomeriSat(800);
    const req = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('posle')).toBe('11');
    req.flush({ ...slajd(20, 2), tip: 'PITANJE', naslov: null, pitanje: { ...nacrt.pitanje!, id: 8, tekst: 'Zemlja je okrugla.' } });
    expect(ids()).toEqual([11, 20, 12, 13]);
    expect(store.izabraniId()).toBe(20);

    // sledeća izmena istog (sada sačuvanog) slajda ide kao PUT na pravi id, i kad stigne sa starim id-jem
    store.izmeniSlajd(nacrt.id, { ...cmd, beleske: 'b' });
    await pomeriSat(800);
    http.expectOne('api/slajdovi/20').flush({ ...slajd(20, 2) });
  }));

  it('brisanje nacrta ne zove server', () => {
    ucitaj();
    store.dodaj('INFO');
    const id = store.izabraniId()!;
    store.obrisi(id);
    http.expectNone(() => true);
    expect(ids()).toEqual([11, 12, 13]);
  });

  it('obrisi sačuvan slajd šalje DELETE i bira suseda', () => {
    ucitaj();
    store.izaberi(12);
    store.obrisi(12);
    expect(ids()).toEqual([11, 13]);
    expect(store.izabraniId()).toBe(13);
    const req = http.expectOne('api/slajdovi/12');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('pomeri preko nacrta šalje samo sačuvane id-jeve', () => {
    ucitaj();
    store.izaberi(13);
    store.dodaj('INFO');
    store.pomeri(3, 0);
    expect(ids()[0]).toBeLessThan(0);
    http.expectNone('api/prezentacije/1/redosled');
    store.pomeri(1, 3);
    expect(http.expectOne('api/prezentacije/1/redosled').request.body).toEqual({ slajdIds: [12, 13, 11] });
  });

  it('neuspelo čuvanje pri izlasku (prelaz na drugu prezentaciju) javlja grešku korisniku', () => {
    const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    ucitaj();
    store.izmeniSlajd(11, info('Pre izlaska'));
    store.ucitaj(2);
    http.expectOne('api/prezentacije/2').flush(prezentacija([slajd(21, 1)]));
    const put = http.expectOne('api/slajdovi/11');
    expect(put.request.body).toMatchObject({ naslov: 'Pre izlaska' });
    put.flush({ reason: 'Slajd nije pronađen.' }, { status: 404, statusText: 'Not Found' });
    expect(greska).toHaveBeenCalledExactlyOnceWith('Izmena slajda nije sačuvana: Slajd nije pronađen.', expect.anything());
    vi.restoreAllMocks();
  });

  describe('sacuvajSve', () => {
    it('završava se tek kad PUT stigne', saLaznimSatom(async () => {
      ucitaj();
      store.izmeniSlajd(11, info('Pre pokretanja'));
      let gotovo = false;
      store.sacuvajSve().subscribe(() => (gotovo = true));
      const req = http.expectOne('api/slajdovi/11');
      await isprazniMikrozadatke();
      expect(gotovo).toBe(false);
      req.flush(slajd(11, 1, 'Pre pokretanja'));
      expect(gotovo).toBe(true);
      await pomeriSat(800);
    }));

    it('bez nesačuvanog se završava odmah', () => {
      ucitaj();
      let gotovo = false;
      store.sacuvajSve().subscribe(() => (gotovo = true));
      expect(gotovo).toBe(true);
    });

    it('neuspelo čuvanje daje grešku sa razlogom servera', saLaznimSatom(async () => {
      ucitaj();
      store.izmeniSlajd(11, info('X'));
      let greska: unknown = null;
      store.sacuvajSve().subscribe({ error: e => (greska = e) });
      http.expectOne('api/slajdovi/11').flush({ reason: 'Slajd nije pronađen.' }, { status: 404, statusText: 'Not Found' });
      expect(greska instanceof NijeSacuvano).toBe(true);
      expect((greska as Error).message).toBe('Slajd nije pronađen.');
      await pomeriSat(800);
    }));

    it('neispravan nacrt daje grešku odmah, bez zahteva', () => {
      ucitaj();
      store.izaberi(13);
      store.dodaj('PITANJE', 'JEDAN_TACAN');
      let greska: unknown = null;
      store.sacuvajSve().subscribe({ error: e => (greska = e) });
      http.expectNone(() => true);
      expect((greska as Error).message).toBe('Slajd 4 nije sačuvan: Tekst pitanja je obavezan (najviše 2000 znakova).');
    });

    it('čeka POST nacrta i izmenu stiglu dok je POST trajao', saLaznimSatom(async () => {
      ucitaj();
      store.izaberi(13);
      store.dodaj('INFO');
      const nacrt = store.izabraniId()!;
      store.izmeniSlajd(nacrt, info('Prvi'));
      let gotovo = false;
      store.sacuvajSve().subscribe(() => (gotovo = true));
      const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
      store.izmeniSlajd(nacrt, info('Drugi'));
      post.flush(slajd(30, 4, 'Prvi'));
      await isprazniMikrozadatke();
      expect(gotovo).toBe(false);
      const put = http.expectOne('api/slajdovi/30');
      expect(put.request.body.naslov).toBe('Drugi');
      put.flush(slajd(30, 4, 'Drugi'));
      expect(gotovo).toBe(true);
      await pomeriSat(800);
    }));
  });
});

function nacrtPitanje(s: SlajdDetails) {
  const p = s.pitanje!;
  return {
    tip: p.tip, tekst: p.tekst, slikaId: null, vremeSekunde: null, opcije: p.opcije.map(o => ({ tekst: o.tekst, tacna: o.tacna })),
    brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
    prihvatljiviOdgovori: [], skalaMinOznaka: null, skalaMaxOznaka: null,
  };
}

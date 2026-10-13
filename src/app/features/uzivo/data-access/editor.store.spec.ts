import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NesacuvaneIzmene } from '../../../core/state/nesacuvane-izmene';
import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja } from '../../../core/state/registar-cuvanja';
import { EditorStore, NijeSacuvano } from './editor.store';
import { PrezentacijaDetails, SlajdCmd, SlajdDetails } from './uzivo.models';
import { novoPlatno } from './platno-novo';
import { platno as platnoFabrika } from './platno-podaci.testing';
import type { Platno } from './platno.models';
import { isprazniMikrozadatke, pomeriSat, saLaznimSatom } from '../lazni-sat.testing';

function slajd(id: number, rb: number, naslov = `Slajd ${id}`): SlajdDetails {
  return { id, rb, tip: 'INFO', naslov, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null, platno: null };
}

function prezentacija(slajdovi: SlajdDetails[]): PrezentacijaDetails {
  return {
    id: 1, naziv: 'Statika', opis: null, predmet: { id: 7, naziv: 'Mehanika' }, brojSlajdova: slajdovi.length,
    brojPitanja: 0, izmenjeno: '2026-10-07T10:00:00', tema: 'NACRT', takmicenje: false, telefonPrikaz: 'DUGMAD',
    detaljiDozvoljeni: true, brojIzvodjenja: 0, aktivnoIzvodjenjeId: null, slajdovi,
  };
}

function info(naslov: string): SlajdCmd {
  return { tip: 'INFO', naslov, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null, platno: null };
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
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, platno: null,
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
      tip: 'PITANJE', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, platno: null,
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

  it('primeniUvoz: slajdovi po rb, izabran prvi uvezen; kasnija izmena postojećeg i dalje ide PUT-om na njegov id', saLaznimSatom(async () => {
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush(prezentacija([slajd(1, 1, 'A'), slajd(2, 2, 'B')]));
    store.izaberi(1);
    // odgovor servera namerno nije poređan po rb
    store.primeniUvoz(prezentacija([slajd(2, 4, 'B'), slajd(6, 3, 'U2'), slajd(1, 1, 'A'), slajd(5, 2, 'U1')]));
    expect(ids()).toEqual([1, 5, 6, 2]);
    expect(store.slajdovi().map(s => s.rb)).toEqual([1, 2, 3, 4]);
    expect(store.izabraniId()).toBe(5);
    expect(store.prezentacija()!.brojSlajdova).toBe(4);
    store.izmeniSlajd(1, info('A izmenjen'));
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/1');
    expect(put.request.method).toBe('PUT');
    put.flush(slajd(1, 1, 'A izmenjen'));
    expect(ids()).toEqual([1, 5, 6, 2]);
  }));

  it('primeniUvoz bez novih slajdova zadržava izbor', () => {
    ucitaj();
    store.izaberi(12);
    store.primeniUvoz(prezentacija([slajd(11, 1), slajd(12, 2), slajd(13, 3)]));
    expect(store.izabraniId()).toBe(12);
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

describe('EditorStore: PLATNO', () => {
  let store: InstanceType<typeof EditorStore>;
  let http: HttpTestingController;
  const P0 = platnoFabrika();
  const P1: Platno = { ...platnoFabrika(), pozadina: { boja: '#EEEEEE', medijId: null } };
  const P2: Platno = { ...platnoFabrika(), pozadina: { boja: '#DDDDDD', medijId: null } };
  const platnoSlajd = (beleske: string | null = null, p: Platno = P0): SlajdDetails => ({
    id: 52, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske, postepeno: false, pitanje: null, platno: p,
  });
  const platnoCmd = (beleske: string | null, p: Platno): SlajdCmd => ({
    tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske, postepeno: false, pitanje: null, platno: p,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({ ...prezentacija([slajd(51, 1), platnoSlajd()]), tema: 'PAPIR' });
  });

  afterEach(() => http.verify());

  it('dodaj(PLATNO) pravi nacrt sa praznim platnom teme i šalje POST odmah (nacrt je ispravan)', saLaznimSatom(async () => {
    store.izaberi(51);
    store.dodaj('PLATNO');
    const nacrt = store.izabrani()!;
    expect(nacrt.id).toBeLessThan(0);
    expect(nacrt.tip).toBe('PLATNO');
    expect(nacrt.platno).toEqual(novoPlatno('PAPIR', 'PRAZNO'));
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    expect(post.request.method).toBe('POST');
    expect(post.request.params.get('posle')).toBe('51');
    expect(post.request.body.platno).toEqual(novoPlatno('PAPIR', 'PRAZNO'));
    post.flush({ ...platnoSlajd(null, novoPlatno('PAPIR', 'PRAZNO')), id: 60 });
    expect(store.izabraniId()).toBe(60);
    await pomeriSat(800);
  }));

  it('dodaj(PLATNO, undefined, NASLOV_I_TEKST) pravi naslov i telo iz teme', saLaznimSatom(async () => {
    store.dodaj('PLATNO', undefined, 'NASLOV_I_TEKST');
    expect(store.izabrani()!.platno).toEqual(novoPlatno('PAPIR', 'NASLOV_I_TEKST'));
    http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi').flush({ ...platnoSlajd(), id: 61, rb: 3 });
    await pomeriSat(800);
  }));

  it('dodaj(INFO) ne šalje ništa (prazan info nije ispravan)', saLaznimSatom(async () => {
    store.dodaj('INFO');
    await pomeriSat(800);
    http.expectNone(() => true);
  }));

  it('izmeniPlatno posle izmene beleški: PUT nosi i beleške i novo platno', saLaznimSatom(async () => {
    store.izmeniSlajd(52, platnoCmd('B1', P0));
    store.izmeniPlatno(52, P1);
    expect(store.slajdovi()[1].platno).toBe(P1);
    expect(store.slajdovi()[1].beleske).toBe('B1');
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/52');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.beleske).toBe('B1');
    expect(put.request.body.platno).toBe(P1);
    put.flush(platnoSlajd('B1', P1));
  }));

  it('izmeniPlatno bez ranije lokalne izmene polazi od sačuvanog slajda (beleške sa servera ostaju)', saLaznimSatom(async () => {
    store.ucitaj(1);
    http.expectOne('api/prezentacije/1').flush({ ...prezentacija([slajd(51, 1), platnoSlajd('Sa servera')]), tema: 'PAPIR' });
    store.izmeniPlatno(52, P1);
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/52');
    expect(put.request.body).toMatchObject({ tip: 'PLATNO', beleske: 'Sa servera' });
    expect(put.request.body.platno).toBe(P1);
    put.flush(platnoSlajd('Sa servera', P1));
  }));

  it('izmeniPlatno za INFO slajd ne radi ništa', saLaznimSatom(async () => {
    const pre = store.slajdovi()[0];
    store.izmeniPlatno(51, P1);
    expect(store.slajdovi()[0]).toBe(pre);
    await pomeriSat(800);
    http.expectNone(() => true);
  }));

  it('isto platno (isti objekat) ne pravi novu izmenu ni PUT', saLaznimSatom(async () => {
    store.izmeniPlatno(52, P0);
    await pomeriSat(800);
    http.expectNone(() => true);
    expect(store.imaNesacuvano()).toBe(false);
  }));

  it('pražnjenje: sacuvajSve prvo upisuje otvorenu izmenu editora, pa PUT nosi to platno', saLaznimSatom(async () => {
    store.registrujPraznjenje(() => store.izmeniPlatno(52, P2), () => true);
    let gotovo = false;
    store.sacuvajSve().subscribe(() => (gotovo = true));
    const put = http.expectOne('api/slajdovi/52');
    expect(put.request.body.platno).toBe(P2);
    put.flush(platnoSlajd(null, P2));
    expect(gotovo).toBe(true);
    await pomeriSat(800);
  }));

  it('sacuvajOdmah i sacuvajPreIzlaska zovu pražnjenje (jednom svaki)', saLaznimSatom(async () => {
    const isprazni = vi.fn();
    store.registrujPraznjenje(isprazni);
    store.sacuvajOdmah();
    expect(isprazni).toHaveBeenCalledTimes(1);
    store.sacuvajPreIzlaska();
    expect(isprazni).toHaveBeenCalledTimes(2);
    store.isprazni();
    expect(isprazni).toHaveBeenCalledTimes(3);
    await pomeriSat(800);
  }));

  it('sacuvajPreIzlaska šalje platno upisano pražnjenjem', () => {
    store.registrujPraznjenje(() => store.izmeniPlatno(52, P2), () => true);
    store.sacuvajPreIzlaska();
    const put = http.expectOne('api/slajdovi/52');
    expect(put.request.body.platno).toBe(P2);
    put.flush(platnoSlajd(null, P2));
  });

  it('imaNesacuvano je true dok je u editoru nešto otvoreno (i bez izmene), false posle odjave', () => {
    let otvoreno = true;
    store.registrujPraznjenje(() => undefined, () => otvoreno);
    expect(store.imaNesacuvano()).toBe(true);
    otvoreno = false;
    expect(store.imaNesacuvano()).toBe(false);
    otvoreno = true;
    store.registrujPraznjenje(null);
    expect(store.imaNesacuvano()).toBe(false);
  });

  it('registrujPraznjenje vraća odjavu koja briše samo svoju registraciju (stara instanca editora ne briše novu)', () => {
    const stara = vi.fn();
    const nova = vi.fn();
    const odjaviStaru = store.registrujPraznjenje(stara, () => true);
    const odjaviNovu = store.registrujPraznjenje(nova, () => true);
    odjaviStaru();
    store.isprazni();
    expect(stara).not.toHaveBeenCalled();
    expect(nova).toHaveBeenCalledTimes(1);
    expect(store.imaNesacuvano()).toBe(true);
    odjaviNovu();
    store.isprazni();
    expect(nova).toHaveBeenCalledTimes(1);
    expect(store.imaNesacuvano()).toBe(false);
    odjaviNovu();   // ponovljena odjava ne smeta
    const treca = vi.fn();
    store.registrujPraznjenje(treca);
    odjaviStaru();
    store.isprazni();
    expect(treca).toHaveBeenCalledTimes(1);
    store.registrujPraznjenje(null);   // stara odjava (null) i dalje briše sve
    store.isprazni();
    expect(treca).toHaveBeenCalledTimes(1);
  });

  it('dokument koji server ne bi primio (#ggg) se ne šalje; status kaže zašto', saLaznimSatom(async () => {
    const los: Platno = { ...P0, pozadina: { boja: '#ggg', medijId: null } };
    store.izmeniPlatno(52, los);
    expect(store.neispravni().has(52)).toBe(false);   // lista proverava samo brojeve (odluka 10)
    await pomeriSat(800);
    http.expectNone('api/slajdovi/52');
    expect(store.cuvanje()).toBe('greska');
    expect(store.greska()).toBe('Slajd 2 nije sačuvan: Boja nije ispravna (#RRGGBB).');
    let greska: unknown = null;
    store.sacuvajSve().subscribe({ error: e => (greska = e) });
    expect((greska as Error).message).toBe('Slajd 2 nije sačuvan: Boja nije ispravna (#RRGGBB).');
    store.sacuvajPreIzlaska();
    http.expectNone(() => true);
  }));
});

describe('EditorStore: RegistarCuvanja (sesija prezentacija-<id>)', () => {
  let http: HttpTestingController;
  let registar: RegistarCuvanja;
  let nesacuvane: NesacuvaneIzmene;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    registar = TestBed.inject(RegistarCuvanja);
    nesacuvane = TestBed.inject(NesacuvaneIzmene);
  });

  afterEach(() => http.verify());

  /** Store u svom injektoru (kao stranica editora), da test može da ga uništi (napušten editor). */
  function napravi(): { store: InstanceType<typeof EditorStore>; unisti: () => void } {
    const injektor = createEnvironmentInjector([EditorStore], TestBed.inject(EnvironmentInjector));
    return { store: injektor.get(EditorStore), unisti: () => injektor.destroy() };
  }

  function prez(id: number, slajdovi: SlajdDetails[]): PrezentacijaDetails {
    return { ...prezentacija(slajdovi), id };
  }

  function ucitajU(store: InstanceType<typeof EditorStore>, id = 1, slajdovi = [slajd(11, 1), slajd(12, 2)]): void {
    store.ucitaj(id);
    http.expectOne(`api/prezentacije/${id}`).flush(prez(id, slajdovi));
  }

  it('napušten editor (PUT iz sacuvajPreIzlaska na putu): drugi store čita prezentaciju tek posle odgovora na PUT', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store);
    a.store.izmeniSlajd(11, info('Pre izlaska'));
    a.unisti();
    const put = http.expectOne('api/slajdovi/11');
    expect(put.request.method).toBe('PUT');
    const b = napravi();
    b.store.ucitaj(1);
    http.expectNone('api/prezentacije/1');
    put.flush(slajd(11, 1, 'Pre izlaska'));
    http.expectOne('api/prezentacije/1').flush(prez(1, [slajd(11, 1, 'Pre izlaska'), slajd(12, 2)]));
    http.expectNone('api/prezentacije/1');
    expect(b.store.slajdovi()[0].naslov).toBe('Pre izlaska');
    b.unisti();
  }));

  it('napušten editor, PUT padne (500): drugi store čita prezentaciju posle neuspeha', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store);
    a.store.izmeniSlajd(11, info('Pre izlaska'));
    a.unisti();
    const put = http.expectOne('api/slajdovi/11');
    const b = napravi();
    b.store.ucitaj(1);
    http.expectNone('api/prezentacije/1');
    put.flush({ reason: 'Greška.' }, { status: 500, statusText: 'Server Error' });
    http.expectOne('api/prezentacije/1').flush(prez(1, [slajd(11, 1), slajd(12, 2)]));
    expect(b.store.prezentacija()?.id).toBe(1);
    b.unisti();
  }));

  it('brojač sesije preživi ponovno učitavanje: PUT započet pre ucitaj iste prezentacije i dalje drži sesiju', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store);
    a.store.izmeniSlajd(11, info('X'));
    a.store.sacuvajOdmah();
    const put = http.expectOne('api/slajdovi/11');
    // ponovno čitanje iste prezentacije: generacija se menja, brojač store-a ide na 0
    a.store.ucitaj(1);
    expect(registar.zauzet('prezentacija-1')).toBe(true);
    let mir = false;
    registar.sacekaj('prezentacija-1').subscribe(() => (mir = true));
    const b = napravi();
    b.store.ucitaj(1);
    http.expectNone('api/prezentacije/1');
    expect(mir).toBe(false);
    put.flush(slajd(11, 1, 'X'));
    expect(registar.zauzet('prezentacija-1')).toBe(false);
    expect(mir).toBe(true);
    const citanja = http.match('api/prezentacije/1');
    expect(citanja.length).toBe(2);
    for (const c of citanja) c.flush(prez(1, [slajd(11, 1, 'X'), slajd(12, 2)]));
    expect(b.store.slajdovi()[0].naslov).toBe('X');
    a.unisti();
    b.unisti();
  }));

  it('ucitaj druge prezentacije ne čeka upis prve', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store);
    a.store.izmeniSlajd(11, info('Pre izlaska'));
    a.unisti();
    const put = http.expectOne('api/slajdovi/11');
    const b = napravi();
    b.store.ucitaj(2);
    http.expectOne('api/prezentacije/2').flush(prez(2, [slajd(21, 1)]));
    expect(b.store.prezentacija()?.id).toBe(2);
    put.flush(slajd(11, 1, 'Pre izlaska'));
    b.unisti();
  }));

  it('NesacuvaneIzmene: izmena na čekanju i njen PUT se broje jednom; otvoreno() u editoru platna broji se i bez izmene', saLaznimSatom(async () => {
    const slusalac = vi.spyOn(window, 'addEventListener');
    const a = napravi();
    ucitajU(a.store);
    expect(nesacuvane.broj()).toBe(0);
    a.store.izmeniSlajd(11, info('A'));
    expect(nesacuvane.broj()).toBe(1);
    // registar.promena(): upozorenje pre zatvaranja kartice je uključeno odmah, pre debounce-a
    expect(slusalac).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    await pomeriSat(800);
    const put = http.expectOne('api/slajdovi/11');
    expect(nesacuvane.broj()).toBe(1);
    put.flush(slajd(11, 1, 'A'));
    expect(nesacuvane.broj()).toBe(0);
    let otvoreno = true;
    const odjavi = a.store.registrujPraznjenje(() => undefined, () => otvoreno);
    expect(nesacuvane.broj()).toBe(1);
    otvoreno = false;
    expect(nesacuvane.broj()).toBe(0);
    odjavi();
    a.unisti();
    expect(nesacuvane.broj()).toBe(0);
    vi.restoreAllMocks();
  }));

  it('prelaz 5 -> 6: PUT iz sacuvajPreIzlaska je u sesiji prezentacija-5, a ucitaj(5) u drugom store-u ga čeka', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store, 5, [slajd(51, 1), slajd(52, 2)]);
    a.store.izmeniSlajd(51, info('U petici'));
    a.store.ucitaj(6);
    const put = http.expectOne('api/slajdovi/51');
    http.expectOne('api/prezentacije/6').flush(prez(6, [slajd(61, 1), slajd(62, 2)]));
    expect(registar.zauzet('prezentacija-5')).toBe(true);
    expect(registar.zauzet('prezentacija-6')).toBe(false);
    // zatvorena sesija 5 broji samo svoj PUT, ne izmene prezentacije 6 (te su u sesiji 6)
    a.store.izmeniSlajd(61, info('a'));
    a.store.izmeniSlajd(62, info('b'));
    expect(nesacuvane.broj()).toBe(3);
    const b = napravi();
    b.store.ucitaj(5);
    http.expectNone('api/prezentacije/5');
    put.flush(slajd(51, 1, 'U petici'));
    expect(registar.zauzet('prezentacija-5')).toBe(false);
    http.expectOne('api/prezentacije/5').flush(prez(5, [slajd(51, 1, 'U petici'), slajd(52, 2)]));
    expect(b.store.slajdovi()[0].naslov).toBe('U petici');
    expect(nesacuvane.broj()).toBe(2);
    await pomeriSat(800);
    http.expectOne('api/slajdovi/61').flush(slajd(61, 1, 'a'));
    http.expectOne('api/slajdovi/62').flush(slajd(62, 2, 'b'));
    expect(nesacuvane.broj()).toBe(0);
    a.unisti();
    b.unisti();
  }));

  it('zahtev koji odgovor na POST nacrta pokrene posle napuštanja editora (DELETE obrisanog nacrta) se i dalje čeka', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store);
    a.store.izaberi(12);
    a.store.dodaj('INFO');
    const nacrt = a.store.izabraniId()!;
    a.store.izmeniSlajd(nacrt, info('Nov'));
    a.store.sacuvajOdmah();
    const post = http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi');
    a.store.obrisi(nacrt);
    a.unisti();
    const b = napravi();
    b.store.ucitaj(1);
    http.expectNone('api/prezentacije/1');
    post.flush(slajd(30, 3, 'Nov'));
    const del = http.expectOne('api/slajdovi/30');
    expect(del.request.method).toBe('DELETE');
    http.expectNone('api/prezentacije/1');
    del.flush(null);
    http.expectOne('api/prezentacije/1').flush(prez(1, [slajd(11, 1), slajd(12, 2)]));
    expect(registar.zauzet('prezentacija-1')).toBe(false);
    b.unisti();
  }));

  /** Nacrt, POST u toku i izmena stigla dok POST traje (čeka u store-u). */
  function nacrtUSlanju(store: InstanceType<typeof EditorStore>, id: number, posle: number) {
    store.izaberi(posle);
    store.dodaj('INFO');
    const nacrt = store.izabraniId()!;
    store.izmeniSlajd(nacrt, info('Prvi'));
    store.sacuvajOdmah();
    const post = http.expectOne(r => r.url === `api/prezentacije/${id}/slajdovi`);
    expect(post.request.body.naslov).toBe('Prvi');
    store.izmeniSlajd(nacrt, info('Drugi'));
    return { nacrt, post };
  }

  it('izmena nacrta stigla dok traje POST, pa napušten editor: odgovor na POST šalje PUT sa izmenom, registar ga čeka', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store);
    const { post } = nacrtUSlanju(a.store, 1, 12);
    a.unisti();
    expect(nesacuvane.broj()).toBe(1);
    const b = napravi();
    b.store.ucitaj(1);
    http.expectNone('api/prezentacije/1');
    post.flush(slajd(30, 3, 'Prvi'));
    const put = http.expectOne('api/slajdovi/30');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.naslov).toBe('Drugi');
    expect(nesacuvane.broj()).toBe(1);
    http.expectNone('api/prezentacije/1');
    put.flush(slajd(30, 3, 'Drugi'));
    http.expectOne('api/prezentacije/1').flush(prez(1, [slajd(11, 1), slajd(12, 2), slajd(30, 3, 'Drugi')]));
    expect(b.store.slajdovi()[2].naslov).toBe('Drugi');
    expect(nesacuvane.broj()).toBe(0);
    expect(registar.zauzet('prezentacija-1')).toBe(false);
    b.unisti();
  }));

  it('izmena nacrta stigla dok traje POST, pa prelaz 5 -> 6: PUT ide za slajd prezentacije 5, stanje 6 ostaje, ponovno otvaranje 5 čeka PUT', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store, 5, [slajd(51, 1), slajd(52, 2)]);
    const { post } = nacrtUSlanju(a.store, 5, 52);
    a.store.ucitaj(6);
    http.expectOne('api/prezentacije/6').flush(prez(6, [slajd(61, 1)]));
    const stanje6 = a.store.prezentacija();
    const b = napravi();
    b.store.ucitaj(5);
    http.expectNone('api/prezentacije/5');
    post.flush(slajd(30, 3, 'Prvi'));
    const put = http.expectOne('api/slajdovi/30');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.naslov).toBe('Drugi');
    expect(registar.zauzet('prezentacija-5')).toBe(true);
    expect(registar.zauzet('prezentacija-6')).toBe(false);
    expect(a.store.prezentacija()).toBe(stanje6);
    expect(a.store.izabraniId()).toBe(61);
    expect(nesacuvane.broj()).toBe(1);
    http.expectNone('api/prezentacije/5');
    put.flush(slajd(30, 3, 'Drugi'));
    http.expectOne('api/prezentacije/5').flush(prez(5, [slajd(51, 1), slajd(52, 2), slajd(30, 3, 'Drugi')]));
    expect(registar.zauzet('prezentacija-5')).toBe(false);
    expect(nesacuvane.broj()).toBe(0);
    a.unisti();
    b.unisti();
  }));

  it('nacrt obrisan dok traje POST, pa prelaz 5 -> 6: odgovor na POST briše napravljen slajd (DELETE u sesiji 5)', saLaznimSatom(async () => {
    const a = napravi();
    ucitajU(a.store, 5, [slajd(51, 1), slajd(52, 2)]);
    const { nacrt, post } = nacrtUSlanju(a.store, 5, 52);
    a.store.obrisi(nacrt);
    a.store.ucitaj(6);
    http.expectOne('api/prezentacije/6').flush(prez(6, [slajd(61, 1)]));
    post.flush(slajd(30, 3, 'Prvi'));
    const del = http.expectOne('api/slajdovi/30');
    expect(del.request.method).toBe('DELETE');
    expect(registar.zauzet('prezentacija-5')).toBe(true);
    del.flush(null);
    expect(registar.zauzet('prezentacija-5')).toBe(false);
    expect(a.store.slajdovi().map(s => s.id)).toEqual([61]);
    a.unisti();
  }));

  describe('neuspeh posle napuštanja editora ili prelaza: globalna poruka (store više nije na ekranu)', () => {
    let greska: ReturnType<typeof vi.spyOn>;
    const pao = { status: 500, statusText: 'Server Error' };

    beforeEach(() => {
      greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    });

    afterEach(() => vi.restoreAllMocks());

    it('POST nacrta padne posle napuštanja editora', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store);
      const { post } = nacrtUSlanju(a.store, 1, 12);
      a.unisti();
      post.flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).toHaveBeenCalledExactlyOnceWith('Novi slajd nije sačuvan: Server ne radi.', { grupa: 'uzivo-cuvanje-pri-izlasku' });
      expect(registar.zauzet('prezentacija-1')).toBe(false);
    }));

    it('POST nacrta padne posle prelaza 5 -> 6 (stanje 6 se ne dira)', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store, 5, [slajd(51, 1), slajd(52, 2)]);
      const { post } = nacrtUSlanju(a.store, 5, 52);
      a.store.ucitaj(6);
      http.expectOne('api/prezentacije/6').flush(prez(6, [slajd(61, 1)]));
      post.flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).toHaveBeenCalledExactlyOnceWith('Novi slajd nije sačuvan: Server ne radi.', { grupa: 'uzivo-cuvanje-pri-izlasku' });
      expect(a.store.greska()).toBeNull();
      a.unisti();
    }));

    it('naknadni PUT izmene nacrta padne posle napuštanja editora', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store);
      const { post } = nacrtUSlanju(a.store, 1, 12);
      a.unisti();
      post.flush(slajd(30, 3, 'Prvi'));
      http.expectOne('api/slajdovi/30').flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).toHaveBeenCalledExactlyOnceWith('Izmena slajda nije sačuvana: Server ne radi.', { grupa: 'uzivo-cuvanje-pri-izlasku' });
    }));

    it('naknadni DELETE nacrta obrisanog dok je POST trajao padne posle napuštanja editora', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store);
      const { nacrt, post } = nacrtUSlanju(a.store, 1, 12);
      a.store.obrisi(nacrt);
      a.unisti();
      post.flush(slajd(30, 3, 'Prvi'));
      http.expectOne('api/slajdovi/30').flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).toHaveBeenCalledExactlyOnceWith('Brisanje slajda nije uspelo: Server ne radi.', { grupa: 'uzivo-cuvanje-pri-izlasku' });
    }));

    it('nacrt poslat tek pri napuštanju (POST iz sacuvajPreIzlaska) padne: poruka kaže da novi slajd nije sačuvan', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store);
      a.store.izaberi(12);
      a.store.dodaj('INFO');
      a.store.izmeniSlajd(a.store.izabraniId()!, info('Nov'));
      a.unisti();
      http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi').flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).toHaveBeenCalledExactlyOnceWith('Novi slajd nije sačuvan: Server ne radi.', { grupa: 'uzivo-cuvanje-pri-izlasku' });
    }));

    it('podešavanja prezentacije padnu posle napuštanja editora', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store);
      const p = a.store.prezentacija()!;
      a.store.izmeniPodesavanja({
        naziv: 'Novi naziv', opis: p.opis, tema: p.tema, takmicenje: p.takmicenje, telefonPrikaz: p.telefonPrikaz,
        detaljiDozvoljeni: p.detaljiDozvoljeni,
      });
      const req = http.expectOne('api/prezentacije/1');
      expect(req.request.method).toBe('PUT');
      a.unisti();
      req.flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).toHaveBeenCalledExactlyOnceWith('Podešavanja prezentacije nisu sačuvana: Server ne radi.', { grupa: 'uzivo-cuvanje-pri-izlasku' });
    }));

    it('neuspeh dok je editor otvoren ide samo u status editora, ne u globalnu poruku', saLaznimSatom(async () => {
      const a = napravi();
      ucitajU(a.store);
      const { post } = nacrtUSlanju(a.store, 1, 12);
      post.flush({ reason: 'Server ne radi.' }, pao);
      expect(greska).not.toHaveBeenCalled();
      expect(a.store.greska()).toBe('Server ne radi.');
      a.unisti();
      http.expectOne(r => r.url === 'api/prezentacije/1/slajdovi').flush(slajd(30, 3, 'Drugi'));
    }));
  });

  it('registracija i odjava pražnjenja javljaju registru: upozorenje pre zatvaranja kartice prati otvoreno()', () => {
    const dodat = vi.spyOn(window, 'addEventListener');
    const skinut = vi.spyOn(window, 'removeEventListener');
    const a = napravi();
    ucitajU(a.store);
    const odjavi = a.store.registrujPraznjenje(() => undefined, () => true);
    expect(dodat).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    odjavi();
    expect(skinut).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    dodat.mockClear();
    a.store.registrujPraznjenje(() => undefined, () => true);
    expect(dodat).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    skinut.mockClear();
    a.store.registrujPraznjenje(null);
    expect(skinut).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    a.unisti();
    vi.restoreAllMocks();
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

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { infoSlajd, naPitanju, pitanjeSlajd, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { animacija, platno } from '../data-access/platno-podaci.testing';
import type { CrtezSloj, Potez } from '../data-access/platno.models';
import { NastavnickoStanje, Rezultat } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { PublikaScenaComponent } from './publika-scena.component';

async function prikazi(s: NastavnickoStanje) {
  const fixture = TestBed.createComponent(PublikaScenaComponent);
  fixture.componentRef.setInput('stanje', s);
  fixture.componentRef.setInput('joinLink', 'http://localhost/uzivo/123456');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

// Svaka scena traži poteze crteža (`PoteziCrteza`); fabričko platno ima CRTEZ bez poteza, pa zahtevi idu u lažni backend.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
});

const tekst = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * Projektor prikazuje samo javne projekcije sa servera (`javniRezultat`, `javnaRangLista`), nikad nastavnički
 * `rezultat` ni `rangLista` (Ruling 16): `L` ili `Space` pre `C` ne smeju da odaju tačnost.
 */
describe('PublikaScenaComponent (javne projekcije)', () => {
  it('L dok je pitanje otvoreno: rang-lista bez poena trenutne runde (javnaRangLista, ne nastavnička)', async () => {
    const el = await prikazi(naPitanju('OTVORENO', {
      takmicenje: true, rangListaPrikazana: true,
      // nastavnik vidi uživo: Bojan je upravo tačno odgovorio
      rangLista: [{ mesto: 1, ucesnikId: 2, ime: 'Bojan', poeni: 800 }, { mesto: 2, ucesnikId: 1, ime: 'Ana', poeni: 0 }],
      // server: trenutna runda se ne računa pre C
      javnaRangLista: [{ mesto: 1, ucesnikId: null, ime: 'Ana', poeni: 0 }, { mesto: 2, ucesnikId: null, ime: 'Bojan', poeni: 0 }],
    }));
    const rang = el.querySelector('[aria-label="Rang-lista"]');
    expect(rang).not.toBeNull();
    const redovi = Array.from(rang!.querySelectorAll('.uz-rang-red'))
      .map(r => [r.querySelector('.uz-rang-ime')?.textContent, r.querySelector('.uz-rang-poeni')?.textContent]);
    expect(redovi).toEqual([['Ana', '0'], ['Bojan', '0']]);
    expect(tekst(rang)).not.toContain('800');
  });

  it('L bez javne rang-liste (stari snimak, null): prazna lista, nikad nastavnička', async () => {
    const el = await prikazi(naPitanju('ZATVORENO', {
      takmicenje: true, rangListaPrikazana: true,
      rangLista: [{ mesto: 1, ucesnikId: 2, ime: 'Bojan', poeni: 800 }],
      javnaRangLista: null,
    }));
    const rang = el.querySelector('[aria-label="Rang-lista"]');
    expect(tekst(rang)).not.toContain('Bojan');
    expect(tekst(rang)).toContain('Još nema poena.');
  });

  it('Space na pitanju sa brojem pre C: nema "U odstupanju" (javniRezultat, ne nastavnički)', async () => {
    const slajd = pitanjeSlajd('BROJ', { opcije: [], brojTacno: 9.81, brojOdstupanje: 0.1, odstupanjeTip: 'APSOLUTNO', jedinica: 'm/s²' });
    const nastavnicki: Rezultat = {
      tip: 'BROJ', ukupno: 2, opcije: null, tekstovi: null, skala: null,
      brojevi: { medijana: 6.4, uOdstupanju: 1, najcesce: [{ vrednost: 9.8, broj: 1 }, { vrednost: 3, broj: 1 }] },
    };
    const javni: Rezultat = { ...nastavnicki, brojevi: { ...nastavnicki.brojevi!, uOdstupanju: null } };
    const el = await prikazi(naPitanju('ZATVORENO', {
      rezultatiPrikazani: true, rezultat: nastavnicki, javniRezultat: javni, brojOdgovora: 2,
    }, slajd));
    expect(tekst(el)).toMatch(/6[.,]4/);   // medijana se vidi (rezultat je prikazan)
    expect(tekst(el)).not.toContain('U odstupanju');

    // posle C server šalje broj u javnom rezultatu
    const posleC = await prikazi(naPitanju('ZATVORENO', {
      rezultatiPrikazani: true, tacanPrikazan: true, rezultat: nastavnicki, javniRezultat: nastavnicki, brojOdgovora: 2,
    }, slajd));
    expect(tekst(posleC)).toContain('U odstupanju');
    expect(tekst(posleC)).toContain('1/2');
  });

  it('Space pre C: opcije bez oznake tačne (javniRezultat)', async () => {
    const nastavnicki: Rezultat = {
      tip: 'JEDAN_TACAN', ukupno: 1, brojevi: null, tekstovi: null, skala: null,
      opcije: [{ id: 1, tekst: '3', broj: 0, tacna: false }, { id: 2, tekst: '4', broj: 1, tacna: true }],
    };
    const javni: Rezultat = { ...nastavnicki, opcije: nastavnicki.opcije!.map(o => ({ ...o, tacna: null })) };
    const el = await prikazi(naPitanju('ZATVORENO', { rezultatiPrikazani: true, rezultat: nastavnicki, javniRezultat: javni }));
    expect(el.querySelectorAll('.uz-rez-opcija').length).toBe(2);
    expect(el.querySelector('.uz-rez-opcija--tacna, .uz-tacno-znak')).toBeNull();
  });

  it('KRAJ sa takmičenjem: postolje iz javnaRangLista', async () => {
    const el = await prikazi(stanje({
      prikaz: 'KRAJ', indeks: 3, takmicenje: true,
      rangLista: [{ mesto: 1, ucesnikId: 2, ime: 'Nastavnički', poeni: 1 }],
      javnaRangLista: [{ mesto: 1, ucesnikId: null, ime: 'Ana', poeni: 1800 }, { mesto: 2, ucesnikId: null, ime: 'Bojan', poeni: 900 }],
    }));
    expect(tekst(el.querySelector('.uz-scena-naslov'))).toBe('Pobednici');
    const postolje = tekst(el.querySelector('app-postolje'));
    expect(postolje).toContain('Ana');
    expect(postolje).not.toContain('Nastavnički');
  });
});

/**
 * Animacija prelaza (Review Focus 2): scena pamti prethodni snimak i pita `animacijaPrelaza`; ključ je `verzija`.
 * Prvi snimak (kasno otvoren prozor, ponovo učitana stranica) nikad ne animira; umanjeni prikaz konzole (`animiraj`
 * false) nikad ne animira.
 */
describe('PublikaScenaComponent (animacija prelaza i tema)', () => {
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => undefined) }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
  });

  const naPlatnu = (korak: number, verzija: number, izmene: Partial<NastavnickoStanje> = {}) => stanje({
    prikaz: 'SLAJD', indeks: 0, trenutniSlajd: platnoSlajd(), korak, brojStavki: 2, verzija, ...izmene,
  });

  async function scena(prvi: NastavnickoStanje, animiraj: boolean) {
    const fixture = TestBed.createComponent(PublikaScenaComponent);
    fixture.componentRef.setInput('stanje', prvi);
    fixture.componentRef.setInput('joinLink', 'http://localhost/uzivo/123456');
    fixture.componentRef.setInput('animiraj', animiraj);
    fixture.detectChanges();
    await fixture.whenStable();
    const slajd = () => fixture.debugElement.query(By.directive(SlajdPrikazComponent))?.componentInstance as SlajdPrikazComponent | undefined;
    const posalji = async (s: NastavnickoStanje) => {
      fixture.componentRef.setInput('stanje', s);
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, slajd, posalji };
  }

  it('korak 0 -> 1 na istom slajdu (verzija 5 -> 6): animacija {kljuc: 6, grupa: 1}; prvi snimak null', async () => {
    const { slajd, posalji } = await scena(naPlatnu(0, 5), true);
    expect(slajd()!.animacija()).toBeNull();

    await posalji(naPlatnu(1, 6));
    expect(slajd()!.animacija()).toEqual({ kljuc: 6, grupa: 1 });
    expect(animate).toHaveBeenCalled();

    // sledeći snimak bez promene koraka (npr. prijava učesnika): bez nove animacije
    await posalji(naPlatnu(1, 7));
    expect(slajd()!.animacija()).toBeNull();
  });

  it('ponovno povezivanje (nova epoha veze): korak koji se desio tokom prekida se ne animira', async () => {
    const { fixture, slajd, posalji } = await scena(naPlatnu(0, 5), true);
    fixture.componentRef.setInput('epohaVeze', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(slajd()!.animacija()).toBeNull();

    await posalji(naPlatnu(1, 6));
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();

    // posle ponovnog povezivanja sledeći korak se opet animira
    await posalji(naPlatnu(2, 7));
    expect(slajd()!.animacija()).toEqual({ kljuc: 7, grupa: 2 });
  });

  it('epoha i snimak stignu zajedno (isti ciklus): bez animacije', async () => {
    const { fixture, slajd } = await scena(naPlatnu(0, 5), true);
    fixture.componentRef.setInput('epohaVeze', 1);
    fixture.componentRef.setInput('stanje', naPlatnu(1, 6));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('animiraj false (umanjen prikaz u konzoli): animacija je uvek null', async () => {
    const { slajd, posalji } = await scena(naPlatnu(0, 5), false);
    await posalji(naPlatnu(1, 6));
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('kasno otvoren prozor usred koraka: crta se krajnje stanje koraka, bez animate', async () => {
    const { fixture, slajd } = await scena(naPlatnu(2, 9), true);
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    // posle koraka 2 oblik je izašao (IZLAZ), slika je ušla u koraku 1
    expect(el.querySelector<HTMLElement>('.uz-pl-sloj[data-sloj="oblik"]')!.style.visibility).toBe('hidden');
    expect(el.querySelector<HTMLElement>('.uz-pl-sloj[data-sloj="slika"]')!.style.visibility).toBe('');
  });

  it('skok na slajd usred koraka (preskočen slajd): bez animacije', async () => {
    const { slajd, posalji } = await scena(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), verzija: 3 }), true);
    await posalji(naPlatnu(0, 4, { indeks: 2 }));
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  /*
   * Prethodni snimak se pamti za svaki prikaz, ne samo dok je na ekranu slajd: snimak prijave (ili kraja) mora da
   * postane "prethodni", inače se prvi slajd poredi sa svežim prozorom ili sa slajdom od pre prijave.
   */
  const saGrupom0 = (id = 30) => platnoSlajd({
    id, platno: { ...platno(), animacije: [animacija('a0', 'tabela', { okidac: 'SA_PRETHODNIM' }), ...platno().animacije] },
  });
  const prijava = (verzija: number) => stanje({ prikaz: 'PRIJAVA', indeks: -1, trenutniSlajd: null, verzija });
  const kraj = (verzija: number) => stanje({ prikaz: 'KRAJ', indeks: 3, trenutniSlajd: null, verzija });
  const prviSlajd = (verzija: number, korak = 0) =>
    stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: saGrupom0(), korak, brojStavki: 2, verzija });

  it('PRIJAVA (v5) -> prvi slajd korak 0 (v6): pušta grupu 0', async () => {
    const { slajd, posalji } = await scena(prijava(5), true);
    await posalji(prviSlajd(6));
    expect(slajd()!.animacija()).toEqual({ kljuc: 6, grupa: 0 });
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('slajd 1 korak 2 -> Home (PRIJAVA) -> prvi slajd korak 0: pušta grupu 0 (ne poredi sa korakom pre prijave)', async () => {
    const { slajd, posalji } = await scena(prviSlajd(4, 2), true);
    await posalji(prijava(5));
    await posalji(prviSlajd(6));
    expect(slajd()!.animacija()).toEqual({ kljuc: 6, grupa: 0 });
  });

  it('PRIJAVA kao prvi snimak, pa prekid veze: prvi slajd posle ponovnog povezivanja se ne animira', async () => {
    const { fixture, slajd, posalji } = await scena(prijava(5), true);
    fixture.componentRef.setInput('epohaVeze', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    await posalji(prviSlajd(6));
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('KRAJ -> slajd: nikad animacija (ni sledeći slajd posle skoka sa kraja, ni nazad na poslednji)', async () => {
    const { slajd, posalji } = await scena(prviSlajd(5), true);
    await posalji(kraj(6));
    // skok sa kraja na drugi slajd: bez kraja kao "prethodnog" ovo bi izgledalo kao korak napred sa slajda 1
    await posalji(stanje({ prikaz: 'SLAJD', indeks: 1, trenutniSlajd: saGrupom0(31), korak: 0, brojStavki: 2, verzija: 7 }));
    expect(slajd()!.animacija()).toBeNull();

    await posalji(kraj(8));
    await posalji(stanje({ prikaz: 'SLAJD', indeks: 2, trenutniSlajd: saGrupom0(32), korak: 2, brojStavki: 2, verzija: 9 }));
    expect(slajd()!.animacija()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('tema prezentacije ide u slajd; snimak bez teme (stari server) je NACRT', async () => {
    const { slajd, posalji } = await scena(naPitanju('CEKA', { tema: 'PONOC' }), false);
    expect(slajd()!.tema()).toBe('PONOC');
    const bezTeme = naPitanju('CEKA', { verzija: 2 }) as Partial<NastavnickoStanje>;
    delete bezTeme.tema;
    await posalji(bezTeme as NastavnickoStanje);
    expect(slajd()!.tema()).toBe('NACRT');
  });
});

/**
 * Potezi crteža (Review Focus 3): snimak nosi CRTEZ bez poteza, scena ih traži za trenutni i sledeći slajd
 * (`GET slajdovi/{id}/potezi`) i slajd sa potezima iz keša daje prikazu.
 */
describe('PublikaScenaComponent (potezi crteža)', () => {
  const potezi: Potez[] = [{ boja: '#C00000', debljina: 3, tacke: [10, 5, 20, 10] }];
  const crtezSlajda = (sl: unknown) =>
    ((sl as { platno: { slojevi: { tip: string }[] } }).platno.slojevi.find((x) => x.tip === 'CRTEZ') as CrtezSloj);

  async function scena(s: NastavnickoStanje) {
    const fixture = TestBed.createComponent(PublikaScenaComponent);
    fixture.componentRef.setInput('stanje', s);
    fixture.componentRef.setInput('joinLink', 'http://localhost/uzivo/123456');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('trenutni i sledeći PLATNO sa CRTEZ-om bez poteza: dva GET; posle odgovora prikaz dobija poteze', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = await scena(stanje({
      prikaz: 'SLAJD', indeks: 0, korak: 0, brojStavki: 2, trenutniSlajd: platnoSlajd({ id: 30 }), sledeciSlajd: platnoSlajd({ id: 31 }),
    }));
    const prikaz = () => fixture.debugElement.query(By.directive(SlajdPrikazComponent)).componentInstance as SlajdPrikazComponent;
    expect(crtezSlajda(prikaz().slajd()).potezi).toBeNull();

    const zahtevi = http.match((r) => /^api\/slajdovi\/\d+\/potezi$/.test(r.url));
    expect(zahtevi.map((r) => r.request.url)).toEqual(['api/slajdovi/30/potezi', 'api/slajdovi/31/potezi']);
    const unos = { slojId: 'crtez', medijId: '00000000-0000-0000-0000-000000000002', sirina: 200, visina: 100, potezi };
    zahtevi.forEach((r) => r.flush([unos]));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(crtezSlajda(prikaz().slajd()).potezi).toEqual(potezi);
    http.verify();
  });

  it('INFO trenutni (i INFO sledeći): nijedan zahtev', async () => {
    const http = TestBed.inject(HttpTestingController);
    await scena(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd() }));
    http.verify();
  });
});

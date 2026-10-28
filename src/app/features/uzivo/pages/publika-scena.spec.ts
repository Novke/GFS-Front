import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  infoSlajd, naPitanju, naZadatku, pitanjeSlajd, platnoSlajd, rezultatVarijante, stanje, varijantaRunde,
} from '../data-access/izvodjenje-podaci.testing';
import { animacija, platno } from '../data-access/platno-podaci.testing';
import type { CrtezSloj, Potez } from '../data-access/platno.models';
import { ServerskiSat } from '../data-access/sat';
import { NastavnickoStanje, Rezultat, SlajdDetails, ZadatakRezultat } from '../data-access/uzivo.models';
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

  it('Space na pitanju sa brojem pre C: čipovi unetih vrednosti bez oznaka (javniRezultat, ne nastavnički); posle C ✓/✗ i tačnih %', async () => {
    const slajd = pitanjeSlajd('BROJ', { opcije: [], brojTacno: 9.81, brojOdstupanje: 0.1, odstupanjeTip: 'APSOLUTNO', jedinica: 'm/s²' });
    const nastavnicki: Rezultat = {
      tip: 'BROJ', ukupno: 3, opcije: null, tekstovi: null, skala: null, tacnih: 2,
      brojevi: { vrednosti: [{ vrednost: 9.8, broj: 2, tacan: true }, { vrednost: 3, broj: 1, tacan: false }] },
    };
    const javni: Rezultat = {
      ...nastavnicki, tacnih: null, brojevi: { vrednosti: nastavnicki.brojevi!.vrednosti.map(v => ({ ...v, tacan: null })) },
    };
    const el = await prikazi(naPitanju('ZATVORENO', {
      rezultatiPrikazani: true, rezultat: nastavnicki, javniRezultat: javni, brojOdgovora: 3,
    }, slajd));
    const cipovi = [...el.querySelectorAll('app-rezultat-prikaz .uz-co-cip')].map(tekst);
    expect(cipovi).toEqual(['9,8 m/s² (2)', '3 m/s²']);
    expect(el.querySelector('.uz-co-cip--tacno, .uz-co-cip--netacno, .uz-rez-tacnih')).toBeNull();
    expect(tekst(el)).not.toContain('Medijana');

    // posle C server šalje tačnost u javnom rezultatu
    const posleC = await prikazi(naPitanju('ZATVORENO', {
      rezultatiPrikazani: true, tacanPrikazan: true, rezultat: nastavnicki, javniRezultat: nastavnicki, brojOdgovora: 3,
    }, slajd));
    expect(posleC.querySelector('.uz-co-cip--tacno')?.textContent).toContain('9,8');
    expect(posleC.querySelector('.uz-co-cip--netacno')?.textContent).toContain('3');
    expect(tekst(posleC.querySelector('.uz-rez-tacnih'))).toContain('Tačno 2 od 3 · 67 %');
  });

  it('Space pre C: opcije bez oznake tačne (javniRezultat)', async () => {
    const nastavnicki: Rezultat = {
      tip: 'JEDAN_TACAN', ukupno: 1, brojevi: null, tekstovi: null, skala: null, tacnih: 1,
      opcije: [{ id: 1, tekst: '3', broj: 0, tacna: false }, { id: 2, tekst: '4', broj: 1, tacna: true }],
    };
    const javni: Rezultat = { ...nastavnicki, tacnih: null, opcije: nastavnicki.opcije!.map(o => ({ ...o, tacna: null })) };
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
 * Zadatak slajd na projektoru (MCP projekat B, FE-4): scena daje prikazu samo `javniRezultat` (nikad nastavnički
 * `rezultat`, ni `varijante` sa id-jevima rešenja), broj odgovora i tajmer važe i za Zadatak, imena učesnika nigde.
 */
describe('PublikaScenaComponent (Zadatak slajd)', () => {
  const javni = (izmene: Partial<ZadatakRezultat> = {}): ZadatakRezultat => ({
    ukupno: 0, odgovoriPrikazani: false,
    varijante: [varijantaRunde(11), varijantaRunde(12)].map(v => ({
      ...rezultatVarijante(v), dodeljeno: 0, odgovorilo: 0, tacnih: null, resenjeSvgId: null,
      polja: [{ ...rezultatVarijante(v).polja[0], vrednosti: null, tacno: null }],
    })),
    ...izmene,
  });
  const slike = (el: Element) => Array.from(el.querySelectorAll('img')).map(i => i.getAttribute('src'));

  it('CEKA: "Zadatak", grupa i uputstvo (bez broja varijanti); bez broja odgovora i bez slika', async () => {
    const el = await prikazi(naZadatku('CEKA'));
    expect(tekst(el.querySelector('.uz-slajd-naslov'))).toBe('Zadatak');
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('Zadatak stiže na telefone');
    expect(el.querySelector('.uz-zad-odgovori')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });

  it('OTVORENO uz Space: "Odgovorilo x od y" (imenilac kao u konzoli) i tajmer runde, bez kartica', async () => {
    const s = naZadatku('OTVORENO', { stanje: { brojOdgovora: 3, ucesnici: [], brojPovezanih: 7, rezultatiPrikazani: true } });
    s.runda = { id: 9, redniBroj: 1, rokMs: s.serverVremeMs + 60_000, preostaloMs: null, tajmerRadi: true };
    const fixture = TestBed.createComponent(PublikaScenaComponent);
    fixture.componentRef.setInput('stanje', s);
    fixture.componentRef.setInput('joinLink', 'http://localhost/uzivo/123456');
    fixture.componentRef.setInput('sat', new ServerskiSat());
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(tekst(el.querySelector('.uz-zad-odgovori'))).toBe('Odgovorilo 3 od 7');
    expect(el.querySelector('.uz-zad-zaglavlje app-tajmer')).not.toBeNull();
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
    fixture.componentRef.setInput('stanje', { ...s, rezultatiPrikazani: false, verzija: s.verzija + 1 });
    fixture.detectChanges();
    expect(el.querySelector('.uz-zad-odgovori')).toBeNull();
  });

  it('nastavnički rezultat i varijante (sa rešenjima) se ne crtaju dok javniRezultat nije tu', async () => {
    const s = naZadatku('ZATVORENO', { zadatak: { resenjePrikazano: true, javniRezultat: null } });
    expect(s.zadatak!.rezultat!.varijante.length).toBe(2);
    const el = await prikazi(s);
    expect(el.querySelector('app-zadatak-rezultat')).toBeNull();
    expect(slike(el)).toEqual([]);
    expect(tekst(el.querySelector('.uz-slajd-podnozje .uz-cip--zatvoreno'))).toBe('Zatvoreno');
  });

  it('samo rešenje (javniRezultat bez brojeva): slike zadatka i rešenja, bez traka; imena učesnika nigde', async () => {
    const r = javni();
    r.varijante.forEach(v => (v.resenjeSvgId = `res-${v.svgId}`));
    const el = await prikazi(naZadatku('ZATVORENO', {
      zadatak: { resenjePrikazano: true, javniRezultat: r },
      stanje: {
        ucesnici: [
          { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: true, varijantaId: 11, tacno: true },
          { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: true, varijantaId: 12, tacno: false },
        ],
      },
    }));
    expect(slike(el)).toEqual([
      'api/public/mediji/svg-V11', 'api/public/mediji/res-svg-V11', 'api/public/mediji/svg-V12', 'api/public/mediji/res-svg-V12',
    ]);
    expect(el.querySelector('.uz-zr-red, .uz-zr-brojevi')).toBeNull();
    expect(tekst(el)).not.toMatch(/Ana|Bojan/);
  });

  it('javniRezultat sa prikazanim odgovorima: mreža kartica u sceni, samo uneti brojevi (bez slika)', async () => {
    const r = javni({ odgovoriPrikazani: true });
    r.varijante = r.varijante.map(v => ({
      ...v, dodeljeno: 1, odgovorilo: 1,
      polja: [{ ...v.polja[0], vrednosti: [{ kljuc: '45.0', tekst: '45', broj: 1, sakriven: false, tacan: null }] }],
    }));
    const el = await prikazi(naZadatku('ZATVORENO', { zadatak: { javniRezultat: r } }));
    expect(el.querySelectorAll('app-zadatak-rezultat .uz-zr-kartica').length).toBe(2);
    expect(el.querySelectorAll('app-zadatak-rezultat .uz-co-cip').length).toBe(2);
    expect(el.querySelector('app-zadatak-rezultat img')).toBeNull();
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

  it('potezi stignu dok grupa 0 traje (PRIJAVA -> prvi slajd): isti prikaz i cilj, animacija nastavlja preko vektora', async () => {
    const http = TestBed.inject(HttpTestingController);
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => undefined) }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
    try {
      const slajd = platnoSlajd({
        id: 30, platno: { ...platno(), animacije: [animacija('a0', 'crtez', { okidac: 'SA_PRETHODNIM', efekat: 'ISCRTAJ', smer: 'LEVO' })] },
      });
      const fixture = await scena(stanje({ prikaz: 'PRIJAVA', indeks: -1, trenutniSlajd: null, verzija: 5 }));
      fixture.componentRef.setInput('animiraj', true);
      fixture.componentRef.setInput('stanje', stanje({ prikaz: 'SLAJD', indeks: 0, korak: 0, brojStavki: 1, trenutniSlajd: slajd, verzija: 6 }));
      fixture.detectChanges();
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const cilj = () => el.querySelector<HTMLElement>('.uz-pl-sloj[data-sloj="crtez"] > .uz-pl-sadrzaj')!;
      const prvi = cilj();
      expect(animate).toHaveBeenCalledTimes(1);
      expect(prvi.getAttribute('data-crtez')).toBe('slika');
      const platnoPrikaz = fixture.debugElement.query(By.css('app-platno-prikaz')).componentInstance;

      http.expectOne('api/slajdovi/30/potezi').flush([
        { slojId: 'crtez', medijId: '00000000-0000-0000-0000-000000000002', sirina: 200, visina: 100, potezi },
      ]);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.debugElement.query(By.css('app-platno-prikaz')).componentInstance).toBe(platnoPrikaz);
      expect(cilj()).toBe(prvi);
      expect(prvi.getAttribute('data-crtez')).toBe('vektor');
      expect(animate).toHaveBeenCalledTimes(1);
      const animacija0 = animate.mock.results[0].value as { cancel: ReturnType<typeof vi.fn> };
      expect(animacija0.cancel).not.toHaveBeenCalled();
      expect(prvi.style.visibility).toBe('visible');
      http.verify();
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
  });

  it('INFO trenutni (i INFO sledeći): nijedan zahtev', async () => {
    const http = TestBed.inject(HttpTestingController);
    await scena(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd() }));
    http.verify();
  });
});

/** Lažni `matchMedia` sa `prefers-reduced-motion: reduce` (i slušaocima, koje CDK `BreakpointObserver` zove). */
const smanjenoKretanjeUSistemu = vi.fn((q: string) => ({
  matches: q === '(prefers-reduced-motion: reduce)', media: q,
  addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined,
}));

/**
 * Prelaz slajda (odluka 12, Review Focus 4): samo prozor publike, samo za tačno jedan slajd napred; grupa 0 PLATNO slajda
 * kreće posle prelaza (dok traje, slajd se crta na koraku -1); nikad dva slajda zaglavljena na ekranu.
 */
describe('PublikaScenaComponent (prelaz slajda)', () => {
  /** `klasa`: klase elementa u trenutku poziva (omotač slajda menja klasu kad iz ulaznog postane odlazni, ista instanca). */
  interface Lazna { finished: Promise<unknown>; cancel: ReturnType<typeof vi.fn>; zavrsi(): void; klasa: string; }
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animate = vi.fn(function (this: Element): Lazna {
      let zavrsi!: () => void;
      let odbij!: (e: unknown) => void;
      const finished = new Promise<unknown>((r, o) => { zavrsi = () => r(undefined); odbij = o; });
      finished.catch(() => undefined);
      return { finished, cancel: vi.fn(() => odbij(new DOMException('Prekinuto', 'AbortError'))), zavrsi, klasa: this.className };
    });
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    vi.unstubAllGlobals();
  });

  const GURANJE = { efekat: 'GURANJE', smer: 'DESNO', trajanjeMs: 600 } as const;
  const slajd1 = infoSlajd({ id: 20 });
  const slajd2 = platnoSlajd({
    id: 30, prelaz: GURANJE,
    platno: { ...platno(), animacije: [animacija('a0', 'tabela', { okidac: 'SA_PRETHODNIM' }), ...platno().animacije] },
  });
  const slajd3 = infoSlajd({ id: 40, naslov: 'Treći', prelaz: { efekat: 'FADE', smer: null, trajanjeMs: 500 } });
  const na = (sl: SlajdDetails, indeks: number, verzija: number, izmene: Partial<NastavnickoStanje> = {}) =>
    stanje({ prikaz: 'SLAJD', indeks, trenutniSlajd: sl, korak: 0, brojStavki: sl.tip === 'PLATNO' ? 2 : 0, verzija, ...izmene });

  async function scena(prvi: NastavnickoStanje, animiraj = true) {
    const fixture = TestBed.createComponent(PublikaScenaComponent);
    fixture.componentRef.setInput('stanje', prvi);
    fixture.componentRef.setInput('joinLink', 'http://localhost/uzivo/123456');
    fixture.componentRef.setInput('animiraj', animiraj);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const prikazi = () => fixture.debugElement.queryAll(By.directive(SlajdPrikazComponent)).map(d => d.componentInstance as SlajdPrikazComponent);
    const ulazni = () => prikazi().at(-1)!;
    const posalji = async (s: NastavnickoStanje) => {
      fixture.componentRef.setInput('stanje', s);
      fixture.detectChanges();
      await fixture.whenStable();
    };
    /** Pozivi `animate` na omotaču (`uz-scena-ulazni` / `uz-scena-odlazni` u trenutku poziva), ne na slojevima platna. */
    const naOmotacu = (klasa: string) => animate.mock.calls
      .map((poziv, i) => ({ kadrovi: poziv[0] as Keyframe[], opcije: poziv[1], el: animate.mock.contexts[i] as Element, a: animate.mock.results[i].value as Lazna }))
      .filter(p => p.a.klasa.split(' ').includes(klasa));
    const zavrsiUlazni = async () => {
      const a = naOmotacu('uz-scena-ulazni').at(-1)!.a;
      a.zavrsi();
      await a.finished;
      await Promise.resolve();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, el, prikazi, ulazni, posalji, naOmotacu, zavrsiUlazni };
  }

  it('1. slajd 1 -> slajd 2 (verzija +1): odlazni i ulazni se guraju, grupa 0 tek posle prelaza', async () => {
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na(slajd2, 1, 6));
    expect(t.prikazi().map(p => p.slajd().id)).toEqual([20, 30]);
    const [ul] = t.naOmotacu('uz-scena-ulazni');
    expect(ul.kadrovi).toEqual([{ transform: 'translate(100%, 0)' }, { transform: 'translate(0, 0)' }]);
    expect(ul.opcije).toEqual({ duration: 600, easing: 'ease-in-out', fill: 'both' });
    const [od] = t.naOmotacu('uz-scena-odlazni');
    expect(od.kadrovi).toEqual([{ transform: 'translate(0, 0)' }, { transform: 'translate(-100%, 0)' }]);
    expect(t.el.querySelector('.uz-scena-odlazni')!.getAttribute('aria-hidden')).toBe('true');
    // ulazni crta stanje pre grupe 0 (sloj grupe 0 sakriven), bez animacije slojeva
    expect(t.ulazni().korak()).toBe(-1);
    expect(t.ulazni().animacija()).toBeNull();
    expect(t.el.querySelector<HTMLElement>('.uz-scena-ulazni .uz-pl-sloj[data-sloj="tabela"]')!.style.visibility).toBe('hidden');
    expect(animate).toHaveBeenCalledTimes(2);

    await t.zavrsiUlazni();
    expect(t.prikazi().length).toBe(1);
    expect(t.el.querySelector('.uz-scena-odlazni')).toBeNull();
    expect(t.ulazni().korak()).toBe(0);
    expect(t.ulazni().animacija()).toEqual({ kljuc: 6, grupa: 0 });
    // omotač bez zaostale animacije (cancel), odlazni prekinut pri uklanjanju; grupa 0 kreće na slojevima
    expect(ul.a.cancel).toHaveBeenCalled();
    expect(od.a.cancel).toHaveBeenCalled();
    expect(animate.mock.contexts.slice(2).some(e => (e as Element).closest('.uz-pl-sloj[data-sloj="tabela"]'))).toBe(true);
  });

  it('2. slajd 2 -> slajd 1 (nazad): bez prelaza, jedan prikaz', async () => {
    const t = await scena(na(slajd2, 1, 5));
    await t.posalji(na({ ...slajd1, prelaz: GURANJE }, 0, 6));
    expect(t.naOmotacu('uz-scena-ulazni')).toEqual([]);
    expect(t.prikazi().length).toBe(1);
  });

  it('3. slajd 1 -> slajd 3 (skok): bez prelaza', async () => {
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na(slajd3, 2, 6));
    expect(animate).not.toHaveBeenCalled();
    expect(t.prikazi().length).toBe(1);
  });

  it('4. nova epoha veze, pa slajd 2: bez prelaza (i bez grupe 0)', async () => {
    const t = await scena(na(slajd1, 0, 5));
    t.fixture.componentRef.setInput('epohaVeze', 1);
    t.fixture.detectChanges();
    await t.fixture.whenStable();
    await t.posalji(na(slajd2, 1, 6));
    expect(animate).not.toHaveBeenCalled();
    expect(t.prikazi().length).toBe(1);
    expect(t.ulazni().korak()).toBe(0);
    expect(t.ulazni().animacija()).toBeNull();
  });

  it('5. prvi snimak je već slajd 2 (kasno otvoren prozor): bez prelaza, grupa 0 se ne pušta', async () => {
    const t = await scena(na(slajd2, 1, 6));
    expect(animate).not.toHaveBeenCalled();
    expect(t.ulazni().korak()).toBe(0);
    expect(t.ulazni().animacija()).toBeNull();
  });

  it('6. PRIJAVA -> slajd 2 (indeks 0): ulazni dolazi preko pozadine, odlaznog nema', async () => {
    const t = await scena(stanje({ prikaz: 'PRIJAVA', indeks: -1, trenutniSlajd: null, verzija: 5 }));
    await t.posalji(na(slajd2, 0, 6));
    expect(t.naOmotacu('uz-scena-ulazni').length).toBe(1);
    expect(t.naOmotacu('uz-scena-odlazni')).toEqual([]);
    expect(t.el.querySelector('.uz-scena-odlazni')).toBeNull();
    expect(t.ulazni().korak()).toBe(-1);
    await t.zavrsiUlazni();
    expect(t.ulazni().animacija()).toEqual({ kljuc: 6, grupa: 0 });
  });

  it('7. tokom prelaza stigne korak 1 istog slajda: odlazni nestaje, prelaz prekinut, animacija grupe 1', async () => {
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na(slajd2, 1, 6));
    const [ul] = t.naOmotacu('uz-scena-ulazni');
    await t.posalji(na(slajd2, 1, 7, { korak: 1 }));
    expect(t.prikazi().length).toBe(1);
    expect(ul.a.cancel).toHaveBeenCalled();
    expect(t.ulazni().korak()).toBe(1);
    expect(t.ulazni().animacija()).toEqual({ kljuc: 7, grupa: 1 });
  });

  it('7a. tokom prelaza snimak sa većom verzijom, a istim prikazom, slajdom i korakom: prelaz traje, grupa 0 tačno jednom', async () => {
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na(slajd2, 1, 6));
    const pre = animate.mock.calls.length;
    await t.posalji(na(slajd2, 1, 7, { brojPovezanih: 3 }));
    expect(t.prikazi().length).toBe(2);
    expect(animate.mock.calls.length).toBe(pre);
    expect(t.ulazni().korak()).toBe(-1);

    await t.zavrsiUlazni();
    expect(t.prikazi().length).toBe(1);
    expect(t.ulazni().animacija()).toEqual({ kljuc: 7, grupa: 0 });
    const posleGrupe0 = animate.mock.calls.length;
    expect(posleGrupe0).toBeGreaterThan(pre);

    await t.posalji(na(slajd2, 1, 8));
    expect(t.ulazni().animacija()).toBeNull();
    expect(animate.mock.calls.length).toBe(posleGrupe0);
  });

  it('7b. odlazni PITANJE sa prikazanim rezultatom: prikazuje rezultat iz prethodnog snimka', async () => {
    const rez: Rezultat = {
      tip: 'JEDAN_TACAN', ukupno: 1, brojevi: null, tekstovi: null, skala: null, tacnih: null,
      opcije: [{ id: 1, tekst: '3', broj: 0, tacna: null }, { id: 2, tekst: '4', broj: 1, tacna: null }],
    };
    const t = await scena(naPitanju('ZATVORENO', { indeks: 0, rezultatiPrikazani: true, javniRezultat: rez, brojOdgovora: 1, verzija: 5 }));
    await t.posalji(na(slajd2, 1, 6));
    const [odlazni] = t.prikazi();
    expect(odlazni.slajd().tip).toBe('PITANJE');
    expect(odlazni.prikaziRezultat()).toBe(true);
    expect(odlazni.rezultat()).toEqual(rez);
    expect(odlazni.faza()).toBe('ZATVORENO');
    expect(odlazni.brojOdgovora()).toBe(1);
  });

  it('8. prefers-reduced-motion: bez prelaza, grupa 0 odmah', async () => {
    vi.stubGlobal('matchMedia', smanjenoKretanjeUSistemu);
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na(slajd2, 1, 6));
    expect(t.naOmotacu('uz-scena-ulazni')).toEqual([]);
    expect(t.prikazi().length).toBe(1);
    expect(t.ulazni().korak()).toBe(0);
    expect(t.ulazni().animacija()).toEqual({ kljuc: 6, grupa: 0 });
    // nov snimak bez promene (prijava učesnika): grupa 0 se ne ponavlja
    await t.posalji(na(slajd2, 1, 7));
    expect(t.ulazni().animacija()).toBeNull();
  });

  it('9. animiraj false (konzola): bez prelaza, animacija null', async () => {
    const t = await scena(na(slajd1, 0, 5), false);
    await t.posalji(na(slajd2, 1, 6));
    expect(animate).not.toHaveBeenCalled();
    expect(t.prikazi().length).toBe(1);
    expect(t.ulazni().korak()).toBe(0);
    expect(t.ulazni().animacija()).toBeNull();
  });

  it('10. slajd bez prelaza: kao pre faze 5 (grupa 0 odmah, jedan prikaz)', async () => {
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na({ ...slajd2, prelaz: null }, 1, 6));
    expect(t.naOmotacu('uz-scena-ulazni')).toEqual([]);
    expect(t.prikazi().length).toBe(1);
    expect(t.ulazni().korak()).toBe(0);
    expect(t.ulazni().animacija()).toEqual({ kljuc: 6, grupa: 0 });
  });

  it('11. brzo prelistavanje: slajd 3 stigne dok prelaz 1 -> 2 traje: bez novog prelaza, jedan prikaz, bez zaostale animacije', async () => {
    const t = await scena(na(slajd1, 0, 5));
    await t.posalji(na(slajd2, 1, 6));
    const [ul] = t.naOmotacu('uz-scena-ulazni');
    const [od] = t.naOmotacu('uz-scena-odlazni');
    await t.posalji(na(slajd3, 2, 7));
    expect(t.naOmotacu('uz-scena-ulazni').length).toBe(1);
    expect(ul.a.cancel).toHaveBeenCalled();
    expect(od.a.cancel).toHaveBeenCalled();
    expect(t.prikazi().map(p => p.slajd().id)).toEqual([40]);
    expect(t.ulazni().korak()).toBe(0);
    // kasno razrešen finished prekinute animacije ne sme da javi kraj ni da pomeri stanje
    ul.a.zavrsi();
    await Promise.resolve();
    t.fixture.detectChanges();
    await t.fixture.whenStable();
    expect(t.prikazi().length).toBe(1);

    // sledeći korak napred posle smirivanja opet ima prelaz (slajd 3 -> 4)
    await t.posalji(na(infoSlajd({ id: 50, prelaz: GURANJE }), 3, 8));
    expect(t.naOmotacu('uz-scena-ulazni').length).toBe(2);
    expect(t.prikazi().map(p => p.slajd().id)).toEqual([40, 50]);
  });

  it('12. korak nazad tokom prelaza (slajd 2 -> 1): prelaz prekinut, bez novog, jedan prikaz (slajd 1 u istoj instanci)', async () => {
    const t = await scena(na(slajd1, 0, 5));
    const prvi = t.prikazi()[0];
    await t.posalji(na(slajd2, 1, 6));
    const [od] = t.naOmotacu('uz-scena-odlazni');
    await t.posalji(na({ ...slajd1, prelaz: GURANJE }, 0, 7));
    expect(t.naOmotacu('uz-scena-ulazni').length).toBe(1);
    expect(t.prikazi().map(p => p.slajd().id)).toEqual([20]);
    expect(t.ulazni().animacija()).toBeNull();
    // odlazni omotač slajda 1 je opet ulazni: ista instanca, krajnji kadar odlaska prekinut (bez upisanog stila)
    expect(t.prikazi()[0]).toBe(prvi);
    expect(od.a.cancel).toHaveBeenCalled();
    expect(t.el.querySelector('.uz-scena-odlazni')).toBeNull();
    expect(t.el.querySelector('.uz-scena-ulazni')!.getAttribute('aria-hidden')).toBeNull();
  });

  it('14. slajd sa ekrana postaje odlazni u istoj instanci prikaza i istom elementu (formule, slike, potezi ostaju nacrtani)', async () => {
    const t = await scena(na(slajd1, 0, 5));
    const prvi = t.prikazi()[0];
    const domacin = t.el.querySelector('app-slajd-prikaz')!;
    const omotac = t.el.querySelector('.uz-scena-ulazni')!;
    await t.posalji(na(slajd2, 1, 6));
    expect(t.prikazi()[0]).toBe(prvi);
    expect(t.el.querySelector('.uz-scena-odlazni app-slajd-prikaz')).toBe(domacin);
    expect(t.el.querySelector('.uz-scena-odlazni')).toBe(omotac);
    expect(omotac.getAttribute('aria-hidden')).toBe('true');
    // odlazni je ispred ulaznog u DOM-u (ulazni iznad njega, z-index), ulazni je nov prikaz slajda 2
    expect(omotac.nextElementSibling!.classList).toContain('uz-scena-ulazni');
    expect(t.ulazni()).not.toBe(prvi);
    expect(prvi.animacija()).toBeNull();
    await t.zavrsiUlazni();
    expect(t.prikazi().length).toBe(1);
    expect(domacin.isConnected).toBe(false);
  });

  it('13. FADE: animira se samo ulazni (providnost), odlazni miruje ispod', async () => {
    const t = await scena(na(slajd2, 1, 5));
    await t.posalji(na(slajd3, 2, 6));
    expect(t.naOmotacu('uz-scena-ulazni').map(p => p.kadrovi)).toEqual([[{ opacity: 0 }, { opacity: 1 }]]);
    expect(t.naOmotacu('uz-scena-odlazni')).toEqual([]);
    expect(t.prikazi().map(p => p.slajd().id)).toEqual([30, 40]);
    await t.zavrsiUlazni();
    expect(t.prikazi().map(p => p.slajd().id)).toEqual([40]);
  });
});

import { EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationStore } from '../../../core/state/notification.store';
import type { OblikSloj, Platno, Sloj, TabelaSloj } from '../data-access/platno.models';
import { animacija, pasus, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { novaTabela, noviOblik, noviTekst } from '../data-access/platno-novo';
import type { KomandeTeksta, RezultatTeksta } from './tekst/tekst-uredjivac.component';
import type { StanjeSelekcije } from './tekst/stil-teksta';
import { izmeniSlojeve, medjuspremnik, pomeriSlojeve } from './komande';
import { SAT_ISTORIJE } from './istorija';
import { PlatnoEditorStore } from './platno-editor.store';

/** Pravougaonik na (x, y), 100 x 50 (Nacrt). */
function oblik(id: string, x = 100, y = 100, deo: Partial<OblikSloj> = {}): OblikSloj {
  return { ...noviOblik(id, 'NACRT', 'PRAVOUGAONIK'), x, y, sirina: 100, visina: 50, ...deo };
}
const dok = (slojevi: Sloj[], animacije: Platno['animacije'] = []): Platno => platnoSaAnimacijama(animacije, slojevi);
const ids = (p: Platno) => p.slojevi.map((s) => s.id);

describe('PlatnoEditorStore', () => {
  let t: number;
  let obavestenja: { greska: ReturnType<typeof vi.fn>; uspeh: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof PlatnoEditorStore>;
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;

  beforeEach(() => {
    t = 0;
    medjuspremnik.slojevi = [];
    obavestenja = { greska: vi.fn(), uspeh: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PlatnoEditorStore,
        { provide: NotificationStore, useValue: obavestenja },
        { provide: SAT_ISTORIJE, useValue: () => t },
      ],
    });
    store = TestBed.inject(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
  });

  afterEach(() => {
    medjuspremnik.slojevi = [];
  });

  function pocni(p: Platno): Platno {
    store.inicijalizuj(p);
    return p;
  }

  it('inicijalizuj postavlja dokument, prazan izbor i istoriju, i ne zove izlaz', () => {
    const p = pocni(dok([oblik('s1')]));
    expect(store.platno()).toBe(p);
    expect(store.izbor()).toEqual([]);
    expect(store.mozeNazad()).toBe(false);
    expect(izlaz).not.toHaveBeenCalled();
  });

  it('primeni beleži korak i zove izlaz sa novim dokumentom', () => {
    pocni(dok([oblik('s1')]));
    expect(store.primeni((p) => ({ ...p, pozadina: { boja: '#000000', medijId: null } }))).toBe(true);
    expect(izlaz).toHaveBeenCalledTimes(1);
    expect(izlaz).toHaveBeenCalledWith(store.platno());
    expect(store.platno().pozadina.boja).toBe('#000000');
    expect(store.mozeNazad()).toBe(true);
  });

  it('primeni koja vraća isti objekat -> false, bez izlaza i bez koraka', () => {
    pocni(dok([oblik('s1')]));
    expect(store.primeni((p) => p)).toBe(false);
    expect(izlaz).not.toHaveBeenCalled();
    expect(store.mozeNazad()).toBe(false);
  });

  it('zOsaIzabranih(NAPRED) za sloj na vrhu: bez izlaza i mozeNazad false', () => {
    pocni(dok([oblik('s1'), oblik('s2')]));
    store.izaberi(['s2']);
    store.zOsaIzabranih('NAPRED');
    expect(izlaz).not.toHaveBeenCalled();
    expect(store.mozeNazad()).toBe(false);
  });

  it('zaključan sloj se pomera po z-osi (odluka 14)', () => {
    pocni(dok([oblik('s1', 100, 100, { zakljucan: true }), oblik('s2')]));
    store.izaberi(['s1']);
    store.zOsaIzabranih('NA_VRH');
    expect(ids(store.platno())).toEqual(['s2', 's1']);
    expect(obavestenja.greska).not.toHaveBeenCalled();
  });

  it('301. sloj (ubaci na platnu sa 300): null, poruka, dokument isti, istorija prazna', () => {
    const p = pocni(dok(Array.from({ length: 300 }, (_, i) => oblik(`s${i + 1}`))));
    expect(store.ubaci((id) => oblik(id))).toBeNull();
    expect(obavestenja.greska).toHaveBeenCalledWith('Slajd može imati najviše 300 slojeva.');
    expect(store.platno()).toBe(p);
    expect(store.mozeNazad()).toBe(false);
    expect(izlaz).not.toHaveBeenCalled();
  });

  it('ubaci daje nov id, stavlja sloj na vrh i bira ga', () => {
    pocni(dok([oblik('s1')]));
    const id = store.ubaci((novi, p) => oblik(novi, p.slojevi.length * 10));
    expect(id).toBe('s2');
    expect(ids(store.platno())).toEqual(['s1', 's2']);
    expect(store.izbor()).toEqual(['s2']);
    expect(store.jedan()?.id).toBe('s2');
  });

  it('ponisti i ponovi: snimak, izlaz i zastavice', () => {
    const p0 = pocni(dok([oblik('s1')]));
    store.izaberi(['s1']);
    store.pomeriIzabrane(10, 0);
    const p1 = store.platno();
    expect([store.mozeNazad(), store.mozeNapred()]).toEqual([true, false]);
    store.ponisti();
    expect(store.platno()).toBe(p0);
    expect(izlaz).toHaveBeenLastCalledWith(p0);
    expect([store.mozeNazad(), store.mozeNapred()]).toEqual([false, true]);
    store.ponovi();
    expect(store.platno()).toBe(p1);
    expect(izlaz).toHaveBeenLastCalledWith(p1);
    expect([store.mozeNazad(), store.mozeNapred()]).toEqual([true, false]);
    expect(izlaz).toHaveBeenCalledTimes(3);
    store.ponovi();   // nema šta
    expect(izlaz).toHaveBeenCalledTimes(3);
  });

  it('izaberi filtrira nepostojeće; prebaciIzbor dodaje i uklanja; izaberiSve preskače skrivene', () => {
    pocni(dok([oblik('s1'), oblik('s2'), oblik('s3')]));
    store.izaberi(['nema']);
    expect(store.izbor()).toEqual([]);
    store.izaberi(['s2', 'nema', 's2']);
    expect(store.izbor()).toEqual(['s2']);
    store.prebaciIzbor('s1');
    expect(store.izbor()).toEqual(['s2', 's1']);
    expect(store.izabraniSlojevi().map((s) => s.id)).toEqual(['s1', 's2']);   // redom z-ose
    store.prebaciIzbor('s2');
    expect(store.izbor()).toEqual(['s1']);
    store.prebaciIzbor('nema');
    expect(store.izbor()).toEqual(['s1']);
    store.prebaciSkriven('s3');
    store.izaberiSve();
    expect(store.izbor()).toEqual(['s1', 's2']);
    store.ponistiIzbor();
    expect(store.izbor()).toEqual([]);
  });

  it('izaberiSve (Ctrl+A) preskače zaključane; zaključan se i dalje bira klikom/panelom', () => {
    pocni(dok([oblik('s1', 100, 100, { zakljucan: true }), oblik('s2'), oblik('s3')]));
    store.izaberiSve();
    expect(store.izbor()).toEqual(['s2', 's3']);
    // izbor bez zaključanog se pomera strelicama (ranije: "Sloj je zaključan." i ništa)
    store.pomeriIzabrane(1, 0);
    expect(store.platno().slojevi.map((s) => s.x)).toEqual([100, 101, 101]);
    store.izaberi(['s1']);
    expect(store.izbor()).toEqual(['s1']);
    store.prebaciIzbor('s2');
    expect(store.izbor()).toEqual(['s1', 's2']);
  });

  it('brisanje izabranog sloja izbacuje ga iz izbora (i animacije sloja)', () => {
    pocni(dok([oblik('s1'), oblik('s2')], [animacija('a1', 's1')]));
    store.izaberi(['s1']);
    store.obrisiIzabrane();
    expect(ids(store.platno())).toEqual(['s2']);
    expect(store.platno().animacije).toEqual([]);
    expect(store.izbor()).toEqual([]);
  });

  it('obrisiIzabrane sa zaključanim slojem: poruka, ništa obrisano', () => {
    const p = pocni(dok([oblik('s1', 100, 100, { zakljucan: true }), oblik('s2')]));
    store.izaberi(['s1', 's2']);
    store.obrisiIzabrane();
    expect(obavestenja.greska).toHaveBeenCalledWith('Sloj je zaključan.');
    expect(store.platno()).toBe(p);
    expect(izlaz).not.toHaveBeenCalled();
  });

  it('pomeriIzabrane i duplirajIzabrane sa zaključanim slojem: poruka, ništa', () => {
    const p = pocni(dok([oblik('s1', 100, 100, { zakljucan: true })]));
    store.izaberi(['s1']);
    store.pomeriIzabrane(1, 0);
    store.duplirajIzabrane();
    expect(obavestenja.greska).toHaveBeenCalledTimes(2);
    expect(store.platno()).toBe(p);
  });

  it('pomeriIzabrane(1, 0) u t = 0 i t = 100: jedan korak', () => {
    const p0 = pocni(dok([oblik('s1')]));
    store.izaberi(['s1']);
    store.pomeriIzabrane(1, 0);
    t = 100;
    store.pomeriIzabrane(1, 0);
    expect(store.platno().slojevi[0].x).toBe(102);
    expect(izlaz).toHaveBeenCalledTimes(2);
    store.ponisti();
    expect(store.platno()).toBe(p0);
    expect(store.mozeNazad()).toBe(false);
  });

  it('pomeriIzabrane(1, 0) u t = 0 i t = 1001: dva koraka', () => {
    pocni(dok([oblik('s1')]));
    store.izaberi(['s1']);
    store.pomeriIzabrane(1, 0);
    t = 1001;
    store.pomeriIzabrane(1, 0);
    store.ponisti();
    expect(store.platno().slojevi[0].x).toBe(101);
    expect(store.mozeNazad()).toBe(true);
  });

  it('kopiraj u jednoj instanci, nalepi u drugoj: kopija sa novim id-jem, izabrana (međuspremnik živi kroz instance)', () => {
    pocni(dok([oblik('s1', 100, 100, { naziv: 'Kvadrat' })], [animacija('a1', 's1')]));
    store.izaberi(['s1']);
    store.kopiraj();
    const druga = TestBed.runInInjectionContext(() => new PlatnoEditorStore());
    druga.inicijalizuj(dok([oblik('s1', 0, 0), oblik('s2', 0, 0)]));
    druga.nalepi();
    const p = druga.platno();
    expect(ids(p)).toEqual(['s1', 's2', 's3']);
    expect(p.slojevi[2]).toMatchObject({ naziv: 'Kvadrat', x: 112, y: 112 });
    expect(p.animacije).toEqual([]);
    expect(druga.izbor()).toEqual(['s3']);
  });

  it('kopiraj pravi duboku kopiju (izmena izvora posle kopiranja ne menja međuspremnik)', () => {
    pocni(dok([oblik('s1')]));
    store.izaberi(['s1']);
    store.kopiraj();
    expect(medjuspremnik.slojevi[0]).not.toBe(store.platno().slojevi[0]);
    expect(medjuspremnik.slojevi[0]).toEqual(store.platno().slojevi[0]);
  });

  it('nalepi sa praznim međuspremnikom ne radi ništa', () => {
    pocni(dok([oblik('s1')]));
    store.nalepi();
    expect(izlaz).not.toHaveBeenCalled();
  });

  it('duplirajIzabrane: kopije izabranih na vrh, izabrane su kopije', () => {
    pocni(dok([oblik('s1'), oblik('s2'), oblik('s3')]));
    store.izaberi(['s3', 's1']);
    store.duplirajIzabrane();
    expect(ids(store.platno())).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(store.izbor()).toEqual(['s4', 's5']);
    expect(medjuspremnik.slojevi).toEqual([]);
  });

  it('premestiSloj, zakljucaj i preimenuj idu kroz istoriju; preimenuj: prazno -> null, > 60 se odseca', () => {
    pocni(dok([oblik('s1'), oblik('s2')]));
    store.premestiSloj('s2', 0);
    expect(ids(store.platno())).toEqual(['s2', 's1']);
    store.zakljucaj('s1', true);
    expect(store.platno().slojevi[1].zakljucan).toBe(true);
    store.zakljucaj('s1', true);   // bez promene
    expect(izlaz).toHaveBeenCalledTimes(2);
    store.preimenuj('s1', '  Naslov  ');
    expect(store.platno().slojevi[1].naziv).toBe('Naslov');
    store.preimenuj('s1', '   ');
    expect(store.platno().slojevi[1].naziv).toBeNull();
    store.preimenuj('s1', 'ž'.repeat(61));
    expect(store.platno().slojevi[1].naziv).toBe('ž'.repeat(60));
    expect(izlaz).toHaveBeenCalledTimes(5);
  });

  it('prebaciSkriven ne menja mozeNazad i ne zove izlaz; skriven sloj izlazi iz izbora', () => {
    pocni(dok([oblik('s1'), oblik('s2')]));
    store.izaberi(['s1', 's2']);
    store.prebaciSkriven('s1');
    expect(store.skriveni()).toEqual(['s1']);
    expect(store.izbor()).toEqual(['s2']);
    expect(store.mozeNazad()).toBe(false);
    expect(izlaz).not.toHaveBeenCalled();
    store.prebaciSkriven('s1');
    expect(store.skriveni()).toEqual([]);
  });

  it('zaPrikaz nema animacija ni skrivenih slojeva', () => {
    pocni(dok([oblik('s1'), oblik('s2')], [animacija('a1', 's1')]));
    store.prebaciSkriven('s2');
    const z = store.zaPrikaz();
    expect(z.animacije).toEqual([]);
    expect(ids(z)).toEqual(['s1']);
    expect(store.platno().animacije.length).toBe(1);
  });

  it('obrisan skriven sloj izlazi iz skrivenih (nov sloj sa istim id-jem nije skriven)', () => {
    pocni(dok([oblik('s1'), oblik('s2')]));
    store.prebaciSkriven('s2');
    store.izaberi(['s1']);
    store.prebaciIzbor('s2');
    store.obrisiIzabrane();
    expect(store.skriveni()).toEqual([]);
  });

  it('inicijalizuj briše istoriju (mozeNazad false posle prethodnih izmena)', () => {
    pocni(dok([oblik('s1')]));
    store.izaberi(['s1']);
    store.pomeriIzabrane(5, 5);
    expect(store.mozeNazad()).toBe(true);
    pocni(dok([oblik('s9')]));
    expect(store.mozeNazad()).toBe(false);
    expect(store.mozeNapred()).toBe(false);
    expect(store.izbor()).toEqual([]);
    store.ponisti();
    expect(ids(store.platno())).toEqual(['s9']);
  });

  it('postaviTab menja tab', () => {
    store.postaviTab('SLOJEVI');
    expect(store.tab()).toBe('SLOJEVI');
  });

  it('isprazni je idempotentan: posle predaje ne predaje ponovo (ponovljen Ctrl+S ne pravi nove PUT-ove)', () => {
    pocni(dok([oblik('s1')]));
    store.isprazni();
    expect(izlaz).not.toHaveBeenCalled();   // početni dokument se ne predaje
    store.izaberi(['s1']);
    store.pomeriIzabrane(1, 0);
    expect(izlaz).toHaveBeenCalledTimes(1);
    store.isprazni();
    store.isprazni();
    expect(izlaz).toHaveBeenCalledTimes(1);
    expect(store.imaOtvoreno()).toBe(false);
  });

  it('isprazni predaje izmenu koja nije predata jer izlaz još nije bio postavljen', () => {
    const drugi = TestBed.runInInjectionContext(() => new PlatnoEditorStore());
    drugi.inicijalizuj(dok([oblik('s1')]));
    drugi.izaberi(['s1']);
    drugi.pomeriIzabrane(1, 0);
    const f = vi.fn<(p: Platno) => void>();
    drugi.postaviIzlaz(f);
    drugi.isprazni();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(drugi.platno());
    drugi.isprazni();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('isprazni bez inicijalizacije ne predaje podrazumevani prazan dokument', () => {
    const drugi = TestBed.runInInjectionContext(() => new PlatnoEditorStore());
    const f = vi.fn<(p: Platno) => void>();
    drugi.postaviIzlaz(f);
    drugi.isprazni();
    expect(f).not.toHaveBeenCalled();
  });

  it('uništavanje instance predaje nepredatu izmenu (onDestroy), a predatu ne ponavlja', () => {
    const inj = createEnvironmentInjector([PlatnoEditorStore], TestBed.inject(EnvironmentInjector));
    const s = inj.get(PlatnoEditorStore);
    s.inicijalizuj(dok([oblik('s1')]));
    s.izaberi(['s1']);
    s.pomeriIzabrane(3, 0);   // izlaz još nije postavljen
    const f = vi.fn<(p: Platno) => void>();
    s.postaviIzlaz(f);
    inj.destroy();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0].slojevi[0].x).toBe(103);

    const inj2 = createEnvironmentInjector([PlatnoEditorStore], TestBed.inject(EnvironmentInjector));
    const s2 = inj2.get(PlatnoEditorStore);
    const f2 = vi.fn<(p: Platno) => void>();
    s2.postaviIzlaz(f2);
    s2.inicijalizuj(dok([oblik('s1')]));
    s2.izaberi(['s1']);
    s2.pomeriIzabrane(3, 0);
    inj2.destroy();
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it('gest u toku: primeni, ponisti i ponovi ne rade; imaOtvoreno true', () => {
    const p = pocni(dok([oblik('s1')]));
    store.izaberi(['s1']);
    store.pomeriIzabrane(1, 0);
    const p1 = store.platno();
    store.pocniGest();
    expect(store.gest()).toBe(p1);
    expect(store.imaOtvoreno()).toBe(true);
    expect(store.primeni((x) => ({ ...x, slojevi: [] }))).toBe(false);
    store.ponisti();
    expect(store.platno()).toBe(p1);
    expect(store.platno()).not.toBe(p);
  });
  it('zakljucanUIzboru: true i poruka samo kad je u izboru zaključan sloj', () => {
    pocni(dok([oblik('s1'), oblik('s2', 100, 100, { zakljucan: true })]));
    store.izaberi(['s1']);
    expect(store.zakljucanUIzboru()).toBe(false);
    expect(obavestenja.greska).not.toHaveBeenCalled();
    store.izaberi(['s1', 's2']);
    expect(store.zakljucanUIzboru()).toBe(true);
    expect(obavestenja.greska).toHaveBeenCalledExactlyOnceWith('Sloj je zaključan.');
  });

  describe('gest mišem (F5)', () => {
    const pomeri = (dx: number) => (p: Platno) => pomeriSlojeve(p, new Set(['s1']), dx, 0);

    it('pocniGest, azurirajGest od početka, zavrsiGest: jedan korak, jedna predaja (kraj gesta)', () => {
      const p = pocni(dok([oblik('s1')]));
      store.pocniGest();
      expect(store.gest()).toBe(p);
      expect(store.imaOtvoreno()).toBe(true);
      store.azurirajGest(pomeri(10));
      store.azurirajGest(pomeri(25));
      expect(store.platno().slojevi[0].x).toBe(125);   // uvek od početka, ne zbirno
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
      store.zavrsiGest();
      expect(store.gest()).toBeNull();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(izlaz.mock.calls[0][0].slojevi[0].x).toBe(125);
      expect(store.mozeNazad()).toBe(true);
      store.ponisti();
      expect(store.platno()).toBe(p);
    });

    it('drugi pocniGest usred gesta ne pomera početak', () => {
      const p = pocni(dok([oblik('s1')]));
      store.pocniGest();
      store.azurirajGest(pomeri(10));
      store.pocniGest();
      expect(store.gest()).toBe(p);
    });

    it('primeni tokom gesta -> false (ni korak ni izlaz); ponisti tokom gesta ne ostavlja polovičan dokument', () => {
      pocni(dok([oblik('s1')]));
      store.izaberi(['s1']);
      store.pocniGest();
      store.azurirajGest(pomeri(40));
      const tokom = store.platno();
      expect(store.primeni((x) => ({ ...x, slojevi: [] }))).toBe(false);
      store.pomeriIzabrane(1, 0);
      store.ponisti();
      expect(store.platno()).toBe(tokom);
      expect(izlaz).not.toHaveBeenCalled();
      store.zavrsiGest();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(store.platno().slojevi[0].x).toBe(140);
    });

    it('zavrsiGest bez promene (ili bez gesta) -> nema koraka ni izlaza', () => {
      pocni(dok([oblik('s1')]));
      store.zavrsiGest();
      store.pocniGest();
      store.azurirajGest((p) => p);
      store.zavrsiGest();
      expect(store.gest()).toBeNull();
      expect(store.mozeNazad()).toBe(false);
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('azurirajGest bez gesta ne menja dokument', () => {
      const p = pocni(dok([oblik('s1')]));
      store.azurirajGest(pomeri(10));
      expect(store.platno()).toBe(p);
    });

    it('prekiniGest vraća početak bez koraka i bez izlaza; izbor ostaje', () => {
      const p = pocni(dok([oblik('s1')]));
      store.izaberi(['s1']);
      store.pocniGest();
      store.azurirajGest(pomeri(30));
      store.prekiniGest();
      expect(store.platno()).toBe(p);
      expect(store.gest()).toBeNull();
      expect(store.izbor()).toEqual(['s1']);
      expect(store.mozeNazad()).toBe(false);
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('isprazni usred gesta završava gest i predaje kraj (pražnjenje pre čuvanja); ponovljen ne predaje', () => {
      pocni(dok([oblik('s1')]));
      store.pocniGest();
      store.azurirajGest(pomeri(7));
      store.isprazni();
      expect(store.gest()).toBeNull();
      expect(store.imaOtvoreno()).toBe(false);
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(izlaz.mock.calls[0][0].slojevi[0].x).toBe(107);
      expect(store.mozeNazad()).toBe(true);
      store.isprazni();
      expect(izlaz).toHaveBeenCalledTimes(1);
    });

    it('store uništen usred gesta (resetTestingModule) -> izlaz dobija dokument sa krajem gesta (Review Focus 3)', () => {
      pocni(dok([oblik('s1')]));
      store.pocniGest();
      store.azurirajGest(pomeri(55));
      TestBed.resetTestingModule();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(izlaz.mock.calls[0][0].slojevi[0].x).toBe(155);
    });
  });

  describe('uređivanje teksta (F12)', () => {
    const PRAZNO: StanjeSelekcije = {
      font: null, velicina: null, boja: null, podebljano: null, kurziv: null, podvuceno: null, precrtano: null, polozaj: null,
      poravnanje: null, lista: null, nivo: null, proredProcenat: null, razmakPre: null, razmakPosle: null, polozaji: [], liste: [],
    };
    /** Tekst sa pasusima "A", "B" i animacijom pasusa 1 (a1) i celog sloja (a2). */
    const tekst = (id = 't1') => ({ ...noviTekst(id, 'NACRT', { x: 0, y: 0, sirina: 200, visina: 100 }), pasusi: [pasus('A'), pasus('B')] });
    const sa = () => dok([tekst(), oblik('s1')], [animacija('a1', 't1', { pasus: 1 }), animacija('a2', 't1')]);
    /** Lažni uređivač: svaki presek vraća sledeći rezultat iz reda (pa null). */
    function lazni(...red: (RezultatTeksta | null)[]): KomandeTeksta & {
      presek: ReturnType<typeof vi.fn>; odbaciPresek: ReturnType<typeof vi.fn>;
    } {
      return {
        presek: vi.fn(() => red.shift() ?? null), odbaciPresek: vi.fn(() => undefined), postaviStil: vi.fn(), prebaciStil: vi.fn(),
        postaviPasus: vi.fn(), prebaciListu: vi.fn(), promeniNivo: vi.fn(), stanje: signal(PRAZNO), fokus: vi.fn(),
        ponisti: vi.fn(() => false), ponovi: vi.fn(() => false), istorija: signal({ nazad: false, napred: false }),
      };
    }
    const rezultat = (tekstovi: string[], mapa: (number | null)[]): RezultatTeksta => ({ pasusi: tekstovi.map((t) => pasus(t)), mapa });
    const tekstoviSloja = (p: Platno, id = 't1') =>
      (p.slojevi.find((s) => s.id === id) as { pasusi: { delovi: { tekst: string }[] }[] }).pasusi.map((x) => x.delovi[0].tekst);

    it('pocniUredjivanje nad zaključanim -> false + poruka; nad OBLIK (ne-TEKST) -> false bez poruke', () => {
      pocni(dok([{ ...tekst(), zakljucan: true }, oblik('s1')]));
      expect(store.pocniUredjivanje('t1')).toBe(false);
      expect(obavestenja.greska).toHaveBeenCalledWith('Sloj je zaključan.');
      obavestenja.greska.mockClear();
      expect(store.pocniUredjivanje('s1')).toBe(false);
      expect(store.pocniUredjivanje('nema')).toBe(false);
      expect(obavestenja.greska).not.toHaveBeenCalled();
      expect(store.uredjivanje()).toBeNull();
    });

    it('pocniUredjivanje: sesija, izbor tog sloja, tab Svojstva; zaPrikaz nema taj sloj; imaOtvoreno true', () => {
      pocni(sa());
      store.postaviTab('SLOJEVI');
      expect(store.pocniUredjivanje('t1')).toBe(true);
      expect(store.uredjivanje()).toEqual({ slojId: 't1', celija: null });
      expect(store.izbor()).toEqual(['t1']);
      expect(store.tab()).toBe('SVOJSTVA');
      expect(store.zaPrikaz().slojevi.map((s) => s.id)).toEqual(['s1']);
      expect(store.imaOtvoreno()).toBe(true);
    });

    it('zavrsiUredjivanje posle unosa: jedan korak istorije, jedan poziv izlaza, uredjivanje null', () => {
      const p = pocni(sa());
      store.pocniUredjivanje('t1');
      const k = lazni(rezultat(['AX', 'B'], [0, 1]));
      store.registrujUredjivac(k);
      store.zavrsiUredjivanje();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(tekstoviSloja(izlaz.mock.calls[0][0])).toEqual(['AX', 'B']);
      expect(store.uredjivanje()).toBeNull();
      expect(store.aktivniUredjivac()).toBeNull();
      expect(store.imaOtvoreno()).toBe(false);
      store.ponisti();
      expect(store.platno()).toBe(p);
      expect(store.mozeNazad()).toBe(false);
    });

    it('prazan rezultat (bez izmene) -> bez koraka istorije i bez izlaza', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni());
      store.zavrsiUredjivanje();
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
    });

    it('zabeleziTekst dva puta tokom sesije sa unosom između -> dva koraka; sesija ostaje otvorena', () => {
      const p = pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['A1', 'B'], [0, 1]), rezultat(['A12', 'B'], [0, 1])));
      store.zabeleziTekst();
      t = 100;
      store.zabeleziTekst();
      expect(izlaz).toHaveBeenCalledTimes(2);
      expect(store.uredjivanje()).not.toBeNull();
      store.zavrsiUredjivanje();
      store.ponisti();
      expect(tekstoviSloja(store.platno())).toEqual(['A1', 'B']);
      store.ponisti();
      expect(store.platno()).toBe(p);
    });

    it('rezultat sa mapom [0, null] uklanja animaciju pasusa 1 uz poruku; animacija sloja ostaje', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['AB'], [0, null])));
      store.zavrsiUredjivanje();
      expect(store.platno().animacije.map((a) => a.id)).toEqual(['a2']);
      expect(obavestenja.info).toHaveBeenCalledWith('Uklonjene animacije pasusa koji više ne postoje: 1.');
    });

    it('isprazni() tokom sesije sa unosom: izlaz dobija tekst, sesija ostaje otvorena; ponovljen isprazni ne predaje', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['Zdravo', 'B'], [0, 1])));
      store.isprazni();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(tekstoviSloja(izlaz.mock.calls[0][0])).toEqual(['Zdravo', 'B']);
      expect(store.uredjivanje()).not.toBeNull();
      expect(store.imaOtvoreno()).toBe(true);
      store.isprazni();
      expect(izlaz).toHaveBeenCalledTimes(1);
    });

    it('store se uništava tokom uređivanja (resetTestingModule) -> izlaz dobija dokument sa novim tekstom (Review Focus 1 i 3)', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['Poslednje', 'B'], [0, 1])));
      TestBed.resetTestingModule();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(tekstoviSloja(izlaz.mock.calls[0][0])).toEqual(['Poslednje', 'B']);
    });

    it('primeni tokom sesije prvo beleži tekst (redosled istorije: tekst, pa X)', () => {
      const p = pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['AX', 'B'], [0, 1])));
      store.primeni((d) => izmeniSlojeve(d, new Set(['s1']), (s) => ({ ...s, x: 500 })));
      expect(izlaz).toHaveBeenCalledTimes(2);
      expect(tekstoviSloja(izlaz.mock.calls[0][0])).toEqual(['AX', 'B']);
      expect(izlaz.mock.calls[0][0].slojevi[1].x).toBe(100);
      expect(izlaz.mock.calls[1][0].slojevi[1].x).toBe(500);
      store.zavrsiUredjivanje();
      store.ponisti();
      expect(tekstoviSloja(store.platno())).toEqual(['AX', 'B']);
      store.ponisti();
      expect(store.platno()).toBe(p);
    });

    it('ponisti tokom sesije završava sesiju (tekst je korak) pa poništava taj korak', () => {
      const p = pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['AX', 'B'], [0, 1])));
      store.ponisti();
      expect(store.uredjivanje()).toBeNull();
      expect(store.platno()).toBe(p);
      store.ponovi();
      expect(tekstoviSloja(store.platno())).toEqual(['AX', 'B']);
    });

    it('drugi pocniUredjivanje (drugi sloj) završava prvu sesiju', () => {
      pocni(dok([tekst('t1'), tekst('t2')]));
      store.pocniUredjivanje('t1');
      const prvi = lazni(rezultat(['A1', 'B'], [0, 1]));
      store.registrujUredjivac(prvi);
      expect(store.pocniUredjivanje('t2')).toBe(true);
      expect(prvi.presek).toHaveBeenCalled();
      expect(tekstoviSloja(store.platno(), 't1')).toEqual(['A1', 'B']);
      expect(store.uredjivanje()?.slojId).toBe('t2');
      expect(store.aktivniUredjivac()).toBeNull();
    });

    it('sloj u uređivanju nestane iz dokumenta (inicijalizuj) -> sesija se zatvara', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni());
      store.inicijalizuj(dok([oblik('s1')]));
      expect(store.uredjivanje()).toBeNull();
      expect(store.aktivniUredjivac()).toBeNull();
    });

    it('Fix 1/1: ubaci tokom sesije završava uređivanje (tekst je korak), pa ubacuje; nov sloj izabran, sesija zatvorena', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['AX', 'B'], [0, 1])));
      const id = store.ubaci((novi) => oblik(novi, 600, 300));
      expect(id).not.toBeNull();
      expect(store.uredjivanje()).toBeNull();
      expect(store.aktivniUredjivac()).toBeNull();
      expect(store.imaOtvoreno()).toBe(false);
      expect(store.izbor()).toEqual([id]);
      expect(tekstoviSloja(store.platno())).toEqual(['AX', 'B']);
    });

    it('Fix 1/3: odbijena izmena teksta (preko granice) ne troši presek: odbaciPresek, bez izlaza i bez koraka', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      const k = lazni(rezultat(['x'.repeat(50_001), 'B'], [0, 1]));
      store.registrujUredjivac(k);
      store.zabeleziTekst();
      expect(obavestenja.greska).toHaveBeenCalledWith('Slajd može imati najviše 50000 znakova teksta.');
      expect(k.odbaciPresek).toHaveBeenCalledTimes(1);
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
      expect(store.uredjivanje()).not.toBeNull();
    });

    it('Fix 1/3: usred gesta zabeleziTekst ne uzima presek (sesija čeka kraj gesta)', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      const k = lazni(rezultat(['AX', 'B'], [0, 1]));
      store.registrujUredjivac(k);
      store.pocniGest();
      store.zabeleziTekst();
      expect(k.presek).not.toHaveBeenCalled();
      store.zavrsiGest();
      store.zabeleziTekst();
      expect(tekstoviSloja(store.platno())).toEqual(['AX', 'B']);
    });

    it('uspešan presek ne zove odbaciPresek', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      const k = lazni(rezultat(['AX', 'B'], [0, 1]));
      store.registrujUredjivac(k);
      store.zabeleziTekst();
      expect(k.odbaciPresek).not.toHaveBeenCalled();
    });

    it('Fix 2/2: nalepi i duplirajIzabrane tokom sesije zatvaraju uređivanje (tekst je korak)', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['AX', 'B'], [0, 1])));
      store.izaberi(['s1']);
      store.kopiraj();
      store.izaberi(['t1']);
      store.nalepi();
      expect(store.uredjivanje()).toBeNull();
      expect(store.imaOtvoreno()).toBe(false);
      expect(tekstoviSloja(store.platno())).toEqual(['AX', 'B']);
      expect(store.izbor()).not.toContain('t1');

      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni());
      store.duplirajIzabrane();
      expect(store.uredjivanje()).toBeNull();
      expect(store.izbor()).toHaveLength(1);
      expect(store.izbor()[0]).not.toBe('t1');
    });

    it('Fix 2/3: zavrsiUredjivanje sa odbijenim presekom ne zatvara sesiju (tekst ostaje u uređivaču)', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      const preko = rezultat(['x'.repeat(50_001), 'B'], [0, 1]);
      const k = lazni(preko, preko);
      store.registrujUredjivac(k);
      expect(store.zavrsiUredjivanje()).toBe(false);
      expect(store.uredjivanje()).not.toBeNull();
      expect(store.aktivniUredjivac()).toBe(k);
      // ni druga sesija ni ubacivanje ne smeju da je zatvore
      expect(store.pocniUredjivanje('s1')).toBe(false);
      expect(store.ubaci((id) => oblik(id))).toBeNull();
      expect(store.uredjivanje()?.slojId).toBe('t1');
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('Fix 2/3: zavrsiUredjivanje usred gesta ne zatvara sesiju; posle gesta tekst ulazi i sesija se zatvara', () => {
      pocni(sa());
      store.pocniUredjivanje('t1');
      store.registrujUredjivac(lazni(rezultat(['AX', 'B'], [0, 1])));
      store.pocniGest();
      expect(store.zavrsiUredjivanje()).toBe(false);
      expect(store.uredjivanje()).not.toBeNull();
      store.zavrsiGest();
      expect(store.zavrsiUredjivanje()).toBe(true);
      expect(store.uredjivanje()).toBeNull();
      expect(tekstoviSloja(store.platno())).toEqual(['AX', 'B']);
    });

    it('pocniUredjivanje usred gesta -> false', () => {
      pocni(sa());
      store.pocniGest();
      expect(store.pocniUredjivanje('t1')).toBe(false);
    });

    describe('zajednički krug F12/F13', () => {
      it('ponistiUTekstu / ponoviUTekstu: tokom sesije idu u istoriju uređivača; sesija ostaje, istorija platna netaknuta', () => {
        pocni(sa());
        expect(store.ponistiUTekstu()).toBe(false);
        store.pocniUredjivanje('t1');
        const k = lazni();
        store.registrujUredjivac(k);
        vi.mocked(k.ponisti).mockReturnValueOnce(true);
        vi.mocked(k.ponovi).mockReturnValueOnce(true);
        expect(store.ponistiUTekstu()).toBe(true);
        expect(store.ponoviUTekstu()).toBe(true);
        // uređivač nema šta da poništi -> false (pozivalac tada ide na istoriju platna)
        expect(store.ponistiUTekstu()).toBe(false);
        expect(k.ponisti).toHaveBeenCalledTimes(2);
        expect(store.uredjivanje()).not.toBeNull();
        expect(store.mozeNazad()).toBe(false);
        expect(izlaz).not.toHaveBeenCalled();
      });

      it('ponistiUTekstu usred gesta: false, uređivač se ne zove', () => {
        pocni(sa());
        store.pocniUredjivanje('t1');
        const k = lazni();
        store.registrujUredjivac(k);
        store.pocniGest();
        expect(store.ponistiUTekstu()).toBe(false);
        expect(k.ponisti).not.toHaveBeenCalled();
      });

      it('F12 rr2/2: duplirajIzabrane tokom sesije kopira NOVI tekst (tekst se beleži pre čitanja izbora)', () => {
        pocni(sa());
        store.pocniUredjivanje('t1');
        store.registrujUredjivac(lazni(rezultat(['Novo', 'B'], [0, 1])));
        store.duplirajIzabrane();
        const p = store.platno();
        expect(p.slojevi).toHaveLength(3);
        expect(tekstoviSloja(p, 't1')).toEqual(['Novo', 'B']);
        expect(tekstoviSloja(p, store.izbor()[0])).toEqual(['Novo', 'B']);
      });

      it('F12 rr2/2: kopiraj tokom sesije kopira NOVI tekst; sesija ostaje otvorena', () => {
        pocni(sa());
        store.pocniUredjivanje('t1');
        store.registrujUredjivac(lazni(rezultat(['Kopija', 'B'], [0, 1])));
        store.kopiraj();
        const kopija = medjuspremnik.slojevi[0] as { pasusi: { delovi: { tekst: string }[] }[] };
        expect(kopija.pasusi.map((x) => x.delovi[0].tekst)).toEqual(['Kopija', 'B']);
        expect(store.uredjivanje()).not.toBeNull();
      });

      it('F12 rr2/3: isprazni usred gesta i sesije: gest pa tekst (oba u dokumentu, kao onDestroy)', () => {
        pocni(sa());
        store.pocniUredjivanje('t1');
        store.registrujUredjivac(lazni(rezultat(['Upisano', 'B'], [0, 1])));
        store.pocniGest();
        store.azurirajGest((p) => pomeriSlojeve(p, new Set(['s1']), 5, 0));
        store.isprazni();
        const p = store.platno();
        expect(tekstoviSloja(p, 't1')).toEqual(['Upisano', 'B']);
        expect(p.slojevi.find((s) => s.id === 's1')!.x).toBe(oblik('s1').x + 5);
        expect(store.gest()).toBeNull();
        expect(izlaz).toHaveBeenLastCalledWith(p);
      });
    });
  });

  it('posle destroy izlaz je ugašen: primeni i ubaci ne predaju ništa', () => {
    store.inicijalizuj(dok([oblik('s1')]));
    store.izaberi(['s1']);
    izlaz.mockClear();
    const sredina = TestBed.inject(EnvironmentInjector);
    expect(sredina).toBeTruthy();
    TestBed.resetTestingModule(); // uništava store (onDestroy hook)
    expect(() => store.primeni((p) => pomeriSlojeve(p, new Set(['s1']), 5, 5))).not.toThrow();
    store.ubaci((id) => oblik(id));
    expect(izlaz).not.toHaveBeenCalled();
  });
  describe('tabele (F14)', () => {
    const PRAZNO: StanjeSelekcije = {
      font: null, velicina: null, boja: null, podebljano: null, kurziv: null, podvuceno: null, precrtano: null, polozaj: null,
      poravnanje: null, lista: null, nivo: null, proredProcenat: null, razmakPre: null, razmakPosle: null, polozaji: [], liste: [],
    };
    /** Tabela T 2 x 3 sa spajanjem (0,0)-(0,1). */
    function tabela(): TabelaSloj {
      const t = novaTabela('T', 'NACRT', 2, 3);
      return {
        ...t, celije: t.celije.map((red, r) => red.map((c, k) => (r === 0 && k === 0 ? { ...c, spojDesno: 1 }
          : r === 0 && k === 1 ? { ...c, pokrivena: true, pasusi: [] } : c))),
      };
    }
    const tabelaU = (p: Platno) => p.slojevi.find((s) => s.id === 'T') as TabelaSloj;
    const tekstCelije = (p: Platno, r: number, k: number) => tabelaU(p).celije[r][k].pasusi.map((x) => x.delovi[0].tekst);
    function lazni(...red: (RezultatTeksta | null)[]): KomandeTeksta {
      return {
        presek: vi.fn(() => red.shift() ?? null), odbaciPresek: vi.fn(), postaviStil: vi.fn(), prebaciStil: vi.fn(),
        postaviPasus: vi.fn(), prebaciListu: vi.fn(), promeniNivo: vi.fn(), stanje: signal(PRAZNO), fokus: vi.fn(),
        ponisti: vi.fn(() => false), ponovi: vi.fn(() => false), istorija: signal({ nazad: false, napred: false }),
      };
    }

    it('izaberiCeliju: pokriveno polje -> vlasnik i ceo njegov raspon; Shift širi od sidra izbora', () => {
      pocni(dok([tabela(), oblik('s1')]));
      store.izaberi(['T']);
      store.izaberiCeliju({ r: 0, k: 1 });
      expect(store.izabranaCelija()).toEqual({ r: 0, k: 0 });
      expect(store.opsegCelijaIzbora()).toEqual({ r1: 0, k1: 0, r2: 0, k2: 1 });
      store.izaberiCeliju({ r: 1, k: 2 }, true);
      expect(store.izabranaCelija()).toEqual({ r: 0, k: 0 });
      expect(store.opsegCelijaIzbora()).toEqual({ r1: 0, k1: 0, r2: 1, k2: 2 });
      store.postaviOpsegCelija({ r1: 1, k1: 1, r2: 1, k2: 2 });
      expect(store.opsegCelijaIzbora()).toEqual({ r1: 1, k1: 1, r2: 1, k2: 2 });
    });

    it('izbor ćelija važi samo dok je izabrana ista jedna tabela', () => {
      pocni(dok([tabela(), oblik('s1')]));
      store.izaberi(['T']);
      store.izaberiCeliju({ r: 1, k: 1 });
      store.izaberi(['T']);
      expect(store.izabranaCelija()).toEqual({ r: 1, k: 1 });
      store.prebaciIzbor('s1');
      expect(store.izabranaCelija()).toBeNull();
      expect(store.opsegCelijaIzbora()).toBeNull();
      store.izaberi(['s1']);
      store.izaberiCeliju({ r: 0, k: 0 });
      expect(store.izabranaCelija()).toBeNull();
    });

    it('uređivanje ćelije: tabela ostaje u prikazu, Esc upisuje tekst u celije[r][k] kao jedan korak', () => {
      const p = pocni(dok([tabela()]));
      expect(store.pocniUredjivanje('T', { r: 1, k: 2 })).toBe(true);
      expect(store.uredjivanje()).toEqual({ slojId: 'T', celija: { r: 1, k: 2 } });
      expect(store.izabranaCelija()).toEqual({ r: 1, k: 2 });
      expect(store.zaPrikaz().slojevi.map((s) => s.id)).toEqual(['T']);
      store.registrujUredjivac(lazni({ pasusi: [pasus('x'), pasus('y')], mapa: [] }));
      expect(store.zavrsiUredjivanje()).toBe(true);
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(tekstCelije(store.platno(), 1, 2)).toEqual(['x', 'y']);
      expect(tabelaU(store.platno()).celije[1][1]).toBe(tabelaU(p).celije[1][1]);
      store.ponisti();
      expect(store.platno()).toBe(p);
    });

    it('pokriveno polje se uređuje kao njegov vlasnik', () => {
      pocni(dok([tabela()]));
      expect(store.pocniUredjivanje('T', { r: 0, k: 1 })).toBe(true);
      expect(store.uredjivanje()?.celija).toEqual({ r: 0, k: 0 });
      expect(store.pocniUredjivanje('T', { r: 5, k: 0 })).toBe(false);
    });

    it('predjiNaCeliju (Tab): tekst je korak, nova sesija u sledećoj ćeliji (preskače pokrivene); na kraju ostaje', () => {
      pocni(dok([tabela()]));
      store.pocniUredjivanje('T', { r: 0, k: 0 });
      store.registrujUredjivac(lazni({ pasusi: [pasus('a')], mapa: [] }));
      store.predjiNaCeliju(1);
      expect(tekstCelije(store.platno(), 0, 0)).toEqual(['a']);
      expect(store.uredjivanje()).toEqual({ slojId: 'T', celija: { r: 0, k: 2 } });
      store.predjiNaCeliju(-1);
      expect(store.uredjivanje()?.celija).toEqual({ r: 0, k: 0 });
      store.pocniUredjivanje('T', { r: 1, k: 2 });
      const s = store.uredjivanje();
      store.predjiNaCeliju(1);
      expect(store.uredjivanje()).toBe(s);
    });
  });
  describe('izabrana animacija (F17)', () => {
    const sa = () => dok([oblik('s1'), oblik('s2')], [animacija('a1', 's1'), animacija('a2', 's2')]);

    it('izaberiAnimaciju bira animaciju i njen sloj; nepostojeća ili null skida izbor animacije', () => {
      pocni(sa());
      store.izaberiAnimaciju('a2');
      expect(store.izabranaAnimacija()).toBe('a2');
      expect(store.izbor()).toEqual(['s2']);
      store.izaberiAnimaciju('nema');
      expect(store.izabranaAnimacija()).toBeNull();
      store.izaberiAnimaciju('a1');
      store.izaberiAnimaciju(null);
      expect(store.izabranaAnimacija()).toBeNull();
      expect(store.izbor()).toEqual(['s1']);
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('izbor drugog sloja, nestanak animacije (brisanje, poništavanje) i nov dokument skidaju izabranu animaciju', () => {
      pocni(sa());
      store.izaberiAnimaciju('a1');
      store.prebaciIzbor('s2');
      expect(store.izabranaAnimacija()).toBe('a1');
      store.izaberi(['s2']);
      expect(store.izabranaAnimacija()).toBeNull();
      store.izaberiAnimaciju('a2');
      store.primeni((p) => ({ ...p, animacije: p.animacije.filter((a) => a.id !== 'a2') }));
      expect(store.izabranaAnimacija()).toBeNull();
      store.ponisti();
      store.izaberiAnimaciju('a2');
      store.ponovi();
      expect(store.izabranaAnimacija()).toBeNull();
      store.izaberiAnimaciju('a1');
      store.inicijalizuj(sa());
      expect(store.izabranaAnimacija()).toBeNull();
    });
  });
});

import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationStore } from '../../../core/state/notification.store';
import type { OblikSloj, Platno, Sloj } from '../data-access/platno.models';
import { animacija, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { noviOblik } from '../data-access/platno-novo';
import { medjuspremnik, pomeriSlojeve } from './komande';
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
});

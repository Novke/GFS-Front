import { TestBed } from '@angular/core/testing';
import { animacija, platno } from '../data-access/platno-podaci.testing';
import { Animacija, Platno, Sloj } from '../data-access/platno.models';
import { PlatnoPrikazComponent, kadroviAnimacije } from './platno-prikaz.component';

/*
 * jsdom nema Web Animations API: `Element.prototype.animate` je lažnjak koji beleži cilj, kadrove i opcije, a vraća
 * lažnu animaciju sa `cancel` i `finished` (podrazumevano nikad ne završi; `zavrsi()` je razreši).
 * Fabričko platno: grupa 1 = a1 (pasus 0 sloja `tekst`, FADE 500), a2 (`slika`, ZUM 500, SA_PRETHODNIM),
 * a3 (`oblik`, POJAVI 0, POSLE_PRETHODNOG -> počinje na 500); grupa 2 = a4 (`oblik`, IZLAZ FADE 500).
 */
interface LaznaAnimacija { cancel: ReturnType<typeof vi.fn>; finished: Promise<void>; zavrsi: () => void; cilj: Element; }

let dnevnik: string[];
let animacije: LaznaAnimacija[];
let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  dnevnik = [];
  animacije = [];
  animate = vi.fn(function (this: Element) {
    let zavrsi = () => undefined as void;
    const finished = new Promise<void>((r) => { zavrsi = r; });
    const indeks = animacije.length;
    const a: LaznaAnimacija = {
      cancel: vi.fn(() => dnevnik.push(`cancel ${indeks}`)), finished, zavrsi: () => zavrsi(), cilj: this,
    };
    animacije.push(a);
    dnevnik.push(`animate ${indeks}`);
    return a;
  });
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
});

afterEach(() => {
  delete (Element.prototype as Partial<Element>).animate;
  vi.unstubAllGlobals();
});

async function prikazi(p: Platno, korak = 0, anim: { kljuc: number; grupa: number } | null = null) {
  const fixture = TestBed.createComponent(PlatnoPrikazComponent);
  fixture.componentRef.setInput('platno', p);
  fixture.componentRef.setInput('korak', korak);
  fixture.componentRef.setInput('animacija', anim);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const postavi = async (k: number, a: { kljuc: number; grupa: number } | null) => {
    fixture.componentRef.setInput('korak', k);
    fixture.componentRef.setInput('animacija', a);
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, postavi };
}

const sloj = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`.uz-pl-sloj[data-sloj="${id}"]`)!;
const sadrzaj = (el: HTMLElement, id: string) => sloj(el, id).querySelector<HTMLElement>(':scope > .uz-pl-sadrzaj')!;
const opcije = (i: number) => animate.mock.calls[i][1] as KeyframeAnimationOptions;

describe('PlatnoPrikazComponent: mereni tabovi i animacije', () => {
  it('rezervno merenje (transformacija) dok grupa traje se ponavlja kad se grupa završi, samo jednom', async () => {
    const p = platno();
    const tekst = p.slojevi.find((s) => s.id === 'tekst')! as Extract<Sloj, { tip: 'TEKST' }>;
    // Rotacija sloja vodi u rezervno merenje i u jsdom-u (izračunat stil ima transformaciju), kao ULET/ZUM koji traje.
    tekst.rotacija = 12;
    tekst.pasusi = [{ ...tekst.pasusi[0], uvlacenje: { levo: 18, prviRed: -18 },
      delovi: [{ ...tekst.pasusi[0].delovi[0], tekst: 'a\tb' }] }, tekst.pasusi[1]];
    const levo = vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get');
    try {
      const fixture = TestBed.createComponent(PlatnoPrikazComponent);
      Object.defineProperty(fixture.nativeElement, 'offsetWidth', { get: () => 1920 });
      fixture.componentRef.setInput('platno', p);
      fixture.componentRef.setInput('korak', 1);
      fixture.componentRef.setInput('animacija', { kljuc: 1, grupa: 1 });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(animacije.length).toBeGreaterThan(0);
      expect(levo).toHaveBeenCalled();

      levo.mockClear();
      animacije.forEach((a) => a.zavrsi());
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(levo).toHaveBeenCalled();

      // Novo merenje je bilo bez grupe koja traje: sledeći kraj grupe ga ne ponavlja.
      levo.mockClear();
      fixture.componentRef.setInput('korak', 2);
      fixture.componentRef.setInput('animacija', { kljuc: 2, grupa: 2 });
      fixture.detectChanges();
      await fixture.whenStable();
      animacije.forEach((a) => a.zavrsi());
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(levo).not.toHaveBeenCalled();
    } finally {
      levo.mockRestore();
    }
  });
});

describe('PlatnoPrikazComponent: animacije koraka', () => {
  it('(a) prvi render bez animacije ne zove animate', async () => {
    await prikazi(platno(), 1);
    expect(animate).not.toHaveBeenCalled();
  });

  it('(b) nov ključ pušta grupu koraka: cilj, delay, duration, fill i easing', async () => {
    const { el, postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });

    expect(animate).toHaveBeenCalledTimes(3);
    expect(animacije.map((a) => a.cilj)).toEqual([
      sloj(el, 'tekst').querySelector('p[data-pasus="0"]'),
      sadrzaj(el, 'slika'),
      sadrzaj(el, 'oblik'),
    ]);
    expect(opcije(0)).toEqual({ delay: 0, duration: 500, fill: 'both', easing: 'ease-out' });
    expect(opcije(1)).toEqual({ delay: 0, duration: 500, fill: 'both', easing: 'ease-out' });
    expect(opcije(2)).toEqual({ delay: 500, duration: 0, fill: 'both', easing: 'ease-out' });
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('(b) druga animacija istog ključa u grupi dobija fill forwards', async () => {
    const p = platno();
    p.animacije = [
      animacija('a1', 'oblik', { efekat: 'FADE' }),
      animacija('a2', 'oblik', { vrsta: 'IZLAZ', okidac: 'POSLE_PRETHODNOG', kasnjenjeMs: 200 }),
    ];
    const { postavi } = await prikazi(p, 0);
    await postavi(1, { kljuc: 7, grupa: 1 });
    expect(opcije(0)).toEqual({ delay: 0, duration: 500, fill: 'both', easing: 'ease-out' });
    expect(opcije(1)).toEqual({ delay: 700, duration: 500, fill: 'forwards', easing: 'ease-out' });
  });

  it('(b) prvi render sa ključem pušta grupu odmah (ulazak na slajd, grupa 0)', async () => {
    const p = platno();
    p.animacije = [animacija('a0', 'tabela', { okidac: 'SA_PRETHODNIM' }), ...p.animacije];
    const { el } = await prikazi(p, 0, { kljuc: 9, grupa: 0 });
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animacije[0].cilj).toBe(sadrzaj(el, 'tabela'));
  });

  it('(c) dva brza prelaza: prethodna grupa dobija cancel pre nove, krajnje stanje iz stanjeSlojeva', async () => {
    const { el, postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    await postavi(2, { kljuc: 3, grupa: 2 });

    expect(dnevnik).toEqual(['animate 0', 'animate 1', 'animate 2', 'cancel 0', 'cancel 1', 'cancel 2', 'animate 3']);
    expect(animacije[3].cilj).toBe(sadrzaj(el, 'oblik'));
    expect(animate.mock.calls[3][0]).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    // Krajnje stanje koraka 2: pasus i slika vidljivi, oblik sakriven (IZLAZ); animacija ga drži vidljivim dok traje.
    expect(sloj(el, 'tekst').querySelector<HTMLElement>('p[data-pasus="0"]')!.style.visibility).toBe('');
    expect(sloj(el, 'slika').style.visibility).toBe('');
    expect(sloj(el, 'oblik').style.visibility).toBe('hidden');
  });

  /*
   * Chromium (brzi koraci napred): posle `cancel()` cilj ume da zadrži zastareo nasleđeni `visibility` (sloj `hidden`, a
   * sadržaj vidljiv). Zato kadrovi ne nose `visibility`: cilj ima inline `visible` dok grupa traje, a posle prekida mu
   * se inline vidljivost izričito vraća na krajnje stanje (izmena inline stila primorava ponovni proračun).
   */
  it('dok grupa traje cilj ima inline visibility visible (i IZLAZ, čiji je sloj već skriven)', async () => {
    const { el, postavi } = await prikazi(platno(), 0);
    const pasus0 = sloj(el, 'tekst').querySelector<HTMLElement>('p[data-pasus="0"]')!;
    await postavi(1, { kljuc: 2, grupa: 1 });
    expect(pasus0.style.visibility).toBe('visible');
    expect(sadrzaj(el, 'slika').style.visibility).toBe('visible');
    expect(sadrzaj(el, 'oblik').style.visibility).toBe('visible');
    expect(sadrzaj(el, 'tabela').style.visibility).toBe('');

    await postavi(2, { kljuc: 3, grupa: 2 });
    expect(sloj(el, 'oblik').style.visibility).toBe('hidden');
    expect(sadrzaj(el, 'oblik').style.visibility).toBe('visible');
  });

  it('brz drugi korak: prekinuti ciljevi gube inline visibility (sadržaj opet nasleđuje od sloja)', async () => {
    const { el, postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    await postavi(2, { kljuc: 3, grupa: 2 });
    expect(sloj(el, 'tekst').querySelector<HTMLElement>('p[data-pasus="0"]')!.style.visibility).toBe('');
    expect(sadrzaj(el, 'slika').style.visibility).toBe('');
    // oblik je cilj i nove grupe (IZLAZ): vidljiv dok ona traje
    expect(sadrzaj(el, 'oblik').style.visibility).toBe('visible');

    animacije[3].zavrsi();
    await new Promise((r) => setTimeout(r));
    expect(animacije[3].cancel).toHaveBeenCalledTimes(1);
    expect(sadrzaj(el, 'oblik').style.visibility).toBe('');
    expect(sloj(el, 'oblik').style.visibility).toBe('hidden');
  });

  it('pasus koji izlazi: posle prekida dobija hidden iz krajnjeg stanja (isto što vezivanje u šablonu)', async () => {
    const p = platno();
    p.animacije = [
      animacija('a1', 'tekst', { pasus: 1, vrsta: 'IZLAZ' }),
      animacija('a2', 'slika'),
    ];
    const { el, postavi } = await prikazi(p, 0);
    const pasus1 = sloj(el, 'tekst').querySelector<HTMLElement>('p[data-pasus="1"]')!;
    expect(pasus1.style.visibility).toBe('');
    await postavi(1, { kljuc: 2, grupa: 1 });
    expect(pasus1.style.visibility).toBe('visible');

    // korak nazad usred animacije: pasus opet vidljiv (korak 0), bez inline ostatka
    await postavi(0, null);
    expect(pasus1.style.visibility).toBe('');

    await postavi(1, { kljuc: 3, grupa: 1 });
    expect(pasus1.style.visibility).toBe('visible');
    await postavi(2, { kljuc: 4, grupa: 2 });
    expect(pasus1.style.visibility).toBe('hidden');
    expect(sadrzaj(el, 'slika').style.visibility).toBe('visible');
  });

  it('kraj grupe (sve animacije završene): cancel svih, važi krajnje stanje', async () => {
    const { postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    expect(dnevnik.filter((d) => d.startsWith('cancel'))).toEqual([]);

    animacije[0].zavrsi();
    animacije[1].zavrsi();
    await Promise.resolve();
    expect(dnevnik.filter((d) => d.startsWith('cancel'))).toEqual([]);

    animacije[2].zavrsi();
    await new Promise((r) => setTimeout(r));
    expect(animacije.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    for (const a of animacije) {
      expect((a.cilj as HTMLElement).style.visibility).toBe('');
    }
  });

  it('(d) prefers-reduced-motion: reduce -> trajanje 0 (i POSLE_PRETHODNOG odmah)', async () => {
    const upiti: string[] = [];
    vi.stubGlobal('matchMedia', vi.fn((upit: string) => {
      upiti.push(upit);
      return { matches: upit === '(prefers-reduced-motion: reduce)' } as MediaQueryList;
    }));
    const { postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    expect(upiti).toContain('(prefers-reduced-motion: reduce)');
    expect(animate).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      expect(opcije(i).duration).toBe(0);
      expect(opcije(i).delay).toBe(0);
    }
  });

  it('(e) promena koraka bez novog ključa (skok, nazad, ponovno povezivanje) ne zove animate', async () => {
    const { el, postavi } = await prikazi(platno(), 0);
    await postavi(2, null);
    await postavi(1, null);
    expect(animate).not.toHaveBeenCalled();
    expect(sloj(el, 'oblik').style.visibility).toBe('');
  });

  it('(e) korak nazad usred animacije prekida animaciju (odmah krajnje stanje)', async () => {
    const { postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    await postavi(0, { kljuc: 2, grupa: 1 });
    expect(animate).toHaveBeenCalledTimes(3);
    expect(animacije.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
  });

  it('(f) isti ključ dva puta (ponovni render zbog drugog ulaza) ne pušta ponovo', async () => {
    const { fixture, postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    await postavi(1, { kljuc: 2, grupa: 1 });
    fixture.componentRef.setInput('platno', platno());
    fixture.detectChanges();
    await fixture.whenStable();
    expect(animate).toHaveBeenCalledTimes(3);
    // Nov snimak sa istim platnom (npr. prijava učesnika) ne prekida animaciju koja traje.
    expect(dnevnik.filter((d) => d.startsWith('cancel'))).toEqual([]);
  });

  it('ključ čija grupa nije trenutni korak se ne pušta', async () => {
    const { postavi } = await prikazi(platno(), 0);
    await postavi(2, { kljuc: 4, grupa: 1 });
    expect(animate).not.toHaveBeenCalled();
  });

  it('uništenje komponente prekida animacije koje traju', async () => {
    const { fixture, postavi } = await prikazi(platno(), 0);
    await postavi(1, { kljuc: 2, grupa: 1 });
    fixture.destroy();
    expect(animacije.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    expect(animacije.every((a) => (a.cilj as HTMLElement).style.visibility === '')).toBe(true);
  });
});

describe('kadroviAnimacije', () => {
  const s = { id: 's', x: 100, y: 50, sirina: 200, visina: 80, rotacija: 0 } as Sloj;
  const a = (deo: Partial<Animacija>) => animacija('a', 's', deo);

  it('POJAVI, FADE i ZUM; IZLAZ obrće kadrove', () => {
    expect(kadroviAnimacije(a({ efekat: 'POJAVI', trajanjeMs: 0 }), s, 1)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(kadroviAnimacije(a({ efekat: 'ZUM' }), s, 1)).toEqual([
      { transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 },
    ]);
    expect(kadroviAnimacije(a({ efekat: 'FADE', vrsta: 'IZLAZ' }), s, 1)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });

  it('ULET sa ivice platna u px (jedinica x širina platna / 960)', () => {
    const ulet = (smer: Animacija['smer'], px = 2) => kadroviAnimacije(a({ efekat: 'ULET', smer }), s, px)[0]['transform'];
    expect(ulet('LEVO')).toBe('translate(-600px, 0px)');
    expect(ulet('DESNO')).toBe('translate(1720px, 0px)');
    expect(ulet('GORE')).toBe('translate(0px, -260px)');
    expect(ulet('DOLE')).toBe('translate(0px, 980px)');
    expect(kadroviAnimacije(a({ efekat: 'ULET', smer: 'LEVO' }), s, 1)).toEqual([
      { transform: 'translate(-300px, 0px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 },
    ]);
  });

  it('ULET na rotiranom sloju: pomeraj u koordinatama sloja, na ekranu i dalje sa ivice', () => {
    // Sloj zarotiran 90° u smeru kazaljke: lokalna +y osa gleda ulevo na ekranu, pa "sleva" = +y lokalno.
    const r = { ...s, rotacija: 90 } as Sloj;
    expect(kadroviAnimacije(a({ efekat: 'ULET', smer: 'LEVO' }), r, 1)[0]['transform']).toBe('translate(0px, 300px)');
  });

  it('PODELI, BRISANJE i ISCRTAJ kroz clip-path', () => {
    const isecak = (deo: Partial<Animacija>) => kadroviAnimacije(a(deo), s, 1).map((k) => k['clipPath']);
    expect(isecak({ efekat: 'PODELI', smer: 'VERTIKALNO' })).toEqual(['inset(-50% 50% -50% 50%)', 'inset(-50%)']);
    expect(isecak({ efekat: 'PODELI', smer: 'HORIZONTALNO' })).toEqual(['inset(50% -50% 50% -50%)', 'inset(-50%)']);
    expect(isecak({ efekat: 'BRISANJE', smer: 'LEVO' })).toEqual(['inset(-50% 100% -50% 0)', 'inset(-50%)']);
    expect(isecak({ efekat: 'BRISANJE', smer: 'DESNO' })).toEqual(['inset(-50% 0 -50% 100%)', 'inset(-50%)']);
    expect(isecak({ efekat: 'BRISANJE', smer: 'GORE' })).toEqual(['inset(0 -50% 100% -50%)', 'inset(-50%)']);
    expect(isecak({ efekat: 'BRISANJE', smer: 'DOLE' })).toEqual(['inset(100% -50% 0 -50%)', 'inset(-50%)']);
    expect(isecak({ efekat: 'ISCRTAJ', smer: 'LEVO' })).toEqual(['inset(-50% 100% -50% 0)', 'inset(-50%)']);
    expect(isecak({ efekat: 'BRISANJE', smer: 'LEVO', vrsta: 'IZLAZ' })).toEqual(['inset(-50%)', 'inset(-50% 100% -50% 0)']);
    expect(kadroviAnimacije(a({ efekat: 'PODELI', smer: 'VERTIKALNO' }), s, 1)[0]).toEqual({ clipPath: 'inset(-50% 50% -50% 50%)' });
  });
});

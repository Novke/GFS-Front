import { TestBed } from '@angular/core/testing';
import { naZadatku, platnoSlajd, rezultatVarijante, varijantaRunde, zadatakSlajd } from '../data-access/izvodjenje-podaci.testing';
import { animacija, platno, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PitanjeDetails, Rezultat, SlajdDetails } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from './slajd-prikaz.component';

const info = (sadrzaj: string): SlajdDetails => ({
  id: 1, rb: 1, tip: 'INFO', naslov: 'Naslov', sadrzaj, slika: null, beleske: null, postepeno: true, pitanje: null, platno: null, prelaz: null,
});

const pitanje: PitanjeDetails = {
  id: 7, tip: 'JEDAN_TACAN', tekst: 'Koliko?', slika: null, vremeSekunde: null,
  opcije: [
    { id: 12, rb: 2, tekst: 'Dva', tacna: true },
    { id: 11, rb: 1, tekst: 'Jedan', tacna: false },
    { id: 13, rb: 3, tekst: 'Tri', tacna: false },
  ],
  brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
  prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
};
const slajdPitanje: SlajdDetails = {
  id: 2, rb: 2, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje, platno: null, prelaz: null,
};

async function prikazi(ulazi: Record<string, unknown>) {
  const fixture = TestBed.createComponent(SlajdPrikazComponent);
  for (const [k, v] of Object.entries(ulazi)) {
    fixture.componentRef.setInput(k, v);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('SlajdPrikazComponent', () => {
  it('postepeno: sakrivene su stavke liste najvišeg nivoa od indeksa korak', async () => {
    const { fixture, el } = await prikazi({ slajd: info('- a\n- b\n  - b1\n- c\n\n1. d'), postepeno: true, korak: 1 });
    const vidljivost = () => Array.from(el.querySelectorAll<HTMLElement>('.uz-slajd-md > ul > li, .uz-slajd-md > ol > li'))
      .map(li => li.style.visibility || 'visible');
    expect(vidljivost()).toEqual(['visible', 'hidden', 'hidden', 'hidden']);

    fixture.componentRef.setInput('korak', 3);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(vidljivost()).toEqual(['visible', 'visible', 'visible', 'hidden']);

    fixture.componentRef.setInput('postepeno', false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(vidljivost()).toEqual(['visible', 'visible', 'visible', 'visible']);
  });

  it('HTML iz Markdown-a ne stiže u DOM', async () => {
    const { el } = await prikazi({ slajd: info('<script>alert(1)</script>\n\nTekst <img src=x onerror=alert(1)>') });
    expect(el.querySelector('.uz-slajd-md script, .uz-slajd-md img')).toBeNull();
    expect(el.querySelector('.uz-slajd-md')?.textContent).toContain('Tekst');
  });

  it('tekst pitanja sa formulom: app-tekst-formule sa klasama uz-md i uz-pitanje-tekst (Markdown, blok)', async () => {
    const { el } = await prikazi({ slajd: { ...slajdPitanje, pitanje: { ...pitanje, tekst: 'Koliko je **tačno** $x^2$?' } } });
    const tekst = el.querySelector<HTMLElement>('app-tekst-formule.uz-pitanje-tekst')!;
    expect(tekst).not.toBeNull();
    expect(tekst.classList).toContain('uz-md');
    expect(tekst.style.display).toBe('block');
    expect(tekst.querySelector('strong')?.textContent).toBe('tačno');
    expect(tekst.querySelector('span.uz-formula')?.textContent).toBe('$x^2$');
  });

  it('tekst pitanja: HTML iz Markdown-a ne stiže u DOM', async () => {
    const { el } = await prikazi({
      slajd: { ...slajdPitanje, pitanje: { ...pitanje, tekst: '<script>alert(1)</script>\n\nTekst <img src=x onerror=alert(1)> $x$' } },
    });
    const tekst = el.querySelector('.uz-pitanje-tekst')!;
    expect(tekst.querySelector('script, img')).toBeNull();
    expect(tekst.textContent).toContain('Tekst');
  });

  it('pitanje: pločice po rb, tačna istaknuta tek kad je tačan prikazan', async () => {
    const { fixture, el } = await prikazi({ slajd: slajdPitanje });
    const tekstovi = Array.from(el.querySelectorAll('.uz-plocica-tekst')).map(t => t.textContent?.trim());
    expect(tekstovi).toEqual(['Jedan', 'Dva', 'Tri']);
    expect(el.querySelectorAll('.uz-plocica--tacna').length).toBe(0);

    fixture.componentRef.setInput('tacanPrikazan', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const tacna = el.querySelector('.uz-plocica--tacna');
    expect(tacna?.textContent).toContain('Dva');
    expect(tacna?.textContent).toContain('tačno');
    expect(el.querySelectorAll('.uz-plocica--prigusena').length).toBe(2);
  });

  it('rezultati zauzimaju mesto pločica; broj odgovora i kod u podnožju', async () => {
    const rezultat: Rezultat = {
      tip: 'JEDAN_TACAN', ukupno: 3, brojevi: null, tekstovi: null, skala: null,
      opcije: [{ id: 11, tekst: 'Jedan', broj: 1, tacna: null }, { id: 12, tekst: 'Dva', broj: 2, tacna: null }, { id: 13, tekst: 'Tri', broj: 0, tacna: null }],
    };
    const { el } = await prikazi({
      slajd: slajdPitanje, rezultat, prikaziRezultat: true, brojOdgovora: 3, kodTraka: { host: 'gfs.trif.rs/gfs', kod: '123456' },
    });
    expect(el.querySelector('app-pitanje-plocice')).toBeNull();
    expect(Array.from(el.querySelectorAll('.uz-rez-opcija-vrednost')).map(v => v.textContent?.trim()))
      .toEqual(['1 · 33 %', '2 · 67 %', '0 · 0 %']);
    expect(el.querySelector('.uz-slajd-odgovori')?.textContent).toContain('3');
    expect(el.querySelector('.uz-kod-traka')?.textContent).toContain('gfs.trif.rs/gfs/uzivo · kod 123 456');
  });
});

describe('SlajdPrikazComponent: PLATNO i teme', () => {
  const koren = (el: HTMLElement) => el.querySelector<HTMLElement>('article.uz-platno')!;

  it('PLATNO crta app-platno-prikaz, bez trake koda i bez podnožja (odluka 5)', async () => {
    const { el } = await prikazi({ slajd: platnoSlajd(), kodTraka: { host: 'gfs.trif.rs', kod: '123456' } });
    expect(el.querySelectorAll('app-platno-prikaz').length).toBe(1);
    expect(el.querySelectorAll('.uz-pl-sloj').length).toBe(6);
    expect(el.querySelector('.uz-kod-traka')).toBeNull();
    expect(el.querySelector('.uz-slajd-podnozje')).toBeNull();
    expect(el.querySelector('.uz-slajd-naslov, .uz-slajd-md')).toBeNull();
  });

  it('PLATNO: korak ide u platno (stanje slojeva posle koraka)', async () => {
    const { fixture, el } = await prikazi({ slajd: platnoSlajd(), korak: 0 });
    const vidljivost = () => el.querySelector<HTMLElement>('.uz-pl-sloj[data-sloj="slika"]')!.style.visibility;
    expect(vidljivost()).toBe('hidden');
    fixture.componentRef.setInput('korak', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(vidljivost()).toBe('');
  });

  it('INFO sa temom TAMNA: promenljive teme na korenu uz-platno i noćni tokeni za sadržaj', async () => {
    const { fixture, el } = await prikazi({ slajd: info('- a'), tema: 'TAMNA' });
    expect(koren(el).style.getPropertyValue('--uz-tema-pozadina')).toBe('#1E1F22');
    expect(koren(el).style.getPropertyValue('--uz-tema-tekst')).toBe('#E8E8E8');
    expect(koren(el).style.getPropertyValue('--uz-tema-font-naslova')).toContain('Atkinson Hyperlegible');
    expect(koren(el).classList).toContain('rezim-noc');

    fixture.componentRef.setInput('tema', 'PAPIR');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(koren(el).style.getPropertyValue('--uz-tema-pozadina')).toBe('#FAF7F2');
    expect(koren(el).classList).not.toContain('rezim-noc');
  });

  it('NACRT INFO: naslov ostaje boje mastila (#121A2A), kao pre tema', async () => {
    const { el } = await prikazi({ slajd: info('- a') });
    expect(koren(el).style.getPropertyValue('--uz-tema-naslov')).toBe('#121A2A');
  });

  it('bez teme (stari snimak) i podrazumevano: NACRT', async () => {
    const { el } = await prikazi({ slajd: slajdPitanje });
    expect(koren(el).style.getPropertyValue('--uz-tema-pozadina')).toBe('#FFFFFF');
    const { el: bez } = await prikazi({ slajd: slajdPitanje, tema: undefined });
    expect(koren(bez).style.getPropertyValue('--uz-tema-pozadina')).toBe('#FFFFFF');
    expect(koren(bez).classList).not.toContain('rezim-noc');
  });

  describe('animacije: nova instanca platna po slajdu', () => {
    let animate: ReturnType<typeof vi.fn>;
    let cancel: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      cancel = vi.fn();
      animate = vi.fn(() => ({ cancel, finished: new Promise(() => undefined) }));
      Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
    });

    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    // Grupa 0 (pre prve KLIK) se pušta sama pri ulasku; isti id slojeva na oba slajda (uvezeni slajdovi ih ponavljaju).
    const saGrupomNula = (id: number) => platnoSlajd({
      id, platno: platnoSaAnimacijama([animacija('g0', 'tekst', { okidac: 'SA_PRETHODNIM' })], platno().slojevi),
    });

    it('animacija ide u platno: grupa 0 pri ulasku', async () => {
      await prikazi({ slajd: saGrupomNula(31), korak: 0, animacija: { kljuc: 4, grupa: 0 } });
      expect(animate).toHaveBeenCalledTimes(1);
    });

    it('skok sa slajda A (grupa 0 traje) na slajd C istog koraka: A se uništava, C crta krajnje stanje bez animate', async () => {
      const { fixture, el } = await prikazi({ slajd: saGrupomNula(31), korak: 0, animacija: { kljuc: 4, grupa: 0 } });
      expect(animate).toHaveBeenCalledTimes(1);
      const instancaA = el.querySelector('app-platno-prikaz');

      fixture.componentRef.setInput('slajd', saGrupomNula(33));
      fixture.componentRef.setInput('animacija', null);
      fixture.detectChanges();
      await fixture.whenStable();

      const instancaC = el.querySelector('app-platno-prikaz');
      expect(instancaC).not.toBeNull();
      expect(instancaC).not.toBe(instancaA);
      expect(instancaA?.isConnected).toBe(false);
      expect(cancel).toHaveBeenCalled();
      expect(animate).toHaveBeenCalledTimes(1);
      expect(instancaC!.querySelector<HTMLElement>('.uz-pl-sloj[data-sloj="tekst"]')!.style.visibility).toBe('');
    });

    it('nov snimak istog slajda zadržava instancu (animacija koja traje se ne prekida)', async () => {
      const { fixture, el } = await prikazi({ slajd: saGrupomNula(31), korak: 0, animacija: { kljuc: 4, grupa: 0 } });
      const instanca = el.querySelector('app-platno-prikaz');
      fixture.componentRef.setInput('slajd', saGrupomNula(31));
      fixture.componentRef.setInput('animacija', null);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(el.querySelector('app-platno-prikaz')).toBe(instanca);
      expect(cancel).not.toHaveBeenCalled();
    });
  });
});

describe('SlajdPrikazComponent: ZADATAK bez stanja izvođenja (editor)', () => {
  it('statična kartica: "Zadatak", naziv grupe i broj različitih (prazno = sve), bez pločica i podnožja pitanja', async () => {
    const { fixture, el } = await prikazi({ slajd: zadatakSlajd({ brojVarijanti: 3 }) });
    const kartica = el.querySelector('[data-zadatak]')!;
    expect(el.querySelector('.uz-slajd-naslov')!.textContent?.trim()).toBe('Zadatak');
    expect([...kartica.querySelectorAll('p')].map(p => p.textContent?.trim())).toEqual(['2 → 10', 'Različitih: 3']);
    expect(el.querySelector('app-pitanje-plocice')).toBeNull();
    expect(el.querySelector('.uz-slajd-podnozje')).toBeNull();

    fixture.componentRef.setInput('slajd', zadatakSlajd({ brojVarijanti: null }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-zadatak]')!.textContent).toContain('Različitih: sve');
  });

  it('obrisana grupa: "Grupa nije izabrana"; izabrana, a naziv još nije stigao sa servera: "Grupa zadataka"', async () => {
    const { fixture, el } = await prikazi({ slajd: zadatakSlajd({ grupaId: null, grupaNaziv: null, putanja: [] }) });
    expect(el.querySelector('[data-zadatak] p')!.textContent?.trim()).toBe('Grupa nije izabrana');
    fixture.componentRef.setInput('slajd', zadatakSlajd({ grupaId: 3, grupaNaziv: null, putanja: [] }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-zadatak] p')!.textContent?.trim()).toBe('Grupa zadataka');
  });
});

describe('SlajdPrikazComponent: ZADATAK sa stanjem izvođenja (projektor)', () => {
  const tekst = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const kodTraka = { host: 'gfs.trif.rs', kod: '123456' };

  it('OTVORENO: app-zadatak-prikaz sa opisom, brojem odgovora u zaglavlju i kodom u podnožju (broj odgovora jednom)', async () => {
    const s = naZadatku('OTVORENO');
    const { el } = await prikazi({
      slajd: s.trenutniSlajd, zadatak: s.zadatak, faza: 'OTVORENO', brojOdgovora: 4, odgovoriliOd: 6, prikaziRezultat: true, kodTraka,
    });
    expect(el.querySelector('app-zadatak-prikaz')).not.toBeNull();
    expect(tekst(el.querySelector('[data-zadatak]'))).toBe('Svako ima svoj zadatak na telefonu');
    expect(el.querySelectorAll('.uz-zad-odgovori').length).toBe(1);
    expect(tekst(el.querySelector('.uz-zad-odgovori'))).toBe('Odgovorilo 4 od 6');
    expect(el.querySelector('.uz-slajd-podnozje .uz-slajd-odgovori')).toBeNull();
    expect(tekst(el.querySelector('.uz-kod-traka'))).toContain('gfs.trif.rs/uzivo · kod 123 456');
    expect(el.querySelector('app-pitanje-plocice')).toBeNull();
  });

  it('ZATVORENO sa javnim rezultatom: mreža kartica, čip "Zatvoreno" u podnožju', async () => {
    const v = [varijantaRunde(11), varijantaRunde(12)];
    const s = naZadatku('ZATVORENO', {
      zadatak: { javniRezultat: { ukupno: 2, odgovoriPrikazani: true, varijante: v.map(x => ({ ...rezultatVarijante(x), odgovorilo: 1 })) } },
    });
    const { el } = await prikazi({ slajd: s.trenutniSlajd, zadatak: s.zadatak, faza: 'ZATVORENO', brojOdgovora: 0, kodTraka });
    expect(el.querySelectorAll('app-zadatak-rezultat .uz-zr-kartica').length).toBe(2);
    expect(tekst(el.querySelector('.uz-slajd-podnozje .uz-cip--zatvoreno'))).toBe('Zatvoreno');
  });

  it('bez stanja i bez trake (editor): i dalje bez podnožja', async () => {
    const { el } = await prikazi({ slajd: zadatakSlajd() });
    expect(el.querySelector('app-zadatak-prikaz')).not.toBeNull();
    expect(el.querySelector('.uz-slajd-podnozje')).toBeNull();
  });
});

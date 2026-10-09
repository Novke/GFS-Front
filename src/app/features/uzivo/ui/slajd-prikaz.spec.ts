import { TestBed } from '@angular/core/testing';
import { PitanjeDetails, Rezultat, SlajdDetails } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from './slajd-prikaz.component';

const info = (sadrzaj: string): SlajdDetails => ({
  id: 1, rb: 1, tip: 'INFO', naslov: 'Naslov', sadrzaj, slika: null, beleske: null, postepeno: true, pitanje: null,
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
  id: 2, rb: 2, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje,
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

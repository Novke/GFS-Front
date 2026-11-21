import { TestBed } from '@angular/core/testing';
import { pitanjeSlajd } from '../data-access/izvodjenje-podaci.testing';
import { PitanjeDetails } from '../data-access/uzivo.models';
import { NATPIS_VISE_TACNIH_TABLA, PitanjePlociceComponent } from './pitanje-plocice.component';

async function prikazi(pitanje: PitanjeDetails, ulazi: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(PitanjePlociceComponent);
  fixture.componentRef.setInput('pitanje', pitanje);
  for (const [k, v] of Object.entries(ulazi)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('PitanjePlociceComponent: formule u opcijama', () => {
  it('tekst opcije je app-tekst-formule (.uz-plocica-tekst); $11$ je mesto formule, običan tekst ostaje tekst', async () => {
    const p = pitanjeSlajd('JEDAN_TACAN', {
      opcije: [{ id: 1, rb: 1, tekst: '$11$', tacna: true }, { id: 2, rb: 2, tekst: 'Cena 5$', tacna: false }],
    }).pitanje!;
    const el = await prikazi(p);
    const tekstovi = Array.from(el.querySelectorAll<HTMLElement>('.uz-plocica-tekst'));
    expect(tekstovi.map((t) => t.tagName.toLowerCase())).toEqual(['app-tekst-formule', 'app-tekst-formule']);
    expect(tekstovi[0].querySelector('span.uz-formula')?.textContent).toBe('$11$');
    expect(tekstovi[1].textContent).toBe('Cena 5$');
    expect(tekstovi[1].querySelector('.uz-formula')).toBeNull();
    // običan tekst: domaćin ostaje u redu (bez inline display), kao dosadašnji <span>
    expect(tekstovi[0].style.display).toBe('');
  });

  it('HTML u tekstu opcije je tekst', async () => {
    const p = pitanjeSlajd('JEDAN_TACAN', {
      opcije: [{ id: 1, rb: 1, tekst: '<b>x</b>', tacna: true }, { id: 2, rb: 2, tekst: '2', tacna: false }],
    }).pitanje!;
    const el = await prikazi(p);
    const prvi = el.querySelector('.uz-plocica-tekst')!;
    expect(prvi.querySelector('b')).toBeNull();
    expect(prvi.textContent).toBe('<b>x</b>');
  });
});

describe('PitanjePlociceComponent: sažeti oblik (velika slika)', () => {
  const osnova = pitanjeSlajd('JEDAN_TACAN').pitanje!;
  const tekst = (el: HTMLElement) => Array.from(el.querySelectorAll('.uz-sazeto-unos > span')).map(x => x.textContent?.trim()).join(' ');

  it('kratak tekst: mala pločica "Aa Napiši kratak odgovor", bez velikog okvira', async () => {
    const el = await prikazi({ ...osnova, tip: 'KRATAK_TEKST', opcije: [] }, { sazeto: true });
    expect(tekst(el)).toBe('Aa Napiši kratak odgovor');
    expect(el.querySelector('.uz-unos')).toBeNull();
  });

  it('broj sa jedinicom i skala sa oznakama', async () => {
    const b = await prikazi({ ...osnova, tip: 'BROJ', opcije: [], jedinica: 'cm' }, { sazeto: true });
    expect(tekst(b)).toBe('# Unesi broj (cm)');
    const s = await prikazi({ ...osnova, tip: 'SKALA', opcije: [], skalaMinOznaka: 'loše', skalaMaxOznaka: 'odlično' }, { sazeto: true });
    expect(tekst(s)).toBe('1–5 Oceni od 1 do 5 1 = loše · 5 = odlično');
  });

  it('tačan odgovor u istom redu kad je prikazan (broj i kratak tekst)', async () => {
    const b = await prikazi({ ...osnova, tip: 'BROJ', opcije: [], jedinica: 'cm', brojTacno: 12.5 }, { sazeto: true, tacne: [] });
    expect(b.querySelector('.uz-sazeto-red .uz-sazeto-tacno')?.textContent).toContain('Tačan odgovor: 12,5 cm');
    const k = await prikazi({ ...osnova, tip: 'KRATAK_TEKST', opcije: [], prihvatljiviOdgovori: ['a', 'b'] }, { sazeto: true, tacne: [] });
    expect(k.querySelector('.uz-sazeto-tacno')?.textContent).toContain('Tačno: a, b');
    const bez = await prikazi({ ...osnova, tip: 'BROJ', opcije: [], brojTacno: 3 }, { sazeto: true });
    expect(bez.querySelector('.uz-sazeto-tacno')).toBeNull();
  });

  it('kratke opcije: pločice u jednom redu (broj kolona = broj opcija), bez --tri', async () => {
    const opcije = ['A', 'B', 'C', 'D', 'E'].map((t, i) => ({ id: i + 1, rb: i + 1, tekst: t, tacna: false }));
    const el = await prikazi({ ...osnova, tip: 'JEDAN_TACAN', opcije }, { sazeto: true });
    const mreza = el.querySelector<HTMLElement>('.uz-plocice-mreza')!;
    expect(mreza.style.getPropertyValue('--uz-n')).toBe('5');
    expect(mreza.classList).not.toContain('uz-plocice-mreza--tri');
    expect(el.querySelectorAll('.uz-plocica')).toHaveLength(5);
    expect(el.classList).toContain('uz-plocice--sazeto');
  });

  it('bez sazeto: kao pre (veliki okvir, bez klase)', async () => {
    const el = await prikazi({ ...osnova, tip: 'KRATAK_TEKST', opcije: [] });
    expect(el.querySelector('.uz-unos')).not.toBeNull();
    expect(el.querySelector('.uz-sazeto-red')).toBeNull();
  });
});

describe('PitanjePlociceComponent: natpis za više tačnih', () => {
  const opc = [{ id: 1, rb: 1, tekst: 'a', tacna: true }, { id: 2, rb: 2, tekst: 'b', tacna: false }];
  it('samo VISE_TACNIH ima natpis', async () => {
    expect(NATPIS_VISE_TACNIH_TABLA).toBe('Može biti više tačnih');
    const el = await prikazi(pitanjeSlajd('VISE_TACNIH', { opcije: opc }).pitanje!);
    expect(el.querySelector('[data-natpis-vise]')!.textContent!.trim()).toBe(NATPIS_VISE_TACNIH_TABLA);
    for (const tip of ['JEDAN_TACAN', 'ANKETA'] as const) {
      const e = await prikazi(pitanjeSlajd(tip, { opcije: opc }).pitanje!);
      expect(e.querySelector('[data-natpis-vise]')).toBeNull();
    }
  });
});

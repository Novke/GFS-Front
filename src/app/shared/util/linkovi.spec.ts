import { describe, expect, it } from 'vitest';

import { deloviSaLinkovima, kratakNatpisLinka, linkoviIzTeksta } from './linkovi';

const DRIVE = 'https://drive.google.com/drive/folders/1cbUKIFMvrJCGQMBFkKI8W_BEIuOeJTeI';
const spojeno = (t: string) => deloviSaLinkovima(t).map((d) => d.tekst).join('');

describe('deloviSaLinkovima', () => {
  it('prazno i bez adrese', () => {
    expect(deloviSaLinkovima(null)).toEqual([]);
    expect(deloviSaLinkovima('')).toEqual([]);
    expect(deloviSaLinkovima('Samo tekst.\nDrugi red')).toEqual([{ tekst: 'Samo tekst.\nDrugi red' }]);
  });

  it('adresa u zagradi pa dvotačka (beleške prvog slajda): zagrada i dvotačka ostaju tekst', () => {
    const t = `folder „Vežbe 6” (${DRIVE}): „1. krug”`;
    expect(deloviSaLinkovima(t)).toEqual([
      { tekst: 'folder „Vežbe 6” (' },
      { tekst: DRIVE, href: DRIVE },
      { tekst: '): „1. krug”' },
    ]);
  });

  it('interpunkcija na kraju rečenice nije deo linka', () => {
    for (const kraj of ['.', ',', ';', ':', '!', '?', '…', '...', ').']) {
      const d = deloviSaLinkovima(`Vidi ${DRIVE}${kraj}`);
      expect(d[1]).toEqual({ tekst: DRIVE, href: DRIVE });
      expect(d[2]).toEqual({ tekst: kraj });
    }
  });

  it('zagrada sa parom u adresi ostaje u linku', () => {
    const wiki = 'https://sr.wikipedia.org/wiki/Word_(program)';
    expect(deloviSaLinkovima(`(${wiki})`)[1]).toEqual({ tekst: wiki, href: wiki });
  });

  it('navodnici, srpski navodnici i prelom reda završavaju adresu', () => {
    expect(linkoviIzTeksta(`„${DRIVE}”`)).toEqual([DRIVE]);
    expect(linkoviIzTeksta(`"${DRIVE}"`)).toEqual([DRIVE]);
    expect(linkoviIzTeksta(`${DRIVE}\nsledeći red`)).toEqual([DRIVE]);
  });

  it('više adresa, http i https, upit i sidro ostaju u linku', () => {
    const a = 'http://primer.rs/a?b=1&c=2#d';
    expect(deloviSaLinkovima(`prvi ${a} i ${DRIVE}`).filter((d) => d.href).map((d) => d.href)).toEqual([a, DRIVE]);
  });

  it('drugi protokoli i adrese bez http(s) ostaju tekst', () => {
    for (const t of ['javascript:alert(1)', 'mailto:a@b.rs', 'file:///etc/passwd', 'www.primer.rs', 'drive.google.com/x',
      'https://', 'https://.', 'ftp://primer.rs']) {
      expect(deloviSaLinkovima(t).some((d) => d.href)).toBe(false);
    }
  });

  it('veliko slovo u protokolu je i dalje link', () => {
    expect(linkoviIzTeksta('HTTPS://Primer.rs/X')).toEqual(['HTTPS://Primer.rs/X']);
  });

  it('spojeni delovi daju tačno ulazni tekst', () => {
    for (const t of [`a ${DRIVE}. b`, `(${DRIVE}):`, `x\n\n${DRIVE}\n- y`, 'bez linka', `${DRIVE}`, `https://a.rs/(b`]) {
      expect(spojeno(t)).toBe(t);
    }
  });
});

describe('linkoviIzTeksta i kratakNatpisLinka', () => {
  it('bez ponavljanja, redom', () => {
    expect(linkoviIzTeksta(`${DRIVE} pa https://a.rs i opet ${DRIVE}.`)).toEqual([DRIVE, 'https://a.rs']);
    expect(linkoviIzTeksta(null)).toEqual([]);
  });

  it('natpis je ime servera bez www.', () => {
    expect(kratakNatpisLinka(DRIVE)).toBe('drive.google.com');
    expect(kratakNatpisLinka('https://www.grf.rs/x')).toBe('grf.rs');
  });
});

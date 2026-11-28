import { describe, expect, it } from 'vitest';

import {
  formatPoena, formatSata, greskaStavke, maxPoenaStavki, podrazumevaniTab, prikazUnetog, rucniPoeniIzTeksta, satTesta, svgUrl,
  tabIzUpita, zvezdice,
} from './online.pravila';

describe('online.pravila', () => {
  it('sat: minuti i sekunde, sati kad treba, nikad ispod nule', () => {
    expect(formatSata(31 * 60_000 + 12_000)).toBe('31:12');
    expect(formatSata(3_909_000)).toBe('1:05:09');
    expect(formatSata(-5_000)).toBe('0:00');
    expect(formatSata(500)).toBe('0:01');
  });

  it('sat testa: U_TOKU po satu servera, pre početka trajanje, posle kraja 0:00', () => {
    expect(satTesta('U_TOKU', 100_000, 10_000, 30_000, 45)).toBe('1:00');
    expect(satTesta('PRIPREMA', null, 0, 0, 45)).toBe('45:00');
    expect(satTesta('ULAZ', null, 0, 0, null)).toBe('—');
    expect(satTesta('ZAVRSEN', 100, 0, 0, 45)).toBe('0:00');
  });

  it('poeni: dve decimale sa zarezom, crta bez vrednosti', () => {
    expect(formatPoena(12.345)).toBe('12,35');
    expect(formatPoena(3)).toBe('3');
    expect(formatPoena(null)).toBe('—');
  });

  it('ručni poeni: prazno je null (briše), neispravno undefined, iznad maksimuma undefined', () => {
    expect(rucniPoeniIzTeksta('  ', 10)).toBeNull();
    expect(rucniPoeniIzTeksta('2,5', 10)).toBe(2.5);
    expect(rucniPoeniIzTeksta('11', 10)).toBeUndefined();
    expect(rucniPoeniIzTeksta('-1', 10)).toBeUndefined();
    expect(rucniPoeniIzTeksta('1.234', 10)).toBeUndefined();
  });

  it('stavka šablona: zbir poena i provere iz ugovora', () => {
    expect(maxPoenaStavki([{ poeni: 5, broj: 2 }, { poeni: 10, broj: 1 }])).toBe(20);
    const dobra = { naziv: 'Konverzije', poeni: 5, broj: 2, izvori: [1] };
    expect(greskaStavke(dobra)).toBeNull();
    expect(greskaStavke({ ...dobra, naziv: ' ' })).toBe('Unesi naziv stavke.');
    expect(greskaStavke({ ...dobra, poeni: 0 })).toContain('Poeni');
    expect(greskaStavke({ ...dobra, broj: 21 })).toContain('Broj zadataka');
    expect(greskaStavke({ ...dobra, izvori: [] })).toContain('izvora');
  });

  it('uneto: opcije po id-u, broj i tekst kako jesu', () => {
    const opcije = [{ id: 1, tekst: 'Prva' }, { id: 2, tekst: 'Druga' }];
    expect(prikazUnetog([2, 1], opcije)).toBe('Prva, Druga');
    expect(prikazUnetog(2, opcije)).toBe('Druga');
    expect(prikazUnetog('101,5', null)).toBe('101,5');
    expect(prikazUnetog(null, null)).toBe('');
  });

  it('tabovi: podrazumevani po stanju i samo poznati iz upita', () => {
    expect(podrazumevaniTab('PRIPREMA')).toBe('priprema');
    expect(podrazumevaniTab('ULAZ')).toBe('uzivo');
    expect(podrazumevaniTab('U_TOKU')).toBe('uzivo');
    expect(podrazumevaniTab('ZAVRSEN')).toBe('studenti');
    expect(tabIzUpita('zadaci')).toBe('zadaci');
    expect(tabIzUpita('x')).toBeNull();
  });

  it('slika iz banke ide kroz javni medij; nivo kao zvezdice', () => {
    expect(svgUrl('a b')).toBe('api/public/mediji/a%20b');
    expect(zvezdice(2)).toBe('★★☆');
  });
});

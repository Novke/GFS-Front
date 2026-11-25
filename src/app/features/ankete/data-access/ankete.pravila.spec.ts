import { describe, expect, it } from 'vitest';

import { KontekstAnkete } from './ankete.models';
import { anketa, sablon } from './ankete.testing';
import {
  PORUKA_BEZ_GRUPE, PORUKA_BEZ_PREDAVANJA, PORUKA_SAMO_ISTORIJA, akcijaPanela, anketaZaProjektor, bojaPrecice, cekiranihTekst, cmdPokretanja,
  cmdPreciceIzAnkete, cmdSablonaIzNacrta, imaPraznaMesta, jedanEmoji, kratkoVreme, lokalnoVreme, mogucnosti, mozeOdmah,
  nacrtIzSablona, nazivPrecice, opisKonteksta, opisPrecice, podrazumevaniRok, pomeri, precice, pretrazi, prazanNacrt, proveriNacrt,
  sledecaBoja, trake, filterIstorije, opsegDozvoljen, podrazumevaniOpseg,
} from './ankete.pravila';

const K: KontekstAnkete = { predavanjeId: 5, grupaId: 4, grupaNaziv: 'GD-2026', predmetNaziv: 'UPR', brojCekiranih: 27 };
const SADA = new Date(2026, 10, 24, 10, 0, 0);

describe('mogucnosti konteksta (spec 6.1)', () => {
  it('na času traži predavanje sa grupom; grupa samo grupu; bez oba poruka', () => {
    expect(mogucnosti(K)).toEqual({ naCasu: true, grupa: true, poruka: null });
    expect(mogucnosti({ ...K, predavanjeId: null })).toEqual({ naCasu: false, grupa: true, poruka: null });
    expect(mogucnosti({ ...K, grupaId: null })).toEqual({ naCasu: false, grupa: false, poruka: PORUKA_BEZ_GRUPE });
    expect(mogucnosti({ ...K, grupaId: null, predavanjeId: null })).toEqual({ naCasu: false, grupa: false, poruka: PORUKA_BEZ_PREDAVANJA });
  });

  it('opisKonteksta: predmet · grupa · broj čekiranih (množina)', () => {
    expect(opisKonteksta(K)).toBe('UPR · GD-2026 · 27 čekiranih');
    expect(opisKonteksta({ ...K, predmetNaziv: null, brojCekiranih: 1 })).toBe('GD-2026 · 1 čekiran');
    expect(cekiranihTekst(3)).toBe('3 čekirana');
    expect(cekiranihTekst(12)).toBe('12 čekiranih');
  });
});

describe('istorija po grupi i predavanju', () => {
  it('samoIstorija: ništa se ne pokreće, poruka objašnjava zašto', () => {
    expect(mogucnosti({ ...K, samoIstorija: true })).toEqual({ naCasu: false, grupa: false, poruka: PORUKA_SAMO_ISTORIJA });
  });

  it('opseg: "sve" uvek, "grupa" traži grupu, "predavanje" traži predavanje', () => {
    expect(['grupa', 'predavanje', 'sve'].map(o => opsegDozvoljen(K, o as 'sve'))).toEqual([true, true, true]);
    const bez = { ...K, grupaId: null, predavanjeId: null };
    expect(['grupa', 'predavanje', 'sve'].map(o => opsegDozvoljen(bez, o as 'sve'))).toEqual([false, false, true]);
  });

  it('podrazumevano: grupa, pa predavanje, pa sve', () => {
    expect(podrazumevaniOpseg(K)).toBe('grupa');
    expect(podrazumevaniOpseg({ ...K, grupaId: null })).toBe('predavanje');
    expect(podrazumevaniOpseg({ ...K, grupaId: null, predavanjeId: null })).toBe('sve');
  });

  it('filter za server; nedozvoljen izbor pada na podrazumevani', () => {
    expect(filterIstorije(K, 'grupa')).toEqual({ grupaId: 4 });
    expect(filterIstorije(K, 'predavanje')).toEqual({ predavanjeId: 5 });
    expect(filterIstorije(K, 'sve')).toEqual({});
    expect(filterIstorije({ ...K, grupaId: null }, 'grupa')).toEqual({ predavanjeId: 5 });
  });
});

describe('prečice i pretraga', () => {
  it('prečice redom po precicaRb pa id; ostali šabloni nisu prečice', () => {
    const info = { folderi: [], sabloni: [sablon(1, { precica: true, precicaRb: 2 }), sablon(2), sablon(3, { precica: true, precicaRb: 1 })] };
    expect(precice(info).map(s => s.id)).toEqual([3, 1]);
    expect(precice(null)).toEqual([]);
  });

  it('natpis i opis pločice', () => {
    expect(nazivPrecice({ kratakNaziv: 'Pauza?', pitanje: 'Da li vam treba pauza?' })).toBe('Pauza?');
    expect(nazivPrecice({ kratakNaziv: null, pitanje: 'Kolokvijum 1: koji datum vam više odgovara?' })).toBe('Kolokvijum 1: koji…');
    expect(opisPrecice({ opcije: ['10', '15', 'bez'], publika: 'NA_CASU' })).toBe('10 · 15 · bez');
    expect(opisPrecice({ opcije: ['Sreda', 'Petak'], publika: 'GRUPA' })).toBe('cela grupa · Sreda · Petak');
  });

  it('pretraga bez razlike slova i kvačica, sve reči', () => {
    const s = [sablon(1, { pitanje: 'Kolokvijum: koji datum?' }), sablon(2, { pitanje: 'Da li vam treba pauza?', kratakNaziv: 'Pauza' }), sablon(3, { opcije: ['Ćevapi', 'Pica'] })];
    expect(pretrazi(s, 'KOLOKVIJUM datum').map(x => x.id)).toEqual([1]);
    expect(pretrazi(s, 'cevapi').map(x => x.id)).toEqual([3]);
    expect(pretrazi(s, '   ')).toEqual([]);
  });

  it('boje: prva slobodna, pa ukrug; token teme za svaku', () => {
    expect(sledecaBoja([])).toBe('PLAVA');
    expect(sledecaBoja([sablon(1, { boja: 'PLAVA' }), sablon(2, { boja: 'ZELENA' })])).toBe('LJUBICASTA');
    expect(bojaPrecice('OKER')).toBe('var(--warn)');
    expect(bojaPrecice(null)).toBe('var(--predmet-1)');
  });
});

describe('nacrt i provera', () => {
  it('podrazumevani rok: sutra u 20:00 ili sada + rokSati', () => {
    expect(podrazumevaniRok(SADA, null)).toEqual(new Date(2026, 10, 25, 20, 0, 0));
    expect(podrazumevaniRok(SADA, 48)).toEqual(new Date(2026, 10, 26, 10, 0, 0));
  });

  it('šablon "na času" bez predavanja se otvara za celu grupu sa rokom', () => {
    const n = nacrtIzSablona(sablon(1, { trajanjeSekunde: 60 }), mogucnosti({ ...K, predavanjeId: null }), SADA);
    expect(n.publika).toBe('GRUPA');
    expect(n.trajanjeSekunde).toBeNull();
    expect(n.rok).toEqual(new Date(2026, 10, 25, 20, 0, 0));
  });

  it('mesta za upis ("Opcija N") se otvaraju prazna i takav šablon se nikad ne pokreće odmah', () => {
    const s = sablon(1, { opcije: ['Opcija 1', 'Opcija 2'], pokreniOdmah: true });
    expect(imaPraznaMesta(s)).toBe(true);
    expect(nacrtIzSablona(s, mogucnosti(K), SADA).opcije).toEqual(['', '']);
    expect(nacrtIzSablona(s, mogucnosti(K), SADA, false).opcije).toEqual(['Opcija 1', 'Opcija 2']);
    expect(mozeOdmah(s, mogucnosti(K))).toBe(false);
    expect(mozeOdmah(sablon(2, { pokreniOdmah: true }), mogucnosti(K))).toBe(true);
    expect(mozeOdmah(sablon(2, { pokreniOdmah: true }), mogucnosti({ ...K, predavanjeId: null }))).toBe(false);
  });

  it('provera ima iste granice kao server', () => {
    const n = { ...prazanNacrt(mogucnosti(K), SADA), pitanje: 'Pauza?', opcije: ['Da', 'Ne'] };
    expect(proveriNacrt(n, SADA)).toBeNull();
    expect(proveriNacrt({ ...n, pitanje: '  ' }, SADA)).toBe('Upiši pitanje.');
    expect(proveriNacrt({ ...n, opcije: ['Da', ' '] }, SADA)).toBe('Potrebna su bar dva odgovora.');
    expect(proveriNacrt({ ...n, opcije: ['Da', 'da '] }, SADA)).toBe('Odgovori moraju biti različiti.');
    expect(proveriNacrt({ ...n, opcije: Array.from({ length: 11 }, (_, i) => `${i}`) }, SADA)).toBe('Najviše 10 odgovora.');
    const g = { ...n, publika: 'GRUPA' as const };
    expect(proveriNacrt({ ...g, rok: null }, SADA)).toBe('Izaberi rok.');
    expect(proveriNacrt({ ...g, rok: new Date(2026, 10, 24, 9, 0) }, SADA)).toBe('Rok mora biti u budućnosti.');
    expect(proveriNacrt({ ...g, rok: new Date(2026, 11, 9, 10, 0) }, SADA)).toBe('Rok mora biti u narednih 14 dana.');
    expect(proveriNacrt({ ...g, rok: new Date(2026, 10, 25, 20, 0) }, SADA)).toBeNull();
  });
});

describe('komande', () => {
  it('na času: predavanje i trajanje, bez grupe i roka; grupa: grupa, predavanje i rok (lokalno vreme)', () => {
    const n = { sablonId: 3, pitanje: ' Pauza? ', opcije: ['Da', ' ', 'Ne '], viseOdgovora: false, publika: 'NA_CASU' as const, trajanjeSekunde: 60, rok: null };
    expect(cmdPokretanja(n, K)).toEqual({
      sablonId: 3, pitanje: 'Pauza?', opcije: ['Da', 'Ne'], viseOdgovora: false, publika: 'NA_CASU', predavanjeId: 5, grupaId: null,
      trajanjeSekunde: 60, rok: null,
    });
    const g = cmdPokretanja({ ...n, publika: 'GRUPA', rok: new Date(2026, 10, 25, 20, 0) }, K);
    expect(g).toMatchObject({ publika: 'GRUPA', predavanjeId: 5, grupaId: 4, trajanjeSekunde: null, rok: '2026-11-25T20:00:00' });
    expect(lokalnoVreme(new Date(2026, 0, 5, 8, 3, 9))).toBe('2026-01-05T08:03:09');
  });

  it('nacrt u postojeći šablon: izgled ostaje; podrazumevani rok ne postaje "33 h"', () => {
    const s = sablon(9, { publika: 'GRUPA', rokSati: null, precica: true, boja: 'VISNJA', ikonica: '📅', kratakNaziv: 'Kolokvijum' });
    const n = nacrtIzSablona(s, mogucnosti(K), SADA);
    const cmd = cmdSablonaIzNacrta({ ...n, opcije: ['Sreda', 'Petak'] }, s, { folderId: null, precica: false, boja: null }, SADA);
    expect(cmd).toMatchObject({ opcije: ['Sreda', 'Petak'], rokSati: null, precica: true, boja: 'VISNJA', ikonica: '📅', kratakNaziv: 'Kolokvijum' });
    const drugiRok = cmdSablonaIzNacrta({ ...n, rok: new Date(2026, 10, 26, 10, 0) }, s, { folderId: null, precica: false, boja: null }, SADA);
    expect(drugiRok.rokSati).toBe(48);
  });

  it('nov šablon iz nacrta: prečica dobija boju i kratak naziv', () => {
    const n = { ...prazanNacrt(mogucnosti(K), SADA), pitanje: 'Da li je jasno do sada?', opcije: ['Jasno', 'Nije'], trajanjeSekunde: 60 };
    expect(cmdSablonaIzNacrta(n, null, { folderId: 2, precica: true, boja: 'ZELENA' }, SADA)).toEqual({
      folderId: 2, pitanje: 'Da li je jasno do sada?', opcije: ['Jasno', 'Nije'], viseOdgovora: false, publika: 'NA_CASU', trajanjeSekunde: 60,
      rokSati: null, precica: true, ikonica: null, boja: 'ZELENA', kratakNaziv: 'Da li je jasno do sada?', pokreniOdmah: false,
    });
  });

  it('"★ Sačuvaj": prečica iz ankete, trajanje iz roka (na času) i rok u satima (grupa)', () => {
    const naCasu = cmdPreciceIzAnkete(anketa(1, { rok: '2026-11-24T10:41:00' }), 'TIRKIZNA');
    expect(naCasu).toMatchObject({ precica: true, boja: 'TIRKIZNA', trajanjeSekunde: 60, rokSati: null, pokreniOdmah: true, folderId: null });
    const grupa = cmdPreciceIzAnkete(anketa(2, { publika: 'GRUPA', rok: '2026-11-26T10:40:00' }), 'PLAVA');
    expect(grupa).toMatchObject({ publika: 'GRUPA', trajanjeSekunde: null, rokSati: 48, pokreniOdmah: false });
  });
});

describe('rezultati i projektor', () => {
  it('trake: udeo od broja glasalih; pobednik samo jedini sa najviše', () => {
    expect(trake(['A', 'B', 'C'], [14, 6, 3], 23).map(t => [t.broj, t.procenat, t.pobednik])).toEqual([[14, 61, true], [6, 26, false], [3, 13, false]]);
    expect(trake(['A', 'B'], [2, 2], 4).some(t => t.pobednik)).toBe(false);
    expect(trake(['A', 'B'], [0, 0], 0).map(t => t.udeo)).toEqual([0, 0]);
    // više odgovora: zbir preko 100 %, udeo najviše 1
    expect(trake(['A', 'B'], [3, 2], 3).map(t => t.udeo)).toEqual([1, 2 / 3]);
  });

  it('projektor: najnovija otvorena, inače najnovija sa prikazanim rezultatom, inače ništa', () => {
    expect(anketaZaProjektor([anketa(1), anketa(2, { otvorena: false, rezultatPrikazan: true })])?.id).toBe(1);
    expect(anketaZaProjektor([anketa(1, { otvorena: false, rezultatPrikazan: true }), anketa(3, { otvorena: false })])?.id).toBe(1);
    expect(anketaZaProjektor([anketa(1, { otvorena: false })])).toBeNull();
    expect(anketaZaProjektor(null)).toBeNull();
  });

  it('kratko vreme reda istorije', () => {
    expect(kratkoVreme('2026-11-24T10:44:12.123456')).toBe('24.11. u 10:44');
    expect(kratkoVreme(null)).toBe('');
  });
});

describe('pomoćne', () => {
  it('pomeri: nov niz, van opsega bez promene', () => {
    const a = [1, 2, 3];
    expect(pomeri(a, 0, 2)).toEqual([2, 3, 1]);
    expect(pomeri(a, 0, 5)).toEqual([1, 2, 3]);
    expect(a).toEqual([1, 2, 3]);
  });

  it('jedan emoji: slike i zastave da, slova, cifre i više znakova ne', () => {
    expect(jedanEmoji(' ☕ ')).toBe('☕');
    expect(jedanEmoji('👍🏽')).toBe('👍🏽');
    expect(jedanEmoji('🇷🇸')).toBe('🇷🇸');
    expect(jedanEmoji('a')).toBeNull();
    expect(jedanEmoji('7')).toBeNull();
    expect(jedanEmoji('☕☕')).toBeNull();
    expect(jedanEmoji('')).toBeNull();
  });
});

describe('tasteri panela (spec 6.1)', () => {
  const t = (key: string, izmene: Partial<KeyboardEvent> & { code?: string; target?: EventTarget | null } = {}) =>
    ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, defaultPrevented: false, target: document.body, ...izmene });

  it('1-9 prečica, Enter zatvori, R (i ćirilično р) rezultat', () => {
    expect(akcijaPanela(t('1'))).toEqual({ tip: 'precica', indeks: 0 });
    expect(akcijaPanela(t('9'))).toEqual({ tip: 'precica', indeks: 8 });
    expect(akcijaPanela(t('0'))).toBeNull();
    expect(akcijaPanela(t('Enter'))).toEqual({ tip: 'zatvori' });
    expect(akcijaPanela(t('r'))).toEqual({ tip: 'rezultat' });
    expect(akcijaPanela(t('R'))).toEqual({ tip: 'rezultat' });
    expect(akcijaPanela(t('р', { code: 'KeyR' }))).toEqual({ tip: 'rezultat' });
  });

  it('ne u polju za unos, ne sa modifikatorom ni ponavljanjem; Enter na dugmetu ostaje dugmetu', () => {
    const input = document.createElement('input');
    const dugme = document.createElement('button');
    const meni = document.createElement('div');
    meni.setAttribute('role', 'menuitem');
    expect(akcijaPanela(t('1', { target: input }))).toBeNull();
    expect(akcijaPanela(t('1', { target: meni }))).toBeNull();
    expect(akcijaPanela(t('1', { ctrlKey: true }))).toBeNull();
    expect(akcijaPanela(t('r', { repeat: true }))).toBeNull();
    expect(akcijaPanela(t('Enter', { target: dugme }))).toBeNull();
    expect(akcijaPanela(t('1', { target: dugme }))).toEqual({ tip: 'precica', indeks: 0 });
  });
});

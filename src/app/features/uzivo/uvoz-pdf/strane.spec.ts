import { describe, expect, it } from 'vitest';

import { proveriKaoServer } from '../data-access/platno-provera';
import type { SlikaSloj } from '../data-access/platno.models';
import { MAX_SLAJDOVA } from '../data-access/slajd-pravila';
import { TEME } from '../ui/teme';
import { MAX_SLIKA, zameniMedije } from '../uvoz-pptx/slanje';
import {
  MAX_PDF_BAJTOVA, MAX_SLIKA_STRANE, MAX_STRANA, nazivStrane, porukaOpsega, PRAG_PNG, razmeraCrtanja, slajdStrane, velicinaPlatna,
} from './strane';

const A4 = { sirina: 595.28, visina: 841.89 };
const ID_SERVERA = 'a'.repeat(36);

const slojStrane = (sirina: number, visina: number) => slajdStrane('k', { sirina, visina }, 'N', 'PAPIR').platno!.slojevi[0] as SlikaSloj;

describe('granice PDF-a', () => {
  it('odgovaraju odlukama 17 i 18', () => {
    expect(MAX_STRANA).toBe(200);
    expect(MAX_PDF_BAJTOVA).toBe(100 * 1024 * 1024);
    expect(PRAG_PNG).toBe(3 * 1024 * 1024);
    expect(MAX_SLIKA_STRANE).toBe(10 * 1024 * 1024);
    expect(MAX_SLIKA_STRANE).toBe(MAX_SLIKA);
  });
});

describe('razmeraCrtanja i velicinaPlatna (contain u 1920 x 1080)', () => {
  it('16:9, 4:3 i uspravni A4', () => {
    expect(razmeraCrtanja(960, 540)).toBe(2);
    expect(razmeraCrtanja(720, 540)).toBe(2);
    expect(razmeraCrtanja(A4.sirina, A4.visina)).toBeCloseTo(1.2828, 4);
    expect(velicinaPlatna(960, 540)).toEqual({ w: 1920, h: 1080 });
    expect(velicinaPlatna(720, 540)).toEqual({ w: 1440, h: 1080 });
    expect(velicinaPlatna(A4.sirina, A4.visina)).toEqual({ w: 764, h: 1080 });
  });

  it('veoma uska strana i dalje daje platno od bar 1 piksela', () => {
    expect(velicinaPlatna(1, 100000)).toEqual({ w: 1, h: 1080 });
    expect(velicinaPlatna(100000, 1)).toEqual({ w: 1920, h: 1 });
  });
});

describe('slajdStrane', () => {
  it('16:9 -> zaključan SLIKA sloj preko celog platna, pozadina teme, bez animacija i beležaka', () => {
    const s = slajdStrane('k', { sirina: 960, visina: 540 }, 'N', 'PAPIR');
    expect(s).toMatchObject({ tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null });
    expect(s.platno!.pozadina).toEqual({ boja: TEME.PAPIR.pozadina, medijId: null });
    expect(s.platno!.animacije).toEqual([]);
    expect(s.platno!.slojevi).toHaveLength(1);
    const sloj = s.platno!.slojevi[0] as SlikaSloj;
    expect(sloj).toMatchObject({ id: 's1', tip: 'SLIKA', naziv: 'N', medijId: 'k', zakljucan: true, rotacija: 0, providnost: 1, senka: null });
    expect(sloj.isecak).toEqual({ levo: 0, gore: 0, desno: 0, dole: 0 });
    expect([sloj.x, sloj.y, sloj.sirina, sloj.visina]).toEqual([0, 0, 960, 540]);
  });

  it('4:3 -> trake levo i desno (120, 0, 720 x 540)', () => {
    const sloj = slojStrane(720, 540);
    expect([sloj.x, sloj.y, sloj.sirina, sloj.visina]).toEqual([120, 0, 720, 540]);
  });

  it('uspravni A4 -> centriran, visina 540, brojevi sa najviše 2 decimale', () => {
    const sloj = slojStrane(A4.sirina, A4.visina);
    expect(sloj.visina).toBe(540);
    expect(sloj.sirina).toBe(381.82);
    expect(sloj.x).toBe(289.09);
    expect(sloj.y).toBe(0);
  });

  it('pozadina prati temu prezentacije', () => {
    for (const tema of ['NACRT', 'BELA', 'PAPIR', 'TAMNA', 'PONOC'] as const) {
      expect(slajdStrane('k', { sirina: 720, visina: 540 }, 'N', tema).platno!.pozadina.boja).toBe(TEME[tema].pozadina);
    }
  });

  it('posle zamene ključa id-jem servera dokument prolazi proveru servera (16:9, 4:3, A4)', () => {
    for (const strana of [{ sirina: 960, visina: 540 }, { sirina: 720, visina: 540 }, A4]) {
      const s = slajdStrane('k', strana, nazivStrane(`${'x'.repeat(100)}.pdf`, 200), 'TAMNA');
      const platno = zameniMedije(s.platno!, new Map([['k', ID_SERVERA]]));
      expect((platno.slojevi[0] as SlikaSloj).medijId).toBe(ID_SERVERA);
      expect(proveriKaoServer(platno)).toBeNull();
    }
  });
});

describe('nazivStrane', () => {
  it('ime bez .pdf i broj strane', () => {
    expect(nazivStrane('Predavanje 3.pdf', 12)).toBe('Predavanje 3 - str. 12');
  });

  it('dugo ime se skraćuje sa "…" na tačno 60 znakova', () => {
    const n = nazivStrane(`${'a'.repeat(100)}.PDF`, 7);
    expect([...n]).toHaveLength(60);
    expect(n.endsWith('… - str. 7')).toBe(true);
  });

  it('ime koje je samo ".pdf" -> PDF', () => {
    expect(nazivStrane('.pdf', 1)).toBe('PDF - str. 1');
  });

  it('broji znakove kao server (kodne tačke): emoji je jedan znak', () => {
    const n = nazivStrane(`${'😀'.repeat(70)}.pdf`, 3);
    expect([...n]).toHaveLength(60);
    expect(n.endsWith('😀… - str. 3')).toBe(true);
  });
});

describe('porukaOpsega', () => {
  it('ispravan opseg -> null', () => {
    expect(porukaOpsega(1, 10, 10, 0)).toBeNull();
    expect(porukaOpsega(1, 5, 10, 195)).toBeNull();
  });

  it('opseg van strana ili obrnut -> izaberi strane od 1 do N', () => {
    expect(porukaOpsega(0, 3, 10, 0)).toBe('Izaberi strane od 1 do 10.');
    expect(porukaOpsega(3, 2, 10, 0)).toBe('Izaberi strane od 1 do 10.');
    expect(porukaOpsega(1, 11, 10, 0)).toBe('Izaberi strane od 1 do 10.');
    expect(porukaOpsega(1.5, 3, 10, 0)).toBe('Izaberi strane od 1 do 10.');
    expect(porukaOpsega(Number.NaN, 3, 10, 0)).toBe('Izaberi strane od 1 do 10.');
  });

  it('više od 200 strana odjednom', () => {
    expect(porukaOpsega(1, 201, 250, 0)).toBe('Najviše 200 strana odjednom. Izaberi manji opseg.');
    expect(porukaOpsega(1, 200, 250, 0)).toBeNull();
  });

  it('broj slajdova koji još staju u prezentaciju', () => {
    expect(porukaOpsega(1, 10, 10, 195)).toBe('Broj slajdova koji još staju: 5. Izaberi manji opseg.');
    expect(porukaOpsega(1, 1, 1, MAX_SLAJDOVA)).toBe('Prezentacija već ima 200 slajdova.');
  });
});

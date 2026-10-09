import type { Mock } from 'vitest';

import { EkranOpis, ProzorSaEkranima, otvoriPublikuNaMonitoru } from './monitor';

function ekran(left: number, isPrimary: boolean, label = '') {
  return {
    left, top: 0, width: 1920, height: 1080, availLeft: left, availTop: 0, availWidth: 1920, availHeight: 1040,
    isPrimary, label,
  };
}

describe('otvoriPublikuNaMonitoru', () => {
  const url = 'http://novica-dev/gfs/izvodjenja/5/publika';
  let open: Mock<ProzorSaEkranima['open']>;
  const prozorcic = {} as Window;

  beforeEach(() => {
    open = vi.fn<ProzorSaEkranima['open']>().mockReturnValue(prozorcic);
  });

  it('bez getScreenDetails: običan popup', async () => {
    const w = await otvoriPublikuNaMonitoru(url, undefined, { open });
    expect(w).toBe(prozorcic);
    expect(open).toHaveBeenCalledWith(url, 'gfs-publika', 'popup');
  });

  it('jedan ekran (isExtended=false): ne traži dozvolu, običan popup', async () => {
    const getScreenDetails = vi.fn();
    await otvoriPublikuNaMonitoru(url, undefined, { open, getScreenDetails, screen: { isExtended: false } });
    expect(getScreenDetails).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(url, 'gfs-publika', 'popup');
  });

  it('dozvola odbijena: običan popup', async () => {
    const p: ProzorSaEkranima = { open, getScreenDetails: () => Promise.reject(new DOMException('ne', 'NotAllowedError')) };
    await otvoriPublikuNaMonitoru(url, undefined, p);
    expect(open).toHaveBeenCalledWith(url, 'gfs-publika', 'popup');
  });

  it('jedan ne-primarni ekran: otvara na njegovim koordinatama bez pitanja', async () => {
    const izbor = vi.fn();
    const glavni = ekran(0, true);
    const p: ProzorSaEkranima = {
      open, screen: { isExtended: true },
      getScreenDetails: () => Promise.resolve({ screens: [glavni, ekran(1920, false, 'Projektor')], currentScreen: glavni }),
    };
    await otvoriPublikuNaMonitoru(url, izbor, p);
    expect(izbor).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(url, 'gfs-publika', 'popup,left=1920,top=0,width=1920,height=1040');
  });

  it('konzola na drugom ekranu: kandidat je glavni (bez currentScreen: ne-primarni)', async () => {
    const drugi = ekran(1920, false);
    await otvoriPublikuNaMonitoru(url, undefined, {
      open, getScreenDetails: () => Promise.resolve({ screens: [ekran(0, true), drugi], currentScreen: drugi }),
    });
    expect(open).toHaveBeenCalledWith(url, 'gfs-publika', 'popup,left=0,top=0,width=1920,height=1040');
  });

  it('dva kandidata: poziva izbor i otvara na izabranom', async () => {
    const izbor = vi.fn((e: EkranOpis[]) => Promise.resolve(e[1]));
    await otvoriPublikuNaMonitoru(url, izbor, {
      open, getScreenDetails: () => Promise.resolve({ screens: [ekran(0, true), ekran(1920, false, 'Projektor'), ekran(3840, false)] }),
    });
    expect(izbor).toHaveBeenCalledTimes(1);
    const ekrani = izbor.mock.lastCall![0] as EkranOpis[];
    expect(ekrani.map(e => e.oznaka)).toEqual(['Projektor (1920×1080)', 'Ekran 3 (1920×1080)']);
    expect(open).toHaveBeenCalledWith(url, 'gfs-publika', 'popup,left=3840,top=0,width=1920,height=1040');
  });

  it('izbor otkazan: ništa se ne otvara', async () => {
    const w = await otvoriPublikuNaMonitoru(url, () => Promise.resolve(null), {
      open, getScreenDetails: () => Promise.resolve({ screens: [ekran(0, true), ekran(1920, false), ekran(3840, false)] }),
    });
    expect(w).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});

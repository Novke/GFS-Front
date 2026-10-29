import { izasaoIz, IZASAO_IZ_IZVODJENJA, zaboraviIzlazak, zapamtiIzlazak } from './izlaz-iz-izvodjenja';

describe('izlaz iz izvođenja', () => {
  afterEach(() => sessionStorage.clear());

  it('pamti samo poslednji kod i važi samo za njega', () => {
    expect(izasaoIz('123456')).toBe(false);
    zapamtiIzlazak('123456');
    expect(sessionStorage.getItem(IZASAO_IZ_IZVODJENJA)).toBe('123456');
    expect(izasaoIz('123456')).toBe(true);
    expect(izasaoIz('654321')).toBe(false);
    expect(izasaoIz('')).toBe(false);
    zapamtiIzlazak('654321');
    expect(izasaoIz('123456')).toBe(false);
    zaboraviIzlazak();
    expect(izasaoIz('654321')).toBe(false);
  });

  it('skladište koje baca ne ruši stranicu', () => {
    const baci = () => {
      throw new DOMException('zabranjeno', 'SecurityError');
    };
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(baci);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(baci);
    const rem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(baci);
    try {
      expect(() => zapamtiIzlazak('123456')).not.toThrow();
      expect(izasaoIz('123456')).toBe(false);
      expect(() => zaboraviIzlazak()).not.toThrow();
    } finally {
      set.mockRestore();
      get.mockRestore();
      rem.mockRestore();
    }
  });
});

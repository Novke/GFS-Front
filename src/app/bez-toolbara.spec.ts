import { bezToolbara } from './bez-toolbara';

describe('bezToolbara', () => {
  it('javne studentske rute: upis i uzivo', () => {
    expect(bezToolbara('/upis/abc')).toBe(true);
    expect(bezToolbara('/uzivo')).toBe(true);
    expect(bezToolbara('/uzivo/123456')).toBe(true);
    expect(bezToolbara('/uzivo?x=1')).toBe(true);
  });

  it('publika i konzola izvođenja (projektor)', () => {
    expect(bezToolbara('/izvodjenja/7/publika')).toBe(true);
    expect(bezToolbara('/izvodjenja/7/konzola')).toBe(true);
    expect(bezToolbara('/izvodjenja/12/konzola?telefon=1')).toBe(true);
  });

  it('ostale rute zadržavaju toolbar', () => {
    expect(bezToolbara('/')).toBe(false);
    expect(bezToolbara('/prezentacije')).toBe(false);
    expect(bezToolbara('/prezentacije/3')).toBe(false);
    expect(bezToolbara('/prezentacije/3/izvodjenja')).toBe(false);
    expect(bezToolbara('/izvodjenja/7/pregled')).toBe(false);
    expect(bezToolbara('/grupe')).toBe(false);
  });

  it('slična imena nisu javna ruta', () => {
    expect(bezToolbara('/uzivo-test')).toBe(false);
    expect(bezToolbara('/upisi')).toBe(false);
    expect(bezToolbara('/izvodjenja/abc/konzola')).toBe(false);
    expect(bezToolbara('/izvodjenja/7/konzola2')).toBe(false);
  });
});

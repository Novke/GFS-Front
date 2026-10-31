import { describe, expect, it } from 'vitest';

import { TerminInfo } from './raspored.models';
import { tekstZaWhatsApp, whatsAppLink } from './whatsapp';

const termin = (o: Partial<TerminInfo> = {}): TerminInfo => ({
  stavkaId: 7, rasporedId: 1, datum: '2030-11-07', pocetak: '10:15:00', kraj: '11:45:00',
  predmet: { id: 3, naziv: 'Osnove računarstva' }, grupa: { id: 4, naziv: 'GD-2030' },
  otkazan: true, napomena: null, poceo: false, brojNajava: 0, prag: 5, najave: [], predavanjeId: null,
  ...o,
} as TerminInfo);

describe('tekstZaWhatsApp', () => {
  it('sutra, otkazan, sa napomenom u novom redu', () => {
    expect(tekstZaWhatsApp(termin({ napomena: ' Sednica veća ' }), 'OTKAZAN', '2030-11-06'))
      .toBe('Sutra (četvrtak 7. 11.) nema časa: Osnove računarstva, 10:15–11:45.\nSednica veća');
  });

  it('danas i dan u akuzativu za kasnije datume', () => {
    expect(tekstZaWhatsApp(termin(), 'OTKAZAN', '2030-11-07')).toBe('Danas (četvrtak 7. 11.) nema časa: Osnove računarstva, 10:15–11:45.');
    expect(tekstZaWhatsApp(termin({ datum: '2030-11-13' }), 'OTKAZAN', '2030-11-06'))
      .toBe('U sredu 13. 11. nema časa: Osnove računarstva, 10:15–11:45.');
    expect(tekstZaWhatsApp(termin({ datum: '2030-11-16' }), 'OTKAZAN', '2030-11-06'))
      .toBe('U subotu 16. 11. nema časa: Osnove računarstva, 10:15–11:45.');
  });

  it('ipak se održava, bez napomene', () => {
    expect(tekstZaWhatsApp(termin({ napomena: 'stara' }), 'ODRZAVA', '2030-11-06'))
      .toBe('Sutra (četvrtak 7. 11.) ipak imamo čas: Osnove računarstva, 10:15–11:45.');
  });
});

describe('whatsAppLink', () => {
  it('kodira tekst za wa.me', () => {
    expect(whatsAppLink('Sutra nema časa: A & B?\nNovi red')).toBe('https://wa.me/?text=Sutra%20nema%20%C4%8Dasa%3A%20A%20%26%20B%3F%0ANovi%20red');
  });
});

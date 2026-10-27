import { describe, expect, it } from 'vitest';

import { UzivoPutanje } from '../../uzivo/uzivo-putanje';
import { konzolaIzvodjenja, pregledIzvodjenja } from './izvodjenje-putanje';

describe('putanje izvođenja na ekranu predavanja', () => {
  it('jednake su putanjama iz uživo modula (kopija postoji zbog budžeta studentskog zatvorenja)', () => {
    for (const id of [1, 70, '55']) {
      expect(konzolaIzvodjenja(id)).toBe(UzivoPutanje.izvodjenjeKonzola(id));
      expect(pregledIzvodjenja(id)).toBe(UzivoPutanje.izvodjenjePregled(id));
    }
  });
});

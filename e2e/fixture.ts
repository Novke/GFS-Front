import { expect, test as osnova } from '@playwright/test';

import { MockApi } from './mock-api';

export { expect } from '@playwright/test';

interface Fiksture {
  /** Mokovan API, već instaliran na `page`; posle testa ne sme biti zahteva bez rute. */
  mock: MockApi;
  /** Neuhvaćene greške stranice (`pageerror`); posle testa mora biti prazno. */
  greskeStranice: string[];
}

/**
 * `test` za sve e2e specove: svaki test dobija svež mok (stanje se ne deli), a posle testa pada ako je aplikacija pozvala
 * rutu koju mok ne poznaje (pogrešna putanja ili nov endpoint bez moka) ili ako je stranica bacila neuhvaćen izuzetak.
 */
export const test = osnova.extend<Fiksture>({
  greskeStranice: [
    async ({ page }, use) => {
      const greske: string[] = [];
      page.on('pageerror', e => greske.push(`${e.name}: ${e.message}`));
      await use(greske);
      expect(greske, 'neuhvaćene greške na stranici').toEqual([]);
    },
    { auto: true },
  ],
  mock: [
    async ({ page }, use) => {
      const mock = new MockApi();
      await mock.instaliraj(page);
      await use(mock);
      expect(mock.nepoznati, 'zahtevi za koje mok nema rutu').toEqual([]);
    },
    { auto: true },
  ],
});

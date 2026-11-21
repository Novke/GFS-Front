import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { nastavnickiBroker } from './uzivo-nastavnik';

/*
 * Pločice pitanja "više tačnih" na projektoru: natpis „Može biti više tačnih“ stoji iznad mreže, a domaćin pločica ima
 * `overflow: hidden`, pa mreža mora da deli visinu sa natpisom (bez slike, ne sažeto). Nijedna pločica ne sme da izađe
 * ispod domaćina (donji red se ranije sekao). Izvođenje 7 (`fixtures/uzivo-izvodjenje.json`, izmišljeno), slajd 103.
 */
const IZVODJENJE = 7;

function viseTacnih(mock: MockApi, brojOpcija: number): void {
  const pitanje = mock.izvodjenje.slajdPoId(103)!.pitanje!;
  mock.izvodjenje.izmeniSlajd(2, {
    pitanje: {
      ...pitanje,
      tip: 'VISE_TACNIH',
      tekst: 'Koje su jedinice SI sistema?',
      opcije: Array.from({ length: brojOpcija }, (_, i) => ({
        id: i + 1, rb: i + 1, tekst: ['Metar', 'Kilogram', 'Inč', 'Sekunda', 'Funta', 'Amper'][i], tacna: i % 2 === 0,
      })),
    },
  });
  // prijava -> slajd 1 (3 koraka) -> slajd 2 (3) -> slajd 3 u CEKA, pa otvaranje
  for (let i = 0; i < 9; i++) mock.izvodjenje.primeni('SLEDECI');
}

/** Koliko piksela najniža pločica (i mreža) izlazi ispod domaćina `.uz-plocice`; 0 = sve staje. */
function prelivanje(page: Page): Promise<{ plocica: number; mreza: number; natpis: boolean }> {
  return page.evaluate(() => {
    const domacin = document.querySelector('app-publika-scena app-pitanje-plocice')!;
    const dno = domacin.getBoundingClientRect().bottom;
    const plocice = [...domacin.querySelectorAll('.uz-plocica')].map(p => p.getBoundingClientRect().bottom);
    const mreza = domacin.querySelector('.uz-plocice-mreza')!.getBoundingClientRect().bottom;
    return {
      plocica: Math.max(0, Math.max(...plocice) - dno),
      mreza: Math.max(0, mreza - dno),
      natpis: !!domacin.querySelector('[data-natpis-vise]'),
    };
  });
}

test.describe('uživo: pločice „više tačnih“ na projektoru', () => {
  for (const brojOpcija of [4, 6]) {
    test(`${brojOpcija} opcija: natpis iznad mreže, nijedna pločica ne izlazi iz okvira`, async ({ page, mock }) => {
      viseTacnih(mock, brojOpcija);
      await nastavnickiBroker(page, mock);
      await page.goto(`izvodjenja/${IZVODJENJE}/publika`);
      await expect(page.locator('app-publika-scena [data-natpis-vise]')).toHaveText('Može biti više tačnih');
      await expect(page.locator('app-publika-scena .uz-plocica')).toHaveCount(brojOpcija);
      expect(await prelivanje(page)).toEqual({ plocica: 0, mreza: 0, natpis: true });
    });
  }
});

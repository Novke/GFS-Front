import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixture';
import type { MockApi } from './mock-api';
import { IME_PPTX, uzorakPptx } from './pptx-uzorak';

/** Prezentacija iz `fixtures/prezentacije.json` (izmišljeno): slajdovi 51 (INFO) i 52 (PLATNO). */
const PREZENTACIJA = 5;
/** Prvi id koji mok dodeljuje (nova prezentacija). */
const NOVA = 10_000;

interface SlajdUvoza {
  tip: string; beleske: string | null; platno: { slojevi: { tip: string; medijId?: string }[]; animacije: unknown[] };
  prelaz: { efekat: string; smer: string | null; trajanjeMs: number } | null;
}
interface TeloUvoza { posle: number | null; slajdovi: SlajdUvoza[] }

const dijalog = (page: Page) => page.locator('mat-dialog-container').filter({ has: page.getByRole('heading', { name: 'Uvoz iz PowerPointa' }) });

/** Bira sintetički PPTX u dijalogu uvoza (slajd-forma editora ima svoje skriveno polje za fajl, pa samo unutar dijaloga). */
async function izaberiFajl(page: Page): Promise<void> {
  await page.locator('mat-dialog-container input[type=file]').setInputFiles(uzorakPptx());
}

async function otvoriUvozUEditoru(page: Page): Promise<Locator> {
  await page.goto(`prezentacije/${PREZENTACIJA}`);
  // izabran prvi slajd: uvoz ide između 1 i 2 (posle = 51)
  await page.getByRole('button', { name: /^1\s/ }).click();
  await page.getByRole('button', { name: 'Uvezi iz PowerPointa' }).click();
  const d = dijalog(page);
  await expect(d).toBeVisible();
  await izaberiFajl(page);
  await expect(d.locator('[data-faza="pregled"]')).toBeVisible();
  return d;
}

/** Lista prezentacija -> "Nova prezentacija" -> "Iz PowerPointa" sa fajlom -> "Napravi"; vraća dijalog uvoza u pregledu. */
async function novaIzPowerPointa(page: Page): Promise<Locator> {
  await page.goto('prezentacije');
  await expect(page.locator('.uz-ed-tabela')).toBeVisible();
  await page.getByRole('button', { name: 'Nova prezentacija' }).click();
  const nova = page.locator('mat-dialog-container').filter({ has: page.getByRole('heading', { name: 'Nova prezentacija' }) });
  await nova.getByRole('combobox', { name: 'Predmet' }).click();
  await page.getByRole('option', { name: 'Programiranje u građevinarstvu' }).click();
  await nova.getByRole('radio', { name: 'Iz PowerPointa' }).check();
  await nova.locator('input[type=file]').setInputFiles(uzorakPptx());
  await expect(nova.getByText(`Izabrano: ${IME_PPTX}`)).toBeVisible();
  await expect(nova.getByRole('textbox', { name: 'Naziv' })).toHaveValue('statika-uvod');
  await nova.getByRole('button', { name: 'Napravi' }).click();
  const d = dijalog(page);
  await expect(d.locator('[data-faza="pregled"]')).toBeVisible();
  return d;
}

const uvozi = (mock: MockApi, id: number) => mock.zahteviZa(`prezentacije/${id}/slajdovi/uvoz`, 'POST');

test.describe('uživo: uvoz iz PowerPointa (mokovan API)', () => {
  test('editor: pregled, uvoz posle izabranog slajda, izveštaj sa upozorenjem, kopiranje izveštaja', async ({ page, context, mock }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const d = await otvoriUvozUEditoru(page);
    await expect(d).toContainText(/(^|\D)2 slajda/);
    await expect(d.getByRole('radio', { name: 'Posle slajda 1' })).toBeChecked();

    await d.getByRole('button', { name: 'Uvezi' }).click();
    await expect(d.locator('[data-faza="izvestaj"]')).toContainText('Uvezeno slajdova: 2');
    await expect(d).toContainText('Efekat 6 nije podržan; prikazuje se kao FADE.');

    // jedna slika (ista na oba slajda) i jedan uvoz sa 2 slajda posle izabranog; ključevi medija su zamenjeni id-jem servera
    const slike = mock.zahteviZa('mediji', 'POST');
    expect(slike).toHaveLength(1);
    expect(uvozi(mock, PREZENTACIJA)).toHaveLength(1);
    const telo = uvozi(mock, PREZENTACIJA)[0].telo as TeloUvoza;
    expect(telo.posle).toBe(51);
    expect(telo.slajdovi.map(s => s.tip)).toEqual(['PLATNO', 'PLATNO']);
    expect(telo.slajdovi[1].beleske).toBe('Pokazati primer na tabli.');
    const medijId = mock.mediji[0].id;
    for (const s of telo.slajdovi) {
      expect(s.platno.slojevi.filter(x => x.tip === 'SLIKA').map(x => x.medijId)).toEqual([medijId]);
    }
    expect(telo.slajdovi[0].platno.animacije).toHaveLength(3);
    // prelaz (5e): `<p:transition spd="med"><p:push dir="u"/>` na drugom slajdu; prvi je bez prelaza (ključ `null`)
    expect(telo.slajdovi.map(s => s.prelaz)).toEqual([null, { efekat: 'GURANJE', smer: 'DOLE', trajanjeMs: 750 }]);

    await d.getByRole('button', { name: 'Kopiraj izveštaj' }).click();
    await expect(page.getByText('Izveštaj je kopiran.')).toBeVisible();
    const kopirano = await page.evaluate(() => navigator.clipboard.readText());
    expect(kopirano.startsWith(`Uvoz: ${IME_PPTX}`)).toBe(true);

    await d.getByRole('button', { name: 'Zatvori' }).click();
    await expect(d).toHaveCount(0);
    // lista editora: 1, dva nova PLATNO slajda, pa stari drugi i treći; izabran je prvi uvezeni
    const stavke = page.locator('.uz-ed-stavka-dugme');
    await expect(stavke).toHaveCount(5);
    const tipovi = await stavke.locator('.uz-ed-ikona').evaluateAll(el => el.map(e => e.getAttribute('aria-label')));
    expect(tipovi).toEqual(['Info slajd', 'Platno', 'Platno', 'Platno', 'Platno']);
    await expect(stavke.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(stavke.nth(1)).toBeFocused();
    expect(mock.zahtevi.filter(z => z.metod === 'DELETE')).toEqual([]);
  });

  test('nova prezentacija iz PowerPointa: POST prezentacije (tema BELA), uvoz na kraj, pa editor nove prezentacije', async ({ page, mock }) => {
    const d = await novaIzPowerPointa(page);
    const napravljena = mock.zahteviZa('prezentacije', 'POST');
    expect(napravljena).toHaveLength(1);
    expect(napravljena[0].telo).toMatchObject({ predmetId: 1, naziv: 'statika-uvod', tema: 'BELA' });
    await expect(d).toContainText(/(^|\D)2 slajda/);
    await expect(d.getByRole('radio', { name: /^Posle slajda/ })).toHaveCount(0);

    await d.getByRole('button', { name: 'Uvezi' }).click();
    await expect(d.locator('[data-faza="izvestaj"]')).toContainText('Uvezeno slajdova: 2');
    expect((uvozi(mock, NOVA)[0].telo as TeloUvoza).posle).toBeNull();
    await d.getByRole('button', { name: 'Otvori prezentaciju' }).click();

    await expect(page).toHaveURL(new RegExp(`/prezentacije/${NOVA}$`));
    await expect(page.locator('.uz-ed-stavka-dugme')).toHaveCount(2);
    expect(mock.zahteviZa(`prezentacije/${NOVA}`, 'DELETE')).toHaveLength(0);
  });

  test('nova prezentacija, uvoz odbijen (400): poruka sa rednim brojem PowerPoint slajda i brisanje prazne prezentacije', async ({ page, mock }) => {
    mock.na('POST', 'prezentacije/:id/slajdovi/uvoz', () => ({ status: 400, telo: { reason: 'Slajd 2: Font nije podržan.', time: '' } }));
    const d = await novaIzPowerPointa(page);
    await d.getByRole('button', { name: 'Uvezi' }).click();

    await expect(d.getByRole('alert')).toHaveText('PowerPoint slajd 2: Font nije podržan. Prazna prezentacija je obrisana.');
    expect(uvozi(mock, NOVA)).toHaveLength(1);
    expect(mock.zahteviZa(`prezentacije/${NOVA}`, 'DELETE')).toHaveLength(1);
    await expect(d.getByRole('button', { name: 'Pokušaj ponovo' })).toHaveCount(0);

    const liste = mock.zahteviZa('prezentacije', 'GET').length;
    await d.getByRole('button', { name: 'Zatvori' }).click();
    await expect(d).toHaveCount(0);
    // lista se ponovo čita i nema obrisane prezentacije
    await expect.poll(() => mock.zahteviZa('prezentacije', 'GET').length).toBe(liste + 1);
    await expect(page).toHaveURL(/\/prezentacije$/);
    await expect(page.locator('.uz-ed-tabela tbody tr')).toHaveCount(1);
  });

  test('nova prezentacija, nepoznat ishod (veza prekinuta): bez brisanja, poruka "možda ipak dodati", lista se ponovo čita', async ({ page, mock }) => {
    const uvoz: string[] = [];
    page.on('request', r => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/prezentacije/${NOVA}/slajdovi/uvoz`)) uvoz.push(r.url());
    });
    // ruta dodata posle moka ima prednost: zahtev nikad ne dobija odgovor (kao pad veze posle slanja)
    await page.route('**/api/prezentacije/*/slajdovi/uvoz', route => route.abort('connectionreset'));
    const d = await novaIzPowerPointa(page);
    await d.getByRole('button', { name: 'Uvezi' }).click();

    await expect(d.getByRole('alert')).toContainText('Slajdovi su možda ipak dodati u novu prezentaciju');
    expect(uvoz).toHaveLength(1);
    await expect(d.getByRole('button', { name: 'Pokušaj ponovo' })).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Izaberi drugi fajl' })).toHaveCount(0);

    const liste = mock.zahteviZa('prezentacije', 'GET').length;
    await d.getByRole('button', { name: 'Zatvori' }).click();
    await expect(d).toHaveCount(0);
    await expect.poll(() => mock.zahteviZa('prezentacije', 'GET').length).toBe(liste + 1);
    // nova prezentacija ostaje (možda ima slajdove): nikakav DELETE, vidi se u listi
    await expect(page.locator('.uz-ed-tabela tbody tr')).toHaveCount(2);
    expect(mock.zahtevi.filter(z => z.metod === 'DELETE')).toEqual([]);
  });

  test('editor, nepoznat ishod (502 bez razloga): bez ponovnog pokušaja, zatvaranje ponovo čita prezentaciju', async ({ page, mock }) => {
    mock.na('POST', 'prezentacije/:id/slajdovi/uvoz', () => ({ status: 502 }));
    const d = await otvoriUvozUEditoru(page);
    await d.getByRole('button', { name: 'Uvezi' }).click();

    await expect(d.getByRole('alert')).toContainText('Slajdovi su možda ipak dodati; prezentacija se ponovo učitava');
    expect(uvozi(mock, PREZENTACIJA)).toHaveLength(1);
    await expect(d.getByRole('button', { name: 'Pokušaj ponovo' })).toHaveCount(0);

    const citanja = mock.zahteviZa(`prezentacije/${PREZENTACIJA}`, 'GET').length;
    await d.getByRole('button', { name: 'Zatvori' }).click();
    await expect(d).toHaveCount(0);
    await expect.poll(() => mock.zahteviZa(`prezentacije/${PREZENTACIJA}`, 'GET').length).toBe(citanja + 1);
    await expect(page.locator('.uz-ed-stavka-dugme')).toHaveCount(3);
    expect(mock.zahtevi.filter(z => z.metod === 'DELETE')).toEqual([]);
  });
});

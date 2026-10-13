import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixture';
import { uzorakPptx } from './pptx-uzorak';
import { budanEkranStub, nastavnickiBroker } from './uzivo-nastavnik';

/** Token otvorene sesije iz `fixtures/onboarding.json` (izmišljen). */
const TOKEN = 'e2eTokenZaUpis_0123456789abcdefg';

/** Stranice iz brief-a i element koji znači da je sadržaj učitan (ne skeleton). */
const STRANICE: { putanja: string; spremno: (page: Page) => ReturnType<Page['locator']>; pripremi?: (page: Page) => Promise<void> }[] = [
  { putanja: '', spremno: p => p.getByRole('heading', { name: 'Čeka na tebe' }) },
  { putanja: 'predavanja', spremno: p => p.getByRole('region', { name: 'Lista predavanja' }).locator('tbody tr').first() },
  { putanja: 'predavanja/1', spremno: p => p.locator('app-studentska-plocica').first() },
  { putanja: 'testovi/1', spremno: p => p.locator('tbody tr').first() },
  { putanja: 'grupe/1/studenti', spremno: p => p.locator('tbody tr').first() },
  { putanja: 'studenti/1', spremno: p => p.getByRole('heading', { level: 1, name: 'Ana Primerović' }) },
  // editor prezentacije sa izabranim PLATNO slajdom (izbor drugog slajda u listi; pregled je uvek dnevnih boja)
  {
    putanja: 'prezentacije/5',
    spremno: p => p.locator('.uz-ed-platno [data-sloj="naslov"]'),
    pripremi: async p => {
      await p.getByRole('button', { name: /^2\s/ }).click();
      // sličica INFO slajda (sa linkom u markdown-u) je lenja (`@defer (on viewport)`): skenira se tek kad je iscrtana
      await expect(p.locator('.uz-ed-slicica a')).toHaveCount(1);
      await expect(p.locator('[data-oznaka="gfs-editor-platna"]')).toBeVisible();
    },
  },
  { putanja: `upis/${TOKEN}`, spremno: p => p.getByRole('button', { name: 'Pošalji' }) },
];

const OZNAKE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/** Serious/critical kršenja axe-a (cela stranica ili samo `ukljuci`), sa prvih 5 elemenata svakog. */
async function ozbiljnaKrsenja(page: Page, ukljuci?: string) {
  const axe = new AxeBuilder({ page }).withTags(OZNAKE);
  const rezultat = await (ukljuci ? axe.include(ukljuci) : axe).analyze();
  return rezultat.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => ({ pravilo: v.id, uticaj: v.impact, opis: v.help, elementi: v.nodes.map(n => n.target.join(' ')).slice(0, 5) }));
}

for (const rezim of ['dan', 'noc'] as const) {
  test.describe(`pristupačnost (axe), režim ${rezim}`, () => {
    // režim "Sistem" (podrazumevan) prati prefers-color-scheme pregledača
    test.use({ colorScheme: rezim === 'noc' ? 'dark' : 'light' });

    for (const s of STRANICE) {
      test(`/${s.putanja}: bez serious/critical kršenja`, async ({ page }) => {
        await page.goto(s.putanja || './');
        await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
        await s.pripremi?.(page);
        await expect(s.spremno(page)).toBeVisible();
        await page.waitForLoadState('networkidle');

        expect(await ozbiljnaKrsenja(page), `axe: /${s.putanja} (${rezim})`).toEqual([]);
      });
    }

    // Uživo za nastavnika (mok izvođenja + lažni STOMP broker): konzola je uvek svetla, daljinski prati dan/noć (`pratiRezim`).
    test('/izvodjenja/7/konzola (1280 px): bez serious/critical kršenja', async ({ page, mock }) => {
      await nastavnickiBroker(page, mock);
      await page.goto('izvodjenja/7/konzola');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await expect(page.getByRole('region', { name: 'Sledeće' })).toBeVisible();
      await expect(page.locator('app-projector-layout')).toHaveClass(/\brezim-dan\b/);
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: /izvodjenja/7/konzola (${rezim})`).toEqual([]);
    });

    test.describe('daljinski na telefonu', () => {
      test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

      test('/izvodjenja/7/daljinski (390 x 844): bez serious/critical kršenja, prati režim', async ({ page, mock }) => {
        await budanEkranStub(page);
        const broker = await nastavnickiBroker(page, mock);
        await page.goto('izvodjenja/7/daljinski');
        await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
        await expect(page.getByRole('button', { name: /^Napred/ })).toBeVisible();
        await expect(page.locator('.uz-dalj-veza')).toHaveText('Povezano');
        // daljinski ne nosi `rezim-dan` (u noći bi ga zaključao na dan)
        await expect(page.locator('app-projector-layout')).not.toHaveClass(/\brezim-dan\b/);
        await page.waitForLoadState('networkidle');
        expect(await ozbiljnaKrsenja(page), `axe: /izvodjenja/7/daljinski, prijava (${rezim})`).toEqual([]);

        // otvoreno pitanje (red Otvori/Zatvori, Rezultati, Tačan i "Odgovorili") stiže sa laptopa kroz STOMP
        for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI');
        broker.posalji('/topic/izvodjenja/7/nastavnik', mock.izvodjenje.primeni('OTVORI_ZATVORI').telo);
        await expect(page.getByRole('group', { name: 'Pitanje' }).getByText('Odgovorili 0/2')).toBeVisible();
        expect(await ozbiljnaKrsenja(page), `axe: /izvodjenja/7/daljinski, pitanje (${rezim})`).toEqual([]);
      });
    });

    // editor platna (lenji chunk) nad PLATNO slajdom 52: panel Svojstva sa izabranim oblikom i slikom, otvorena paleta
    // boja (CDK popover) i panel Slojevi
    test('editor platna (svojstva oblika i slike, paleta boja, slojevi): bez serious/critical kršenja', async ({ page }) => {
      await page.goto('prezentacije/5');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await page.getByRole('button', { name: /^2\s/ }).click();
      await expect(page.locator('.uz-ed-slicica a')).toHaveCount(1);
      const editor = page.locator('[data-oznaka="gfs-editor-platna"]');
      const sloj = (id: string) => editor.locator(`.uz-ep-platno [data-sloj="${id}"]`);
      // sloj izbora (overlay) leži preko prikaza i prima pokazivač: klik mišem u centar sloja
      const izaberi = async (id: string) => {
        await sloj(id).scrollIntoViewIfNeeded(); // fokus u panelu (paleta) može da pomeri stranu: mere tek posle
        const b = (await sloj(id).boundingBox())!;
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      };
      await expect(sloj('oblik')).toBeVisible();

      await izaberi('oblik');
      await expect(editor.getByText('Izabrano: Elipsa 1')).toBeAttached();
      const popuna = editor.getByRole('button', { name: /^Popuna:/ });
      await expect(popuna).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, svojstva oblika (${rezim})`).toEqual([]);

      await popuna.click();
      const paleta = page.getByRole('dialog', { name: 'Popuna' });
      await expect(paleta).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, paleta boja (${rezim})`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(paleta).toBeHidden();
      await expect(popuna).toBeFocused();

      await izaberi('slika');
      await expect(editor.getByText('Izabrano: Slika 1')).toBeAttached();
      await expect(editor.getByRole('heading', { name: 'Isečak' })).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, svojstva slike (${rezim})`).toEqual([]);

      await editor.getByRole('tab', { name: 'Slojevi' }).click();
      await expect(editor.locator('[data-sloj-panel="oblik"]')).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, slojevi (${rezim})`).toEqual([]);
    });

    // dijalog uvoza iz PowerPointa (lenji chunk) u stanju pregleda i izveštaja, nad editorom prezentacije
    test('dijalog uvoza iz PowerPointa (pregled, izveštaj): bez serious/critical kršenja', async ({ page }) => {
      await page.goto('prezentacije/5');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await page.getByRole('button', { name: 'Uvezi iz PowerPointa' }).click();
      const dijalog = page.locator('mat-dialog-container');
      await expect(dijalog.getByRole('heading', { name: 'Uvoz iz PowerPointa' })).toBeVisible();
      await dijalog.locator('input[type=file]').setInputFiles(uzorakPptx());

      await expect(dijalog.locator('[data-faza="pregled"]')).toBeVisible();
      await expect(dijalog.locator('.uz-uv-zbir')).toBeFocused();
      expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: dijalog uvoza, pregled (${rezim})`).toEqual([]);

      await dijalog.getByRole('button', { name: 'Uvezi' }).click();
      await expect(dijalog.locator('[data-faza="izvestaj"]')).toBeVisible();
      await expect(dijalog.locator('.uz-uv-zbir')).toBeFocused();
      expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: dijalog uvoza, izveštaj (${rezim})`).toEqual([]);
    });
  });
}

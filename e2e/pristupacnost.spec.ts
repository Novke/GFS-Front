import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { posleOtvaranjaDijaloga } from './dijalog';
import { expect, test } from './fixture';
import { napraviPdf } from './fixtures/pdf-fabrika';
import { lazniBroker } from './lazni-stomp';
import { IZVORI_TEKSTA, OPCIJE_SA_FORMULOM, SPREMNIH_FORMULA, TEKST_SA_FORMULOM, pitanjeSaFormulom } from './mock-izvodjenje';
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
  // editor prezentacije sa izabranim PLATNO slajdom (izbor drugog slajda u listi; platno je uvek dnevnih boja)
  {
    putanja: 'prezentacije/5',
    spremno: p => p.locator('.uz-ep-platno [data-sloj="naslov"]'),
    pripremi: async p => {
      await p.getByRole('button', { name: /^2\s/ }).click();
      // sličica INFO slajda (sa linkom u markdown-u) je lenja (`@defer (on viewport)`): skenira se tek kad je iscrtana
      await expect(p.locator('.uz-ed-slicica a')).toHaveCount(1);
      await expect(p.locator('[data-oznaka="gfs-editor-platna"]')).toBeVisible();
    },
  },
  { putanja: `upis/${TOKEN}`, spremno: p => p.getByRole('button', { name: 'Pošalji' }) },
  // banka zadataka: list sa karticama (i greškom rendera) i unutrašnji čvor sa zbirom
  { putanja: 'banka?predmet=1', spremno: p => p.locator('app-varijanta-kartica').first() },
  { putanja: 'banka?predmet=1&grupa=1', spremno: p => p.locator('[data-zbir]') },
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
    // 5a: forma pitanja sa uputstvom i upozorenjem za formule (`--warn`, jedini nov element 5a koji prati noćni režim);
    // nijedan fixture editora nema PITANJE, pa se ovde dodaje (proba recenzenta B4)
    test('/prezentacije/5 (forma pitanja sa upozorenjem za formulu): bez serious/critical kršenja', async ({ page, mock }) => {
      mock.podaci.prezentacije.find(x => x.id === 5)!.slajdovi.push({
        id: 777, rb: 4, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, postepeno: false, platno: null, beleske: null,
        pitanje: {
          id: 551, tip: 'JEDAN_TACAN', tekst: 'Koliko je $1011_2$ i $\\nepostoji{x}$?', slika: null, vremeSekunde: null,
          opcije: [{ id: 1, rb: 1, tekst: '$\\nepostoji{y}$', tacna: true }, { id: 2, rb: 2, tekst: '$13$', tacna: false }],
          brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
          prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
        },
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('prezentacije/5');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      const dugme = page.getByRole('button', { name: /^4\s/ });
      await expect(dugme).toBeEnabled();
      await dugme.click();
      const upozorenja = page.locator('p.uz-ed-upozorenje');
      await expect(upozorenja).toHaveCount(2, { timeout: 15_000 });
      await expect(upozorenja.first()).toContainText('u tekstu pitanja');
      await expect(page.getByText('odmah posle cifre $ ne otvara formulu', { exact: false })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: forma pitanja sa upozorenjem (${rezim})`).toEqual([]);
    });

    // banka zadataka: dijalozi nove grupe (naziv, težina), premeštanja (radio stablo sa onemogućenim mestima) i preambule
    test('/banka (dijalozi nove grupe, premeštanja i preambule): bez serious/critical kršenja', async ({ page }) => {
      await page.goto('banka?predmet=1');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await expect(page.locator('app-varijanta-kartica')).toHaveCount(3);
      const kontejner = page.locator('mat-dialog-container');
      const proveri = async (naziv: string) => {
        await expect(kontejner).toBeVisible();
        await posleOtvaranjaDijaloga(page, kontejner);
        expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: ${naziv} (${rezim})`).toEqual([]);
        await page.getByRole('button', { name: 'Odustani' }).click();
        await expect(kontejner).toHaveCount(0);
      };

      await page.getByRole('button', { name: 'Nova grupa' }).click();
      await proveri('nova grupa');
      await page.getByRole('button', { name: 'Radnje za grupu 2 → 10' }).click();
      await page.getByRole('menuitem', { name: 'Premesti u…' }).click();
      await proveri('premesti');
      await page.getByRole('button', { name: 'Podešavanja LaTeX-a' }).click();
      await expect(page.getByRole('textbox', { name: 'Preambula' })).toBeVisible();
      await proveri('preambula');
    });

    // 5c: forma INFO slajda sa dugmetom "Pretvori u platno" i potvrda pretvaranja uz gubitke (veza)
    test('/prezentacije/5 (forma INFO sa "Pretvori u platno" i dijalog potvrde): bez serious/critical kršenja', async ({ page }) => {
      await page.goto('prezentacije/5');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      const pretvori = page.getByRole('button', { name: 'Pretvori u platno' });
      await expect(pretvori).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: forma INFO sa dugmetom (${rezim})`).toEqual([]);

      await page.getByRole('textbox', { name: 'Tekst (Markdown)' }).fill('Vidi [vezu](https://primer.rs).');
      await expect(pretvori).toBeEnabled();
      await pretvori.click();
      const dijalog = page.getByRole('alertdialog', { name: 'Pretvoriti slajd u platno?' });
      await expect(dijalog).toContainText('Veze postaju običan tekst');
      // fokus na potvrdi postavlja CDK posle animacije otvaranja (ConfirmDialog, autoFocus '[data-potvrdi]')
      await expect(dijalog.getByRole('button', { name: 'Pretvori' })).toBeFocused();
      expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: potvrda pretvaranja (${rezim})`).toEqual([]);
      const odustani = dijalog.getByRole('button', { name: 'Odustani' });
      await expect(odustani).toBeEnabled();
      await odustani.click();
      await expect(dijalog).toHaveCount(0);
    });

    // 5e: polja prelaza u formi (Efekat, Smer, Trajanje sa greškom na polju, "Pregledaj prelaz") i dijalog pregleda prelaza
    test('/prezentacije/5 (polja prelaza i dijalog "Pregled prelaza"): bez serious/critical kršenja', async ({ page, mock }) => {
      const p = mock.podaci.prezentacije.find(x => x.id === 5)!;
      p.slajdovi.push({
        id: 54, rb: 4, tip: 'INFO', naslov: 'Zaključak', sadrzaj: 'Sile su u ravnoteži.', slika: null, beleske: null,
        postepeno: false, pitanje: null, platno: null, prelaz: { efekat: 'GURANJE', smer: 'GORE', trajanjeMs: 5000 },
      });
      await page.goto('prezentacije/5');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await page.getByRole('button', { name: /^4\s/ }).click();
      const grupa = page.getByRole('group', { name: 'Prelaz na ovaj slajd' });
      await expect(grupa.getByRole('combobox', { name: 'Smer' })).toContainText('Odozgo');
      // greška na samom polju (crveno, aria-invalid, mat-error) mora da ima kontrast i u noćnom režimu
      const trajanje = grupa.getByRole('textbox', { name: 'Trajanje (s)' });
      await trajanje.fill('9');
      await expect(trajanje).toHaveAttribute('aria-invalid', 'true');
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page, 'app-slajd-forma'), `axe: polja prelaza sa greškom (${rezim})`).toEqual([]);
      await trajanje.fill('5');
      await expect(trajanje).not.toHaveAttribute('aria-invalid', 'true');
      expect(await ozbiljnaKrsenja(page, 'app-slajd-forma'), `axe: polja prelaza (${rezim})`).toEqual([]);

      await grupa.getByRole('button', { name: 'Pregledaj prelaz' }).click();
      const dijalog = page.getByRole('dialog', { name: 'Pregled prelaza' });
      await expect(dijalog.getByRole('button', { name: 'Ponovi' })).toBeFocused();
      // fokus stiže pre kraja animacije otvaranja (afterNextRender), a providan kontejner daje pogrešan kontrast
      await posleOtvaranjaDijaloga(page, page.locator('mat-dialog-container'));
      // prelaz od 5 s: odlazni (aria-hidden) i ulazni slajd su oba u dijalogu dok axe radi
      await expect(dijalog.locator('app-slajd-prikaz')).toHaveCount(2);
      expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: pregled prelaza (${rezim})`).toEqual([]);
      await dijalog.getByRole('button', { name: 'Zatvori' }).click();
      await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    });

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
    // boja (CDK popover), tekst, tabela (F14: popover "Tabela", panel tabele, uređivanje ćelije), formula (F16: panel i
    // dijalog) i panel Slojevi
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
      // kao i ostali testovi ovog fajla: axe tek kad stanu zahtevi (slike i fontovi platna, lenji chunk-ovi panela), jer
      // nema jednog vidljivog stanja koje bi pokazalo da su svi stigli (slika sloja može da stigne posle teksta)
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

      // F13: svojstva teksta (radiogroup poravnanja i sidra, aria-pressed), pa isto tokom uređivanja teksta
      await izaberi('naslov');
      await expect(editor.getByRole('radiogroup', { name: 'Poravnanje' })).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, svojstva teksta (${rezim})`).toEqual([]);
      const b = (await sloj('naslov').boundingBox())!;
      await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
      await expect(editor.getByRole('textbox', { name: /^Tekst sloja/ })).toBeFocused();
      await expect(editor.getByText('Uređuje se tekst.')).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, svojstva teksta tokom uređivanja (${rezim})`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(editor.getByText('Uređuje se tekst.')).toBeHidden();

      // F16: panel formule, pa dijalog formule (math-field MathLive-a u fokusu posle učitavanja)
      await izaberi('formula');
      await expect(editor.getByRole('button', { name: 'Uredi formulu' })).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, svojstva formule (${rezim})`).toEqual([]);
      await editor.getByRole('button', { name: 'Uredi formulu' }).click();
      const formula = page.locator('[data-oznaka="gfs-formula-editor"]');
      await expect(formula.locator('math-field')).toBeFocused();
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: dijalog formule (${rezim})`).toEqual([]);
      await formula.getByRole('button', { name: 'Otkaži' }).click();
      await expect(formula).toHaveCount(0);
      await expect(editor.getByRole('button', { name: 'Uredi formulu' })).toBeFocused();

      // F14: "Tabela" (CDK popover sa poljima), panel tabele, pa uređivanje ćelije
      await editor.getByRole('button', { name: 'Tabela', exact: true }).click();
      const ubaci = page.getByRole('dialog', { name: 'Ubaci tabelu' });
      await expect(ubaci.getByLabel('Redova')).toBeFocused();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, ubacivanje tabele (${rezim})`).toEqual([]);
      await ubaci.getByRole('button', { name: 'Ubaci' }).click();
      await expect(ubaci).toBeHidden();
      await expect(editor.getByRole('group', { name: 'Ćelije' })).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, svojstva tabele (${rezim})`).toEqual([]);
      const td = editor.locator('.uz-ep-platno td[data-celija="1-1"]').last();
      await td.scrollIntoViewIfNeeded();
      const c = (await td.boundingBox())!;
      await page.mouse.dblclick(c.x + c.width / 2, c.y + c.height / 2);
      await expect(editor.getByRole('textbox', { name: 'Tekst ćelije 2, 2' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(editor.getByText('Uređuje se tekst.')).toBeHidden();

      await editor.getByRole('tab', { name: 'Slojevi' }).click();
      await expect(editor.locator('[data-sloj-panel="oblik"]')).toBeVisible();
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, slojevi (${rezim})`).toEqual([]);
    });

    // F19: tab "Animacije" sa izabranom animacijom (detalji, značke grupa na platnu) i režim "Pregled" (koraci, tabovi
    // onemogućeni, sadržaj panela sakriven), nad PLATNO slajdom 52 sa tri KLIK animacije
    test('editor platna (animacije sa izabranom animacijom, režim Pregled): bez serious/critical kršenja', async ({ page }) => {
      await page.goto('prezentacije/5');
      await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
      await page.getByRole('button', { name: /^2\s/ }).click();
      await expect(page.locator('.uz-ed-slicica a')).toHaveCount(1);
      const editor = page.locator('[data-oznaka="gfs-editor-platna"]');
      await expect(editor.locator('.uz-ep-platno [data-sloj="naslov"]')).toBeVisible();

      await editor.getByRole('tab', { name: 'Animacije' }).click();
      // kraj animacije tela taba pre klika u panelu (Material tada skida privremenu visinu omotača)
      await expect(editor.locator('.mat-tab-body-animating')).toHaveCount(0);
      const red = editor.locator('[data-animacija="a2"] > button');
      await red.click();
      await expect(red).toHaveAttribute('aria-pressed', 'true');
      await expect(editor.getByRole('textbox', { name: 'Trajanje (s)' })).toBeVisible();
      await expect(editor.locator('.uz-ep-znacka')).toHaveText(['1', '2', '3']);
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, animacije (${rezim})`).toEqual([]);

      await editor.getByRole('group', { name: 'Alati platna' }).getByRole('button', { name: 'Pregled' }).click();
      await expect(editor.locator('.uz-ep-korak')).toHaveText('Korak 0 / 3');
      await editor.getByRole('button', { name: 'Korak napred' }).click();
      await expect(editor.locator('.uz-ep-korak')).toHaveText('Korak 1 / 3');
      await expect(editor.getByRole('tab', { name: 'Animacije' })).toBeDisabled();
      await expect(editor.locator('app-panel-animacije')).toBeHidden();
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), `axe: editor platna, režim Pregled (${rezim})`).toEqual([]);
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

    // dijalog uvoza iz PDF-a (5d, lenji chunk + pdf.js) u stanju pregleda i slanja (slika strane zadržana u moku)
    test('dijalog uvoza iz PDF-a (pregled, slanje): bez serious/critical kršenja', async ({ page, mock }) => {
      const zadrzan = mock.zadrzi('POST', 'mediji');
      try {
        await page.goto('prezentacije/5');
        await expect(page.locator('html')).toHaveAttribute('data-mode', rezim);
        const pdf = page.getByRole('button', { name: 'Uvezi iz PDF-a' });
        await expect(pdf).toBeEnabled();
        await pdf.click();
        const dijalog = page.locator('mat-dialog-container');
        await expect(dijalog.getByRole('heading', { name: 'Uvoz iz PDF-a' })).toBeVisible();
        await dijalog.locator('input[type=file]').setInputFiles({ name: 'Sinteticki.pdf', mimeType: 'application/pdf', buffer: napraviPdf([{ sirina: 960, visina: 540 }]) });

        await expect(dijalog.locator('[data-faza="pregled"]')).toBeVisible();
        await expect(dijalog.locator('.uz-uv-zbir')).toBeFocused();
        expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: dijalog PDF-a, pregled (${rezim})`).toEqual([]);

        const uvezi = dijalog.getByRole('button', { name: 'Uvezi' });
        await expect(uvezi).toBeEnabled();
        await uvezi.click();
        await expect(dijalog.locator('[data-faza="slanje"]')).toBeVisible();
        await zadrzan.stigao;
        await expect(dijalog.locator('.uz-uv-status')).toBeFocused();
        expect(await ozbiljnaKrsenja(page, 'mat-dialog-container'), `axe: dijalog PDF-a, slanje (${rezim})`).toEqual([]);
      } finally {
        zadrzan.pusti();
      }
      await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    });
  });
}

// 5a: pitanje sa formulama (nacrtane i izvor `$...$`) na telefonu studenta i na projektoru. Javne strane i projektor su
// uvek dnevni, pa jedan prolaz (dan).
test.describe('pristupačnost (axe): pitanje sa formulom, dan', () => {
  test.use({ colorScheme: 'light' });

  test.describe('telefon', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('/uzivo/123456 (pitanje sa formulom, 390 x 844): bez serious/critical kršenja', async ({ page, mock }) => {
      mock.podaci.ucesnici.push({ ucesnikId: 10_000, ime: 'Mina', izvodjenjeId: 7 });
      await lazniBroker(page, 'api/public/ws', o => (o === '/app/izvodjenja/7/pocetno' ? {
        javno: {
          izvodjenjeId: 7, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
          kod: '123456', prikaz: 'SLAJD', slajdTip: 'PITANJE', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'PITANJE',
          detaljiDozvoljeni: false, brojUcesnika: 1, rezultat: null, rangLista: null,
          pitanje: {
            tip: 'JEDAN_TACAN', faza: 'OTVORENO', rundaId: 31, brojOpcija: OPCIJE_SA_FORMULOM.length,
            opcije: OPCIJE_SA_FORMULOM.map((tekst, i) => ({ id: i + 1, tekst })), tekst: TEKST_SA_FORMULOM, slikaId: null,
            jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null, rokMs: null, preostaloMs: null, tacneOpcije: null,
            tacanBroj: null, prihvatljiviOdgovori: null,
          },
        },
        licno: { verzija: 1, ucesnikId: 10_000, ime: 'Mina', poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
      } : undefined));
      await page.goto('uzivo/123456');
      await expect(page.locator('.uz-formula--spremna .ML__latex')).toHaveCount(SPREMNIH_FORMULA);
      await expect(page.locator('.uz-formula--izvor')).toHaveCount(IZVORI_TEKSTA.length);
      await page.waitForLoadState('networkidle');
      expect(await ozbiljnaKrsenja(page), 'axe: telefon, pitanje sa formulom').toEqual([]);
    });

    /*
     * Talas ispravki 5a (završna recenzija B, Important 2): šira formula se na telefonu skroluje u sebi, pa je skrol region
     * (`scrollable-region-focusable`, serious) koji tastatura mora da dohvati. Tab stop (`tabindex="0"`) dobija samo
     * nacrtana formula koja stvarno prelazi širinu; kratka ne, a formula u dugmetu opcije (`aria-hidden`, ime dugmeta iz
     * `tekstZaCitac`) nikad (`nested-interactive`). Ime je `aria-label` = LaTeX uz `role="img"`.
     */
    const SIROKA = '$\\frac{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9}{b_1+b_2+b_3+b_4+b_5+b_6+b_7+b_8+b_9}=x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8$';
    for (const ekran of ['unos', 'tačan odgovor'] as const) {
      test(`/uzivo/123456 (široka formula, 360 x 740, ${ekran}): bez serious/critical kršenja, skrol formule dostupan tastaturi`, async ({ page, mock }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        mock.podaci.ucesnici.push({ ucesnikId: 10_000, ime: 'Mina', izvodjenjeId: 7 });
        const tacan = ekran === 'tačan odgovor';
        await lazniBroker(page, 'api/public/ws', o => (o === '/app/izvodjenja/7/pocetno' ? {
          javno: {
            izvodjenjeId: 7, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
            kod: '123456', prikaz: 'SLAJD', slajdTip: 'PITANJE', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'PITANJE',
            detaljiDozvoljeni: false, brojUcesnika: 1, rezultat: null, rangLista: null,
            pitanje: {
              tip: 'JEDAN_TACAN', faza: tacan ? 'ZATVORENO' : 'OTVORENO', rundaId: 31, brojOpcija: 2,
              opcije: [{ id: 1, tekst: SIROKA }, { id: 2, tekst: '$13$' }], tekst: `Izračunaj ${SIROKA} ako je $13$.`,
              slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null, rokMs: null, preostaloMs: null,
              tacneOpcije: tacan ? [1, 2] : null, tacanBroj: null, prihvatljiviOdgovori: null,
            },
          },
          licno: { verzija: 1, ucesnikId: 10_000, ime: 'Mina', poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
        } : undefined));
        await page.goto('uzivo/123456');
        const okvir = tacan ? '.uz-st-tacna' : '.uz-st-md';
        const siroka = page.locator(`${okvir} .uz-formula--spremna`).first();
        await expect(siroka.locator('.ML__latex')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await ozbiljnaKrsenja(page), `axe: telefon, široka formula (${ekran})`).toEqual([]);
        // široka formula: skrol region sa tab stopom; kratka ($13$) i formule u dugmadima opcija bez tab stopa
        await expect(siroka).toHaveAttribute('tabindex', '0');
        expect(await siroka.evaluate(f => f.scrollWidth > f.clientWidth), 'široka formula prelazi širinu').toBe(true);
        const kratke = page.locator('.uz-formula--spremna[aria-label="13"]');
        await expect(kratke.first()).toBeVisible();
        for (const k of await kratke.all()) await expect(k).not.toHaveAttribute('tabindex');
        // u dugmetu opcije: nikad tab stop (samo -1 kad formula prelazi) i bez uloge i imena (dugme ga daje)
        await expect(page.locator('button [tabindex]:not([tabindex="-1"]), button .uz-formula[role], button .uz-formula[aria-label]'))
          .toHaveCount(0);
        if (!tacan) await expect(page.locator('button .uz-formula--spremna[tabindex="-1"]')).toHaveCount(1);
        // tab red (re-recenzija B, I1): Chromium 130+ sam stavlja skrol kontejner bez fokusabilnih potomaka u tab red, pa bi
        // široka formula u dugmetu opcije (`aria-hidden`) bila prazan stop; formula iz teksta pitanja ostaje stop
        const stopovi: { opis: string; skriven: boolean; uDugmetu: boolean; tekstPitanja: boolean }[] = [];
        for (let i = 0; i < 30; i++) {
          await page.keyboard.press('Tab');
          const s = await page.evaluate((sel) => {
            const a = document.activeElement as HTMLElement | null;
            if (!a || a === document.body || a.dataset['tabProba'] !== undefined) return null; // krug je završen
            a.dataset['tabProba'] = '';
            return {
              opis: `${a.tagName}.${[...a.classList].join('.')}`,
              skriven: !!a.closest('[aria-hidden="true"]'),
              uDugmetu: a.matches('.uz-formula') && !!a.parentElement?.closest('button'),
              tekstPitanja: a.matches('.uz-formula') && !!a.closest(sel),
            };
          }, okvir);
          if (!s) break;
          stopovi.push(s);
        }
        test.info().annotations.push({ type: 'tab red', description: stopovi.map(x => x.opis).join(' -> ') });
        expect(stopovi.filter(x => x.skriven || x.uDugmetu).map(x => x.opis), 'stop u aria-hidden ili formula u dugmetu').toEqual([]);
        expect(stopovi.some(x => x.tekstPitanja), 'široka formula iz teksta je tab stop').toBe(true);
        // tastatura: fokus na formuli, strelica je skroluje
        await siroka.focus();
        await expect(siroka).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => siroka.evaluate(f => f.scrollLeft)).toBeGreaterThan(0);
      });
    }
  });

  test('/izvodjenja/7/publika (projektor, pitanje sa formulom): bez serious/critical kršenja', async ({ page, mock }) => {
    mock.izvodjenje.izmeniSlajd(2, { pitanje: pitanjeSaFormulom() });
    for (let i = 0; i < 8; i++) mock.izvodjenje.primeni('SLEDECI'); // prijava -> slajd 1 (3) -> slajd 2 (3) -> slajd 3
    await nastavnickiBroker(page, mock);
    await page.goto('izvodjenja/7/publika');
    await expect(page.locator('.uz-pitanje-tekst .uz-formula--spremna .ML__latex')).toHaveCount(1);
    await expect(page.locator('.uz-plocica-tekst .uz-formula--spremna .ML__latex')).toHaveCount(OPCIJE_SA_FORMULOM.length);
    await expect(page.locator('.uz-pitanje-tekst .uz-formula--izvor')).toHaveCount(IZVORI_TEKSTA.length);
    await page.waitForLoadState('networkidle');
    expect(await ozbiljnaKrsenja(page), 'axe: projektor, pitanje sa formulom').toEqual([]);
  });
});

import type { Page } from '@playwright/test';
import { expect, test } from './javna-mreza';
import { lazniBroker, type LazniBroker } from './lazni-stomp';

/*
 * Zadatak slajd na telefonu studenta (FE-5; "ni ranije", Ugovori). Telefon dobija samo svoju varijantu (A) kroz lično
 * stanje; slike druge varijante (B) i rešenja nikad ne stižu, pa ih telefon ne sme ni tražiti, a svoje rešenje (resA) tek
 * posle `RESENJE`. Lažni broker igra server: javno i lično stanje šalje spec, `pocetno` vraća poslednje poslato.
 * Id-jevi slika su izmišljeni UUID-i; mok za svaki `api/public/mediji/*` vraća providan piksel.
 */
const KOD = '123456';
const IZVODJENJE = 7;
const RUNDA = 55;
const A = '00000000-0000-4000-8000-00000000000a';
const RES_A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-00000000000b';
const RES_B = '00000000-0000-4000-8000-0000000000bb';

const POLJA = [
  { kljuc: 'a', oznaka: 'a) Dekadno', tip: 'BROJ', odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null,
    zanemariRazmake: null, opcije: null },
  { kljuc: 'c', oznaka: 'c) Broj cifara', tip: 'JEDAN_TACAN', odstupanje: null, odstupanjeTip: null, jedinica: null,
    zanemariVelicinu: null, zanemariRazmake: null, opcije: [{ id: 1, tekst: '5' }, { id: 2, tekst: '6' }, { id: 3, tekst: '7' }] },
];

const javno = (verzija: number, zadatak: Record<string, unknown> | null) => ({
  izvodjenjeId: IZVODJENJE, verzija, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Brojni sistemi · vežbe', kod: KOD,
  prikaz: zadatak ? 'SLAJD' : 'PRIJAVA', slajdTip: zadatak ? 'ZADATAK' : null, ekran: 'NORMALAN', takmicenje: false,
  telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false, brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null, zadatak,
});
const javniZadatak = (faza: string, izmene: Record<string, unknown> = {}) => ({
  faza, rundaId: faza === 'CEKA' ? null : RUNDA, rokMs: null, preostaloMs: null, brojVarijanti: 2, grupaNaziv: '2 → 10',
  resenjePrikazano: false, ...izmene,
});
const licno = (verzija: number, ime: string, zadatak: Record<string, unknown> | null) => ({
  verzija, ucesnikId: 10_000, ime, poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null, zadatak,
});
const licniZadatak = (izmene: Record<string, unknown> = {}) => ({
  rundaId: RUNDA, varijantaId: 12, svgId: A, polja: POLJA, faza: 'OTVORENO', primljen: false, ishod: null, tacno: null,
  tacneVrednosti: null, resenjeSvgId: null, ...izmene,
});

/** Server za jednog studenta: šalje javno pa lično (kao `PublicUzivoStompController`) i pamti ih za `pocetno`. */
class Cas {
  javno = javno(1, null);
  licno: ReturnType<typeof licno>;
  private v = 1;
  broker!: LazniBroker;

  constructor(private readonly ime: string) {
    this.licno = licno(1, ime, null);
  }

  async povezi(page: Page, ws: string[]): Promise<void> {
    this.broker = await lazniBroker(
      page, 'api/public/ws',
      o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? { javno: this.javno, licno: this.licno } : undefined),
      url => ws.push(new URL(url).pathname),
    );
  }

  posalji(zadatak: Record<string, unknown> | null, svoj: Record<string, unknown> | null): void {
    this.v++;
    this.javno = javno(this.v, zadatak);
    this.licno = licno(this.v, this.ime, svoj);
    this.broker.posalji(`/topic/izvodjenja/${IZVODJENJE}/javno`, this.javno);
    this.broker.posalji('/user/queue/licno', this.licno);
  }
}

/** Id-jevi svih slika koje je stranica tražila sa `api/public/mediji/` (bez ponavljanja). */
function pratiMedije(page: Page): Set<string> {
  const ids = new Set<string>();
  page.on('request', r => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/api/public/mediji/')) ids.add(decodeURIComponent(p.slice('/api/public/mediji/'.length)));
  });
  return ids;
}

test.describe('javni uživo: Zadatak slajd na telefonu', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    // kod, ime (prijava), pa samo javni GET-ovi i slike; ništa nastavničko
    dozvoljeniApi: /^(GET \/api\/public\/(uzivo|mediji)\/|POST \/api\/public\/uzivo\/\d{6}\/prijava$)/,
  });

  test('svoja varijanta, odgovor bez varijantaId, ista slika posle ponovnog povezivanja, ishod, tačno i rešenje tek kad su prikazani', async ({ page, javnaMreza }) => {
    const mediji = pratiMedije(page);
    const cas = new Cas('Mina');
    await cas.povezi(page, javnaMreza.ws);

    await page.goto('uzivo');
    await page.getByLabel('Kod sa table').fill(KOD);
    await expect(page).toHaveURL(new RegExp(`/uzivo/${KOD}$`));
    await page.getByLabel('Tvoje ime').fill('Mina');
    await page.getByRole('button', { name: 'Uđi' }).click();
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    await expect.poll(() => cas.broker.pretplate).toContain(`/topic/izvodjenja/${IZVODJENJE}/javno`);

    // CEKA: bez sadržaja, nijedna slika
    cas.posalji(javniZadatak('CEKA'), null);
    await expect(page.getByText('Zadatak stiže…')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect([...mediji], 'slika pre otvaranja').toEqual([]);

    // OTVORENO: svoja varijanta A (i samo ona)
    cas.posalji(javniZadatak('OTVORENO', { preostaloMs: 120_000 }), licniZadatak());
    const slika = page.locator('img[data-zadatak-svg]');
    await expect(slika).toHaveAttribute('src', `api/public/mediji/${A}`);
    await expect.poll(() => slika.evaluate(i => (i as HTMLImageElement).complete)).toBe(true);
    expect([...mediji]).toEqual([A]);
    // omot dozvoljava zum prstima i skrol jednim prstom (`pan-x pan-y pinch-zoom`, Chromium ga piše kao `manipulation`);
    // samo `pinch-zoom` bi preko slike ugasio skrol stranice jednim prstom
    expect(await slika.evaluate(i => getComputedStyle(i.parentElement!).touchAction)).toBe('manipulation');
    await expect(page.getByRole('timer')).toBeVisible();

    const posalji = page.getByRole('button', { name: 'Pošalji' });
    await expect(posalji).toBeDisabled();
    await page.getByLabel('a) Dekadno').fill('45');
    await page.getByRole('group', { name: 'c) Broj cifara' }).getByRole('button', { name: '6' }).click();
    await posalji.click();
    await expect(page.getByText('Odgovor primljen ✓')).toBeVisible();
    // posle slanja polja i "Pošalji" nestaju; ostaje šta je poslato
    await expect(posalji).toHaveCount(0);
    await expect(page.getByLabel('a) Dekadno')).toHaveCount(0);
    await expect(page.locator('[data-poslato]')).toContainText('a) Dekadno: 45');
    await expect.poll(() => cas.broker.slanja.length).toBe(1);
    const [poslato] = cas.broker.slanja;
    expect(poslato.odrediste).toBe(`/app/izvodjenja/${IZVODJENJE}/odgovor`);
    expect(JSON.parse(poslato.telo)).toEqual({ rundaId: RUNDA, polja: { a: '45', c: [2] } });
    expect(poslato.telo).not.toContain('varijantaId');
    cas.posalji(javniZadatak('OTVORENO', { preostaloMs: 110_000 }), licniZadatak({ primljen: true }));

    // ponovno povezivanje (telefon zaspi, osveži): broker zatvori vezu, nova veza dobija `pocetno` sa istom varijantom
    cas.broker.prekini();
    await expect(page.getByText('Veza prekinuta, povezujem…')).toBeVisible();
    await expect.poll(() => cas.broker.veze, { timeout: 10_000 }).toBe(2);
    await expect(page.getByText('Veza prekinuta, povezujem…')).toBeHidden();
    await expect(slika).toHaveAttribute('src', `api/public/mediji/${A}`);
    await expect(page.getByText('Odgovor primljen ✓')).toBeVisible();
    await expect(page.getByLabel('a) Dekadno')).toHaveCount(0);
    await expect(page.locator('[data-poslato]')).toContainText('a) Dekadno: 45');

    // ZATVORENO: ishod po poljima, još bez tačnih vrednosti i bez rešenja
    cas.posalji(javniZadatak('ZATVORENO'), licniZadatak({ faza: 'ZATVORENO', primljen: true, ishod: { a: true, c: false }, tacno: false }));
    await expect(page.getByText('a) Dekadno: tačno')).toBeVisible();
    await expect(page.getByText('c) Broj cifara: netačno')).toBeVisible();
    await expect(page.getByText('Netačno', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Tačno:/)).toHaveCount(0);

    // TACAN: tačne vrednosti svoje varijante
    const tacne = { a: { broj: 45, prihvatljivi: null, tacna: null, tacne: null }, c: { broj: null, prihvatljivi: null, tacna: 3, tacne: null } };
    cas.posalji(javniZadatak('ZATVORENO'), licniZadatak({
      faza: 'ZATVORENO', primljen: true, ishod: { a: true, c: false }, tacno: false, tacneVrednosti: tacne,
    }));
    await expect(page.getByText('Tačno: 45')).toBeVisible();
    await expect(page.locator('[data-tacno]').nth(1)).toHaveText(/Tačno:\s*7/);
    await page.waitForLoadState('networkidle');
    expect(mediji.has(RES_A), 'rešenje pre RESENJE').toBe(false);
    await expect(page.getByRole('img', { name: 'Rešenje' })).toHaveCount(0);

    // RESENJE: slika rešenja svoje varijante
    cas.posalji(javniZadatak('ZATVORENO', { resenjePrikazano: true }), licniZadatak({
      faza: 'ZATVORENO', primljen: true, ishod: { a: true, c: false }, tacno: false, tacneVrednosti: tacne, resenjeSvgId: RES_A,
    }));
    await expect(page.getByRole('img', { name: 'Rešenje' })).toHaveAttribute('src', `api/public/mediji/${RES_A}`);
    await expect.poll(() => mediji.has(RES_A)).toBe(true);
    await page.waitForLoadState('networkidle');
    expect([...mediji].sort(), 'samo svoja slika i svoje rešenje').toEqual([A, RES_A].sort());
    expect(mediji.has(B) || mediji.has(RES_B), 'slika druge varijante').toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('"Uvećaj": slika preko celog ekrana, Esc zatvara i vraća fokus', async ({ page, mock, javnaMreza }) => {
    mock.podaci.ucesnici.push({ ucesnikId: 10_000, ime: 'Mina', izvodjenjeId: IZVODJENJE });
    const cas = new Cas('Mina');
    cas.javno = javno(2, javniZadatak('OTVORENO'));
    cas.licno = licno(2, 'Mina', licniZadatak());
    await cas.povezi(page, javnaMreza.ws);
    await page.goto(`uzivo/${KOD}`);
    const uvecaj = page.getByRole('button', { name: 'Uvećaj', exact: true });
    await uvecaj.click();
    const dijalog = page.getByRole('dialog', { name: 'Zadatak' });
    await expect(dijalog).toBeVisible();
    await expect(dijalog.getByRole('button', { name: 'Zatvori' })).toBeFocused();
    await expect(dijalog.locator('img')).toHaveAttribute('src', `api/public/mediji/${A}`);
    await page.keyboard.press('Escape');
    await expect(dijalog).toBeHidden();
    await expect(uvecaj).toBeFocused();
  });

  test('papir: "Reši na papiru." bez polja i bez "Pošalji"', async ({ page, mock, javnaMreza }) => {
    mock.podaci.ucesnici.push({ ucesnikId: 10_000, ime: 'Mina', izvodjenjeId: IZVODJENJE });
    const cas = new Cas('Mina');
    cas.javno = javno(2, javniZadatak('OTVORENO'));
    cas.licno = licno(2, 'Mina', licniZadatak({ polja: [] }));
    await cas.povezi(page, javnaMreza.ws);
    await page.goto(`uzivo/${KOD}`);
    await expect(page.locator('img[data-zadatak-svg]')).toHaveAttribute('src', `api/public/mediji/${A}`);
    await expect(page.getByText('Reši na papiru.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pošalji' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });

  test('prijavljen student (bodovan run): bez forme imena, ulazi pod svojim imenom', async ({ page, mock, javnaMreza }) => {
    mock.podaci.izvodjenja.find(i => i.kod === KOD)!.prijavaObavezna = true;
    mock.podaci.prijavljenStudent = 'Mina Primerović';
    const cas = new Cas('Mina Primerović');
    await cas.povezi(page, javnaMreza.ws);
    await page.goto(`uzivo/${KOD}`);
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    await expect(page.getByLabel('Tvoje ime')).toHaveCount(0);
    expect(mock.zahteviZa(`public/uzivo/${KOD}/prijava`, 'POST').map(z => z.telo)).toEqual([{ ime: '' }]);
    await expect(page.getByText('Ti si: Mina Primerović')).toBeVisible();
  });
});

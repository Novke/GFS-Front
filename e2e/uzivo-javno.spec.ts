import { expect, test } from './javna-mreza';
import { lazniBroker } from './lazni-stomp';

/** Kod aktivnog izvođenja iz `fixtures/uzivo.json` (izmišljen). */
const KOD = '123456';
const IZVODJENJE = 7;

/** Početni snimak "čeka se početak" (javno + lično), kao `PublicUzivoStompController`. */
const pocetno = (ime: string) => ({
  javno: {
    izvodjenjeId: IZVODJENJE, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
    kod: KOD, prikaz: 'PRIJAVA', slajdTip: null, ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD',
    detaljiDozvoljeni: false, brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null,
  },
  licno: { verzija: 1, ucesnikId: 10_000, ime, poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
});

test.describe('javni uživo (telefon studenta, bez basic-auth-a)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: /^(GET \/api\/public\/uzivo\/\d{6}(\/ja)?|POST \/api\/public\/uzivo\/\d{6}\/prijava)$/,
  });

  test('kod pa ime: samo api/public/uzivo i api/public/ws, nijedan 401; posle prijave "Čekamo početak"', async ({ page, mock, javnaMreza }) => {
    let ime = '';
    const zahtevi: string[] = [];
    page.on('request', r => zahtevi.push(new URL(r.url()).pathname));
    // veze kroz `page.routeWebSocket` ne izazivaju događaj `websocket`, pa putanju upisuje broker
    const broker = await lazniBroker(
      page, 'api/public/ws',
      o => (o === `/app/izvodjenja/${IZVODJENJE}/pocetno` ? pocetno(ime) : undefined),
      url => javnaMreza.ws.push(new URL(url).pathname),
    );

    await page.goto('uzivo');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Uživo');
    await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toHaveCount(0);
    const kod = page.getByLabel('Kod sa table');
    await expect(kod).toBeVisible();

    // šesta cifra sama proverava kod i vodi na uzivo/:kod
    await kod.fill(KOD);
    await expect(page).toHaveURL(new RegExp(`/uzivo/${KOD}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statika · uvodni čas');

    ime = 'Mina';
    await page.getByLabel('Tvoje ime').fill(ime);
    await page.getByRole('button', { name: 'Uđi' }).click();
    await expect(page.getByText('Čekamo početak')).toBeVisible();
    await expect(page.getByText('Ti si: Mina')).toBeVisible();

    expect(mock.zahteviZa(`public/uzivo/${KOD}/prijava`, 'POST')[0].telo).toEqual({ ime: 'Mina' });
    expect(javnaMreza.api).toEqual([
      `GET /api/public/uzivo/${KOD}`,
      `GET /api/public/uzivo/${KOD}`,
      `GET /api/public/uzivo/${KOD}/ja`,
      `POST /api/public/uzivo/${KOD}/prijava`,
    ]);
    // javna ruta ne vuče fontove platna (spec 13): ni jedan zahtev za carlito, caladea, arimo, tinos, cousine, atkinson
    expect(zahtevi.filter(p => /carlito|caladea|arimo|tinos|cousine|atkinson/i.test(p)), 'fontovi platna na javnoj ruti').toEqual([]);
    expect(javnaMreza.ws).toEqual(['/api/public/ws']);
    // samo odredišta koja backend dozvoljava studentu
    expect([...broker.pretplate].sort()).toEqual([
      `/app/izvodjenja/${IZVODJENJE}/pocetno`, `/topic/izvodjenja/${IZVODJENJE}/javno`, '/user/queue/greske', '/user/queue/licno',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('nepoznat kod: poruka uz polje, ostaje na unosu koda', async ({ page }) => {
    await page.goto('uzivo');
    await page.getByLabel('Kod sa table').fill('000000');
    await expect(page.getByText('Izvođenje sa tim kodom ne postoji ili je završeno.')).toBeVisible();
    await expect(page).toHaveURL(/\/uzivo$/);
  });
});

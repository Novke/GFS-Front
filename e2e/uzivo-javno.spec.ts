import type { WebSocketRoute } from '@playwright/test';

import { expect, test } from './javna-mreza';

/** Kod aktivnog izvođenja iz `fixtures/uzivo.json` (izmišljen). */
const KOD = '123456';
const IZVODJENJE = 7;

/** STOMP okvir (tekst, `\0` na kraju). */
const okvir = (komanda: string, zaglavlja: Record<string, string>, telo = '') =>
  `${komanda}\n${Object.entries(zaglavlja).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${telo}\0`;

/** Prvi red i zaglavlja primljenog okvira. */
function procitaj(poruka: string): { komanda: string; zaglavlja: Record<string, string> } {
  const [glava] = poruka.split('\n\n');
  const [komanda, ...redovi] = glava.split('\n');
  return { komanda, zaglavlja: Object.fromEntries(redovi.map(r => [r.slice(0, r.indexOf(':')), r.slice(r.indexOf(':') + 1)])) };
}

/**
 * Lažni STOMP broker na `api/public/ws` (bez servera): potvrđuje CONNECT, beleži pretplate i na pretplatu za početno stanje
 * odgovara snimkom "čeka se početak" (javno + lično), kao `PublicUzivoStompController`.
 */
function laznaVeza(ws: WebSocketRoute, pretplate: string[], ime: () => string): void {
  ws.onMessage(poruka => {
    const tekst = typeof poruka === 'string' ? poruka : poruka.toString('utf8');
    if (tekst === '\n') {
      return; // heartbeat
    }
    const { komanda, zaglavlja } = procitaj(tekst.replace(/^\n+/, ''));
    if (komanda === 'CONNECT' || komanda === 'STOMP') {
      ws.send(okvir('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }));
    } else if (komanda === 'SUBSCRIBE') {
      pretplate.push(zaglavlja['destination']);
      if (zaglavlja['destination'] === `/app/izvodjenja/${IZVODJENJE}/pocetno`) {
        const telo = JSON.stringify({
          javno: {
            izvodjenjeId: IZVODJENJE, verzija: 1, serverVremeMs: Date.now(), status: 'AKTIVNO', naziv: 'Statika · uvodni čas',
            kod: KOD, prikaz: 'PRIJAVA', slajdTip: null, ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD',
            detaljiDozvoljeni: false, brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null,
          },
          licno: { verzija: 1, ucesnikId: 10_000, ime: ime(), poeni: 0, mesto: null, brojUcesnika: 1, izbacen: false, odgovor: null },
        });
        ws.send(okvir('MESSAGE', {
          destination: zaglavlja['destination'], subscription: zaglavlja['id'], 'message-id': '1', 'content-type': 'application/json',
        }, telo));
      }
    }
  });
}

test.describe('javni uživo (telefon studenta, bez basic-auth-a)', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    dozvoljeniApi: /^(GET \/api\/public\/uzivo\/\d{6}(\/ja)?|POST \/api\/public\/uzivo\/\d{6}\/prijava)$/,
  });

  test('kod pa ime: samo api/public/uzivo i api/public/ws, nijedan 401; posle prijave "Čekamo početak"', async ({ page, mock, javnaMreza }) => {
    const pretplate: string[] = [];
    let ime = '';
    await page.routeWebSocket('**/api/public/ws', ws => {
      javnaMreza.ws.push(new URL(ws.url()).pathname);
      laznaVeza(ws, pretplate, () => ime);
    });

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
    expect(javnaMreza.ws).toEqual(['/api/public/ws']);
    // samo odredišta koja backend dozvoljava studentu
    expect([...pretplate].sort()).toEqual([
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

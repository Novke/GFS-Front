/*
 * Service worker GFS aplikacije (spec „Aplikacija i obaveštenja“, odeljci 4.2 i 5; ugovor u planu, „Sadržaj push poruke“).
 *
 * Namerno bez keša i bez `fetch` handler-a: ništa ne presreće (ni `/api/`), pa nema mešanja verzija. Samo prikazuje push
 * poruke i na klik otvara putanju iz poruke, i to samo unutar svog opsega (isti origin). Registruje ga `core/pwa/service-worker.ts`
 * sa opsegom korena aplikacije; nginx fronta za ovaj fajl šalje `Service-Worker-Allowed: /` i `no-store`.
 *
 * Poruka: JSON `{naslov, tekst, putanja, oznaka}`; `putanja` je relativna prema korenu aplikacije (`nalog`, `nalog/cas`,
 * `nalog/predmet/7`, `raspored/termini?od=2026-11-03`, `?obavestenja=otvori`, `` za nastavničku početnu).
 */
'use strict';

const OSNOVNO = { naslov: 'GFS', tekst: 'Imaš novo obaveštenje.', putanja: 'nalog', oznaka: 'gfs' };
/** Ikonice su pored ovog fajla (`assets/pwa/`), a ne relativno prema korenu. */
const IKONA = new URL('ikona-192.png', self.location.href).href;
const ZNACKA = new URL('znacka-96.png', self.location.href).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function niska(v, max) {
  return typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : null;
}

/** Adresa za putanju iz poruke: samo unutar opsega service worker-a; sve ostalo (drugi origin, smeće) vodi na nalog. */
function adresa(putanja) {
  const opseg = self.registration.scope;
  if (typeof putanja === 'string' && putanja.length <= 500) {
    try {
      const url = new URL(putanja, opseg);
      if (url.origin === self.location.origin && url.href.startsWith(opseg)) {
        return url.href;
      }
    } catch (e) {
      // neispravna putanja: osnovna
    }
  }
  return new URL(OSNOVNO.putanja, opseg).href;
}

function procitaj(data) {
  let p = null;
  try {
    p = data ? data.json() : null;
  } catch (e) {
    p = null;
  }
  if (!p || typeof p !== 'object') {
    return OSNOVNO;
  }
  return {
    naslov: niska(p.naslov, 120) || OSNOVNO.naslov,
    tekst: niska(p.tekst, 500) || '',
    putanja: typeof p.putanja === 'string' ? p.putanja : OSNOVNO.putanja,
    oznaka: niska(p.oznaka, 120) || OSNOVNO.oznaka,
  };
}

/** Otvoreni prozori aplikacije osvežavaju zvono odmah (`core/pwa/service-worker.ts`, `porukeServiceWorkera`). */
async function javiProzorima() {
  const prozori = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const prozor of prozori) {
    prozor.postMessage({ tip: 'gfs-obavestenje' });
  }
}

self.addEventListener('push', event => {
  // Chrome traži vidljivo obaveštenje za svaku push poruku, pa se prikazuje i kad je sadržaj neispravan (osnovni tekst).
  const p = procitaj(event.data);
  event.waitUntil(Promise.all([
    self.registration.showNotification(p.naslov, {
      body: p.tekst,
      tag: p.oznaka,
      icon: IKONA,
      badge: ZNACKA,
      lang: 'sr-Latn',
      data: { putanja: p.putanja },
    }),
    javiProzorima().catch(() => undefined),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const cilj = adresa(event.notification.data && event.notification.data.putanja);
  event.waitUntil((async () => {
    const prozori = await self.clients.matchAll({ type: 'window' });
    const prozor = prozori.find(p => p.url.startsWith(self.registration.scope));
    if (prozor) {
      try {
        const fokusiran = (await prozor.focus()) || prozor;
        if (await fokusiran.navigate(cilj)) {
          return;
        }
      } catch (e) {
        // prozor ne može da se preusmeri: novi prozor ispod
      }
    }
    await self.clients.openWindow(cilj);
  })());
});

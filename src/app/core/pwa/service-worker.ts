/**
 * Registracija service worker-a (spec „Aplikacija i obaveštenja“ 4.2). Bez uvoza iz aplikacije: koristi ga i javni nalog
 * studenta (`gfs/javna-ruta-uvozi`). Zove se samo posle prijave (zvono naloga, nastavnička ljuska), nikad na `upis` i
 * `uzivo`. Fajl je `assets/pwa/sw.js`, opseg koren aplikacije (oba relativno prema `<base href>`); nginx fronta mu šalje
 * `Service-Worker-Allowed: /`. SW nema keš ni `fetch` handler, pa registracija ništa ne menja u radu stranice.
 */

let registracija: Promise<ServiceWorkerRegistration | null> | null = null;

/** Podržava li browser service worker (stari browseri, `http://` van localhost-a i neki ugrađeni pregledači ne). */
export function imaServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && window.isSecureContext;
}

/** Jednom po učitavanju stranice; greška (npr. `ng serve` bez zaglavlja) daje `null` i ne smeta ostatku stranice. */
export function registrujServiceWorker(dokument: Document): Promise<ServiceWorkerRegistration | null> {
  if (!imaServiceWorker()) {
    return Promise.resolve(null);
  }
  registracija ??= navigator.serviceWorker
    .register(new URL('assets/pwa/sw.js', dokument.baseURI).href, {
      scope: new URL('./', dokument.baseURI).href,
      updateViaCache: 'none',
    })
    .catch(() => {
      registracija = null;
      return null;
    });
  return registracija;
}

/** Aktivna registracija (čeka da SW postane aktivan, jer push pretplata to traži). */
export async function spremnaRegistracija(dokument: Document): Promise<ServiceWorkerRegistration | null> {
  const r = await registrujServiceWorker(dokument);
  if (!r) {
    return null;
  }
  return r.active ? r : navigator.serviceWorker.ready;
}

/** Poruka iz SW-a kad stigne push (`{tip: 'gfs-obavestenje'}`): zvono se osvežava odmah. Vraća funkciju za odjavu. */
export function naPushPoruku(povratni: () => void): () => void {
  if (!imaServiceWorker()) {
    return () => undefined;
  }
  const slusalac = (e: MessageEvent) => {
    if ((e.data as { tip?: unknown } | null)?.tip === 'gfs-obavestenje') {
      povratni();
    }
  };
  navigator.serviceWorker.addEventListener('message', slusalac);
  return () => navigator.serviceWorker.removeEventListener('message', slusalac);
}

/** Samo za specove: zaboravlja keširanu registraciju. */
export function zaboraviRegistracijuZaTest(): void {
  registracija = null;
}

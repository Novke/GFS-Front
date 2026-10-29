/**
 * Manifest aplikacije (spec „Aplikacija i obaveštenja“ 4.1). Bez uvoza: koristi ga i javni nalog studenta. Postavljaju ga
 * samo prijavljeni delovi: ljuska tabova naloga (`NalogTabovi`) studentski, zvono nastavničke ljuske (`ObavestenjaMeni`)
 * nastavnički. `upis`, `uzivo` i `prijava` otvoreni iz linka nemaju manifest, pa browser anonimnom telefonu ne nudi
 * instalaciju. Oba manifesta imaju isti `id`, pa jedan browser ima jednu ikonicu (jedan browser = jedan identitet);
 * studentova ikonica otvara nalog, nastavnikova kontrolnu tablu. Postavlja se iz lenjih chunk-ova, pa početni paket ne raste.
 */

export type VrstaManifesta = 'student' | 'nastavnik';

/** Postavlja `<link rel="manifest" id="gfs-manifest">` (pravi ga ako ga nema). */
export function postaviManifest(dokument: Document, vrsta: VrstaManifesta): void {
  let link = dokument.getElementById('gfs-manifest') as HTMLLinkElement | null;
  const href = `assets/pwa/manifest-${vrsta}.webmanifest`;
  if (!link) {
    link = dokument.createElement('link');
    link.id = 'gfs-manifest';
    link.rel = 'manifest';
    dokument.head.appendChild(link);
  }
  // isti href se ne postavlja ponovo (browser bi ponovo čitao manifest)
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
}

/**
 * Skener QR-a na tabu Čas (spec „Aplikacija i obaveštenja“ 4.5): prihvata **samo** našu adresu čekiranja, isti origin i
 * putanju `nalog/cas/<token>` ispod `<base href>`. Upit i heš se odbacuju; sve ostalo je „Ovo nije QR za čekiranje.“.
 */

/** Token iz QR-a čekiranja (`<predavanjeId>.<22 znaka>` danas; ovde samo bezbedan skup znakova, server proverava ostalo). */
const TOKEN = /^[A-Za-z0-9._~-]{1,200}$/u;

export function tokenIzQr(tekst: string, baseUri: string): string | null {
  let url: URL;
  let osnova: URL;
  try {
    url = new URL(tekst.trim());
    osnova = new URL('./', baseUri);
  } catch {
    return null;
  }
  if (url.origin !== osnova.origin || !url.pathname.startsWith(osnova.pathname)) {
    return null;
  }
  const ostatak = url.pathname.slice(osnova.pathname.length);
  const m = /^nalog\/cas\/([^/]+)$/u.exec(ostatak);
  if (!m) {
    return null;
  }
  let token: string;
  try {
    token = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return TOKEN.test(token) ? token : null;
}

export const PORUKA_NIJE_NAS_QR = 'Ovo nije QR za čekiranje.';

/** Uputstvo kad je kamera odbijena, po telefonu (iPhone: Safari/aplikacija; Android: katanac pored adrese). */
export function uputstvoZaKameru(uredjaj: 'iphone' | 'android' | 'racunar'): string {
  if (uredjaj === 'iphone') {
    return 'iPhone: Settings (Podešavanja) → Apps → Safari → Camera (Kamera) → Allow (Dozvoli), pa se vrati ovde.';
  }
  if (uredjaj === 'android') {
    return 'Android: dodirni katanac ili ⓘ levo od adrese → Dozvole → Kamera → Dozvoli. U aplikaciji: dugo pritisni ikonicu GFS → ⓘ → Dozvole.';
  }
  return 'Dozvoli kameru u podešavanjima sajta (ikonica levo od adrese), pa pokušaj ponovo.';
}

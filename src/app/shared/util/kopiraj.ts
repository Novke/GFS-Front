/**
 * Kopira tekst u clipboard: Clipboard API, a bez njega ili kad ga pregledač odbije (http preko tailneta nije "secure
 * context", npr. `http://novica-dev/gfs/`) skriveno polje + `execCommand('copy')`. Vraća da li je uspelo; pozivalac
 * odlučuje šta dalje (poruka, selekcija teksta).
 */
export async function kopirajTekst(tekst: string, dokument: Document): Promise<boolean> {
  const clipboard = dokument.defaultView?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(tekst);
      return true;
    } catch {
      // pada na rezervni način
    }
  }
  const polje = dokument.createElement('textarea');
  polje.value = tekst;
  polje.setAttribute('readonly', '');
  polje.setAttribute('aria-hidden', 'true');
  polje.style.position = 'fixed';
  polje.style.top = '0';
  polje.style.opacity = '0';
  const aktivan = dokument.activeElement as HTMLElement | null;
  dokument.body.appendChild(polje);
  polje.select();
  try {
    return typeof dokument.execCommand === 'function' ? dokument.execCommand('copy') : false;
  } catch {
    return false;
  } finally {
    polje.remove();
    aktivan?.focus?.();
  }
}

/** Kanonski link za poziv u WhatsApp grupu (server ga tako čuva, `utility/WaLink`); sve drugo se ne prikazuje kao link. */
const WA_LINK = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/u;

/**
 * Link za dugme "WhatsApp grupa" (upis posle prijave, Početna naloga), ili `null`: odbrana i na klijentu, da `href` nikad ne
 * bude proizvoljan URL. Bez uvoza, pa je na javnoj allow-listi.
 */
export function waLinkZaPrikaz(link: unknown): string | null {
  return typeof link === 'string' && WA_LINK.test(link) ? link : null;
}

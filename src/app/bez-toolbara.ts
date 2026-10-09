// Rute bez toolbara: javne (bez basic-auth-a na nginx-u, ne zovu zaključani /api/*) i ekrani za projektor
// (publika i konzola izvođenja). Ostalo ide kroz ljusku sa toolbar-om.
const BEZ_TOOLBARA = /^\/(?:upis|uzivo)(?=[/?#]|$)|^\/izvodjenja\/\d+\/(?:publika|konzola)(?=[/?#]|$)/;

export function bezToolbara(url: string): boolean {
  return BEZ_TOOLBARA.test(url);
}

/** `prefers-reduced-motion: reduce` (spec 4.4); bez `matchMedia` (stari pregledač) puno kretanje. */
export function smanjenoKretanje(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

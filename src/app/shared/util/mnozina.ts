/** Broj sa rečju u pravom obliku: `jedan` za 1, 21, 31…; `dva` za 2-4, 22-24…; `pet` za ostalo (i 11-14). */
function sRecju(n: number, jedan: string, dva: string, pet: string): string {
  const poslednja = n % 10;
  const poslednjeDve = n % 100;
  if (poslednja === 1 && poslednjeDve !== 11) {
    return `${n} ${jedan}`;
  }
  if (poslednja >= 2 && poslednja <= 4 && (poslednjeDve < 12 || poslednjeDve > 14)) {
    return `${n} ${dva}`;
  }
  return `${n} ${pet}`;
}

/** `1 student`, `2 studenta`, `5 studenata`, `21 student`, `12 studenata`. */
export function brojStudenataTekst(n: number): string {
  return sRecju(n, 'student', 'studenta', 'studenata');
}

/** `1 adresa`, `2 adrese`, `5 adresa`, `12 adresa`, `22 adrese`. */
export function brojAdresaTekst(n: number): string {
  return sRecju(n, 'adresa', 'adrese', 'adresa');
}

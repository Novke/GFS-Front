/** `1 student`, `2 studenta`, `5 studenata`, `21 student`, `12 studenata`. */
export function brojStudenataTekst(n: number): string {
  const poslednja = n % 10;
  const poslednjeDve = n % 100;
  if (poslednja === 1 && poslednjeDve !== 11) {
    return `${n} student`;
  }
  if (poslednja >= 2 && poslednja <= 4 && (poslednjeDve < 12 || poslednjeDve > 14)) {
    return `${n} studenta`;
  }
  return `${n} studenata`;
}

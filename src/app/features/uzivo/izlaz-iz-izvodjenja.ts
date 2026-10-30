/**
 * Student je sam napustio izvođenje koje još traje ("Izađi" ili Nazad sa `uzivo/<kod>`). Tab Čas naloga tada ne ulazi sam
 * ponovo u to izvođenje, nego nudi "Uđi u prezentaciju": bez ovoga bi Nazad vodio na `/nalog/cas`, koji odmah ponovo otvara
 * `uzivo/<kod>` (petlja). Pamti se samo kod u `sessionStorage` (samo ova kartica); otvaranje `uzivo/<kod>` ga briše, a
 * drugo izvođenje (drugi kod) se otvara samo kao i pre. Bez uvoza, pa ga smeju i `uzivo/javno` i nalog studenta.
 */
export const IZASAO_IZ_IZVODJENJA = 'gfs-uzivo-izasao';

/** Skladište može da baci (privatni režim, zabranjeno skladište): tada se izlazak ne pamti, Čas ulazi sam kao ranije. */
export function zapamtiIzlazak(kod: string): void {
  try {
    sessionStorage.setItem(IZASAO_IZ_IZVODJENJA, kod);
  } catch {
    // bez skladišta
  }
}

export function izasaoIz(kod: string): boolean {
  try {
    return !!kod && sessionStorage.getItem(IZASAO_IZ_IZVODJENJA) === kod;
  } catch {
    return false;
  }
}

export function zaboraviIzlazak(): void {
  try {
    sessionStorage.removeItem(IZASAO_IZ_IZVODJENJA);
  } catch {
    // bez skladišta
  }
}

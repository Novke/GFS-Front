import { danUNedelji, dodajDane, isoDatum, lokalniDatum } from '../../../shared/util/termin';

/** Jedan dan mesečne mreže kalendara. */
export interface DanMreze {
  iso: string;
  broj: number;
  /** `false` za dane prethodnog i narednog meseca koji popunjavaju prvu i poslednju nedelju. */
  uMesecu: boolean;
  vikend: boolean;
}

/** Koliko boja predmeta ima u temi (`--predmet-1` ...). */
const BROJ_BOJA = 5;

/** `2026-11` -> nedelje (ponedeljak-nedelja) koje pokrivaju mesec; neispravan mesec -> prazno. */
export function mrezaMeseca(mesec: string): DanMreze[][] {
  const prvi = lokalniDatum(`${mesec}-01`);
  if (!prvi) {
    return [];
  }
  const poslednji = isoDatum(new Date(prvi.getFullYear(), prvi.getMonth() + 1, 0));
  const nedelje: DanMreze[][] = [];
  let dan = dodajDane(`${mesec}-01`, 1 - danUNedelji(`${mesec}-01`));
  while (dan <= poslednji) {
    const nedelja: DanMreze[] = [];
    for (let i = 0; i < 7; i++) {
      nedelja.push({ iso: dan, broj: Number(dan.slice(8)), uMesecu: dan.startsWith(mesec), vikend: i > 4 });
      dan = dodajDane(dan, 1);
    }
    nedelje.push(nedelja);
  }
  return nedelje;
}

/** Meseci (`2026-11`) u kojima ima bar jednog datuma, po redu; to su meseci kroz koje strelice kalendara vode. */
export function meseciDatuma(datumi: readonly string[]): string[] {
  return [...new Set(datumi.map(d => d.slice(0, 7)))].sort();
}

/** Predmet -> CSS boja; po abecedi, pa predmet ne menja boju kad se lista termina pomeri. */
export function bojePredmeta(predmeti: readonly string[]): Map<string, string> {
  const redom = [...new Set(predmeti)].sort((a, b) => a.localeCompare(b, 'sr'));
  return new Map(redom.map((p, i) => [p, `var(--predmet-${(i % BROJ_BOJA) + 1})`]));
}

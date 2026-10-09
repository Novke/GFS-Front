import type { GrupaInfo } from './reference.api';
import type { StanjePrisustva } from '../../shared/ui/heatmap';

export type { GrupaInfo } from './reference.api';

/** `CreateGrupaCmd`: naziv do 60 znakova, godina upisa 2000-2100 (obe obavezne). */
export interface CreateGrupaCmd {
  naziv: string;
  godinaUpisa: number;
}

/** `UpdateGrupaCmd` (`PUT grupe/{id}`): pun zamenski zapis, ista pravila kao `CreateGrupaCmd`. */
export type UpdateGrupaCmd = CreateGrupaCmd;

/** `StudentInfo` (red G2, red matrice, odgovor `POST`/`PUT studenti`); `godina` je godina upisa (`int` na serveru). */
export interface StudentInfo {
  id: number;
  ime: string | null;
  prezime: string | null;
  godina: number | null;
  indeks: string | null;
  brojTelefona: string | null;
  email: string | null;
  datumRodjenja: string | null;
  opstina: string | null;
}

/**
 * `CreateStudentCmd` (`POST studenti`): ime i prezime do 60, indeks do 20, godina 2000-2100, telefon do 20,
 * email do 120, opština do 100. Server normalizuje indeks i odbija duplikat (indeks, godina upisa).
 */
export interface CreateStudentCmd {
  grupaId: number;
  ime: string;
  prezime: string;
  godina: number;
  indeks: string;
  brojTelefona: string | null;
  email: string | null;
  datumRodjenja: string | null;
  opstina: string | null;
}

/**
 * `UpdateStudentCmd` (`PUT studenti/{id}`): pun zamenski zapis (izostavljeno opciono polje se briše); `grupaId` je nova
 * grupa, pa isti poziv služi i za premeštanje. Indeks 2-20 znakova, email do 255.
 */
export interface UpdateStudentCmd {
  grupaId: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number;
  email: string | null;
  brojTelefona: string | null;
  datumRodjenja: string | null;
  opstina: string | null;
}

/** Poslednje polaganje studenta (`GrupaStudentStatInfo.TestRef`); `poeni` i `maxPoena` mogu biti `null`. */
export interface TestRef {
  testId: number;
  tip: string | null;
  datum: string | null;
  poeni: number | null;
  maxPoena: number | null;
}

/** Red G2 (`GrupaStudentStatInfo`): `prisutan <= predavanja` (i za ponovce i premeštene). */
export interface GrupaStudentStat {
  student: StudentInfo;
  prisutan: number;
  predavanja: number;
  domaciUradjeno: number;
  domaciUkupno: number;
  poslednjiTest: TestRef | null;
}

/** Sesija upisa kako je vraća server (`OnboardingSesijaInfo`); deo koji treba grupi. */
export interface OtvorenaSesija {
  id: number;
  token: string;
  istice: string;
  brojPrijava: number;
  brojNaCekanju: number;
  maxPrijava: number;
}

/**
 * `GET grupe/{id}/pregled` (`GrupaPregledInfo`, G1 + G2). `prosecnaPrisutnost` je 0-1, `null` kad nema predavanja;
 * `otvorenOnboarding` je najnovija otvorena sesija ili `null`.
 */
export interface GrupaPregledInfo {
  grupa: GrupaInfo;
  brojStudenata: number;
  brojPredavanja: number;
  prosecnaPrisutnost: number | null;
  otvorenOnboarding: OtvorenaSesija | null;
  studenti: GrupaStudentStat[];
}

export type TipAktivnostiMatrice = 'PRISUSTVO' | 'ZADATAK' | 'SA_ZVEZDICOM';

/** Kolona G3 (`PrisustvoMatricaInfo.PredavanjeRef`). */
export interface PredavanjeRef {
  id: number;
  rb: number;
  datum: string | null;
  tema: string | null;
}

/** Red G3: `tip` je predavanjeId -> tip aktivnosti; nema ključa = odsutan. */
export interface RedMatrice {
  student: StudentInfo;
  tip: Record<string, TipAktivnostiMatrice | string>;
}

/** `GET grupe/{id}/prisustvo?predmetId&godina` (`PrisustvoMatricaInfo`). */
export interface PrisustvoMatricaInfo {
  predavanja: PredavanjeRef[];
  studenti: RedMatrice[];
}

// ---------------------------------------------------------------------------------------------- pravila prikaza

/** `Petrović Ana`; bez imena i prezimena `—`. */
export function imeStudenta(s: Pick<StudentInfo, 'ime' | 'prezime'> | null | undefined): string {
  const t = [s?.prezime?.trim(), s?.ime?.trim()].filter(Boolean).join(' ');
  return t || '—';
}

/**
 * Adrese za "Kopiraj emailove" (G6): skinute sa razmaka, bez praznih i bez duplikata (bez obzira na velika slova),
 * redosledom studenata.
 */
export function emailoviZaKopiranje(studenti: readonly Pick<StudentInfo, 'email'>[]): string[] {
  const vidjeno = new Set<string>();
  const adrese: string[] = [];
  for (const s of studenti) {
    const e = s?.email?.trim();
    if (!e || vidjeno.has(e.toLowerCase())) {
      continue;
    }
    vidjeno.add(e.toLowerCase());
    adrese.push(e);
  }
  return adrese;
}

/** Separator adresa za klijente pošte (Outlook prihvata `;`, ostali i `;` i `,`). */
export const SEPARATOR_EMAILOVA = '; ';

/** Grupe u koje se student može premestiti: sve osim trenutne, po nazivu. */
export function grupeZaPremestanje(grupe: readonly GrupaInfo[], trenutnaId: number | null): GrupaInfo[] {
  return grupe.filter(g => g.id !== trenutnaId).sort((a, b) => a.naziv.localeCompare(b.naziv, 'sr'));
}

/**
 * Ćelija G3 u stanje heatmape. ZADATAK i SA_ZVEZDICOM su prisustvo sa aktivnošću, pa ih "Ukupno" broji kao prisutne
 * (Heatmap broji svako stanje > 0). Nepoznat tip iz budućeg backenda je prisustvo (red postoji = student je bio).
 */
export function stanjeCelije(tip: string | null | undefined): StanjePrisustva {
  switch (tip) {
    case undefined:
    case null:
    case '':
      return 0;
    case 'ZADATAK':
      return 2;
    case 'SA_ZVEZDICOM':
      return 3;
    default:
      return 1;
  }
}

/** Procenat 0-100 zaokružen, `null` kad nema imenioca. */
export function procenat(deo: number | null | undefined, celina: number | null | undefined): number | null {
  if (typeof deo !== 'number' || typeof celina !== 'number' || !Number.isFinite(deo) || !Number.isFinite(celina) || celina <= 0) {
    return null;
  }
  return Math.round((deo / celina) * 100);
}

/**
 * Fajlovi uz prezentaciju (spec 2026-11-20 „Fajlovi uz prezentaciju”, odeljak 5): tipovi odgovora backend-a i čiste
 * pomoćne funkcije. Bez ijednog uvoza (ni HTTP-a ni store-a), pa je na javnoj allow-listi (`/f`, nalog, telefon uživo).
 */

/** Vrsta po ekstenziji; server prima samo ove. */
export type VrstaFajla = 'DOCX' | 'XLSX' | 'PPTX' | 'PDF' | 'ZIP';

/** Fajl u spisku (nalog, stanje izvođenja, pregled prezentacije). */
export interface FajlKratko {
  id: number;
  naziv: string;
  vrsta: VrstaFajla;
  velicina: number;
}

/** Fajl na stranici `/f/<kod>` (bez prijave), sa imenom prezentacije. */
export interface FajlCasa extends FajlKratko {
  prezentacija: string;
}

/** `GET api/public/fajlovi/<kod>`. */
export interface FajloviCasa {
  kod: string;
  predmet: string;
  tema: string | null;
  datum: string | null;
  fajlovi: FajlCasa[];
}

/** `GET api/public/nalog/predmeti/<id>/fajlovi`: fajlovi po prezentaciji koju je grupa studenta završila. */
export interface FajloviPrezentacije {
  prezentacijaId: number;
  naziv: string;
  odrzana: string | null;
  fajlovi: FajlKratko[];
}

/** `NastavnickoStanje.fajlovi`: link za projektor, konzolu i daljinski (`null` kad slajd nema fajl ili kod ne važi). */
export interface FajloviSlajda {
  kod: string;
  /** Bez šeme, npr. `gfs.trif.rs/f/1234` (host iz `gfs.front.url`). */
  link: string;
  fajlovi: FajlKratko[];
}

/** Nastavnik: fajl prezentacije u editoru. */
export interface FajlPrezentacijeInfo extends FajlKratko {
  prezentacijaId: number;
  /** Slajd na kome se fajl pojavljuje; `null` = uz celu prezentaciju. */
  slajdId: number | null;
  slajdRb: number | null;
  rb: number;
  kreirano: string;
}

/** `PUT api/fajlovi-prezentacije/<id>`. */
export interface FajlPrezentacijeCmd {
  naziv: string;
  slajdId: number | null;
}

/** `POST api/public/nalog/fajlovi/<id>/mejl` (202). */
export interface MejlFajlaOdgovor {
  poslatoNa: string;
}

/** Ekstenzije koje server prima (za `accept` na izboru fajla). */
export const PRIHVACENI_FAJLOVI = '.docx,.xlsx,.pptx,.pdf,.zip';

/** Najveći fajl (10 MB, ista granica kao na serveru). */
export const MAX_FAJL_BAJTOVA = 10 * 1024 * 1024;

/** Kod sa table: tačno 4 cifre. */
export function ispravanKod(kod: unknown): kod is string {
  return typeof kod === 'string' && /^[0-9]{4}$/.test(kod);
}

/** Veličina za ljude: `850 B`, `12 KB`, `1,4 MB` (srpski decimalni zarez). */
export function velicinaFajla(bajtova: number): string {
  if (!Number.isFinite(bajtova) || bajtova < 0) return '';
  if (bajtova < 1024) return `${bajtova} B`;
  if (bajtova < 1024 * 1024) return `${Math.round(bajtova / 1024)} KB`;
  return `${(bajtova / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Kratka oznaka vrste za dugme ili ikonicu. */
export function oznakaVrste(vrsta: VrstaFajla): string {
  switch (vrsta) {
    case 'DOCX': return 'Word';
    case 'XLSX': return 'Excel';
    case 'PPTX': return 'PowerPoint';
    case 'PDF': return 'PDF';
    case 'ZIP': return 'ZIP';
  }
}

/** Preuzimanje sa časa bez prijave (relativno, kao `API_URL`; radi pod svakim base href-om). */
export function urlFajlaCasa(kod: string, fajlId: number): string {
  return `api/public/fajlovi/${encodeURIComponent(kod)}/${fajlId}`;
}

/** Preuzimanje iz naloga studenta (kolačić `gfs_student`). */
export function urlFajlaNaloga(fajlId: number): string {
  return `api/public/nalog/fajlovi/${fajlId}`;
}

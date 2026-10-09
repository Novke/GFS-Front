import {
  MedijInfo, OpcijaCmd, OpcijaDetails, PitanjeCmd, PitanjeDetails, SlajdCmd, SlajdDetails, TipPitanja, TipSlajda,
} from './uzivo.models';
import type { NazivIkone } from '../../../core/layout/icons';

/**
 * Pravila editora slajdova: podrazumevane vrednosti, prevođenje SlajdDetails <-> SlajdCmd i klijentska validacija.
 * Poruke su doslovno iste kao u backendu (`validation/SlajdPP`), da nastavnik vidi isti tekst pre i posle slanja.
 * Backend vraća samo prvu prekršenu poruku; ovde se vraćaju sve, istim redom.
 */

export const TACNO = 'Tačno';
export const NETACNO = 'Netačno';
export const MIN_OPCIJA = 2;
export const MAX_OPCIJA = 6;
export const MAX_SLAJDOVA = 200;
export const MIN_VREME = 5;
export const MAX_VREME = 600;
/** Podrazumevano vreme kad nastavnik uključi ograničenje. */
export const PODRAZUMEVANO_VREME = 20;

const MAX_NASLOV = 300;
const MAX_SADRZAJ = 20_000;
const MAX_BELESKE = 5_000;
const MAX_TEKST_PITANJA = 2_000;
const MAX_TEKST_OPCIJE = 300;
const MAX_JEDINICA = 30;
const MAX_PRIHVATLJIVIH = 20;
const MAX_PRIHVATLJIV = 100;
const MAX_OZNAKA_SKALE = 60;
const MAX_NAZIV = 200;
const MAX_OPIS = 1_000;

export const PORUKE = {
  tipSlajda: 'Tip slajda je obavezan.',
  naslov: 'Naslov može imati najviše 300 znakova.',
  sadrzaj: 'Tekst slajda može imati najviše 20000 znakova.',
  beleske: 'Beleške mogu imati najviše 5000 znakova.',
  infoPrazan: 'Info slajd mora imati naslov, tekst ili sliku.',
  bezPitanja: 'Slajd sa pitanjem mora imati pitanje.',
  tipPitanja: 'Tip pitanja je obavezan.',
  tekstPitanja: 'Tekst pitanja je obavezan (najviše 2000 znakova).',
  vreme: 'Vreme za odgovor mora biti od 5 do 600 sekundi.',
  brojOpcija: 'Pitanje mora imati od 2 do 6 ponuđenih odgovora.',
  tekstOpcije: 'Ponuđeni odgovor mora imati od 1 do 300 znakova.',
  jedanTacan: 'Pitanje sa jednim tačnim odgovorom mora imati tačno jedan tačan odgovor.',
  viseTacnih: 'Označi bar jedan tačan odgovor.',
  tacnoNetacno: 'Tačno/netačno pitanje ima tačno dva odgovora, od kojih je jedan tačan.',
  prihvatljivi: 'Najviše 20 prihvatljivih odgovora, svaki do 100 znakova.',
  broj: 'Broj nije ispravan.',
  odstupanje: 'Odstupanje ne može biti negativno.',
  jedinica: 'Jedinica može imati najviše 30 znakova.',
  oznakaSkale: 'Oznaka skale može imati najviše 60 znakova.',
  brojSlajdova: 'Prezentacija može imati najviše 200 slajdova.',
  naziv: 'Naziv je obavezan (najviše 200 znakova).',
  opis: 'Opis može imati najviše 1000 znakova.',
} as const;

export interface TipPitanjaOpis { readonly tip: TipPitanja; readonly naziv: string; readonly ikona: NazivIkone; }

/** Redosled i srpski nazivi za meni "+ Pitanje" i izbor tipa. */
export const TIPOVI_PITANJA: readonly TipPitanjaOpis[] = Object.freeze([
  { tip: 'JEDAN_TACAN', naziv: 'Jedan tačan', ikona: 'radio_button_checked' },
  { tip: 'VISE_TACNIH', naziv: 'Više tačnih', ikona: 'check_box' },
  { tip: 'ANKETA', naziv: 'Anketa', ikona: 'bar_chart' },
  { tip: 'TACNO_NETACNO', naziv: 'Tačno/netačno', ikona: 'rule' },
  { tip: 'KRATAK_TEKST', naziv: 'Kratak tekst', ikona: 'short_text' },
  { tip: 'BROJ', naziv: 'Broj', ikona: 'pin' },
  { tip: 'SKALA', naziv: 'Skala 1-5', ikona: 'linear_scale' },
] as const);

export function opisTipa(tip: TipPitanja): TipPitanjaOpis {
  return TIPOVI_PITANJA.find(t => t.tip === tip) ?? TIPOVI_PITANJA[0];
}

/** Tipovi pitanja sa ponuđenim odgovorima. */
export function imaOpcije(tip: TipPitanja): boolean {
  return tip === 'JEDAN_TACAN' || tip === 'VISE_TACNIH' || tip === 'ANKETA' || tip === 'TACNO_NETACNO';
}

/** Dužina u znakovima kao u MySQL koloni (code point), isto kao `SlajdPP.duzina`. */
export function duzina(s: string | null | undefined): number {
  return s ? [...s].length : 0;
}

function ociscen(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function prazan(s: string | null | undefined): boolean {
  return ociscen(s) === '';
}

function nijeKonacan(n: number | null | undefined): boolean {
  return n !== null && n !== undefined && !Number.isFinite(n);
}

/** Greške pitanja, istim redom i tekstom kao `SlajdPP.proveri(PitanjeCmd)`; prazan niz = ispravno. */
export function greskePitanja(p: PitanjeCmd): string[] {
  if (!p.tip) {
    return [PORUKE.tipPitanja];
  }
  const greske: string[] = [];
  const tekst = ociscen(p.tekst);
  if (!tekst || duzina(tekst) > MAX_TEKST_PITANJA) {
    greske.push(PORUKE.tekstPitanja);
  }
  const v = p.vremeSekunde;
  if (v !== null && v !== undefined && (!Number.isInteger(v) || v < MIN_VREME || v > MAX_VREME)) {
    greske.push(PORUKE.vreme);
  }
  const opcije = p.opcije ?? [];
  const tacnih = opcije.filter(o => o?.tacna).length;
  switch (p.tip) {
    case 'JEDAN_TACAN':
    case 'VISE_TACNIH':
    case 'ANKETA':
      if (opcije.length < MIN_OPCIJA || opcije.length > MAX_OPCIJA) {
        greske.push(PORUKE.brojOpcija);
      }
      if (opcije.some(o => !o || prazan(o.tekst) || duzina(ociscen(o.tekst)) > MAX_TEKST_OPCIJE)) {
        greske.push(PORUKE.tekstOpcije);
      }
      if (p.tip === 'JEDAN_TACAN' && tacnih !== 1) {
        greske.push(PORUKE.jedanTacan);
      }
      if (p.tip === 'VISE_TACNIH' && tacnih < 1) {
        greske.push(PORUKE.viseTacnih);
      }
      break;
    case 'TACNO_NETACNO':
      if (opcije.length !== 2 || tacnih !== 1) {
        greske.push(PORUKE.tacnoNetacno);
      }
      break;
    case 'KRATAK_TEKST': {
      const lista = (p.prihvatljiviOdgovori ?? []).map(ociscen).filter(s => s !== '');
      if (lista.length > MAX_PRIHVATLJIVIH || lista.some(s => duzina(s) > MAX_PRIHVATLJIV)) {
        greske.push(PORUKE.prihvatljivi);
      }
      break;
    }
    case 'BROJ':
      if (nijeKonacan(p.brojTacno) || nijeKonacan(p.brojOdstupanje)) {
        greske.push(PORUKE.broj);
      } else if (p.brojOdstupanje !== null && p.brojOdstupanje !== undefined && p.brojOdstupanje < 0) {
        greske.push(PORUKE.odstupanje);
      }
      if (duzina(ociscen(p.jedinica)) > MAX_JEDINICA) {
        greske.push(PORUKE.jedinica);
      }
      break;
    case 'SKALA':
      if (duzina(ociscen(p.skalaMinOznaka)) > MAX_OZNAKA_SKALE || duzina(ociscen(p.skalaMaxOznaka)) > MAX_OZNAKA_SKALE) {
        greske.push(PORUKE.oznakaSkale);
      }
      break;
  }
  return greske;
}

/** Greške celog slajda, istim redom kao `SlajdPP.proveri(SlajdCmd)`. */
export function greskeSlajda(cmd: SlajdCmd): string[] {
  if (!cmd?.tip) {
    return [PORUKE.tipSlajda];
  }
  const greske: string[] = [];
  if (duzina(ociscen(cmd.naslov)) > MAX_NASLOV) greske.push(PORUKE.naslov);
  if (duzina(ociscen(cmd.sadrzaj)) > MAX_SADRZAJ) greske.push(PORUKE.sadrzaj);
  if (duzina(ociscen(cmd.beleske)) > MAX_BELESKE) greske.push(PORUKE.beleske);
  if (cmd.tip === 'INFO') {
    if (prazan(cmd.naslov) && prazan(cmd.sadrzaj) && prazan(cmd.slikaId)) {
      greske.push(PORUKE.infoPrazan);
    }
    return greske;
  }
  if (!cmd.pitanje) {
    return [...greske, PORUKE.bezPitanja];
  }
  return [...greske, ...greskePitanja(cmd.pitanje)];
}

/** Greške naziva i opisa prezentacije (isto kao `PrezentacijaService`). */
export function greskePrezentacije(naziv: string | null | undefined, opis: string | null | undefined): string[] {
  const greske: string[] = [];
  const n = ociscen(naziv);
  if (!n || duzina(n) > MAX_NAZIV) greske.push(PORUKE.naziv);
  if (duzina(ociscen(opis)) > MAX_OPIS) greske.push(PORUKE.opis);
  return greske;
}

// ---------------------------------------------------------------- podrazumevane vrednosti

function praznaOpcija(): OpcijaCmd {
  return { tekst: '', tacna: false };
}

function opcijeTacnoNetacno(tacnoJeTacno = true): OpcijaCmd[] {
  return [{ tekst: TACNO, tacna: tacnoJeTacno }, { tekst: NETACNO, tacna: !tacnoJeTacno }];
}

/** Novo pitanje datog tipa: dve prazne opcije za izbor, Tačno/Netačno (Tačno je tačno) za TN, ostalo bez opcija. */
export function novoPitanje(tip: TipPitanja, tekst = ''): PitanjeCmd {
  return {
    tip, tekst, slikaId: null, vremeSekunde: null,
    opcije: tip === 'TACNO_NETACNO' ? opcijeTacnoNetacno() : imaOpcije(tip) ? [praznaOpcija(), praznaOpcija()] : [],
    brojTacno: null,
    brojOdstupanje: tip === 'BROJ' ? 0 : null,
    odstupanjeTip: tip === 'BROJ' ? 'APSOLUTNO' : null,
    jedinica: null,
    tekstPrikaz: tip === 'KRATAK_TEKST' ? 'OBLAK' : null,
    prihvatljiviOdgovori: [],
    skalaMinOznaka: null,
    skalaMaxOznaka: null,
  };
}

/** Komanda za nov slajd (`dodaj`): INFO je prazan, PITANJE ima podrazumevano pitanje izabranog tipa. */
export function noviSlajd(tip: TipSlajda, tipPitanja: TipPitanja = 'JEDAN_TACAN'): SlajdCmd {
  return {
    tip, naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false,
    pitanje: tip === 'PITANJE' ? novoPitanje(tipPitanja) : null,
  };
}

/**
 * Promena tipa pitanja: tekst, slika, vreme i beleške ostaju. Između izbora (jedan/više/anketa) opcije ostaju (jedan
 * tačan zadržava samo prvu tačnu); u TN i iz TN-a opcije počinju iznova; tipovi bez opcija ih nemaju.
 */
export function promeniTipPitanja(p: PitanjeCmd, tip: TipPitanja): PitanjeCmd {
  if (p.tip === tip) {
    return p;
  }
  const osnova = novoPitanje(tip, p.tekst);
  const izbor = (t: TipPitanja) => t === 'JEDAN_TACAN' || t === 'VISE_TACNIH' || t === 'ANKETA';
  let opcije = osnova.opcije;
  if (izbor(tip) && izbor(p.tip) && p.opcije.length) {
    let prvaTacna = false;
    opcije = p.opcije.map(o => {
      const tacna = tip === 'ANKETA' ? false : tip === 'JEDAN_TACAN' ? o.tacna && !prvaTacna : o.tacna;
      prvaTacna ||= tacna;
      return { tekst: o.tekst, tacna };
    });
  }
  return { ...osnova, slikaId: p.slikaId, vremeSekunde: p.vremeSekunde, opcije };
}

// ---------------------------------------------------------------- prevođenje

export function pitanjeUCmd(p: PitanjeDetails): PitanjeCmd {
  return {
    tip: p.tip, tekst: p.tekst ?? '', slikaId: p.slika?.id ?? null, vremeSekunde: p.vremeSekunde,
    opcije: [...p.opcije].sort((a, b) => a.rb - b.rb).map(o => ({ tekst: o.tekst, tacna: o.tacna })),
    brojTacno: p.brojTacno, brojOdstupanje: p.brojOdstupanje, odstupanjeTip: p.odstupanjeTip, jedinica: p.jedinica,
    tekstPrikaz: p.tekstPrikaz, prihvatljiviOdgovori: [...(p.prihvatljiviOdgovori ?? [])],
    skalaMinOznaka: p.skalaMinOznaka, skalaMaxOznaka: p.skalaMaxOznaka,
  };
}

export function slajdUCmd(s: SlajdDetails): SlajdCmd {
  return {
    tip: s.tip, naslov: s.naslov, sadrzaj: s.sadrzaj, slikaId: s.slika?.id ?? null, beleske: s.beleske,
    postepeno: s.postepeno, pitanje: s.pitanje ? pitanjeUCmd(s.pitanje) : null,
  };
}

function slika(id: string | null, postojeca: MedijInfo | null | undefined): MedijInfo | null {
  if (!id) return null;
  return postojeca?.id === id ? postojeca : { id, naziv: 'Slika', mime: '', velicina: 0 };
}

/**
 * Lokalni (optimistični) prikaz komande dok server ne odgovori: id-jevi opcija su privremeni (negativni ako ih nema),
 * jer server ionako menja id-jeve opcija pri svakom čuvanju.
 */
export function slajdIzCmd(cmd: SlajdCmd, osnova: { id: number; rb: number } & Partial<SlajdDetails>): SlajdDetails {
  const p = cmd.pitanje;
  const staro = osnova.pitanje ?? null;
  const opcije: OpcijaDetails[] = (p?.opcije ?? []).map((o, i) => ({
    id: staro?.opcije[i]?.id ?? -(i + 1), rb: i + 1, tekst: o.tekst, tacna: o.tacna,
  }));
  return {
    id: osnova.id, rb: osnova.rb, tip: cmd.tip, naslov: cmd.naslov, sadrzaj: cmd.sadrzaj,
    slika: slika(cmd.slikaId, osnova.slika), beleske: cmd.beleske, postepeno: cmd.postepeno,
    pitanje: cmd.tip === 'PITANJE' && p ? {
      id: staro?.id ?? 0, tip: p.tip, tekst: p.tekst, slika: slika(p.slikaId, staro?.slika), vremeSekunde: p.vremeSekunde,
      opcije, brojTacno: p.brojTacno, brojOdstupanje: p.brojOdstupanje, odstupanjeTip: p.odstupanjeTip,
      jedinica: p.jedinica, tekstPrikaz: p.tekstPrikaz, prihvatljiviOdgovori: p.prihvatljiviOdgovori,
      skalaMinOznaka: p.skalaMinOznaka, skalaMaxOznaka: p.skalaMaxOznaka,
    } : null,
  };
}

/** Kratka oznaka slajda za listu: naslov ili početak teksta (bez Markdown znakova). */
export function oznakaSlajda(s: SlajdDetails, max = 60): string {
  const izvor = s.tip === 'PITANJE' ? s.pitanje?.tekst : s.naslov || s.sadrzaj;
  const tekst = (izvor ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')            // slike
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')         // veze -> tekst
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '') // naslovi, citati, stavke liste
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!tekst) {
    return s.tip === 'PITANJE' ? 'Novo pitanje' : s.slika ? 'Slika' : 'Nov slajd';
  }
  return duzina(tekst) > max ? [...tekst].slice(0, max - 1).join('') + '…' : tekst;
}

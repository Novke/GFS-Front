// GFS-Front: src/app/features/uzivo/data-access/platno.models.ts (Java: dto/uzivo/platno/*, records sa istim imenima polja)
export type Poravnanje = 'LEVO' | 'CENTAR' | 'DESNO' | 'OBOSTRANO';
export type Sidro = 'VRH' | 'SREDINA' | 'DNO';
export type Crtica = 'PUNA' | 'ISPREKIDANA' | 'TACKASTA';
export type Polozaj = 'OBICAN' | 'INDEKS' | 'EKSPONENT';
export type FormatBroja = 'ARAPSKI_TACKA' | 'ARAPSKI_ZAGRADA' | 'ARAPSKI' | 'MALA_SLOVA_ZAGRADA' | 'VELIKA_SLOVA_TACKA' | 'RIMSKI_VELIKI_TACKA' | 'RIMSKI_MALI_TACKA';
export type VrstaOblika = 'PRAVOUGAONIK' | 'ZAOBLJENI_PRAVOUGAONIK' | 'ELIPSA' | 'TROUGAO' | 'LINIJA' | 'STRELICA' | 'DVOSTRUKA_STRELICA';
export type TipSloja = 'TEKST' | 'SLIKA' | 'OBLIK' | 'TABELA' | 'FORMULA' | 'CRTEZ';
export type VrstaAnimacije = 'ULAZ' | 'IZLAZ';
export type Efekat = 'POJAVI' | 'FADE' | 'ULET' | 'PODELI' | 'BRISANJE' | 'ZUM' | 'ISCRTAJ';
export type Smer = 'LEVO' | 'DESNO' | 'GORE' | 'DOLE' | 'HORIZONTALNO' | 'VERTIKALNO';
export type Okidac = 'KLIK' | 'SA_PRETHODNIM' | 'POSLE_PRETHODNOG';
export type Tema = 'NACRT' | 'BELA' | 'PAPIR' | 'TAMNA' | 'PONOC';

export interface Tacka { x: number; y: number; }
export interface Ivica { boja: string; debljina: number; crtica: Crtica; }
export interface Senka { boja: string; pomerajX: number; pomerajY: number; zamucenje: number; }
export interface Lista { vrsta: 'ZNAK' | 'BROJ'; znak: string | null; boja: string | null; format: FormatBroja | null; pocetak: number | null; }
export interface Tabulator { poz: number; poravnanje: 'LEVO' | 'CENTAR' | 'DESNO' | 'DECIMALNO'; }
export interface Deo {
  tekst: string; font: string; velicina: number; boja: string;
  podebljano: boolean; kurziv: boolean; podvuceno: boolean; precrtano: boolean; polozaj: Polozaj;
}
export interface Pasus {
  poravnanje: Poravnanje; nivo: number; lista: Lista | null; uvlacenje: { levo: number; prviRed: number };
  razmakPre: number; razmakPosle: number; proredProcenat: number; tabulatori: Tabulator[]; delovi: Deo[];
}
export interface Okvir {
  unutraLevo: number; unutraGore: number; unutraDesno: number; unutraDole: number;
  sidro: Sidro; prelom: boolean; skala: number; skalaProreda: number;
}
interface SlojOsnova {
  id: string; naziv: string | null; x: number; y: number; sirina: number; visina: number;
  rotacija: number; providnost: number; zakljucan: boolean; senka: Senka | null;
}
export interface TekstSloj extends SlojOsnova { tip: 'TEKST'; pasusi: Pasus[]; okvir: Okvir; popuna: string | null; ivica: Ivica | null; }
export interface SlikaSloj extends SlojOsnova { tip: 'SLIKA'; medijId: string; isecak: { levo: number; gore: number; desno: number; dole: number }; }
export interface OblikSloj extends SlojOsnova {
  tip: 'OBLIK'; oblik: VrstaOblika; popuna: string | null; ivica: Ivica | null; od: Tacka | null; do: Tacka | null;
}
export interface IviceCelije { gore: Ivica | null; dole: Ivica | null; levo: Ivica | null; desno: Ivica | null; }
export interface Celija {
  pasusi: Pasus[]; popuna: string | null; ivice: IviceCelije; spojDesno: number; spojDole: number; pokrivena: boolean; sidro: Sidro;
}
export interface TabelaSloj extends SlojOsnova { tip: 'TABELA'; kolone: number[]; redovi: number[]; celije: Celija[][]; }
export interface FormulaSloj extends SlojOsnova {
  tip: 'FORMULA'; latex: string; boja: string; velicina: number; poravnanje: Poravnanje; slikaIzvora: string | null;
}
export interface Potez { boja: string; debljina: number; tacke: number[]; }
export interface CrtezSloj extends SlojOsnova { tip: 'CRTEZ'; medijId: string; potezi: Potez[] | null; }
export type Sloj = TekstSloj | SlikaSloj | OblikSloj | TabelaSloj | FormulaSloj | CrtezSloj;
export interface Animacija {
  id: string; slojId: string; pasus: number | null; vrsta: VrstaAnimacije; efekat: Efekat; smer: Smer | null;
  okidac: Okidac; trajanjeMs: number; kasnjenjeMs: number;
}
export interface Platno { verzija: 1; pozadina: { boja: string; medijId: string | null }; slojevi: Sloj[]; animacije: Animacija[]; }

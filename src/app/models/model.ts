import { NumberSymbol } from "@angular/common";

export interface StartPredavanjeCmd {
    predmetId: number;
    grupaId: number;
  }
  
  export interface PredavanjeDetails {
    id: number;
    rb:number;
    datum: Date;
    tema: string;
    posecenost: number;
    predmet: PredmetInfo;
    grupa: GrupaInfo;
    aktivnosti: AktivnostInfo[];
    zavrseno: boolean;
  }
  
  export interface IdCmd {
    id: number;
  }
  
  export interface PredmetInfo {
    id: number;
    naziv: string;
  }
  
  export interface GrupaInfo {
    id: number;
    naziv: string;
    godinaUpisa: number;
    brojStudenata?: number | null;
  }

  export interface GrupaDetails {
    id: number;
    naziv: string;
    godinaUpisa: number;
    studenti: StudentDetails[];
  }
  
  export interface AktivnostInfo {
    id: number;
    student: StudentInfo;
    tip: string;
    napomene: string;
  }
  
  export interface StudentInfo {
    id: number;
    ime: string;
    prezime: string;
    indeks: string;
    godina?: number;
    email?: string | null;
    brojTelefona?: string | null;
  }
  
  export interface StudentDetails {
    id: number;
    ime: string;
    prezime: string;
    indeks: string;
    godina?: number;
    email?: string | null;
    brojTelefona?: string | null;
    aktivnosti: AktivnostInfo[];
  }

  export interface UpdatePredavanjeCmd {
    rb:number,
    datum:Date,
    tema:string,
    posecenost:number
  }

  export interface UpdateAktivnostNapomenaCmd {
    napomene: string
  }

  export const tipAktivnosti = {
    PRISUSTVO : "PRISUSTVO",
    ZADATAK : "ZADATAK",
    SA_ZVEZDICOM : "SA_ZVEZDICOM"
  }

export interface PredavanjeInfo {
    id: number,
    rb: number,
    datum: Date,
    tema: String,
    zavrseno: boolean
}

export interface DomaciId {
    id: number
}

export interface DodajDomaciCmd {
    predavanjeId: number | undefined,
    grupaId: number,
    predmetId: number
}

export interface DomaciGrupaInfo {
  id: number;
  naziv: string;
  godinaUpisa: number;
}

export interface DomaciStudentiInfo {
  studentId: number;  
  domaciId: number;        
  ime: string;             
  prezime: string;        
  indeks: string;         
  godina: number;          
  tip: string;      
  predavanjaNapomene: string;
  uradjenDomaciId: number | null;
  bodovi: number;
  uradjenDomaciNapomene: string;   
  prepisivanje: boolean;
  oslobodjen: boolean;
}

export interface DomaciDetails {

  id: number,
  predmet: PredmetInfo,
  naslov: string,
  text: string,
  datum: Date,
  pregledan: Boolean
  grupa: DomaciGrupaInfo,
  predavanje: PredavanjeInfo,
  studenti: DomaciStudentiInfo[]

}

export interface CreateUradjenDomaciCmd {

  studentId: number,
  domaciId: number,
  bodovi: number,
  napomene: string,
  prepisivanje: boolean
  
}

export interface UpdateDomaciCmd {
  text: string,
  datum: Date,
  naslov: string
}

export interface DomaciInfo {
  id: number,
  naslov: string,
  text: string,
  datum: Date,
  pregledan: boolean
}

export interface CreateTestCmd {
  tipTestaId: number | null,
  novTipTesta: string | null,
  predmetId: number,
  grupaId: number,
  datum: Date,
  brojGrupa: number,
  maxPoena: number
}

export interface UpdateTestCmd {
  datum: Date,
  maxPoena: number,
  tipTestaId: number
}

export interface TipTestaInfo {
  id: number,
  naziv: string
}

export interface TestInfo {
  id: number,
  tipTesta: TipTestaInfo,
  predmet: PredmetInfo,
  grupa: GrupaInfo,
  datum: Date,
  maxPoena: number,
  grupe: TestGrupa[],
  pregledan: boolean,
  posecenost: number
}

export enum TestGrupa {
  A,B,D,C
}

export interface TestDetails {
  id: number,
  tipTesta: TipTestaInfo,
  predmet: PredmetInfo,
  grupa: GrupaInfo,
  datum: Date,
  maxPoena: number,
  pregledan: Boolean,
  grupe: TestGrupa[],
  polaganja: TestPolaganjeInfo[],
  statistika: TestStatistikaInfo
}

export interface TestStatistikaInfo {
  ukupnoPolaganja: number;
  prosecniPoeni: number;
  minPoeni: number;
  maxPoeni: number;
  standardnaDevijacija: number;
  brojPolozenih: number;
  brojPalih: number;
  procenatProlaznosti: number;
  statistikaPoGrupi: TestStatistikaPoGrupiInfo[];
}

export interface TestStatistikaPoGrupiInfo {
  grupa: TestGrupa;
  brojPolaganja: number;
  prosecniPoeni: number;
  procenatProlaznosti: number;
}

export interface TestPolaganjeInfo {
  id: number,
  student: StudentInfo,
  grupa: TestGrupa,
  ostvareniPoeni: number | null,
  prepisivao: Boolean,
  polozio: Boolean,
  napomene: string
}

export interface EvidentirajPolaganjeCmd {
  studentId: number,
  grupa: TestGrupa,
  ostvareniPoeni: number | null,
  prepisivao: Boolean,
  napomene: string
}
  
export interface StudentPregledDetails {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
  grupa: string;
  aktivnosti: StudentPregledAktivnostInfo[];
  uradjeniDomaci: StudentPregledDomaciInfo[];
  polaganja: StudentPregledTestInfo[];
}
  
export interface StudentPregledAktivnostInfo {
  id: number;
  predavanjeId: number,
  tip: string;
  napomene: string;
  datum: Date;
  tema: string;
}

export interface StudentPregledDomaciInfo {
  id: number,
  domaciId: number,
  bodovi: number,
  napomene: string,
  prepisivanje: boolean,
  oslobodjen: boolean,
  datum: Date;
  naslov: string;
}

export interface StudentPregledTestInfo {
  id: number,
  testId: number,
  ostvareniPoeni: number,
  polozio: boolean,
  prepisivao: boolean,
  napomene: string,
  datum: Date;
  tipTesta: TipTestaInfo
}

export interface StudentNaPredmetuDetails {
  student: StudentInfo;
  predmet: PredmetInfo;
  grupaNaziv: string;
  aktivnosti: StudentPregledAktivnostInfo[];
  domaci: StudentPregledDomaciInfo[];
  testoviPoTipu: StudentTestoviPoTipuInfo[];
  ukupnoPoenaAktivnost: number;
  ukupnoPoenaDomaci: number;
}

export interface StudentTestoviPoTipuInfo {
  tipTesta: TipTestaInfo;
  polaganja: StudentPregledTestInfo[];
  najboljePolaganje: StudentPregledTestInfo | null;
}

// ========== OCENJIVANJE ==========

export interface KoeficijentiInfo {
  id: number;
  predmetId: number;
  koefPrisustvo: number;
  koefZadatak: number;
  koefZvezdica: number;
  domaciFlat: number;
  domaciVarijansa: number;
  koristiMaxRezultat: boolean;
  prikaziZbirno: boolean;
  maxAktivnost: number | null;  // ako null, ne normalizuje se
  maxDomaci: number | null;     // ako null, ne normalizuje se
  koeficijentiTipova: KoeficijentTipTestaInfo[];
}

export interface KoeficijentTipTestaInfo {
  tipTestaId: number;
  tipTestaNaziv: string;
  maxPoena: number | null;  // ako null, ne normalizuje se
}

export interface SaveKoeficijentiCmd {
  koefPrisustvo: number;
  koefZadatak: number;
  koefZvezdica: number;
  domaciFlat: number;
  domaciVarijansa: number;
  koristiMaxRezultat: boolean;
  prikaziZbirno: boolean;
  maxAktivnost: number | null;
  maxDomaci: number | null;
  koeficijentiTipova: KoeficijentTipTestaCmd[];
}

export interface KoeficijentTipTestaCmd {
  tipTestaId: number;
  maxPoena: number | null;
}

export interface GetOceneCmd {
  grupaId: number;
}

export interface RezultatiStudentaInfo {
  studentInfo: StudentInfo;
  rezultati: MaxPoeniStudentaNaTestuInfo[];
  poeniDomaci: number;
  poeniAktivnost: number;
  poeniPredispitne: number;
  ukupno: number;
  predlogOcene: number | null;
}

export interface MaxPoeniStudentaNaTestuInfo {
  tipTesta: TipTestaInfo;
  ostvarenoPoena: number;
}

export interface CreateGrupaCmd { naziv: string; godinaUpisa: number; }

export interface CreateStudentCmd {
  grupaId: number; ime: string; prezime: string; godina: number; indeks: string;
  brojTelefona: string | null; email: string | null; datumRodjenja: string | null; opstina: string | null;
}

export type StatusPrijave = 'NA_CEKANJU' | 'PRIHVACENA' | 'ODBIJENA';

export interface OnboardingSesijaInfo {
  id: number; token: string; grupa: GrupaInfo; aktivna: boolean; otvorena: boolean;
  kreirano: string; istice: string; maxPrijava: number; brojPrijava: number; brojNaCekanju: number;
  napomena: string | null;
}

export interface PrijavaInfo {
  id: number; ime: string; prezime: string; indeks: string; godina: number; email: string; brojTelefona: string;
  datumRodjenja: string | null; opstina: string | null; status: StatusPrijave; podneto: string;
  obradjeno: string | null; studentId: number | null; napomena: string | null;
}

export interface OnboardingSesijaDetails { sesija: OnboardingSesijaInfo; prijave: PrijavaInfo[]; poruka: string | null; }
export interface CreateOnboardingCmd { isticeZaDana: number; maxPrijava: number; napomena: string | null; }
export interface UpdateOnboardingCmd { aktivna: boolean; isticeZaDana?: number; }
export interface PoljaPrijave {
  ime: string; prezime: string; indeks: string; godina: number | null; email: string; brojTelefona: string;
  datumRodjenja: string | null; opstina: string | null;
}
export interface UpdatePrijavaCmd extends PoljaPrijave {}
export interface OdbijPrijavuCmd { napomena: string | null; }

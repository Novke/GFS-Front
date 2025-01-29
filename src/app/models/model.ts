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
    godinaUpisa: number
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
  }
  
  export interface StudentDetails {
    id: number;
    ime: string;
    prezime: string;
    indeks: string;
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
  polaganja: TestPolaganjeInfo[]
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

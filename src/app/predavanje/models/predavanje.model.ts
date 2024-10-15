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
  }
  
  export interface PredavanjeStudentId {
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

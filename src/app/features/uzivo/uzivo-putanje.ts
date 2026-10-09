/**
 * Putanje uživo ekrana (relativne na `<base href>`, bez vodeće kose crte): jedini izvor za linkove i navigaciju. Rute
 * (`uzivo.routes.ts`, `app.routes.ts`) iste putanje zapisuju kao šablone (`:id`, `putanjaSaId`), pa se ne grade odavde; promena
 * putanje menja oba mesta (putanje su možda odštampane kao QR kodovi). Čiste konstante bez uvoza, pa ih sme koristiti i javni
 * deo (`javno/`).
 */
export const UzivoPutanje = {
  prezentacije: 'prezentacije',
  prezentacija: (id: number | string) => `prezentacije/${id}`,
  prezentacijaIzvodjenja: (id: number | string) => `prezentacije/${id}/izvodjenja`,
  izvodjenjePregled: (id: number | string) => `izvodjenja/${id}/pregled`,
  izvodjenjePublika: (id: number | string) => `izvodjenja/${id}/publika`,
  izvodjenjeKonzola: (id: number | string) => `izvodjenja/${id}/konzola`,
  uzivo: 'uzivo',
  uzivoKod: (kod: string) => `uzivo/${kod}`,
} as const;

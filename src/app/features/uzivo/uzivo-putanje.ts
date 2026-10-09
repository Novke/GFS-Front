/**
 * Putanje uživo ekrana (relativne na `<base href>`, bez vodeće kose crte). Jedini izvor za rute (`uzivo.routes.ts`) i
 * linkove; čiste konstante bez uvoza, pa ih sme koristiti i javni deo (`javno/`).
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

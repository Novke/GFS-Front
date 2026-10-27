/**
 * Putanje konzole i pregleda izvođenja za ekran predavanja. Namerno kopija dve stavke iz `uzivo/uzivo-putanje.ts`
 * (`UzivoPutanje.izvodjenjeKonzola` / `izvodjenjePregled`), ne uvoz: uvoz iz `predavanja` pravi od `UzivoPutanje` deljeni chunk
 * u koji studentske javne stranice (`uzivo-student.page.ts`, `uzivo-kod.page.ts`) plaćaju uvoz, pa studentsko zatvorenje
 * prekorači budžet u `e2e/lenji-formule.spec.ts`. Jednakost sa izvorom čuva `izvodjenje-putanje.spec.ts`.
 */
export const konzolaIzvodjenja = (id: number | string): string => `izvodjenja/${id}/konzola`;
export const pregledIzvodjenja = (id: number | string): string => `izvodjenja/${id}/pregled`;

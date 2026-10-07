/**
 * PRIVREMENO (do Task 18-24): putanje kojima STARI ekrani navigiraju, usmerene na novo stablo ruta (`app.routes.ts`).
 * Nove stranice ovo ne koriste; kad ekran-zadatak obriše stari ekran, briše i njegove ključeve odavde.
 *
 * Stari ekrani su imali po dve stranice za jedan entitet (beleženje i pregled predavanja, evidentiranje i pregled
 * domaćeg/testa), a nova ruta je jedna (`/predavanja/:id`). Query parametar `prikaz` bira staru stranicu (vidi
 * `privremeno.ts`); bez njega bira se po stanju (završeno/pregledan). Zato se ove putanje otvaraju sa
 * `router.navigateByUrl(...)` (query deo), a ne kroz `router.navigate([...])`.
 */
export const AppRoutes = {
  home: '',
  predavanjeSelect: 'predavanja',
  predavanjeStart: 'predavanja/novo',
  predavanjeLive: (id: number | string) => `predavanja/${id}?prikaz=belezenje`,
  predavanjePregled: (id: number | string) => `predavanja/${id}?prikaz=pregled`,
  predavanjeGrupaPredmet: (grupaId: number | string, predmetId: number | string) =>
    `predavanja?grupa=${grupaId}&predmet=${predmetId}`,
  domaciSelect: 'domaci',
  domaciNew: 'domaci/novo',
  domaciEvidentiranje: (id: number | string) => `domaci/${id}?prikaz=evidentiranje`,
  domaciPregled: (id: number | string) => `domaci/${id}?prikaz=pregled`,
  domaciGrupaPredmet: (grupaId: number | string, predmetId: number | string) =>
    `domaci?grupa=${grupaId}&predmet=${predmetId}`,
  testSelect: 'testovi',
  testNew: 'testovi/novo',
  testEvidentiranje: (id: number | string) => `testovi/${id}?prikaz=evidentiranje`,
  testPregled: (id: number | string) => `testovi/${id}?prikaz=pregled`,
  testGrupaPredmet: (grupaId: number | string, predmetId: number | string) =>
    `testovi?grupa=${grupaId}&predmet=${predmetId}`,
  studentDetails: (id: number | string) => `studenti/${id}`,
  studentPredmet: (studentId: number | string, predmetId: number | string) => `studenti/${studentId}/predmeti/${predmetId}`,
  ocenjivanjeSelect: 'ocene',
  grupe: 'grupe',
  grupaDetails: (id: number | string) => `grupe/${id}`,
  onboardingPrijave: (grupaId: number | string, sesijaId: number | string) => `grupe/${grupaId}/onboarding/${sesijaId}`,
  onboardingQr: (grupaId: number | string, sesijaId: number | string) => `grupe/${grupaId}/onboarding/${sesijaId}/qr`,
  upis: (token: string) => `upis/${token}`,
};

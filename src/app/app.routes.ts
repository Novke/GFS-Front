export const AppRoutes = {
    predavanjeSelect: "predavanje",
    predavanjeStart: "predavanje/start",
    predavanjeLive: (id: number | string) => `predavanje/live/${id}`,
    predavanjePregled: (id: number | string) => `predavanje/${id}/pregled`,
    predavanjeGrupaPredmet: (grupaId: number | string, predmetId: number | string) => `predavanje/grupa/${grupaId}/predmet/${predmetId}`,
    domaciSelect: "domaci",
    domaciNew: "domaci/new",
    domaciEvidentiranje: (id: number | string) => `domaci/${id}/evidentiranje`,
    domaciPregled: (id: number | string) => `domaci/${id}/pregled`,
    domaciGrupaPredmet: (grupaId: number | string, predmetId: number | string) => `domaci/grupa/${grupaId}/predmet/${predmetId}`
  };
  
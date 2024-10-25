export const AppRoutes = {
    predavanjeStart: "predavanje/start",
    predavanjeLive: (id: number | string) => `predavanje/live/${id}`,
    domaciEvidentiranje: (id: number | string) => `domaci/${id}/evidentiranje`,
    domaciPregled: (id: number | string) => `domaci/${id}/pregled`,
    domaciGrupaPredmet: (grupaId: number | string, predmetId: number | string) => `domaci/grupa/${grupaId}/predmet/${predmetId}`,
    domaciSelect: "domaci",
    domaciNew: "domaci/new"
  };
  
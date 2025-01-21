export const AppRoutes = {
    home: "",
    predavanjeSelect: "predavanje",
    predavanjeStart: "predavanje/start",
    predavanjeLive: (id: number | string) => `predavanje/live/${id}`,
    predavanjePregled: (id: number | string) => `predavanje/${id}/pregled`,
    predavanjeGrupaPredmet: (grupaId: number | string, predmetId: number | string) => `predavanje/grupa/${grupaId}/predmet/${predmetId}`,
    domaciSelect: "domaci",
    domaciNew: "domaci/new",
    domaciEvidentiranje: (id: number | string) => `domaci/${id}/evidentiranje`,
    domaciPregled: (id: number | string) => `domaci/${id}/pregled`,
    domaciGrupaPredmet: (grupaId: number | string, predmetId: number | string) => `domaci/grupa/${grupaId}/predmet/${predmetId}`,
    testSelect: "test",
    testNew: "test/new",
    testEvidentiranje: (id: number | string) => `test/${id}/evidentiranje`,
    testPregled: (id: number | string) => `test/${id}/pregled`,
    testGrupaPredmet: (grupaId: number | string, predmetId: number | string) => `test/grupa/${grupaId}/predmet/${predmetId}`,
    studentDetails: (id: number | string) => `student/${id}`
  };
  
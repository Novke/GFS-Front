# GFS-Front

Angular 16 frontend za sistem Građevinskog fakulteta Subotica (evidencija predavanja, domaćih, testova i predlog ocena).

## Pokretanje

### Lokalno (razvoj)

```bash
npm ci
npx ng serve --host 127.0.0.1   # http://127.0.0.1:4200
```

Backend se očekuje na `localhost:8080`. Frontend poziva `api` (bez vodeće kose crte), što se razrešava
u odnosu na `<base href>`: lokalno daje `/api/...`, a iza preview proxy-ja `/gfs/api/...`. `ng serve`
zahteve ka `/api` preko `proxy.conf.json` prosleđuje na `http://localhost:8080` (prefiks `/api` se uklanja).

### Docker

```bash
docker build --build-arg BASE_HREF=/gfs/ -t gfs-frontend .
```

`BASE_HREF` je putanja pod kojom se aplikacija služi (podrazumevano `/`). Kontejner sluša na portu 80;
nginx unutra služi Angular build i proxy-uje `/api` ka servisu `backend` (`http://backend:8080/`).

`/api` proxy razrešava ime `backend` preko Docker DNS-a (`127.0.0.11`), pa kontejner mora da radi na compose
ili user-defined mreži koja ima servis po imenu `backend`; na podrazumevanom bridge-u `/api` vraća 502.

## Grane i CI

- Tok: `feature/* -> staging -> master`. PR-ovi podrazumevano ciljaju `staging`; izdanje je PR `staging -> master`
  (otvara Novica ili agent na zahtev). Nikad direktan push na `master`; direktan push na `staging` je dozvoljen za brze probe.
  `master` je zaštićen: obavezan PR i zeleni check `build`. Repo je javan, pa u njemu nema tajni ni pravih podataka.
- Staging: svaki push na `staging` se automatski deployuje (oko minut) na `https://staging.gfs.trif.rs` (basic-auth,
  samo izmišljeni podaci); ishod je commit status `staging-deploy`. Detalji u deploy repou `Novke/GFS-deploy` (`README.md`).
- CI: `.github/workflows/ci.yml`, job `build`, na PR i push na `staging`/`master`: Node 18, `npm ci`,
  `npx ng build --configuration production`, Karma (`npx ng test --watch=false --browsers=ChromeHeadless`), pa `docker build`.
  Lokalno isto: `npm ci && npx ng build --configuration production`.
  **Poznati dug:** Karma korak ima `continue-on-error: true`, jer CLI stub specovi padaju (`NullInjectorError: No provider for HttpClient`,
  nedostaje i `ActivatedRoute`). Check je zelen i kad Karma padne; greška se vidi samo u logu koraka.

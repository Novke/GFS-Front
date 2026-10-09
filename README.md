# GFS-Front

Angular 22 frontend za sistem Građevinskog fakulteta Subotica (evidencija predavanja, domaćih, testova i predlog ocena).

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

`APP_ENV` (build arg, podrazumevano `prod`) se upisuje u `assets/env.json`. Za `APP_ENV=staging` aplikacija prikazuje crvenu
traku "STAGING — test podaci" i značku `STAGING` u bočnoj navigaciji (tako se staging razlikuje od prod). Sa `prod` nema trake; `ng serve`
nema `env.json`, pa ni lokalno nema trake.

`/api` proxy razrešava ime `backend` preko Docker DNS-a (`127.0.0.11`), pa kontejner mora da radi na compose
ili user-defined mreži koja ima servis po imenu `backend`; na podrazumevanom bridge-u `/api` vraća 502.
WebSocket uživo ide kroz `location = /api/ws` (nastavnik) i `location = /api/public/ws` (student), oba ispred `^~ /api/`;
lokalni `ng serve` traži `"ws": true` u proxy fajlu (`proxy.conf.json` ga ima).

## Grane i CI

- Tok: `feature/* -> staging -> master`. PR-ovi podrazumevano ciljaju `staging`; izdanje je PR `staging -> master`
  (otvara Novica ili agent na zahtev). Nikad direktan push na `master`; direktan push na `staging` je dozvoljen za brze probe.
  `master` je zaštićen: obavezan PR i zeleni check `build`. Repo je javan, pa u njemu nema tajni ni pravih podataka.
- Staging: svaki push na `staging` se automatski deployuje (oko minut) na `https://gfs.dev.trif.rs` (basic-auth,
  samo izmišljeni podaci); ishod je commit status `staging-deploy`. Detalji u deploy repou `Novke/GFS-deploy` (`README.md`).
- CI: `.github/workflows/ci.yml`, job `build`, na PR i push na `staging`/`master`: Node 24, `npm ci`, `npx ng lint` (ESLint,
  angular-eslint i dva sopstvena pravila iz `eslint-rules/`), `npm run test:eslint-pravila` (testovi tih pravila i stvarnog
  `eslint.config.js`), `npx ng test --watch=false` (Vitest + jsdom, ne treba browser), `npx ng build --configuration production`,
  pa `docker build`. Nijedan korak nije `continue-on-error`: crven lint ili test blokira merge.
  Lokalno isto: `npm ci && npx ng lint && npm run test:eslint-pravila && npx ng test --watch=false && npx ng build --configuration production`.
- Sopstvena ESLint pravila: `gfs/javna-ruta-uvozi` (javne rute `upis/:token` i `uzivo[/:kod]` smeju da uvoze samo sebe i
  spisak iz `eslint-rules/javna-ruta-konfig.js` (zajednički plus dodatak po feature-u), jer svaki zaključan `/api/*` studentu otvara dijalog za lozinku) i
  `gfs/granice-featurea` (feature ne uvozi tuđi `data-access/`; `core/` i `shared/` ne uvoze `features/`).

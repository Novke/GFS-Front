# GFS-Front

Angular 16 frontend za sistem Građevinskog fakulteta Subotica (evidencija predavanja, domaćih, testova i predlog ocena).

## Pokretanje

### Lokalno (razvoj)

```bash
npm ci
npx ng serve --host 127.0.0.1   # http://127.0.0.1:4200
```

Backend se očekuje na `localhost:8080`. Frontend poziva relativni URL `/api`, a `ng serve` ga
preko `proxy.conf.json` prosleđuje na `http://localhost:8080` (prefiks `/api` se uklanja).

### Docker

```bash
docker build --build-arg BASE_HREF=/gfs/ -t gfs-frontend .
```

`BASE_HREF` je putanja pod kojom se aplikacija služi (podrazumevano `/`). Kontejner sluša na portu 80;
nginx unutra služi Angular build i proxy-uje `/api` ka servisu `backend` (`http://backend:8080/`).

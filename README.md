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

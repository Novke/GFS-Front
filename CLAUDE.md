# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GFS-Front is the teacher tool of Građevinski fakultet Subotica (lectures, homework, tests, grade proposals, live
presentations "uživo") plus two public student areas (the intake form `upis` and the live student pages `uzivo`). The backend is `Novke/GFSSystem` (Spring Boot); deploy, staging and branching rules live in the
wrapper repo `Novke/GFS-deploy` (`CLAUDE.md`, `README.md`). This repo is **public**: no secrets, no real data.

## Stack

Angular 22, standalone components only, **zoneless** (`provideZonelessChangeDetection()`, no zone.js), OnPush
everywhere, signals + NgRx SignalStore (`@ngrx/signals`), Angular Material 22 (M3) on our own tokens, STOMP over WebSocket
(`@stomp/rx-stomp`) and `marked` for uživo, Vitest + jsdom
through `ng test` (no browser), ESLint (angular-eslint) with two project rules in `eslint-rules/`. CI runs Node 24.
All UI text is Serbian Latin; code identifiers are Serbian too (predmet, grupa, predavanje, domaći, test, ocena).

## Commands

```bash
npm ci
npx ng lint                                   # ESLint, incl. gfs/javna-ruta-uvozi and gfs/granice-featurea
npm run test:eslint-pravila                   # node --test for the two project rules and the real eslint.config.js
npx ng test --watch=false                     # all specs
npx ng test --watch=false --include src/app/features/testovi/data-access/test.store.spec.ts   # one spec
npx ng build                                  # production build -> dist/gfs-front
npm run e2e                                   # ng build + tsc (e2e) + Playwright over dist with a mocked API
npx playwright test e2e/liste.spec.ts         # one e2e spec (needs a fresh dist; Chromium: npx playwright install chromium)
npx ng serve --host 127.0.0.1                 # angular.json defaults host to "sistem.gfs"; port 4200
```

`ng serve` proxies `/api` to `http://localhost:8080` and strips the prefix (`proxy.conf.json`); point it elsewhere
with your own proxy file (`--proxy-config`). CI (`.github/workflows/ci.yml`, job `build`) runs lint, the rule tests,
`ng test`, `ng build --configuration production`, the e2e suite and `docker build`; nothing is `continue-on-error`.

E2E (`e2e/`, Playwright + `@axe-core/playwright`): `playwright.config.ts` serves `dist/gfs-front/browser` with
`e2e/staticki-server.ts` (SPA fallback, port 4300 or `E2E_PORT`) and every spec imports `test` from `e2e/fixture.ts`,
which installs `MockApi` (`e2e/mock-api.ts`, invented data in `e2e/fixtures/*.json`, state per test). A request the mock
has no route for gets 404 **and fails the test**, so a new endpoint needs a mock route; so does an uncaught page error.
`mock.na(...)` overrides one route, `mock.zadrzi(...)` holds a response until the test releases it (no fixed sleeps).
`pristupacnost.spec.ts` runs axe (WCAG 2.0/2.1/2.2 A+AA) day and night: 0 serious/critical violations; fix the app,
do not disable rules.

## Layout

```
src/app/
  core/      app singletons: api/ (HTTP clients + DTOs), state/ (root stores), layout/ (shell, nav, breadcrumbs), search/
  shared/    reusable, feature-agnostic: ui/ (list-states, filter-bar, paginator, ...), store/ (withListQuery,
             withRequestStatus), forms/, util/, models/
  features/<x>/
    data-access/  stores and feature-only API/models
    pages/        routed components
    ui/           presentational components
    <x>.routes.ts
  app.routes.ts  shell routes, legacy redirects, public layout, projector layout
```

- **Boundaries** (`gfs/granice-featurea`): a feature never imports another feature's `data-access/`; `core/` and
  `shared/` never import `features/`. API clients and DTOs used by more than one feature live in `core/api/` (DTO field
  names mirror the backend exactly), shared stores in `core/state/` (e.g. the list stores reused by the grupa/predmet
  hubs). Importing another feature's `ui/` is allowed.
- Request options have one type, `OpcijeZahteva` (`core/api/opcije-zahteva.ts`; never a per-client copy): `{ tiho: true }`
  sets `LOCAL_ERRORS`, so the global error interceptor shows no snackbar and the caller reports the error itself. Clients
  whose callers always use the snackbar (`ReferenceApi`, global search) and the public `upis.api` take no options.
- Breadcrumbs: `data.mrvice` built with `mrvica(label, url?)` from `core/layout/mrvica.ts`.
- `withComponentInputBinding()` is on: route and query params bind to same-named inputs of routed components.

## State

- Lists use `withListQuery` (`shared/store/list-query.feature.ts`): **the URL is the source of truth** for filters,
  sort and page; locked filters (hub routes) never enter the URL. Reference data (`ReferenceStore` predmeti/grupe)
  needs an explicit `ucitaj()`.
- Pages show empty / loading / error states with `shared/ui/list-states`; destructive actions confirm through
  `ConfirmDialog`, undo through the 6 s "Poništi" snackbar (`NotificationStore`).
- Missing data (lecture without group, student without email or year) renders "—", never throws.

### Saving stores (PredavanjeStore, DomaciStore, TestStore)

The three entry screens save every row by itself (optimistic UI, per-row debounce or click queue). They share one
pattern; keep it when touching any of them:

- One **session** per loaded entity, with a per-row (predavanje, domaći) or per-entity (test) `concatMap` queue:
  at most one request per row in flight, and the job sends the **latest** values when it runs, so rapid edits end
  with the server holding the last shown value. Row versions decide whether a response may update the display.
- After **any** save error the row's confirmed value is **unknown** (the server may have written it and the response
  got lost), so the next edit always sends (PredavanjeStore first re-reads the lecture to compute the transition).
- A reconcile/refresh response (re-GET after an error, `oslobodi`) is applied only if the row's confirmation version
  has not changed since it was sent.
- Leaving the screen or loading another id **closes** the session, never cancels it: pending debounces are flushed,
  queued and in-flight saves finish, stale responses never touch the new entity's state.
- Loading entity N waits until every session for N (any store instance) has drained: `core/state/registar-cuvanja.ts`
  (`RegistarCuvanja`, keys `test-N`, `domaci-N`, `predavanje-N`).
- Every queue job is wrapped in `bezPrekidaReda`: an exception thrown inside an error handler goes to `ErrorHandler`
  and does not kill the queue or stall the registry wait.
- `core/state/nesacuvane-izmene.ts` (`NesacuvaneIzmene`) shows the browser's native "leave site?" prompt on close or
  reload only while a registered session has pending, queued, in-flight or failed saves.

Specs for these stores drive `HttpTestingController` with fake timers; a fix to a guarantee needs a spec that fails
without it.

## Public routes

`upis/:token` and `uzivo`, `uzivo/:kod` are opened by students on a phone **without basic-auth**, so they may only request
`assets/*` and `api/public/*` (`upis`: `api/public/upis/*`; uživo: `api/public/uzivo/*`, `api/public/mediji/*`,
`api/public/ws`); any other `/api/*` call returns 401 and pops the browser's password dialog. Both live in
`PublicLayout` (no shell; a wrong link under `/upis` or `/uzivo` stays a public 404). `gfs/javna-ruta-uvozi` enforces
this fail-closed: a public feature (`features/upis`, `features/uzivo/javno`) may import only itself plus
`dozvoljenoZa(feature)` in `eslint-rules/javna-ruta-konfig.js` = the shared list (`JAVNO_DOZVOLJENO`) plus a per-feature
addition (`DOZVOLJENO_PO_FEATURE`). The rule checks direct imports only, so every addition must be read together with its
own imports (the comment next to each entry says why it is safe). Never add teacher-shell code (stores, `core/state`,
shell, teacher API clients) to it. On the backend, anything mapped under `/public/**` is reachable from the internet
without auth.

## Uživo (`features/uzivo`)

Interactive presentation with live questions (spec `docs/superpowers/specs/2026-10-07-interaktivna-prezentacija-design.md`
in `Novke/GFS-deploy`). The server is the only source of truth: every change arrives as a whole snapshot with `verzija`
over STOMP; teacher commands are REST.

- `data-access/`: `uzivo.models.ts` (mirrors the backend DTOs), `prezentacije.api.ts`, `izvodjenja.api.ts` (teacher;
  every request is `LOCAL_ERRORS`, because every uživo caller shows its own error), `stomp.ts`, `sat.ts` (server clock
  offset), `editor.store.ts`, `izvodjenje.store.ts`, rules (`slajd-pravila`, `izvodjenje-pravila`). Only uživo uses them.
- `ui/`: shared views (slide, options, results, ranking, timer, QR); `pages/`: list, editor, runs, overview, audience
  (`publika`), console (`konzola`); `javno/`: the student pages (`uzivo-kod.page`, `uzivo-student.page`, `student.store`,
  `javno.api`); `uzivo-putanje.ts`: the only path builders; `uzivo.routes.ts`: route children.
- Layouts (paths unchanged since the first release, they may be printed as QR codes): `prezentacije`, `prezentacije/:id`,
  `prezentacije/:id/izvodjenja` and `izvodjenja/:id/pregled` in the shell; `izvodjenja/:id/publika|konzola` in
  `ProjectorLayout`; `uzivo`, `uzivo/:kod` in `PublicLayout`. The last two layouts get `data: { celaStrana: true }` (no
  content frame), because these pages draw the whole screen themselves.
- `javno/` may import exactly: `uzivo-putanje`, `data-access/uzivo.models`, `data-access/stomp`, `data-access/sat`,
  `data-access/razlog-greske`, `ui/format`, `ui/markdown`, `ui/opcija-oblik`, `ui/rang-lista.component`,
  `ui/tajmer.component` (and `lazni-sat.testing` in specs). Never `prezentacije.api`, `izvodjenja.api`, the stores,
  `pages/` or `core/state`. After touching `javno/` or the routes, check that `uzivo/<kod>` makes no `/api/` call outside
  `/api/public/` (the wrapper's `staging/e2e/uzivo_e2e.py` checks it).
- Styles are global (`uzivo-tokeni.css`, `pages/uzivo-editor.css`, `pages/uzivo-izvodjenje.css`, `javno/uzivo-javno.css`,
  `@use`d from `src/styles.scss`; class prefix `uz-`), so components stay under the style budget. Colours only through
  tokens; projector, console, editor preview and student pages are always day (`rezim-dan uz-dan`: `uz-dan` re-sets the
  text colour, which is inherited as a computed value). The black/white screens (keys B/W) are deliberately pure black and
  white. Destructive Material buttons use `.uz-opasno` (M3 ignores `color="warn"`).
- Zoneless: all state is signals (STOMP messages go through `patchState`, the timer interval sets a signal). Component
  specs that render Material form fields under `saLaznimSatom` provide `MATERIAL_ANIMATIONS` with
  `animationsDisabled: true`, otherwise MatFormField leaves 300 ms timers behind.

## Routes and paths

- Old routes (`predavanje/...`, `domaci/new`, `test/...`, ...) redirect to the new ones in
  `features/legacy-redirects.ts` until the end of the semester; printed QR codes and shared links use `upis/:token`
  and `uzivo/:kod`, which never change (the uživo teacher paths kept their pre-redesign URLs too).
- All URLs are **relative** (`api/...`, `assets/...`, `new URL('upis/' + token, document.baseURI)`): the app is built with
  a `BASE_HREF` (`/` on staging and prod, `/gfs/` historically), so never write root-relative `/api` or `/assets`.

## Design

Theme "Nacrt": `src/styles/_tokens.scss` is the only source of colours (`--bg`, `--surface`, `--ink`, `--primary`, ...),
day/night via `data-mode` on `<html>`, `.rezim-dan` forces day tokens (projector screens). The focus ring is always
`--focus`; dark shell bars use `.ljuska-tamna`, which switches `--focus` to `--side-focus`. No hex colours in
components. Check layouts at 390 px (no horizontal scroll from 360 px) and 1280 px, day and night.

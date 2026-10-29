# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GFS-Front is the teacher tool of Građevinski fakultet Subotica (lectures, homework, tests, grade proposals, live
presentations "uživo") plus three public student areas (the intake form `upis`, the live student pages `uzivo` and the student
account `nalog`). Teachers sign in at `/prijava` (see "Prijava"). The backend is `Novke/GFSSystem` (Spring Boot); deploy, staging and branching rules live in the
wrapper repo `Novke/GFS-deploy` (`CLAUDE.md`, `README.md`). This repo is **public**: no secrets, no real data.

## Stack

Angular 22, standalone components only, **zoneless** (`provideZonelessChangeDetection()`, no zone.js), OnPush
everywhere, signals + NgRx SignalStore (`@ngrx/signals`), Angular Material 22 (M3) on our own tokens, STOMP over WebSocket
(`@stomp/rx-stomp`) and `marked` for uživo, Vitest + jsdom
through `ng test` (no browser; `src/test-setup.ts` stubs canvas `getContext`, `Range.getClientRects` /
`getBoundingClientRect` and `document.elementFromPoint` for ProseMirror in jsdom, and a global `beforeEach` gives every spec
`UCITAJ_FORMULE` / `UCITAJ_STIL_FORMULA` / `UCITAJ_STIL_TEKSTA_FORMULE` loaders that never resolve, so a formula stays the
LaTeX source unless the spec provides its own; `afterEach` resets the text-formula style cache and removes its `<link>`), ESLint (angular-eslint) with two project rules
in `eslint-rules/`. CI runs Node 24.
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
`e2e/staticki-server.ts` (SPA fallback, port 4300 or `E2E_PORT`; every response carries the container's CSP from `e2e/csp.ts`,
so the whole suite runs under it, see "Markdown images and CSP") and every browser spec imports `test` from `e2e/fixture.ts`,
which installs `MockApi` (`e2e/mock-api.ts`, invented data in `e2e/fixtures/*.json`, state per test). A request the mock
has no route for gets 404 **and fails the test**, so a new endpoint needs a mock route; so does an uncaught page error.
`mock.na(...)` overrides one route, `mock.zadrzi(...)` holds a response until the test releases it (no fixed sleeps).
`pristupacnost.spec.ts` runs axe (WCAG 2.0/2.1/2.2 A+AA) day and night: 0 serious/critical violations; fix the app,
do not disable rules.

Public paths: `e2e/javne-putanje.ts` holds the public-path regex (`JAVNI_IZRAZ`, a copy of the server's: `staging public gfs`
on the box and the commented public line in the wrapper's `deploy/nginx/` templates; change all of them together) and the
long-cache regex of `docker/nginx.conf` (`DUGI_KES_IZRAZ`, also used by the e2e static server). `javne-putanje.spec.ts`
(no browser) checks them against the real build: every file except `index.html` is public, every hashed file (root and
`media/`) is long-cached, `assets/` never is, and `nginx.conf` uses the same string. Public-route specs (`javni-upis`,
`uzivo-javno`) import `test` from `e2e/javna-mreza.ts`: every request whose path does not match the public regex (static
files too, e.g. a lazy chunk) gets 401 and fails the test, as on staging; `dozvoljeniApi` lists the allowed `/api/` calls,
`dozvoljeni401` the public API paths where a 401 is the app's own answer (`nalog`: wrong code, expired student cookie; a 401
from a locked path still fails). `JAVNI_IZRAZ` already contains `nalog(/|$)`, which the server regex gets with the prijava
release (Novica runs `staging public gfs`; until then the e2e regex is one branch ahead of staging).
By default the fixture is strict (no JS with any `NIZOVI_EDITORA` string, `ML__latex` included, and no request under
`assets/mathlive/`: `upis` and uživo without a formula); `test.use({ formule: true })` (uživo with a formula, 5a) checks
`zabranjeniJavno` instead (`e2e/nizovi-editora.ts`: editor, ProseMirror, formula dialog and `NIZ_MATHLIVE_CEO`, i.e. the full
`mathlive`; `mathlive/ssr` is allowed) and lets `assets/mathlive/` through. Since 5d it also fails on any JS with a `nizoviPdf` string (`e2e/nizovi-uvoza.ts`: PDF
dialog, pdf.js, its worker) and on any request under `assets/pdfjs/`, in both modes.
Angular 22 lazy chunks have mixed-case base64url hashes (`chunk-CtOh0Kox.js`, `chunk-_fBU7IqW.js`), so the hashed-file
branch is `[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$`.

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
  whose callers always use the snackbar (`ReferenceApi`) take no options; global search (`PretragaApi`) always sets
  `LOCAL_ERRORS` (its dialog shows the error), and the public `upis.api` takes no options.
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
  (`RegistarCuvanja`, keys `test-N`, `domaci-N`, `predavanje-N`, and `prezentacija-N` for the uživo editor's
  `EditorStore`, which keeps its **own** request counter of the session, decremented unconditionally in `finalize`,
  because the store's `uToku` is reset in `ucitaj` and the registry must not wait on it; see "Slide editor, part 4a").
- Every queue job is wrapped in `bezPrekidaReda`: an exception thrown inside an error handler goes to `ErrorHandler`
  and does not kill the queue or stall the registry wait.
- `core/state/nesacuvane-izmene.ts` (`NesacuvaneIzmene`) shows the browser's native "leave site?" prompt on close or
  reload only while a registered session has pending, queued, in-flight or failed saves.

Specs for these stores drive `HttpTestingController` with fake timers; a fix to a guarantee needs a spec that fails
without it.

## Public routes

`upis/:token`, `uzivo`, `uzivo/:kod`, `nalog`, `nalog/moodle`, `nalog/cas` and `nalog/cas/:token` are opened by students on a phone **without basic-auth**
and without a teacher session, so they may only request `assets/*` and `api/public/*` (`upis`: `api/public/upis/*`; uživo:
`api/public/uzivo/*`, `api/public/mediji/*` (for a Zadatak slide only the participant's own variant and, after `RESENJE`, its
solution), `api/public/ws`; nalog: `api/public/nalog/*`, and `nalog/moodle` also `api/public/lti/povezi` and `api/public/lti/povezivanje`); any other `/api/*`
call returns 401 and pops the browser's password dialog. All live in `PublicLayout` (no shell; a wrong link under `/upis`,
`/uzivo` or `/nalog` stays a public 404). `gfs/javna-ruta-uvozi` enforces this fail-closed: a public feature (`features/upis`,
`features/uzivo/javno`, `features/nalog`) may import only itself plus
`dozvoljenoZa(feature)` in `eslint-rules/javna-ruta-konfig.js` = the shared list (`JAVNO_DOZVOLJENO`) plus a per-feature
addition (`DOZVOLJENO_PO_FEATURE`). The rule checks direct imports only, so every addition must be read together with its
own imports (the comment next to each entry says why it is safe). `JAVNO_DOZVOLJENO` today also holds `shared/util/nazad`,
`shared/util/indeks` and `shared/forms/indeks-polja` (three-part index, see below). Never add teacher-shell code (stores, `core/state`,
shell, teacher API clients) to it. npm packages are free for public features except `ZABRANJENI_PAKETI_JAVNO` in the same
file (heavy slide-builder editor/import libraries, today `fflate`, the seven `prosemirror-*` packages, `mathlive` (with
`mathlive/ssr`) and `pdfjs-dist`; subpaths such as `fflate/esm` count too): the rule reports them as `zabranjenPaket`. The
public part imports nothing of the slide editor, the canvas, the PDF or the PPTX import. **Formulas on the phone (phase 5a):**
the only entry is `DOZVOLJENO_PO_FEATURE['features/uzivo/javno']` += `ui/tekst-formule.component` and `ui/tekst-formule`
(not `ui/formula-prikaz.component`, `ui/formula-ucitavanje` or `ui/formula-markup`: the public files never import them
directly, the rule tests keep it). Transitively the component statically reaches `ui/markdown`, `ui/tekst-formule` and
`ui/formula-ucitavanje` -> `ui/cekanje-fontova` (no imports, `document.fonts`), **never** `ui/preducitavanje`, `ui/teme` or
`ui/platno-*` (canvas data and fonts; once they did arrive through a static import and cost ~5 kB on the phone). The
`mathlive/ssr` chunk may reach a public route **only through the dynamic `import()`** in `ui/formula-ucitavanje` and only when
the text has a formula; its CSS and the KaTeX fonts come from `assets/mathlive/`, so nginx and the public regex need no change.
The rule sees direct imports only, so `e2e/lenji-formule.spec.ts` guards the graph over the build (below, "Uživo"). On the backend, anything mapped under `/public/**` is reachable from the internet
without auth.

**Index in three parts and phone (`upis`, `nalog`, `nalog/moodle`; branch `feature/prijava-indeks-mejl`):** both forms use
`shared/forms/indeks-polja` (`IndeksPolja`, `indeksKontrole`, `vrednostIndeksa`) and `shared/util/indeks` (no imports): the study
programme `GD` is fixed and shown as the prefix of the number field (`SMEROVI` = `{sifra, naziv}[]`, today only `{GD, Geodezija}`, same codes and order as the backend enum `utility/Smer`; no picker until there is a second programme), the number is
1-3 digits (`inputmode="numeric"`, letters dropped, `05` = `5`), the year is a separate 4-digit field (2000 to current school year + 1),
**proposed but editable**, errors directly under each field and a live line "Indeks: GD5/2026"; a pasted full index (`GD05/2026`) fills
both fields. Both files are on `JAVNO_DOZVOLJENO` (they import only Angular, Material and each other). The request is
`{indeks: 'GD5', godina: 2026}`. Year proposal: `upis` = the session group's year; `nalog` = `?godina=` when it is a valid 4-digit year
(the Uživo phone adds it from `JavnoIzvodjenjeInfo.godinaUpisa`, `nalogUrl` in `student.store.ts`), otherwise the start year of the
current school year (`tekucaSkolska`); an invalid `?godina=` is ignored. **Phone on `upis`** (`features/upis/telefon.ts`, pure functions,
own small list instead of `libphonenumber-js`, which would put tens of kB of metadata into the public chunk): a native
`<select matNativeControl>` with Srbija +381 (default), BiH +387, Crna Gora +382, Hrvatska +385, Mađarska +36 (prefix `06`), Severna
Makedonija +389, Slovenija +386 and "Druga zemlja" (manual 1-3 digit code), plus the number field; `uE164` strips spaces, dashes, dots,
slashes and parentheses, drops the national prefix (`0`) and adds the code, keeps `+...`/`00...` as international, and on blur or paste a
full international number of a listed country selects the country itself (`razdvojiMedjunarodni`). The form sends E.164 and shows "Biće
sačuvan kao +381 64 1234567"; the server applies the same rule (`Telefon.uE164`).

After a successful submit `upis` shows "Pridruži se WhatsApp grupi" when the `POST` response carries `waLink`; it renders
only a canonical `https://chat.whatsapp.com/<code>` (`waLinkZaPrikaz` in `upis.pravila`, the server enforces the same), so
the `href` is never an arbitrary URL. The teacher side lives on the group's Studenti tab: "Kontakti za telefon" is a plain
`<a download>` to `api/grupe/{id}/kontakti.vcf` (vCard; the phone offers the import into Contacts), "Pošalji WA link" is a
`mailto:` built by `mailtoWaLinka` (`core/api/grupe.models.ts`: shown students' addresses in BCC, RFC 6068 encoding) that
opens the teacher's own mail app, and `ui/wa-link-dialog` sets the link (`PATCH grupe/{id}/wa-link`).

## Prijava (teacher session and student account)

Spec `docs/superpowers/specs/2026-10-19-prijava-design.md` in `Novke/GFS-deploy` (sections 4, 5, 10). The backend decides;
the front only routes and shows.

- **Teacher session** (`core/auth/`): `SesijaStore` (root; `proveri()` = one shared `GET api/auth/ja`, success cached; 401
  `odjavljen`, network/5xx `nepoznato` and the route loads anyway, so a deploy does not log anybody out; `ponisti()`),
  `AuthApi` (`api/auth/*`), `nastavnikGuard` (`canMatch`) **per route**: on the shell route and on every teacher route
  outside it (the five `ProjectorLayout` routes: lecture projector, onboarding QR, publika, konzola, daljinski; the two
  legacy `onboarding/:id[/qr]` redirects in `legacy-redirects.ts`). Without a session it returns a `UrlTree` to
  `/prijava?nazad=<nazadIzUrla(url)>`. **No guard** on `upis`, `uzivo`, `nalog`, `prijava` (and later `render/slajd`); a new
  teacher route outside the shell must get `canMatch: [nastavnikGuard]` (`app.routes.spec.ts` lists the guarded URLs).
- **`/prijava`** (`features/prijava/pages/prijava.page`, in `PublicLayout`, day look): injects only `SesijaStore` and
  `Router`, so its only requests are `GET api/auth/ja` (guard of the target) and `POST api/auth/prijava` (`API_BEZ_SESIJE`
  in `e2e/javne-putanje.ts`). It is **not** in `JAVNI_IZRAZ` (a teacher page; on staging behind basic-auth) and not a
  `JAVNI_FEATURE` (it must call `api/auth/*`); `e2e/prijava.spec.ts` checks its network instead. Errors: 401/429/503 show the
  server's `reason` in the form banner (503 read from the body, `toApiError` hides 5xx), network/other 5xx generic.
- **`nazad`** (`shared/util/nazad.ts`, no imports, also on the public allow-list): `bezbednoNazad(v)` passes only a relative
  app path (`^[A-Za-z0-9][A-Za-z0-9/_.?=&%-]*$`, no `//`, `..`, `:`, `\`), anything else is `null` and ignored
  (`//evil.com`, `https://x`, `/\evil`, `javascript:`); `nazadIzUrla(routerUrl)` builds it (drops the leading `/` and the
  fragment, percent-encodes the rest, e.g. the comma of `sort=datum,desc`). Use is always `navigateByUrl(bezbednoNazad(x) ?? ...)`.
- **401 = expiry** (`sesija.interceptor.ts`, before `errorInterceptor`): a 401 on a teacher API (`jeIstekSesije`: `api/*`
  except `api/public/*`, `auth/prijava`, `auth/ja`, `auth/odjava`) dynamically imports `istek-sesije` (lazy chunk, budget) and
  calls `IstekSesije.obradi()` once for all parallel 401s: `ponisti()`, then `/prijava?nazad=<current URL>` through the router.
  With unsaved work in `RegistarCuvanja` (`NesacuvaneIzmene.broj() > 0`) a `ConfirmDialog` ("Prijava je istekla") asks first,
  also on routes with `canDeactivate`; "Odustani" keeps the page, shows `PORUKA_OSTAO` once per URL, and rows keep
  "Pokušaj ponovo" for after a login in another tab. The error interceptor shows no snackbar for that 401. **Never from a
  public route:** when the current URL or the navigation in progress targets `/upis`, `/uzivo` or `/nalog`, `obradi` only
  calls `ponisti()` (a late teacher response must not take a student to `/prijava`).
- **Shell-lifetime refresh:** the root stores that poll a teacher API run only while the shell lives:
  `DashboardCountsStore.pokreni(DestroyRef)` (called by `Shell`) and `ObavestenjaStore.pokreni(DestroyRef)` (called by the bell
  in the top bar) load at once, then follow `core/state/periodicno-osvezavanje.ts` (after navigation at most once per 15 s,
  every 60 s while the tab is visible) and stop (and cancel the request in flight) when that `DestroyRef` ends. Creating the
  store alone requests nothing. A new teacher-side polling store must follow the same pattern; `e2e/nalog.spec.ts` ("posle
  ljuske u istoj kartici") checks that no teacher request fires on `/nalog` after leaving the shell in the same tab.
- **Top bar and nav** (F2): `@defer (on immediate)` holds the bell (`obavestenja-meni`, badge = unread) and the user menu
  (`korisnik-meni`: "Prijavljeni uređaji" (lazy `sesije.dialog`), "Odjava" (`ConfirmDialog` only with unsaved work; 401 counts
  as success; other errors keep the teacher on the page)); the notifications list is a lazy dialog anchored under the bell
  (`obavestenja-panel`, several actions per item, so not a menu). All of it is outside the initial bundle. The side nav shows
  the username (`SideNav.korisnik` from `SesijaStore.korisnik`). Home shows the "Obaveštenja" card next to "Čeka na tebe"
  (renamed from "Nalozi" when `MNOGO_NAJAVA` arrived: not every notification is about a student account; its link comes from
  `vezaObavestenja`, as in the bell list).
- **Student account `nalog`** (`features/nalog/`, a `JAVNI_FEATURE`): route `nalog` in `PublicLayout` with children
  `NALOG_RUTE` (lazy page; the public 404 under `/nalog` is added in `app.routes.ts` because `NotFound` lives in
  `core/layout`). Allow-list: `JAVNO_DOZVOLJENO` plus `DOZVOLJENO_PO_FEATURE['features/nalog']` = `shared/ui/confirm-dialog`
  (Angular Material dialog/button and rxjs only), `shared/util/datum.pipe` (`@angular/core` only) and `shared/util/termin`
  (no imports; a rule test keeps it import-free); never `core/state`,
  `core/auth`, teacher API clients or `features/studenti`. `data-access/`: `nalog.api.ts` (only `api/public/nalog/*`, all
  `LOCAL_ERRORS`; bodies carry `{indeks, godina}`), `nalog.models.ts` (DTOs as on the server), `nalog.pravila.ts` (code digits,
  `porukaGreske`; `javnoNazad` now lives in `shared/util/nazad.ts`). `ui/`: presentational steps with inputs/outputs and no HTTP, reused by `nalog/moodle` (F5):
  `IndeksKorak` (`posaljiKod`, `imamKod`: "Imam kod od nastavnika" goes to the code step **without** sending a mail, plan C), `KodKorak`
  (`odNastavnika` = dictated code: label "Kod od nastavnika", no mask, no "Ne stiže mi kod", the resend button is "Pošalji kod na mejl";
  `prijavi`, `posaljiPonovo`, `neStize`, `promeniIndeks`; `slanjeBroj` restarts the
  60 s wait of "Pošalji ponovo", `CEKANJE_PONOVO_S`; the field has `inputmode="numeric"`, `autocomplete="one-time-code"`,
  `maxlength="6"`, and a pasted code with spaces or a dash is reduced to its 6 digits before `maxlength` cuts it),
  `NalogPregled` (index, name, masked e-mail, Moodle, devices, "Odjavi se", "Odjavi sve uređaje"). `pages/nalog.page.ts`: step
  signal `'ucitavanje' | 'greska' | 'indeks' | 'kod' | 'prijavljen'`; first load `GET stanje` (+ `GET ja` when signed in;
  `ja` 401 = index step); after a successful code `navigateByUrl(javnoNazad(nazad))`, otherwise the account screen; an
  already signed-in student with a safe `nazad` gets a "Nastavi" button, never an automatic jump (no loop). `javnoNazad`
  (`shared/util/nazad.ts`, re-exported by `nalog.pravila.ts`, also used by `/prijava`) is `bezbednoNazad` plus a public first segment (`uzivo`, `upis`, `nalog`): a teacher route
  (`predavanja/3`) is ignored as if absent (the student has no teacher session), and a `nazad` to the same page
  (`nalog`, `nalog?...`) shows the account screen instead of navigating (the reused component would stay on the code step). Server texts are
  shown verbatim ("Ako nalog postoji, kod je poslat.", 401 "Kod nije ispravan ili je istekao.", 429, 503, "Javili smo
  nastavniku."); "Odjavi sve uređaje" confirms with `ConfirmDialog`. Focus moves to the step heading (`h2`) after each step change.
- **Moodle, student side** (`features/nalog/pages/moodle.page.ts`, public child `nalog/moodle`, spec prijave 8.3): the backend
  redirects here after a Moodle launch. `?greska=<kod>` shows a fixed text per code (`nepoznata-registracija`,
  `istekla-sesija`, `bez-kolacica`, `neispravan-token`, `nepodrzana-poruka`; unknown code = generic text, the code itself is
  never shown) and a link "Otvori GFS" (`/nalog`); `?uloga=nastavnik` shows "Alat je ispravno registrovan."; both make no
  request. Without them it is the pairing flow: first `GET api/public/lti/povezivanje` (the Moodle account name from the launch, kept
  for the confirmation step; 410 = "Povezivanje nije uspelo" with the server text and no pairing; any other error, e.g. 404, network
  or 5xx, continues without a name), then `GET stanje` (+ `ja`), the same `IndeksKorak`/`KodKorak`, then the confirmation step.
  **Linking is never automatic (R18/R19):** a code proves only the GFS identity, while the Moodle account in the browser may belong
  to someone else (shared lab PC). So after a fresh code login the page always goes to the confirmation step ("GFS nalog: <ime>
  (<indeks>)" and, when Moodle sent a name, "Moodle nalog: <ime>"; without a name the text "Moodle nije poslao ime naloga. Poveži
  samo ako je Moodle na ovom računaru otvoren pod tvojim nalogom." instead) and only the button "Poveži" sends
  `POST api/public/lti/povezi` (`NalogApi.poveziMoodle`, cookie `__Host-gfs_lti_par`) -> "Moodle nalog je povezan". An already signed-in
  student lands on the same step. "Poveži" has `aria-describedby` on the warning and on the `role="group"` accounts block. "Drugi
  indeks" logs the device out (error ignored) and clears the index field. 409/410 are the server text verbatim (fallbacks
  `PORUKA_VEC_POVEZAN`, `PORUKA_POVEZIVANJE_ISTEKLO`) with "Otvori GFS"; 401 goes back to the index step; network/5xx keep the
  signed-in student on "Poveži" with the error. `nazad` (public only) gives "Nastavi" after pairing. Both pages share the card
  frame `ui/nalog-okvir.component.ts`. The page requests only `api/public/nalog/*`, `api/public/lti/povezi` and
  `api/public/lti/povezivanje` (`e2e/nalog.spec.ts`, "nalog/moodle").
- **`/prijava` is for teachers only** (h1 "Prijava za nastavnike", "korisničko ime i lozinka"); a large link "Student si? Prijavi se brojem
  indeksa" goes to `/nalog` (`routerLink`, no import from `features/nalog`) and passes `nazad` only when `javnoNazad` accepts it.
- **Dictated code, teacher side (plan C):** "Kod za diktiranje" on the student card (`app-student-nalog`, also for a student without mail)
  and on notification items with a student (`obavestenja-panel`) calls `core/api/kod-za-diktiranje.api` (`POST
  api/studenti/{id}/nalog/kod-za-diktiranje`, shared by a feature and `core`, hence in `core`) and shows the result once in
  `core/layout/kod-za-diktiranje-dialog` (large code "123 456", valid until HH:mm, the index and year the student types, the server's
  warning if the index is not `GD` + number); the server resolves the student's open notifications, so the badge and list refresh.
- **Moodle, teacher side** (`features/podesavanja/`, route `podesavanja` in the shell via `loadChildren`, `podesavanja` ->
  `podesavanja/moodle`; side nav section "Podešavanja" -> "Moodle"): `MoodleRegistracijePage` lists registrations
  (`LtiApi`, `api/lti/registracije`), "Nova registracija"/"Izmeni" open `RegistracijaDialog` (typed form; empty auth/JWKS
  URL = derived from the issuer, the hint shows the derived address, `lti.pravila.uFormu` blanks a stored URL equal to the
  derived one so it follows issuer edits; 400/409 server text in the form banner), "Obriši" with `ConfirmDialog`. "Vrednosti
  za Moodle" (`GET api/lti/registracije/vrednosti`) has a "Kopiraj" button per address (`shared/util/kopiraj`, snackbar
  confirmation) and the short Moodle guide (More -> LTI External tools -> Add tool; LTI 1.3, Keyset URL, New window,
  services off, name Always, e-mail Never). e2e: `podesavanja-moodle.spec.ts`; mock routes `lti/registracije*` and
  `public/lti/povezi` (`MockApi.moodlePar` = cookie `__Host-gfs_lti_par`), fixture `e2e/fixtures/lti.json`.
- **Tests:** `core/auth/sesija.testing.ts` `prijaviNastavnika()` signs the real `SesijaStore` in for specs that go through the
  real routes. e2e: `MockApi.prijavljen` (teacher cookie; `false` = every teacher API answers 401 before overrides, as the
  server), `MockApi.LOZINKA`, `MockApi.studentPrijavljen` and `MockApi.KOD_NALOGA` (student cookie and the only accepted code
  for `podaci.nalogStudenta`, fixture `e2e/fixtures/nalozi.json`, which also holds notifications and teacher sessions). Before
  revoking the teacher session in a test wait for the top bar (`trakaSpremna` in `prijava.spec.ts`): the deferred bell's first
  `GET obavestenja/broj` would otherwise get the 401. Specs: `prijava.spec.ts`, `nalog-nastavnika.spec.ts`, `nalog.spec.ts`, `podesavanja-moodle.spec.ts`.

## Čekiranje (student portal, phase 1)

Spec `docs/superpowers/specs/2026-10-28-studentski-portal-design.md` in `Novke/GFS-deploy` (sections 4-8), plan next to it. A
student confirms attendance by scanning a QR on the projector; the backend decides who counts (group, account, 20-30 s token,
lecture not finished) and writes the PRISUSTVO activity; the front only shows the QR, routes the phone and polls.
- **Token and link:** `GET api/predavanja/{id}/cekiranje` (teacher, `core/api/cekiranje.api.ts`, always `LOCAL_ERRORS`) returns
  `{token, vaziDoMs, serverVremeMs, datumNijeDanas, cekirani[]}`; the token is `<predavanjeId>.<22 chars>`, changes every 10 s and
  is `null` for a finished lecture. `linkCekiranja(token)` = `new URL('nalog/cas/' + token, document.baseURI)`. The secret never
  reaches the front. `CekiranjeApi` is in `core` because the lecture projector, the lecture page and Uživo share it.
- **Teacher screens:** the lecture projector (`predavanja/:id/projektor`, link "Čekiranje" on the lecture page) polls every 3 s
  (`CEKIRANJE_MS`, only while the tab is visible, `exhaustMap`, an error keeps the last QR) and shows the QR (720 px), the
  address, "Čekirano: N" (count only, never names on the projector) and, when `datumNijeDanas`, "Ovo predavanje je od … Da li si
  hteo novo predavanje?". The lecture page polls every 5 s (`OSVEZAVANJE_DETALJA_MS`) while live: the "Čekirani" panel
  (`ui/cekirani-panel`: time, "kasnio" after 15 min, "isti telefon kao X") and `PredavanjeStore.osvezi()`, which merges server
  activities only into rows without pending saves (per-student confirmation counters snapshotted at request time), so a check-in
  appears in the grid without overwriting a teacher's click. Uživo: while the run belongs to a lecture and the join screen or the
  Q overlay is shown, `IzvodjenjeStore` polls the same endpoint every 3 s (`QR_CEKIRANJE_MS`) and `qrLink` becomes the check-in
  link (the QR content only; the printed text stays the short join link). A lecture from another day (`datumNijeDanas`) keeps the
  join QR, so the board never checks students into an old lecture without the projector's warning. Console and remote show "čekirano N"; the answer count
  is `N / max(brojOcekivanih ?? ucesnici, brojOdgovora)`.
- **Student `/nalog/cas` and `/nalog/cas/:token`** (`features/nalog/pages/cas.page.ts`, public, `CasApi` = only
  `api/public/nalog/cas`, `/skeniraj`, `/potvrdi`, all `LOCAL_ERRORS`): with a token the address is replaced by `/nalog/cas` at once
  (`Location.replaceState`, the token stays in no history), then `POST skeniraj`. A signed-in student gets the lecture state; a
  student without `gfs_student` gets a one-time key, which goes to `sessionStorage` `gfs-cas-kljuc`, and the page goes to
  `nalog?nazad=nalog/cas` (`javnoNazad` accepts the `nalog` prefix); back on `/nalog/cas` the key goes to `POST potvrdi` and is
  deleted (401 keeps it and returns to the login, network/5xx keep it for "Pokušaj ponovo", other errors delete it). Without a
  token and key: `GET` state (401 = login). While on the lecture it polls every 10 s ± 2 s (`sledeciUpitMs`) and at once on
  `visibilitychange`; a hidden page does not poll; 429 backs off 20, 40, at most 60 s without a message; a network error keeps
  the view. A 429 on `skeniraj` or `potvrdi` (a classroom behind one NAT scanning at once) repeats the same step after 1-9 s
  (`odlaganjeKoraka429`, short because the token lives 20-30 s) up to 5 times, then shows the message with "Pokušaj ponovo";
  the key stays. The backend accepts a key only from the phone that scanned (same `gfs_uredjaj` cookie). A state with `izvodjenje` navigates to `uzivo/<kod>?sa=cas`; a finished lecture, removed attendance or "not checked
  in" end polling with a message. Server texts are shown verbatim (410 "QR je istekao. Skeniraj ponovo sa table.", "Čekiranje za
  ovaj čas je završeno.", "Čekiranje je isteklo. Skeniraj QR ponovo."). `/nalog` shows the card "Na času si" (`ui/na-casu-kartica`,
  "Nastavi" -> `/nalog/cas`) when `GET cas` returns a lecture that is not finished.
- **Uživo phone:** `?sa=cas` (`uzivo-student.page.ts`, `saCasa`) returns to `nalog/cas` 3 s after `kraj` or `izbacen`
  (`POVRATAK_NA_CAS_MS`, text "Vraćam te na čas…"). A scored run of a lecture requires a check-in: the join 403 with
  `PRVO_CEKIRANJE` ("Prvo se čekiraj: skeniraj QR sa table.") is phase `cekiranje` (message and "Moj nalog", no retry, the
  connection closes); 403 `IZBACEN` is `izbacen` (a signed-in student sees "Nastavnik te je uklonio iz ovog izvođenja." without
  "Uđi ponovo"); any other 403 goes to `nalog` as before.
- **Tests:** unit specs next to each file; e2e `e2e/cekiranje.spec.ts` (scan -> wait -> run -> end -> back on the lecture,
  login with a key, server messages, the `/nalog` card, axe in day mode, projector QR changes and shows no names, a finished
  lecture has no QR and no request). The mock (`MockApi.cekiranje`) returns a new token on every `GET predavanja/:id/cekiranje`
  so the test sees the change without waiting 10 s.

## Raspored i najava odsustva (timetable, absence announcements)

Spec `docs/superpowers/specs/2026-10-29-najava-odsustva-design.md` in `Novke/GFS-deploy` (decisions in section 11), plan next
to it; backend in `GFSSystem/CLAUDE.md`. A timetable period (`naziv`, `vaziOd`/`vaziDo`, threshold `pragNajava`, lines =
subject, group, ISO weekday, start, end) generates weekly termini; only cancellations and announcements are stored. Termini are
computed on the server; the front never builds dates of termini itself.
- **Shared util `shared/util/termin.ts`** (no imports, so it is on the `features/nalog` allow-list): `DANI`/`DANI_KRATKO`
  (index = ISO weekday), `lokalniDatum`, `danUNedelji`, `isoDatum`, `dodajDane`, `hhmm` (server `HH:mm:ss` -> `HH:mm`),
  `blokVremena` ("10:00–13:00"), `danIDatum` ("sreda 4. 11."), `relativniDan` ("danas"/"sutra"). Use it for every termin label.
- **Student card "Naredni časovi"** (`features/nalog/ui/naredni-casovi.component.ts`, mounted in the `prijavljen` step of
  `/nalog` after "Na času si"): **self-contained** (provides its own `CasoviStore`, loads in its constructor, no inputs or
  outputs), so it can move unchanged into a future "Čas" tab. `CasoviApi` = only `api/public/nalog/casovi`, `/najavi`, `/povuci`,
  all `LOCAL_ERRORS`; the student comes from the cookie. Hidden while loading and when the student has no termini; an error shows
  "Pokušaj ponovo". Per termin: "Neću doći" (one tap, no reason), then "Dodaj/Izmeni razlog" (textarea, 200 chars) and "Ipak
  dolazim"; a cancelled termin shows "Nema časa." plus the teacher's note and no buttons. 404/409 from the server (not your line,
  started, cancelled meanwhile) show the server text next to that termin and reload the list silently. The response never
  carries counts or other students' names, and the card shows none.
- **Teacher `features/raspored`** (lazy `RASPORED_RUTE` under `raspored`, side nav "Raspored", icon `event`): `/raspored` list
  of periods (newest first, "Važi danas", Izmeni, "Kopiraj u novi" = `/raspored/novi?kopija=<id>`, Obriši with `ConfirmDialog`),
  `/raspored/novi` and `/raspored/:id` (`RasporedFormaPage`, typed form with a `FormArray` of lines, `unsavedChangesGuard`; a new
  line copies subject, group and times of the last one; the copy keeps lines and threshold, drops ids and dates; the server
  re-checks everything and its 400 text goes to the banner), `/raspored/termini?od=<datum>` (`TerminiPage`: 28 days from `od`,
  grouped by day, chip "Ne dolazi: N" in warn tone above the threshold, `<details>` "Ko ne dolazi" with names, card links and
  reasons, link to the lecture of that day, "Otkaži čas" (`OtkazivanjeDialog`, optional note; for an already cancelled termin the
  same dialog only edits the note) and "Vrati čas" (`ConfirmDialog`), both hidden once the termin started; the snackbar says how
  many students got the mail). Names and reasons exist only in `api/rasporedi/termini`. Rules (copy, cmd, window, threshold) are
  pure functions in `data-access/raspored.pravila.ts`.
- **Notifications:** `VrstaObavestenja` has `MNOGO_NAJAVA` (`podaci`: `stavkaId`, `datum`, `pocetak`, `kraj`, `predmet`,
  `grupa`, `broj`, `prag`; never names or reasons). `tekstObavestenja` -> "Mnogo najava odsustva: predmet · grupa · sreda 4. 11.
  (6)"; `vezaObavestenja(o)` gives the link for both the bell list and the Home card (`/raspored/termini?od=<datum>` here, the
  student card for the account kinds, `null` without a student).
- **Home:** `KontrolnaTablaInfo.raspored` (optional, older backend: no field) feeds the card "Raspored, narednih 7 dana"
  (`features/pocetna/ui/raspored-kartica`, shown when a period covers today or there are termini; counts only, link "ne dolazi: N"
  to the termini page) and "Otkazano danas" rows in the hero. `SledecePredavanjeInfo.termin` and `izvor` (both optional):
  `RASPORED_DANAS` adds the time block and "najavljeno odsustvo: N" to "danas"; `RASPORED_SLEDECI` turns the eyebrow into
  "Danas nema časa po rasporedu", shows "Sledeći: <dan>, <vreme>" and the button "Ipak započni danas" (it still starts today's
  lecture for that subject and group).
- **Tests:** unit specs next to each file; e2e `e2e/najava-odsustva.spec.ts` (phone, public network, axe: own group only,
  announce, reason, withdraw, threshold notification, no counts in the student response, cancelled termin, 409 while open),
  `e2e/raspored.spec.ts` (nav, copy, new form with server error, termini with names/reasons, cancel/restore, bell link, Home),
  and a raspored block in `e2e/pristupacnost.spec.ts` (day and night). Mock: `e2e/mock-raspored.ts` (empty by default, so old
  specs are unchanged; `mock.raspored.primer()` fills one period around today with prag 2 and lines tomorrow and the day after).
  `nalog.spec.ts` and `cekiranje.spec.ts` allow `GET /api/public/nalog/casovi`, because the card asks on every signed-in `/nalog`.

## Uživo (`features/uzivo`)

Interactive presentation with live questions (spec `docs/superpowers/specs/2026-10-07-interaktivna-prezentacija-design.md`
in `Novke/GFS-deploy`). The server is the only source of truth: every change arrives as a whole snapshot with `verzija`
over STOMP; teacher commands are REST.

- **Presentations on a lecture (`features/predavanja`, not `features/uzivo`).** The live lecture page (`/predavanja/:id` until finished) has
  "Pokreni prezentaciju": `ui/pokreni-prezentaciju.dialog.ts` lists the subject's presentations (`GET prezentacije?predmetId`, newest edited first,
  filter field above 6) and starts a run bound to the lecture (`POST prezentacije/{id}/izvodjenja`, `cuvanje: true`, `predavanjeId`, also for a
  presentation without questions) and opens its console in a **new tab**, so recording continues. The tab is opened **synchronously from the click** as
  `about:blank` and gets its address when the server answers (popup blockers refuse `window.open` after an async call); on a server error it is closed,
  and when even the blank tab is blocked the run still starts and the page tells the teacher to use "Nastavi". A presentation with a run in progress for this
  lecture offers "Nastavi" (link, no second start); one running elsewhere is locked (the server allows one active run per presentation, 409).
  `ui/prezentacije-na-predavanju.ts` ("Prezentacije na ovom predavanju", live and finished view) lists `GET izvodjenja?predavanjeId` with status,
  "Nastavi" (console) or "Pregled", reloads when the browser tab becomes visible again. The API client and DTOs are in `core/api/prezentacije-predavanja.api.ts`
  (`features/predavanja` must not import `features/uzivo/data-access`); it does not import `features/uzivo/uzivo-putanje.ts` either (a shared chunk would grow the student closure past its e2e budget): `ui/izvodjenje-putanje.ts` holds the two paths, pinned equal to `UzivoPutanje` by `izvodjenje-putanje.spec.ts`. The route
  `prezentacije/:id?predavanje=ID` (editor, "Pokreni" without dialog) still exists and is unchanged.

- **Formulas in question and option text (phase 5a).** Syntax `$...$` by pandoc's `tex_math_dollars` (`ui/tekst-formule.ts`):
  after the opening `$` a character that is neither a space nor `$`; no newline and no unescaped `$` inside; the last character
  before the closing `$` is not a space or `\`; no digit right after the closing `$`; `\$` is always a dollar sign; no `$$...$$`.
  **Exception (not pandoc):** a `$` right after a digit does not open a formula, because amounts are likelier (`5$`, `10$-20$`,
  `Košta 5$, a sa popustom 4$.` stay text, so `2$x$` stays text too). "Digit" is the *source* character before the `$`, so
  `**2**$x$`, `2 $x$` and `(2)$x$` are formulas. Formulas are read **only** in the question text (Markdown: a `marked` inline
  extension, `markdownSaFormulama`, so code spans and blocks stay literal; `renderMarkdown` for INFO does not read `$`) and
  in option text (plain text, `podeliFormule`). A formula takes precedence over emphasis and strike-through, as in pandoc:
  `hooks.emStrongMask` (`maskirajFormule`) hides formula ranges from the `*`/`_`/`~` delimiter search, so `*x $a*b$ y*` is
  italic around the whole formula (escaped `\$` and code spans are already masked by `marked` and are not formulas). The mask
  runs on every `inlineTokens`, so it is superlinear around many delimiters and formulas (a stack overflow from ~15 500
  characters): a question text longer than `MAX_TEKST_SA_FORMULAMA` (4000, twice the server limit of 2000) is plain Markdown
  without formulas or mask (`markdown.ts`), and the question form uses the same function, so it warns about nothing the display
  does not draw. If the server limit ever grows, the hook and `start` need a cache or one pass per block. They are **not** read in student answers, acceptable answers, the unit, scale
  labels, INFO slides or notes (an ordinary `$` there would suddenly become a formula). An image `alt` with a formula gets
  the LaTeX source. `app-tekst-formule` (`ui/tekst-formule.component.ts`, `[tekst]`, `[markdown]`; host `[innerHTML]` with
  Angular's sanitizer, **never** `bypassSecurityTrustHtml`, which is the only defence against `[x](javascript:...)`) renders
  every formula as `span.uz-formula` holding the source; after the module (`UCITAJ_FORMULE`, the phase 4 path) and the light
  style (`UCITAJ_STIL_TEKSTA_FORMULE`: the same `mathlive-static.css`, waiting only for `KaTeX_Main` 400 and `KaTeX_Math`
  italic, 3 + 3 s at most; no second `<link>` when the phase 4 one exists) each span gets `latexUMarkup('\textstyle ' + latex)`,
  `uz-formula--spremna`, `role="img"` and `aria-label` = LaTeX. Invalid, forbidden (`\href`, the `\html…` family) or too heavy
  LaTeX, more than `MAX_FORMULA_U_TEKSTU` (50) formulas in one text, or a failed load leave the source (`uz-formula--izvor`),
  never an exception or an error on the projector or phone (one `console.warn` per window, `upozoriFormuleNisuUcitane` in
  `ui/formula-ucitavanje`). A failed `mathlive-static.css` is **not** remembered as success: the light style rejects, removes
  its `<link>` (a failed phase 4 link gets `data-greska` and is not waited for again), the formula stays the source, and the next
  text shown tries again (no loop; a 3 s timeout still draws). Option buttons on the phone get their name
  through `tekstZaCitac` (no `$`). Used by `slajd-prikaz`, `pitanje-plocice`, `rezultat-prikaz` (bars), `izvodjenje-pregled`
  and `javno/` (question text, options, correct answer, "Detalji"). Projector and console preload the module when the current or
  next slide is a question with a formula (`imaFormuluZaCrtanje`); the phone does not know the text in advance, so a student
  may briefly see the source. Anything that appears **live** next to a formula (the "✓ tačno" badge after `TACAN`, the timer
  beside the question text) must sit **outside the formula's block**, so it changes the block's width and the `ResizeObserver`
  re-measures; inside the same block it would only shift the formula and nothing would notice (final review 5a, B I1: up to
  188 px clipped). Results: `.uz-rez-opcija-tekst` is a flex row (badge, then `app-tekst-formule.uz-rez-opcija-formula` with
  `flex: 1 1 0` and the ellipsis); tiles and the question header already were (`flex: 1`). A formula never wraps (the source does, also inside long LaTeX). On teacher views a formula wider than its
  block is scaled down (`--uz-formula-k`, down to 0.5, below that it is clipped at the edge, never a scrollbar): `ui/mera-formule.ts`
  (`meriFormule`, after rendering reads first and writes after, again on `ResizeObserver` of the blocks and `document.fonts`
  `loadingdone`). MathLive's markup width is **not linear** in k, so k is computed only when the formula's **input** changes
  (block content width or font size by >= 0.5 px, or new fonts): from the measure at k = 1 (stays 1 when it does not overflow
  there, so a frame that shrinks to its content cannot spiral), then at most `MAX_KOREKCIJA` (2) steps down while it really
  overflows, then nothing; the same input (e.g. the `ResizeObserver` callback after its own write) writes nothing. The earlier
  "grow while it fits, shrink when it overflows" rule oscillated ~60 times a second; `uzivo-formule-tekst.spec.ts` counts style
  writes during 1 s of rest after resizing (900-1920 px, tiles and results) and expects 0. `meriFormule` is provided through the
  token `MERA_FORMULE` **only** by `slajd-prikaz`, `pitanje-plocice`,
  `rezultat-prikaz` and `izvodjenje-pregled`; its default is `null`, so the phone has neither the code nor the scaling. On the
  phone (`.uz-st`) a wide formula scrolls inside itself (`max-width: 100%`, `overflow-x: auto`) and `padding-inline-end: 0.15em`
  keeps MathLive's ~2 px overhang inside the box, so a short formula never gets a scrollbar; the document never scrolls
  horizontally (e2e at 360 px; `uzivo-javno-trake.spec.ts` and `uzivo-formule-tekst.spec.ts` run without `--hide-scrollbars`,
  so classic 15 px scrollbars would show). A scrolling formula is a scroll region, so the phone (no `MERA_FORMULE`) watches drawn
  formulas with one `ResizeObserver` and gives `tabindex="0"` only to a formula with `scrollWidth > clientWidth` (removed again
  when it fits, e.g. after rotating); its name stays `role="img"` + `aria-label` (children presentational, nothing read twice),
  focus ring inset (`outline-offset: -3px`, the host clips). Inside an option button (or any `aria-hidden` host) a formula gets
  **no** `role`/`aria-label` (the button is named by `tekstZaCitac`) and, when it overflows, an explicit `tabindex="-1"`, never 0:
  Chromium 130+ puts a scroll container without focusable descendants into the tab order by itself, which made it an empty stop
  in hidden content (re-review B, I1); `-1` takes it out, finger scrolling stays. `pristupacnost.spec.ts` (360 px): axe
  `scrollable-region-focusable`, and a Tab walk through the page that never lands inside `aria-hidden` or on a formula in a
  button, while the wide formula of the question text is a stop. Formulas are `font-weight: 400` (bold KaTeX fonts are not loaded). **The question form** (`pages/pitanje-forma.component.ts`) shows a hint (including the
  digit exception) and, 300 ms after typing, a non-blocking warning in `--warn` (not `--danger`: saving is not blocked, the
  server does not check formulas) for every formula the display would not draw, naming the field ("u tekstu pitanja",
  "u odgovoru B"); it runs exactly the display's check (same parser per field, lazy `latexUMarkup`, same limit of 50), so an
  incomplete `\frac{1}{`, which MathLive draws with an empty box, gets **no** warning (use `\nepostoji{x}` as the invalid
  example in specs and fakes). A failed module load is remembered per form instance (no new `import()` or `console.warn` on
  every pause). **Budgets** (`e2e/lenji-formule.spec.ts`, build only, annotations `velicina`): the student page's own closure
  (file with `NIZ_STUDENTA` minus the initial closure) <= `OSNOVA_STUDENTA` 108 218 + 8 000 B (114 929 B after 5e (+134: warm module cache of `app-tekst-formule`), 114 795 B after 5d, 114 790 B after 5c, whose lazy conversion
  chunk adds one export to the `marked` chunk shared with the phone; 114 615 B after the fix wave of the final review 5a) and without `ML__latex`, editor strings, `tabelaZaglavlje`, `Carlito`
  or `--uz-formula-k` (only in `mera-formule`: the phone has no measuring code; ~2.4 kB, below the reserve, so the byte limit
  alone would not catch it); `mathlive/ssr` only dynamically imported, outside the
  initial and student closure, own closure <= measured + 5 % (348 195 B -> 365 604 B, never above 380 000) and <= 105 000 B
  gzip (102 932); `tekst-formule*.ts` never import `mathlive` nor contain `ML__latex`. Network of one formula on the phone
  (`uzivo-javno.spec.ts`, annotation `mreza-formule`; JS, CSS and woff2 after the question, app fonts from `media/` not
  counted): 404 112 B, limit measured + 10 % and never above 450 000 B; no `KaTeX_AMS*`/`KaTeX_Size*`, nothing off-origin.
  The editor page file stays <= 215 000 B (current value: `velicina` annotation of `e2e/lenji-editor.spec.ts`; the form's formula check, ~1-1.4 kB, is the first candidate for a
  lazy chunk if 5b-5e need room). **Known limitations:** `aria-label` is raw LaTeX (no spoken form); `\color{black}` (the
  sanitizer allows `#hex` colours) is unreadable on a **dark presentation theme** (TAMNA, PONOĆ: `rezim-noc` on the slide) on
  projector, console and editor preview; the app's night mode does not touch it (those views are always `rezim-dan uz-dan`); the
  phone may show the source until the chunk loads; after a rejected `import()` the browser may keep the failure for that URL in
  its module map until reload (browser-dependent), so a retry can fail at once; inside a GFM table a `|` in a formula splits
  the cell (write `\|` there, which the table turns back into `|`, or `\vert` / `\mid`); after `MAX_KOREKCIJA` a formula can
  stay a few tenths of a pixel over its edge (nonlinear width); the slide list label (`oznakaSlajda`) keeps `$...$` of a
  question as written (`_` and `*` inside stay).

- `data-access/`: `uzivo.models.ts` (mirrors the backend DTOs), `prezentacije.api.ts`, `izvodjenja.api.ts` (teacher;
  every request is `LOCAL_ERRORS`, because every uživo caller shows its own error), `stomp.ts`, `sat.ts` (server clock
  offset), `editor.store.ts`, `izvodjenje.store.ts`, rules (`slajd-pravila`, `izvodjenje-pravila`). Only uživo uses them.
- **Question results** (`ui/rezultat-prikaz.component`, the same component on the projector (`javniRezultat`), in the console
  (teacher `rezultat`, `kompaktno`) and in the run overview): options (A/B/C/D) are bars with count and percent; free entry is shown
  as **chips of the entered answers** like the Zadatak slide (`ui/cipovi-odgovora.component`, shared with `zadatak-rezultat`): BROJ
  always (no median since 2026-10-28; every distinct value with all decimals through `tacanBroj` plus the unit, because the server
  groups exactly equal values and rounding would show two different answers as one) and KRATAK_TEKST when the question has accepted
  answers (`prihvatljiviOdgovori`, whatever `tekstPrikaz` says). Open KRATAK_TEKST (no accepted answers) keeps the word cloud or the
  list (`tekstPrikaz`, `vrstaRezultata`); BROJ without a correct value (estimate) shows neutral chips. Chips are neutral until
  correctness is visible (`Rezultat.tacnih !== null`, server rule: public result only after `TACAN` on a closed question); then the
  correct ones come first with ✓, the wrong ones with ✗, and a chip "niko" with the correct value from the question when answers exist
  but nobody had it (`cipoviRezultata`). At most `MAKS_CIPOVA` = 30 chips plus "+N drugih (M)", correct ones are never cut
  (`ograniciCipove`); on the projector the font follows `data-gustina` (`gustinaCipova`, `min(cqw, cqh)` in `uzivo-tokeni.css`).
  Whenever `tacnih` is set and there are answers, a line "✓ Tačno x od y · N %" (`tacnihTekst`) sits above every result type (options
  included); the overview turns it off (`[prikaziTacnih]="false"`, its round header already says "tačnih N %"). Inputs: `rezultat`
  and `pitanje` (`OpisPitanja` = `tekstPrikaz`, `jedinica`, `prihvatljiviOdgovori`, `brojTacno`; `PitanjeDetails` and
  `PitanjeSnimak` both fit). Chip styles live in the lazy chip component, not in the global CSS; a parent enlarges the correct chip
  with `--uz-co-tacno-f` and centers with `--uz-co-poravnanje`. The question form notes under "Rezultati na projektoru" that cloud and
  list apply only without accepted answers.
- `ui/`: shared views (slide, options, results, ranking, timer, QR); `pages/`: list, editor, runs, overview, audience
  (`publika`), console (`konzola`); `javno/`: the student pages (`uzivo-kod.page`, `uzivo-student.page`, `student.store`,
  `javno.api`); `uzivo-putanje.ts`: the only path builders; `uzivo.routes.ts`: route children.
- Layouts (paths unchanged since the first release, they may be printed as QR codes): `prezentacije`, `prezentacije/:id`,
  `prezentacije/:id/izvodjenja` and `izvodjenja/:id/pregled` in the shell; `izvodjenja/:id/publika|konzola|daljinski` in
  `ProjectorLayout`; `uzivo`, `uzivo/:kod` in `PublicLayout`. The last two layouts get `data: { celaStrana: true }` (no
  content frame), because these pages draw the whole screen themselves. `daljinski` also gets `pratiRezim: true`
  (`ProjectorLayout` then drops `.rezim-dan`, so the phone follows day/night); projector and console stay day.
- `javno/` may import exactly: `uzivo-putanje`, `data-access/uzivo.models`, `data-access/stomp`, `data-access/sat`,
  `data-access/razlog-greske`, `ui/format`, `ui/markdown`, `ui/opcija-oblik`, `ui/rang-lista.component`,
  `ui/tajmer.component`, `ui/tekst-formule.component`, `ui/tekst-formule` (and `lazni-sat.testing` in specs). Never `prezentacije.api`, `izvodjenja.api`, the stores,
  `pages/` or `core/state`. After touching `javno/` or the routes, check that `uzivo/<kod>` makes no `/api/` call outside
  `/api/public/` (`e2e/uzivo-javno.spec.ts` checks it with a fake STOMP broker; the wrapper's `staging/e2e/uzivo_e2e.py`
  against a real backend).
- **PLATNO slide (phase 1 of the slide builder):** a slide of type `PLATNO` carries a layer document `platno`
  (`data-access/platno.models.ts`, mirrors the backend; fonts from the same catalogue as `PlatnoPP.FONTOVI`).
  `data-access/platno-koraci.ts` holds the pure step logic: `stanjeSlojeva` (visibility of every layer at step k),
  `grupaZaKorak`, `animacijaPrelaza` (which animations play for a transition; only `k-1 -> k` on the same slide and
  entering forward, group 0; anything else draws the exact state without animation). `ui/platno-prikaz.component.ts`
  is a DOM renderer (`data-sloj`/`data-pasus` attributes, `platno.css`, text through `ui/platno-tekst.ts`), animations
  through the Web Animations API; a new instance per slide, and a fast second click cancels the running animations and
  jumps the previous group to its end state, so no layer stays hidden or transparent. Keyframes never animate `visibility`:
  each target gets inline `visibility: visible` while its group runs and has it reset explicitly after `cancel()` (Chromium
  can otherwise keep a stale inherited `visibility` after fast steps; e2e `uzivo-platno.spec.ts` "brzi koraci"). `ui/teme.ts`: 5 themes; an
  unknown or missing `tema` means NACRT; the NACRT title is ink, and `teme.spec.ts` checks WCAG AA contrast of every
  theme. Fonts of the canvas: `ui/platno-fontovi.ts` plus `src/styles/_fontovi-platna.scss` (fontsource, OFL: Carlito,
  Caladea, Arimo, Tinos, Cousine, IBM Plex Sans/Mono, Atkinson Hyperlegible; `font-display: block`). `ui/preducitavanje.ts`
  waits for the fonts of the first snapshot (3 s at most) and preloads the images of the next slide (failed loads are
  not cached). `publika-scena` counts reconnect epochs: no animation right after a reconnect or a late-opened window; it records every
  snapshot as "previous" (PRIJAVA and KRAJ too, through an effect), so → from PRIJAVA to the first slide plays group 0.
  Editor: a PLATNO slide has no side preview any more; steps and animations are watched in the editor's "Pregled" mode
  (part 4b). The form of a PLATNO slide edits only the notes; the theme is a presentation setting in the page's settings panel
  (`podesi({ tema })`, radio; a note below it says that changing the theme does not recolour existing layers).
  **`PUT /slajdovi/{id}` of a PLATNO slide must send `platno` back unchanged** (the page always sends the store's
  `platno`, never the form's (`izmenaForme`), and `slajdUCmd` copies it from the slide; omitting it wipes the layers). **`javno/` imports none of this** (no `platno.*`, `teme`, `platno-*`, `preducitavanje`; `uzivo.models`, which `javno/` may import, only `import type`s `platno.models`, erased at compile time, so no platno runtime code reaches public routes): the
  phone never gets the canvas and loads no canvas fonts (`e2e/uzivo-javno.spec.ts` checks it); e2e `uzivo-platno.spec.ts`.
- **Console and remote (phase 3 of the slide builder):** the console (`konzola`) shows the position with the step ("korak k/n"
  from the server's `korak`/`brojStavki`, never from `brojKoraka`), `sledece-panel` (state after the next click; on a
  question in CEKA/OTVORENO the action plus "Zatim:", pure function `sledeciKlik` in `izvodjenje-pravila`),
  `beleske-panel` (notes with A-/A+, `pre-wrap`, long words break, scroll back to top on a new slide) and
  `vreme-izvodjenja` (stopwatch and clock). The size of the notes is one `PreferencesStore` setting `velicinaBeleski`
  (14-40 px, default 18), shared by console and remote. `data-access/stoperica.ts`: pure stopwatch from the server's
  `NastavnickoStanje.pocetakMs` (needs backend `pocetakMs`) on server time (`sat.sada()`), pause/reset local to the
  window but kept in `sessionStorage` (`gfs.uzivo.stoperica.<id>`), reset undone through "Poništi". The console's
  "Telefon" dialog shows the QR of the remote (toggle "Cela konzola").
  `izvodjenja/:id/daljinski` (`daljinski.page`): Nazad/Napred (each half the width, at least 25% of the screen height),
  notes, question controls, no `ZAVRSI` and no keyboard shortcuts. `data-access/dodir.ts`: a second tap of the same button
  within 300 ms is dropped (`performance.now()`), plus `vibriraj`. `data-access/budan-ekran.ts`: Screen Wake Lock,
  requested again on every return to the page, released on end/destroy; a visible warning when missing or refused. A
  command error shows in a `role="alert"` bar on the phone; 410 shows "Izvođenje je završeno.". Waking up:
  `data-access/povratak.ts` `pratiPovratak` calls the store's `posleVracanja` (always `GET stanje`, after >= 5 s hidden
  or `online` also `ponovoPovezi`, which drops a half-dead socket at once); while STOMP is not connected the remote polls
  `GET stanje` every 5 s (page visible only). Console and audience wake up the same way.
  **The remote is not a public route:** it stays behind basic-auth (the phone asks for user and password once, in the
  browser); it uses only the existing teacher API and STOMP `/api/ws`, and `javne-putanje.spec.ts` checks that the public
  regex does not cover it. E2E: `e2e/mock-izvodjenje.ts` (state machine of run 7, fixture `uzivo-izvodjenje.json`, routes
  `GET stanje`, `POST komande` and `GET slajdovi/:id/potezi` in `MockApi`), `e2e/lazni-stomp.ts` (fake STOMP broker over `page.routeWebSocket`, also
  used by `uzivo-javno`), `e2e/uzivo-nastavnik.ts` (teacher broker, Wake Lock stub), specs `uzivo-konzola` and
  `uzivo-daljinski` (360 x 740 long notes, double tap, 409/410/aborted command, sleep and wake).
- **PowerPoint import (phase 2):** `uvoz-pptx/` holds the import as pure TS functions without Angular (`paket`, `xml`, `tema`,
  `preset-boje`, `tipovi`, `kontekst`, `nasledjivanje`, `tekst`, `oblik`, `slika`, `tabela`/`tabela-stilovi`, `crtez`,
  `formula`/`omml-latex`, `png`, `animacije`, `prelaz`, `beleske`, `granice`, `ime-fajla`, `format-slike`, `slike`, `slanje`,
  `izvestaj`, `uvoz`; `slike` uses browser canvas APIs and is not loaded by the Node sample check, `format-slike` is its
  browser-free part; synthetic PPTX files for specs come from `pptx-fabrika.testing.ts`). The only
  entry from the rest of the app is `pages/uvoz-pptx-otvarac.ts` (`UvozPptxOtvarac`): a dynamic `import()` of
  `uvoz-pptx.dialog`, so the dialog, the modules and `fflate` (used only here) live in a lazy chunk and the main bundle and
  the editor carry none of it (`e2e/lenji-uvoz.spec.ts` checks it). The dialog analyses the file in the browser, shows the
  report, then sends slides and images through `slanje.ts`; `editor.store.primeniUvoz(prezentacija)` merges the result
  into the open editor (ids of existing slides stay, the first new slide is selected). A small hostile file must not hang
  the tab: building a slide stops past 300 layers or 400 animations (the slide then fails with the usual limit message), and
  a picture whose bytes are neither a server format nor BMP (`format-slike`) is skipped at conversion, never at send time.
  **`javno/` imports nothing from `uvoz-pptx/`** (`gfs/javna-ruta-uvozi` also forbids `fflate` there). Local check on real decks (outside `ng test` and CI,
  `*.uzorci.ts` read files with `node:fs`): `PPTX_UZORCI=<dir> npx vitest run --config vitest.uzorci.config.mts`; the
  samples are private and **never go into the repo** (not text, images or XML; fixtures are synthetic).
- **Slide editor, part 4a (phase 4: layers, shapes, images, properties, undo):** `editor-platna/` is the canvas editor
  of a PLATNO slide. The editor page renders it only inside `@defer (on immediate)` (one instance per slide, `@for ... track
  kljuc` (since 5c `kljuc:tip`)), so it is a lazy chunk: nothing outside `editor-platna/` imports it statically, and the host attribute
  `data-oznaka="gfs-editor-platna"` (`OZNAKA_EDITORA_PLATNA` in `oznake.ts`) marks the chunk. `e2e/lenji-editor.spec.ts`
  (no browser, over `dist/`) checks it with the helpers of `e2e/chunkovi.ts` and records sizes as test annotations
  (`velicina`): the initial closure (scripts and `modulepreload` of `index.html`, everything they import statically, plus
  the global stylesheet once) has no editor string from `e2e/nizovi-editora.ts` and stays <= 800 000 B (`BUDZET_POCETNO`,
raised by 5 kB for the teacher session, see "Prijava", and to 800 000 B for release tracking, see "Releases and stale tabs"); the editor page
  file (contains `uz-ed-zaglavlje`) <= 215 000 B; the editor's own closure (its closure minus initial and page closure)
  <= 450 000 B and <= 140 000 B gzip since 4b (it carries ProseMirror, the text editor of F12; 4a alone was
  <= 160 000 B). Public routes load none of it (`e2e/javna-mreza.ts` also checks every JS body for those strings).
  `PlatnoEditorStore` (per editor instance) holds the document, selection, hidden-in-editor layers, the active panel and
  the undo history (`Istorija`, 100 steps, same-key edits within 1 s merge; the history dies with the instance, so it is
  per slide and survives a draft getting its real id). A mouse gesture changes the document at most once per frame
  (`PoKadru`) and is one step on `pointerup`; Esc cancels it. After every recorded change the store calls its output
  **synchronously** (`postaviIzlaz` -> `EditorStore.izmeniPlatno(id, platno)`, which keeps the notes of the slide's last
  local command); the open gesture is flushed into the document through `EditorStore.registrujPraznjenje` before every
  save (`sacuvajOdmah`, `sacuvajSve`, `sacuvajPreIzlaska`, page `beforeunload`), on destroy, and (since 4b) in
  `EditorStore.izaberi` before `posaljiOdmah` of the slide being left. The PLATNO slide form only
  edits notes: the page always takes `platno` from the store (`izmenaForme`), never from the form. A new PLATNO slide is a
  front-end document (`data-access/platno-novo.ts`: empty, or title and body from the theme) and is sent at once.
  `data-access/platno-provera.ts` mirrors the server's `PlatnoPP` (limits, rounding, 1 MB): `greskeSlajda` checks only
  the cheap counts (the slide list runs it on every change), `greskeSlajdaZaSlanje` is the full check, called only right
  before a request. `EditorStore` registers in `RegistarCuvanja` as `prezentacija-<id>` with its **own** request counter
  (decremented unconditionally in `finalize`); writes after leaving the editor (including a draft edit that arrived while
  its POST was running) go through the closed session, and a failure off screen is a global message with group
  `'uzivo-cuvanje-pri-izlasku'`. Shortcuts (`tastatura-platna.ts`) work only while focus is on the canvas frame
  `.uz-ep-platno` (`role="group"`), never in inputs, tabs, menus or overlays; the exception is undo/redo (Ctrl+Z,
  Ctrl+Shift+Z, Ctrl+Y): the editor root (`app-platno-editor` host `keydown`) handles them anywhere in the editor (panels,
  toolbar, after a colour or switch change) with the same `uPoljuZaUnos` filter, and the frame leaves them to the root (no double undo); the only
  exception is a closed `mat-select` (`zatvorenIzbornik`): the root takes undo/redo there in the **capture** phase and
  stops propagation, because a closed select sends Shift+letter (also with Ctrl/Meta) to its typeahead, so Ctrl+Shift+Z
  would pick an option starting with "Z". Ctrl+S is handled before that
  check and still reaches the page; letters come from `key`, `[`/`]` from `code`. Inserting a layer focuses the frame. The
  keyboard path: select in the "Slojevi" panel, Shift+Tab to the frame, arrows; exact values in the "Svojstva" number
  fields. Row buttons of "Slojevi" keep fixed labels with `aria-pressed` and get the layer name through
  `aria-describedby`. Buttons that keep focus while disabled use `disabledInteractive`, which does **not** block the click on
  a `<button>` (Material blocks only `<a>`): every such handler checks the same condition as its `[disabled]` first and does
  nothing (toolbar, table panel, Pregled, animation list, page actions, import dialog; e.g. "Obriši red" over all rows must not
  report the 2880 limit, a grey "Poništi" must not end a text session); `disabledInteractive` without `[disabled]` is
  pointless. Locked layers can be selected (click, panel) and reordered but not moved, resized or deleted, and
  Ctrl+A skips them (and hidden ones); hiding is editor-only (not saved). Layout: the panels (280 px) sit right of the canvas
  when the editor is at least 760 px wide (container query `uz-ep`); then the canvas and the tab header are sticky at
  64 px (below the shell's 56 px sticky top bar; the header rule is global in `uzivo-editor.css`), so scrolling through a
  long panel keeps both on screen. For a PLATNO slide the slide list is 200 px, so this holds from a 1366 px window with
  the side nav (1366: canvas ~526 px, 1440: ~600 px); at 1280 the editor is 736 px and the panels go below a full-width
  canvas, as on a phone. `platno-prikaz`
  caches the prepared view per (layer object, index) in a `WeakMap`, so moving one layer rebuilds only that layer. Slide
  list thumbnails are `@defer (on viewport)` and `inert`. Two tabs editing the same slide: the last `PUT` wins (no
  version check on the backend). E2E: `e2e/uzivo-editor-platna.spec.ts` (mouse, keyboard only, image upload, undo per
  instance and from a panel, last `PUT` after Ctrl+S carries both canvas and notes with the page clock paused so the
  debounce cannot send it, layout at 1280/1366/1440/390 px), editor panels and the colour popover in `pristupacnost.spec.ts`.
- **Slide editor, part 4b (text, tables, formulas, animations, preview):** all of it lives in the lazy editor chunk except the formula
  view in `ui/` (phase 5a reuses it for `$...$` in question text, above). **Text** (`editor-platna/tekst/`): ProseMirror directly (not TipTap); the schema (`pm-sema.ts`) has `pasus` (paragraph
  attributes plus `prazanDeo` and `kljuc`), `prelom` (`\n`, PowerPoint's `a:br`) and **one** mark `stil` carrying all 8 attributes of a
  part; a tab stays the character `\t`. `pm-konverzija.ts` maps both ways without loss up to normalisation (empty parts of a non-empty
  paragraph dropped, neighbours of equal style merged). `prazanDeo` keeps the style of an empty paragraph, but only for paragraphs the
  user touched (`dodatakStila` compares node identity), so an untouched empty paragraph stays byte-identical. **Never change
  `node.attrs` in place** (defaults such as `uvlacenje` are shared and frozen): every change goes through `setNodeMarkup` with a new
  object. `prosemirror-view/style/prosemirror.css` is not imported (the needed rules are in `STIL_UREDJIVACA` under `.uz-ep-uredjivanje`;
  ligatures stay as in the display so lines wrap as on the projector). Pasting is plain text only (`nalepiTekst`); the limit of 50 000
  characters is counted in code points like the server (`codePointa`), and a refused change gives the cut back (`odbaciPresek`).
  **Paragraph keys** (`kljucevi-pasusa.ts`): animations of paragraphs follow a stable key `p<i>`, not ProseMirror's mapping (after Ctrl+Z
  the accumulated mapping still says "deleted"): Enter leaves the key with the part that holds the content, joining keeps the upper key,
  a new paragraph has none, history restores the node with its key; at the end of a session `preslikajAnimacije` moves the animation to the
  paragraph with its key and removes it (with a message) when there is none. **Session**: `PlatnoEditorStore.pocniUredjivanje` opens one
  `TekstUredjivacComponent` per layer or table cell (the cell's editor is the same component laid over the cell); a cut
  (`zabeleziTekst`) is one history step; `zavrsiUredjivanje` returns `false` while the cut is not accepted (limit, gesture running) and
  the session then stays open; flushing (`isprazni`, called through `registrujPraznjenje` before every save) is **idempotent** (no change
  since the last cut = nothing handed over). Inside a session Ctrl+Z is ProseMirror's history, also from the panels and the toolbar
  (`ponistiUTekstu`). **History boundary:** a cut accepted in the middle of a session (Ctrl+S, a frame change from the panel such as
  anchor, margin or wrap, copy) is already a canvas step, so the editor closes ProseMirror's history there and remembers its depth
  (`granica`, moved along when ProseMirror drops its oldest events past 120); no undo (in the text, panel, toolbar or root) goes
  below it: from the text, the panels and the toolbar alike the next undo ends the session and undoes the last canvas step (the
  frame change, then the cut; from the text focus then goes to the frame). Without any cut and without a ProseMirror step, Ctrl+Z
  in the text does nothing (Note F4b RF3). The browser's own Undo/Redo (menu "Edit", context menu, tablet gesture) arrives as
  `beforeinput` `historyUndo`/`historyRedo`, which `prosemirror-history` would run unbounded: `dodatakUndoPregledaca` (before
  `history()`) sends it to the same bounded undo. The panel keeps **one** `app-svojstva-teksta` for the session and after it
  (`panel-svojstva`, `tekst()`), so a Ctrl+Z on a panel control that ends the session does not destroy the focused control; if
  the focused control still disappears (the undone layer had the panel open), the root moves focus to the frame, never `body`.
  Undo/redo on a `mat-button-toggle` (`role="radio"`: alignment, anchor) also goes to the root (`uPoljuZaUnos(cilj, true)`);
  the radio group keeps arrows, Home and End. Redo during a session goes **only** to ProseMirror (nothing to redo = nothing
  happens: the session stays open and the canvas "redo" is not wiped by a cut; the toolbar "Ponovi" shows only ProseMirror's redo
  then). The tabs "Slojevi" and "Animacije" are disabled; **F6** (and Shift+F6) in the text or a cell moves focus to the first
  control of the text panel ("Font") without ending the session, and F6 from the panels returns to the text with the saved
  selection (`FokusPlatna.fokusPanela`, editor root `f6IzPanela`; announced in the editor's and the frame's `aria-describedby`);
  panel commands act on the saved selection. **The selection is
  taken from the DOM before a key command** (`dodatakIzboraIzDoma`, first plugin): Shift/Ctrl+arrows change the browser's selection and
  ProseMirror copies it to its state only on `selectionchange`, a separate task, so Backspace or Ctrl+B right after (or while the main
  thread is busy) acted on the old selection (without the plugin 3 of 10 e2e runs failed). The plugin copies only when both ends are
  inside the editor, the state's selection is a `TextSelection` (Ctrl+A here is `izaberiSav`, also a `TextSelection`, so it is
  covered too), they differ, both ends are in inline
  content and no IME composition runs. It does the same on `keyup` (skipped while composing): after the first focus of a new editor
  ProseMirror schedules a `setTimeout(20)` that writes the state's selection back into the DOM if the DOM differs from the last
  selection it saw, so when that timer runs late (busy CI) it undid a Shift+Home made before it; copying on keyup makes them equal.
  Lists: bullet `•` or `ARAPSKI_TACKA` from 1, indent `18 + 36 * level`, first line `-18` (PowerPoint
  body, 16:9); Tab at the start of a list paragraph (Shift+Tab) changes the level 0-8, elsewhere Tab writes `\t`. The editor does **not**
  change `METRIKA`: text typed in the editor lays out like the projector. History keys: `tekst-<field>:<selection>` (table:
  `...:<r1>-<k1>-<r2>-<k2>`), `animacija-<field>:<id>`, `tabela-sirina:<id>:<k1>-<k2>`, `tabela-visina:<id>:<r1>-<r2>`. A layer
  with `pasusi: []` (server, import) gets a fallback paragraph that already has the key `p0`, so opening and closing it without
  typing makes no step and no `PUT`.
  **Tables** (`tabela.ts`, pure functions tested as a table, every result passes `proveriKaoServer`): insert (popover "Tabela", 1-30 x 1-30,
  theme look resolved into cell colours), rows and columns (a row inserted through a merged cell grows it), merge (rectangular range widened
  to whole merged areas, the text of covered cells is appended to the anchor, like PowerPoint) and split, fill, borders, anchor, column
  width, row height; an action that would make the table wider or taller than 2880 or add a 31st row/column is **refused with a
  message**. Borders follow PowerPoint: `SVE` and `SPOLJNE` also write the same value to the facing side of the neighbour outside the range,
  `NIJEDNA` clears both sides, `SPOLJNE` and `UNUTRASNJE` touch only their own sides. A cell is selected by click (Shift+click widens),
  edited with double click or Enter/F2, Tab / Shift+Tab move between cells; the range also has four number fields in the panel (keyboard
  path). Cell rectangles are measured from the drawn `td[data-celija]` after rendering (`afterRenderEffect`, cached, never during a drag).
  **Formulas**: the dialog `editor-platna/formula/formula.dialog.ts` (`data-oznaka="gfs-formula-editor"`) is a dynamic `import()` from
  `FormulaOtvarac`, and `formula/mathlive-ucitavanje.ts` is the **only** import of full `mathlive` (the `<math-field>`; `fontsDirectory`
  points to the local `assets/mathlive/fonts/`, sounds off, no CDN: `angular.json` copies `mathlive-static.css` and the 20 KaTeX `woff2`
  there). The `<math-field>` and the plain "LaTeX" field are kept in sync both ways (the field is also the accessible alternative);
  "Sačuvaj" always clears `slikaIzvora`. Toolbar, editor root and panel each call `formulaEditora()`, but one guard per editor
  (`otvoreni`, keyed by its `PlatnoEditorStore`) allows one dialog at a time, also while its lazy chunk is still loading. When the
  component that opened the dialog is destroyed (slide change), the dialog closes (`OtvorenaFormula.zatvori`; a message when it
  had changes) and a dialog whose chunk is still loading never opens. The save check (`greskaFormule`, messages, `MAX_LATEX`) is in
  `formula/provera-formule.ts`, imported **only** by the dialog, so neither it nor `ui/formula-komande` is in the editor chunk. The static view is **not** in the editor: `ui/formula-markup.ts` is the only import of
  `mathlive/ssr` (`convertLatexToMarkup`), `ui/formula-ucitavanje.ts` its only dynamic `import()` (tokens `UCITAJ_FORMULE`,
  `UCITAJ_STIL_FORMULA`: one `<link data-gfs="mathlive">` and the KaTeX fonts, 3 s at most) and `ui/formula-prikaz.component.ts` the view
  `platno-prikaz` uses for a FORMULA layer without `slikaIzvora`; projector, console and editor therefore look the same, and `publika` /
  `konzola` preload module and style for the current and next slide (`preducitajFormule`). **A first slide with a formula may briefly show
  the LaTeX source** until module, style and fonts are loaded (it is also the fallback for invalid or too heavy LaTeX); that is accepted.
  MathLive's markup is never assigned as is, it goes through a **sanitizer by allow-list** (`ui/formula-sanitizer.ts`, no imports): elements
  `span`, `svg`, `path`, `line`, `polygon`; only the classes and SVG forms that **MathLive 0.111.1** emits (the class list was measured on
  ~170 formulas plus the literals in `mathlive-ssr.min.mjs`); style declarations with checked values (length or `calc(` with numbers,
  `#hex` colours, `position` only `relative|absolute`, never `url(`); a length limit of every value (200, paths 20 000) before any regex
  (no nested quantifiers, see the comment in the file); `MAX_MARKUP` 450 kB. **When MathLive is upgraded, measure the class and SVG lists
  again** (`formula-sanitizer.spec` "isti elementi i atributi kao sirov MathLive" shows what would be lost), and check the
  `mathlive/ssr` budgets of `e2e/lenji-formule.spec.ts` (own closure <= 365 604 B and <= 105 000 B gzip; on 0.111.1 it is
  348 195 / 102 932, so the gzip reserve is only ~2 kB). In front of it:
  `ui/formula-komande.ts` has the forbidden commands (the whole `\html…` family, `\href`, `\url`, `\style`, `\class`, `\cssId`, `\csname`)
  and `^^` (it can spell a backslash), one list for the regex and the dialog message; and `trosakFormule` (structural cost, one linear
  pass before MathLive): depth <= 32 (braces, `\bgroup`, `\left`, `\begin`, argument-taking commands), stretchy constructs inside each
  other <= 16, roots <= 32, structural commands <= 200, rows <= 100, columns in one matrix row <= 100 and cells of all matrices
  <= 2000 (LaTeX <= 5000 characters). `latexUMarkup` caches the sanitised fragment per LaTeX (`KesFormula`, LRU, 300 formulas and
  2 M characters of markup, a copy on every read), one cache per window shared by projector, console and editor, so the same formula on a
  slide (or the same slide drawn twice) is converted once. A formula over a limit, a markup over
  450 kB or an exception is **drawn as the LaTeX source**, and the dialog refuses to save it. **This protection exists only in the
  client**: the server (unchanged in 4b) still accepts and stores such LaTeX, and the projector then draws it as the source. The
  `math-field` receives LaTeX only if it passes the lists and `markupNepromenjen` (the sanitizer changes nothing in MathLive's own
  markup); `\mathtip` / `\texttip` make a `position: fixed` bubble and are therefore deleted by the sanitizer. The markup wrapper has
  `isolation: isolate` (`platno.css`): MathLive's `svg` for `\cancel`, `\bcancel`, `\xcancel`, `\enclose{…strike|…arrow}` carries
  `z-index: 2` and would otherwise paint above later layers and catch the pointer above the editor overlay. A formula may still
  draw **outside its layer box** (`\rule`, `\colorbox`, negative `\hspace`, as in LaTeX and PowerPoint) but never outside the
  canvas (`overflow: hidden`). Timing limits in the formula specs come from `ui/formula-vreme.testing.ts` (refused input 100 ms,
  input that goes through MathLive 1500 ms; CI is 2-3 times slower), and the fuzz (`formula-fuzz.testing.ts`, also wide matrices)
  checks the two classes separately.
  **Animations** (`animacije.ts` pure, panel `panel-animacije`): the list is in execution order (CDK drag-drop plus "Pomeri gore/dole" for
  the keyboard), a KLIK row shows its group number, the others are indented with the trigger icon, group 0 (before the first click) is
  marked "Kreće sama"; for a TEXT layer the target is the whole layer, "Po pasusima" (one KLIK per non-empty paragraph) or one paragraph.
  Defaults FADE, 500 ms, KLIK; ISCRTAJ is offered only for CRTEZ; a change of effect keeps `smer` and POJAVI = 0 valid like the server; a
  function that changes nothing returns the same object (no empty step). **A locked layer may still change its animations** (like its
  z-order, decision 14: locking keeps the look and content, the rest is slide layout).
  **Pregled** (`pregled.ts`, `pregled-platna.component.ts`, `PlatnoEditorStore.postaviRezim`): one toolbar button switches between
  "Uređivanje" and "Pregled"; the preview is the real `app-platno-prikaz` with the full document, with "Korak nazad/napred", "Pusti slajd"
  (all steps, 400 ms between groups, `planPustanja`), "Pusti od izabrane" (from the group before the selected animation; group 0 or 1
  plays the whole slide), "Zaustavi" and Esc; keys as in PowerPoint: right/down arrow, Space, PageDown and Enter step forward,
  left/up arrow, PageUp and Backspace step back (a `document` listener that reacts only to events from this editor or `body`, not
  already handled, without Ctrl/Alt/Meta, outside fields, menus and dialogs; Enter and Space on a button press the button). The
  toolbar's "Slika se otprema…" stays visible in Pregled (an upload started before it adds the image to the document shown). In Pregled the tools are removed, the tabs are disabled and their content is hidden by a
  **global** rule in `pages/uzivo-editor.css` (`.uz-ep-paneli--pregled .mat-mdc-tab-body-wrapper`): the inside of `mat-tab-group` is outside
  the component's encapsulation, the same reason as the sticky tab header rule next to it (that is the precedent); Ctrl+Z is ignored there.
  The group badges on the canvas (tab "Animacije" only) are drawn by the overlay.
  **Budgets** (`e2e/lenji-editor.spec.ts`, measured after the final wave of 4b): initial 781 794 B (<= 785 000), editor page file 208 350 B
  (<= 215 000), the editor's own closure 444 088 B / 131 002 B gzip (<= 450 000 / 140 000), `mathlive/ssr` 348 195 B (<= 380 000; it now
  also carries `ui/formula-komande`, which left the editor), the formula dialog 844 170 B (<= 900 000, counted with a "fence" in `potpunoZatvorenje`: files of initial + page + editor are neither counted nor followed,
  otherwise the dialog would drag in the editor's lazy chunks). Nothing of ProseMirror or MathLive is in the initial closure or the page
  file, and public routes load none of it (`NIZOVI_EDITORA`; `JavnaMreza` fails a public test on any `/assets/mathlive/` request
  unless the test sets `formule: true`, and then only `mathlive/ssr` may arrive, phase 5a).
  **Two tabs editing one slide: the last `PUT` wins**, with no version check (the backend has none; adding one is out of scope).
  **Known limitations:** a tab character in a table cell has no shortcut (Tab moves the cell); banding (`tabelaTraka`) is not recomputed
  after inserting a row, because the model carries resolved colours (decision 19); a neighbour merged across the edge of the range gets the
  border along its whole side; after a double click the caret goes to the end of the text; tab stops are not measured while typing (default 36 pt until the session ends); "Vrati 100%" (autofit) loses the
  caret and the ProseMirror history of the session; pasting into the `math-field` (`preUnosa`) checks the command lists but not
  `markupNepromenjen`; "Pusti od izabrane" for group 1 plays group 0 again (by contract); the first close of a text session normalises the
  whole layer (merges parts of equal style); the formula protection above is client-only.
  **PPTX import (animations):** the exit "Wipe" (preset 22) is mirrored, because PowerPoint keeps the entrance subtype for the exit ("From
  Bottom" hides the bottom part first, and PowerPoint keeps the "From …" label) while the canvas draws an exit as a reversed entrance; the proof is LibreOffice's source
  (`effects.xml`, `transitionfactorytab.cxx`), not PowerPoint itself. Saved documents are not changed: a deck imported earlier keeps the old
  direction (re-import it or change the direction in the panel). E2E: `uzivo-editor-platna.spec.ts` (block "4b, F19"), `uzivo-platno.spec.ts`
  (formula on projector and console), `pristupacnost.spec.ts`, `lenji-editor.spec.ts`.
- **Drawings as vectors (phase 5b; backend GFSSystem B1).** A CRTEZ layer that has `potezi` is drawn as SVG
  (`ui/crtez-potezi.ts`; in `platno-prikaz` a `[data-crtez="vektor"]` box with one `<path data-potez pathLength="1">` per stroke,
  `putanjaPoteza`) on the projector, the console and in the editor (Uređivanje, Pregled and the slide list thumbnails, which get
  the whole document through `slicica()`, `@defer (on viewport)` and the same path cache, so they never ask for strokes). The image (`medijId`, still required by the server) is the fallback (`[data-crtez="slika"]`) by **one rule:
  there is no drawable stroke** (`putanjeCrteza` is empty): `potezi` `null` or `[]`, only empty `tacke`, or only invalid strokes
  (`nacrtivPotez`: a coordinate not finite or beyond `MAX_KOORDINATA` 1e6, e.g. ±1e308 which the server accepts, thickness not finite
  or <= 0, colour not `#RRGGBB`); invalid strokes among valid ones are skipped. On the projector the image also shows until the
  strokes arrive. Paths are cached per `Potez[]` array (`putanjeCrteza`, `WeakMap`), so a new layer object with the same strokes
  (every snapshot, moving in the editor) does not rebuild `d` (~5 ms for 20 000 points); `PoteziCrteza` keeps the scaled array per
  entry and layer size for the same reason. **`CRTEZ_KAO_VEKTOR`** is the switch of the W1 gate (plan
  decision 7): `false` draws the image everywhere and ISCRTAJ as BRISANJE again (phases 1-4); it is set to `false` only if the
  visual check against PowerPoint's PDF gets worse with vectors. The whole gate (wrapper `staging/pptx-provera`, run locally with
  B1 in the stack): (a) and (b) pass as in phase 2, (c) >= 98.5 %, and CRTEZ layers out of tolerance < 7 (goal <= 2); a line
  "UPOZORENJE vektorski crteži" on stderr or in `izvestaj.txt` means a drawing was measured as the image, so that run does not
  count. **ISCRTAJ** over a
  vector draws stroke by stroke (`planIscrtavanja`, `kadroviPoteza`): strokes in record order (IZLAZ in reverse), each a
  `stroke-dasharray: 1 1` animation of `stroke-dashoffset` 1 -> 0 that starts when the previous one ends, `trajanjeMs` split in
  proportion to stroke length with at least `NAJKRACI_POTEZ_MS` (16) each (an infinite or NaN length or duration never reaches
  `animate`, which would throw in the middle of `pusti`; a second animation of the same layer in the group, e.g. ISCRTAJ IZLAZ after
  ISCRTAJ ULAZ, gets `fill: forwards` like every other branch), `opacity: 0` before its part (the round cap would leave a
  dot), `smer` ignored, `prefers-reduced-motion` 0 ms; `.uz-pl-sadrzaj` itself is not animated then. The InkML times are not used
  (the `Potez` model has no time and the phase 2 import does not keep it). A drawing shown as the image (no drawable stroke, the
  rule above) keeps BRISANJE through `clipPath`.
  **Why the snapshot has no strokes:** a drawing may hold 20 000 points and the snapshot goes out up to 4 times a second with the
  current and the next slide (phase 1 decision 6), so the server sends every CRTEZ with `potezi: null` (`SlajdMapper.bezPoteza`).
  `data-access/potezi-crteza.ts` `PoteziCrteza` (root, so one cache per window) fetches them with `GET api/slajdovi/{id}/potezi`
  (`PrezentacijeApi.potezi`, behind basic-auth, never under `/public`): `publika-scena` calls `ucitaj` for the current and the next
  slide (once per slide), `sledece-panel` only reads the cache (`saPotezima`). The key is `slojId|medijId` (a drawing pasted onto the
  same id never gets the old strokes), stored strokes are scaled to the layer size of the snapshot (`skalirajPoteze`, linear like
  `postaviKutiju`), and an error (404/500) keeps the image, warns once per failed request and asks again after `PONOVI_POSLE_MS` (10 s) **by itself**: the pause timer
  raises a signal that `ucitaj` reads, so the scene's effect runs once more even when no snapshot arrives (a quiet classroom still
  gets the vector); at most one attempt per pause, a new error starts a new pause, and after success nothing repeats (no loop). The cache has no bound (the slides this window has seen).
  **The phone gets none of it:** `javno/` does not import `potezi-crteza`, `uzivo.models` only `import type`s `Potez`, and
  `NIZOVI_CRTEZA` (`e2e/nizovi-editora.ts`) is checked in `lenji-formule.spec.ts` (build) and `uzivo-javno.spec.ts` (network).
  **Known limitations:** an ISCRTAJ that started over the image before the strokes arrived (group 0 of a slide whose strokes were
  not prefetched, e.g. a late-opened window or a GET slower than → after PRIJAVA, which otherwise prefetches the first slide; or a
  click right after entering) finishes as BRISANJE over the vector: the content stays the same element on purpose, so the running
  animation is neither cut nor restarted; the next run draws stroke by stroke. Within one group the content box and the stroke
  paths of the same layer are separate targets and are not chained: a FADE IZLAZ (the layer's first animation, `fill: both`)
  keeps the content at `opacity: 0` until the group ends, so a following ISCRTAJ ULAZ of the same layer in the same group is
  invisible and the whole drawing appears only at the end of the group (`cancel`); the other way round, after an ISCRTAJ IZLAZ
  (paths held at `opacity: 0`) an ULAZ of the same layer in the same group shows nothing until the group ends. The combination
  is rare, and phase 4 already had the same pattern (two animations of different properties on one target, e.g. FADE IZLAZ then
  BRISANJE ULAZ).
  E2E: slide 105 of run 7 (`uzivo-izvodjenje.json`) and slide 53 of presentation 5 (`prezentacije.json`) carry CRTEZ `crtez2` with 2
  invented strokes and one ISCRTAJ KLIK of 3000 ms; `MockIzvodjenje` strips strokes from the snapshot like the server,
  `GET slajdovi/:id/potezi` answers from the fixture, `MockApi.brojZahtevaPoteza` counts requests; `uzivo-platno.spec.ts` (block
  "5b": vector from exactly one GET, second stroke's delay = first's delay + duration; 500 -> image and no second request within
  the pause, waited on the 500 response itself (the image is also shown while the request runs); after the pause the request
  repeats by itself, with no new snapshot (`page.clock.fastForward`), and the vector appears; editor without any GET).
- **Convert to canvas (phase 5c; backend unchanged).** The INFO form has "Pretvori u platno" (`SlajdFormaComponent.pretvori`)
  and the page's `pretvoriUPlatno` turns the slide into PLATNO with **one** `izmeniSlajd` (`PUT` after 800 ms or Ctrl+S). The
  conversion is the pure function `data-access/pretvori-u-platno.ts` (`infoUPlatno`, plan decisions 20-21: `marked` lexer plus the
  phase 4 factories), loaded only through a dynamic `import()` on click (its own lazy chunk, 7 173 B / 3 288 B gzip on 2026-10-15, including the loss texts
  `OPISI_GUBITAKA`; the page file did not grow, `platno-novo` moved into a chunk shared by both; `lenji-editor.spec.ts` checks
  that the chunk is only imported dynamically and is outside the initial and page closures). Title -> TEXT `s1` (40 pt bold like the INFO title, theme title font and colour, same scale rule as the body), Markdown -> TEXT `s2` (lists
  with levels, markers in the theme's first accent like `li::marker`, numbering from `start` clamped to the server's 1-9999; a
  numbered list gets a hanging indent from its widest number (`visecaZaBroj`: 36 for one digit, 54 for two) instead of the editor's
  18, otherwise the number touches the text; bullets keep the phase 4 rule `18 + 36 * level` / -18; bold, italic, strike, code in Cousine, headings, line breaks; `okvir.skala` 0.25-1 for long
  text), image -> SLIKA `s3` (right column of 320 next to text, otherwise the whole area, contain; natural size through the token
  `ui/dimenzije-slike.ts` `DIMENZIJE_SLIKE`, waited for 3 s at most, 1600 x 900 when it cannot be measured), notes stay, `postepeno` -> one KLIK FADE per
  top-level list item (so the step count equals the INFO slide's), `$` stays text (INFO reads no formulas). **Lost** (`Gubitak`,
  texts `OPISI_GUBITAKA`): link addresses, images inside the text, tables (rows with tabs), horizontal rules, quotes (indented
  italic), and very long text (letters shrunk). Colours and fonts are resolved at conversion (phase 4 factories), so a later theme
  change no longer recolours the slide (an INFO slide follows the theme); the full list of known limitations is in the PR of 5c. **`ConfirmDialog` only when something is lost** (list of losses); a document
  `greskePlatna` (= `proveriKaoServer`) would reject (e.g. more than 400 list items with "Otkrivaj stavke") is not applied:
  a message with the server's reason, the INFO slide stays; an exception (or a chunk that does not load) goes to `ErrorHandler`
  with a message. After every conversion the 6 s snackbar "Slajd je pretvoren u platno." (group `uzivo-pretvori`) has
  **"Poništi pretvaranje"** (not "Poništi", which is the canvas toolbar's undo): `isprazni()` first (an open text session or
  gesture of the canvas editor goes into the document), then a second `izmeniSlajd` with the INFO command from the moment of
  conversion (title, text, image, `postepeno`, unsaved form edits) plus the notes as they are now; the image keeps its real name
  in the local view (`izmeniSlajd(id, cmd, slika)`). Canvas edits made in those 6 s are lost by design. One conversion per slide
  at a time (`pretvaranja`, from the click to confirm, cancel or error), so a double click never opens a second dialog; after the
  chunk wait the handler reads the slide again from the store (edits typed meanwhile, a draft that got its real id) and does
  nothing if it is no longer INFO or the editor was left; "Poništi pretvaranje" after leaving the editor only says that it is too
  late (the store is destroyed and no longer saves). Focus never falls to `body`: after the conversion it goes to the selected
  slide in the list (as after the PPTX import), after undo to "Pretvori u platno" of the new form (only while that slide is
  still selected). The middle column uses `@for ... track kljuc(id) + ':' + tip`, so a type change builds a new form and canvas
  editor (the form builds its controls once). E2E `uzivo-pretvori.spec.ts` (list with steps by keyboard, link with
  Odustani/Pretvori, focus after both, exact `PUT` counts), form and dialog in `pristupacnost.spec.ts`.
- **PDF import (phase 5d; backend and nginx unchanged).** The editor's "PDF" button (accessible name "Uvezi iz PDF-a", next to
  "PowerPoint") turns pages of a PDF into PLATNO slides. **The PDF never goes to the server** (only page images do) and **the app
  never asks for a password**: `getDocument` gets no `password`/`onPassword`, so pdf.js rejects a locked file with
  `PasswordException` -> "PDF je zaključan lozinkom…". `uvoz-pdf/` modules: `strane` (limits: PDF <= 100 MB, <= 200 pages
  per import, presentation <= 200 slides, page image <= 10 MB (`MAX_SLIKA_STRANE` = `MAX_SLIKA` of phase 2), PNG above 3 MB ->
  WebP 0.9 -> JPEG 0.9; contain in 1920 x 1080; slide = theme background + one locked SLIKA `s1` contain in 960 x 540, name
  `<file> - str. N` <= 60), `slanje-pdf` (`uveziPdf`: pages are drawn one by one while images upload, at most 3 uploads and 4
  images in memory, SHA-256 dedup, retries of phase 2 via `posaljiSliku`, then one `POST slajdovi/uvoz`; "Otkaži" works even
  in the middle of drawing; the abort observable is a small `new Observable` with `addEventListener`, **not rxjs `fromEvent`**:
  an rxjs operator nobody else uses lands in the shared rxjs chunk of the initial bundle as soon as lazy code uses it
  (+638 B once; `lenji-editor.spec.ts` forbids its string `Invalid event target` in the initial closure)), `pdf-crtac`
  (adapter over pdf.js, tested with a fake API; `verbosity: 0`, so pdf.js writes no `Warning: …` to the console for odd files;
  `spremanRadnik` waits for the worker's first message, because pdf.js does not wait for `ready` on a `workerPort`),
  `pdf-token` (`UCITAJ_PDFJS`, `NAPRAVI_PLATNO_PDF`), `pdf-ucitavanje` (the **only** importer of `pdfjs-dist`, once per tab),
  `pdf.worker.ts`, `uvoz-pdf.dialog` (lazy chunk, marker `gfs-uvoz-pdf`; imports nothing of `uvoz-pptx.dialog`/`uvoz`, so no
  `fflate`). The only entry is `pages/uvoz-pdf-otvarac.ts` (dynamic `import()`). pdf.js and the worker load only after a file is
  chosen. **`pdfjs-dist` is exactly 6.4.299, legacy build** (the modern build needs `Map.prototype.getOrInsertComputed`; no
  `eval` in 6.x). The worker is an **Angular web worker** (`webWorkerTsConfig`, `tsconfig.worker.json`, handed over as
  `GlobalWorkerOptions.workerPort`), not the `.mjs` copied from assets: nginx 1.27 of the frontend image has no `mjs` in
  `mime.types`, so a module worker would arrive as `application/octet-stream`; the hashed `worker-*.js` is already covered by the
  long-cache rule. pdf.js data is copied by `angular.json` to `assets/pdfjs/` (`standard_fonts`, `cmaps`, `iccs`, `wasm` only
  `jbig2*`/`openjpeg*`/`qcms*` and licences; never `quickjs-eval.*`, which is for scripts in PDFs), always same origin, never a
  CDN. Specs use `UCITAJ_PDFJS` instead of `vi.mock` and never import `pdf-ucitavanje` (its `new Worker(new URL(...))` would
  pull the worker into the unit-test build; `pdf-token.spec.ts` shows that importing the token is safe). pdf.js 6 shares one
  `PDFWorker` per port, so the dialog serializes shutdowns per tab (`gasenje`, at most 5 s per document, also for a document
  abandoned while it is still being read). `@napi-rs/canvas` comes in as an **optional** Node-only dependency of `pdfjs-dist`
  (no install scripts, never bundled: `browser: { canvas: false }`); do not drop it with `npm ci --omit=optional`, which would
  also drop esbuild's platform packages. The container's CSP (since MCP A1, "Markdown images and CSP") limits only `img-src` and
  `connect-src` (`'self'` is all pdf.js needs there); if `script-src` or `default-src` is ever restricted, PDF import also needs
  `worker-src 'self'` and `script-src 'self' 'wasm-unsafe-eval'`. E2E: synthetic PDFs from `e2e/fixtures/pdf-fabrika.ts`
  (no library: coloured rectangle and Helvetica "Strana N" per page; `zakljucanPdf` has an R2 `/Encrypt` whose `/U` does not
  match the empty password), `uvoz-pdf.spec.ts` (two pages 16:9 and 4:3 -> two `image/png` uploads and one import with
  `s1` {0, 0, 960, 540} and {120, 0, 720, 540}; nothing of PDF before the click, only the dialog after it, pdf.js and
  `worker-*.js` after the file; same-origin `assets/pdfjs/`; locked, not-a-PDF and "Otkaži" during an upload; console without
  warnings or errors, including the worker's), `lenji-pdf.spec.ts` (over the build: initial and editor-page closures without
  `nizoviPdf`, dialog only dynamic and its static closure without fflate or pdf.js, pdf.js file <= 520 000 B and only dynamic,
  `worker-*.js` <= 1 300 000 B and never `import`ed, student page cannot reach any of it; sizes as `velicina` annotations),
  dialog in `pristupacnost.spec.ts` (preview and sending, day and night).
- **Slide transition (phase 5e; backend GFSSystem B2, Flyway V10).** `SlajdCmd.prelaz` / `SlajdDetails.prelaz`
  (`Prelaz { efekat: FADE | GURANJE | BRISANJE; smer: LEVO | DESNO | GORE | DOLE | null; trajanjeMs }`, `null` = none) belongs to
  a slide of **any** type, not to the canvas document. `slajd-pravila`: `PRELAZ` (100-5000 ms, default 500), `normalizujPrelaz`
  (same as `SlajdPP.normalizuj(Prelaz)`: no effect -> `null`, FADE has no direction, otherwise DESNO), `PORUKE.prelaz` (the
  server's text), checked in `greskeSlajda` after the notes and before the type branch (so for PLATNO too); `slajdIzCmd`
  normalises it for the local view. **`PUT /slajdovi/{id}` is a full replacement, so a command without `prelaz` deletes it**:
  `slajdUCmd` copies it (`?? null`: a response or fixture without the field gives `null`, never a missing key), the form always
  sends its own fields, `izmeniPlatno`, duplicating a local (unsaved) copy and leaving the editor reuse the last command (a saved
  slide is duplicated by the server, which copies the transition), and "Poništi pretvaranje"
  sends the slide's **current** transition (changed in the PLATNO form after converting), like the notes. `EditorStore` and
  page specs cover each path (block "prelaz preživi svaki PUT"); `e2e/mock-api.ts` replaces it on PUT like the server, so an
  e2e PUT without it would lose it. The PDF import (`uvoz-pdf/strane.ts`) sends `prelaz: null`. **The PPTX import (F18)**
  maps `p:transition` in `uvoz-pptx/prelaz.ts` (`elementPrelaza`, `prelazSlajda`; read directly or from `mc:AlternateContent`:
  a `mc:Choice` only when every `Requires` prefix is p14, otherwise `mc:Fallback`): `p:fade` -> FADE, `p:push` -> GURANJE,
  `p:wipe` -> BRISANJE, `p:cut`/empty -> `null`, any other effect -> FADE plus `PRELAZ_SLAJDA` on that slide; `dir` is the
  direction of motion (`l` -> DESNO, `r` -> LEVO, `u` -> DOLE, `d` -> GORE, default `l`); duration from `p14:dur`, otherwise
  `spd` (fast 500, med 750, slow 1000), clamped to 100-5000; `advTm`/`advClick="0"` and `p:sndAc` are dropped with a
  `PRELAZ_SLAJDA` warning per slide (no more file-wide "transitions are not imported" warning; a deck with `advTm` on every
  slide gets one warning per slide). The
  form fields ("Prelaz na ovaj slajd": Efekat with "Bez prelaza", Smer only for GURANJE/BRISANJE, "Trajanje (s)" 0.1-5,
  "Pregledaj prelaz" -> `SlajdFormaComponent.pregledPrelaza`) live in `pages/prelaz-polja.component.ts`, rendered by the form
  in `@defer (on immediate)` with an `@error` line ("Polja prelaza nisu učitana…"), so they are a lazy chunk (~3 kB) and the
  editor page file grows only by the controls (~0.9 kB). "Trajanje (s)" is a **text** field (`inputmode="decimal"`, value
  shown with a decimal comma): `type="number"` gives an empty value for "0,8" in many locales, which became 0 ms;
  `slajd-pravila` `trajanjeIzSekundi` reads comma or dot (empty or invalid -> 0 ms -> `PORUKE.prelaz`), and the field itself
  shows the error (`mat-error`, `aria-invalid`) through an `ErrorStateMatcher` with the same 100-5000 ms rule;
  the controls stay in the slide form (`[formControl]`, the child cannot use `formControlName` across the component
  boundary) and the form passes the effect as a signal. Names: `ui/prelaz-slajda.ts` (`NAZIVI_PRELAZA`, `NAZIVI_SMERA_PRELAZA`).
  Specs: the form spec renders the block with `DeferBlockBehavior.Manual` + `render(Complete)`; `prezentacija-editor.spec.ts`
  imports the chunk once in `beforeAll`, otherwise its first (real) dynamic import could finish inside a `saLaznimSatom` test and
  leave the scheduler's timers behind. The phone gets nothing (`JavnoStanje` has no slide content).
  **Playing it (F17):** only in the audience window (`animiraj`), only without `prefers-reduced-motion` (`ui/kretanje.ts`
  `smanjenoKretanje`, shared with `platno-prikaz`) and only for exactly one slide forward (`platno-koraci` `napredNaSlajd`, the
  same rule as group 0: PRIJAVA -> first slide or index + 1, step 0, newer version, another slide). `publika-scena` draws the
  SLAJD branch in `.uz-scena-slajdovi` (grid, both wrappers in one cell, `.uz-scena-ulazni` above with `z-index: 1`; without a
  transition only the incoming wrapper exists, so the scene looks as before; these three rules are in the component's `styles`
  and copied in the preview dialog, **not** in the global `uzivo-izvodjenje.css`, so the initial bundle and the phone do not get
  them). The wrappers are an `@for` tracked by slide id (`omotaci`): the slide on screen **becomes the outgoing one in the same
  `app-slajd-prikaz` instance and element** (only its class, `aria-hidden` and inputs change), so its formulas, images and strokes
  stay drawn in the first frame (a new instance showed the LaTeX source for at least one frame; e2e checks every
  `MutationObserver` call). Every slide change therefore makes a **new** `app-slajd-prikaz` (before 5e the incoming wrapper
  kept one instance across slides); so that a new question (PITANJE -> PITANJE without a transition) and new options never show
  `$…$` for a frame, `app-tekst-formule` keeps the module per loader pair once module **and** style have loaded (`ucitani`,
  `WeakMap`, reset by `resetujStilTekstaFormule`) and a new instance starts with it, so the markup goes in during the first render
  (`uzivo-prelaz.spec.ts`, block "5e, M1"). FORMULA layers of the canvas (`formula-prikaz`) and "Ponovi" in the preview dialog
  still load asynchronously and may show the source for one frame. The outgoing slide (`aria-hidden`) is drawn from the
  **previous** snapshot's inputs (`ulaziSlajda`: phase, public result, correct answer, answer count, timer, code strip; strokes from
  the cache), and `ui/prelaz.directive.ts` (`[appPrelaz]`, `appPrelazZadrzi`, `appPrelazKraj`; the plan's contract called it
  `[uzPrelaz]`, renamed to the project's `app` prefix without an `eslint-disable`) runs one WAAPI animation per wrapper (`kadroviPrelaza`: only `transform`/`opacity`/`clip-path` of the whole wrapper, so formula
  `k` measuring, tab measuring and stroke paths inside see the same layout; translation is uniform, `getBoundingClientRect`
  differences stay the same). After the end the incoming animation is `cancel()`ed (no inline style, no animation left), the
  outgoing one keeps its last frame until its wrapper is removed. **Group 0 starts after the transition** (PowerPoint): while it
  runs the incoming slide is drawn at step -1 and `animacija` is `null`, then step 0 and the key arrive together. A snapshot that
  keeps view, slide and step (participant joins, new answer) carries the transition and group 0 on; any other snapshot or a
  reconnect epoch interrupts it (end state) and **never starts a new transition while one runs** (fast
  paging); a transition is only created when it will actually play (`animiraj`, no reduced motion), so "running" cannot stick.
  Known: three or more quick clicks alternate transition and cut (the interrupting snapshot clears the transition, so the next
  step may start one again); never two slides stuck on screen.
  The `zavrsen` key is read `untracked` in the `linkedSignal`, otherwise the end of the transition would recompute it and
  drop group 0. Editor: "Pregledaj prelaz" -> `pregledajPrelaz` (dynamic `import()` of `pages/prelaz-pregled.dialog.ts`, a
  lazy chunk of ~3.7 kB; page file +426 B on 2026-10-15) with the previous slide, the selected slide from the store (the
  form's transition before saving) and the theme; the dialog uses the same wrappers, directive and keyframes, plays on open,
  "Ponovi" = new key, a PLATNO previous slide is drawn after all steps, group 0 of a PLATNO slide plays after the transition,
  the form's duration is clamped to 0.1-5 s, `autoFocus: false` and focus on "Ponovi" (`afterNextRender`); a double click (or a
  click while the chunk loads, or with any dialog open) opens exactly one dialog (`pregledSeOtvara`, `openDialogs`). Specs fake
  `Element.prototype.animate` with a manually resolved `finished` (`cancel` rejects it, like WAAPI) and find the wrapper
  calls through `animate.mock.contexts`, with the wrapper's class recorded **at call time** (a wrapper changes class when it
  becomes the outgoing one); a fake `matchMedia` needs `addListener`/`removeListener` (CDK `BreakpointObserver`).
  **E2E (F19):** `e2e/uzivo-prelaz.spec.ts` over the live fixture (`uzivo-izvodjenje.json`: 104 GURANJE from the right 3000 ms,
  105 FADE 3000 ms with group 0 = title FADE 2000 ms after previous; 3 s so "transition running" surely exists while the test
  reads it). "Never two slides" reads a peak (`window.__vrhunac`, a `MutationObserver` on the scene installed **before** the
  command), not a sample; positive checks use `expect.poll` over `document.getAnimations()` targets (`.uz-scena-ulazni`,
  `.uz-scena-odlazni`, `.uz-pl-sloj`). Covered: forward with two wrappers then one, back (no transition), reduced motion,
  console, group 0 only after the transition, outgoing question with formulas and an image drawn in every frame, and the editor
  form (comma duration -> PUT 800 ms, field error, double click -> one preview dialog, focus "Ponovi", Esc). The synthetic PPTX
  (`e2e/pptx-uzorak.ts`) has `<p:push dir="u"/>` `spd="med"` on slide 2 (`uvoz-pptx.spec.ts`: `{GURANJE, DOLE, 750}`), and
  `pristupacnost.spec.ts` scans the transition fields (with the field error) and the preview dialog, day and night.
- **The canvas renderer intentionally follows PowerPoint** (calibrated in F19 against PowerPoint's PDF export; measured on
  Linux Chromium), not CSS defaults. A future slide editor must not "fix" these back: `ui/platno-metrika.ts` (`METRIKA`, the
  only place for these values) has no space-before on the first paragraph of a text box (`razmakPrePrvogPasusa: false`) and
  puts the whole extra line spacing above the baseline (`razlikaProredaIznad: 1`; measured for 85-100%, spacing above 100% is
  extrapolated); `platno.css` sets `text-rendering: geometricPrecision` on the whole canvas (exact glyph widths, otherwise
  lines wrap differently than in the PDF); `roundRect` radius is 16.667% of the shorter side; the arrowhead size comes from
  LibreOffice oox (`VRH_STRELICE` in `platno-prikaz.component.ts`), not measured; a highlighter drawing (`rasterOp` `maskPen`,
  `uvoz-pptx/crtez.ts`) gets 50% opacity like PowerPoint's PDF export. `ui/platno-tabovi.ts` measures every paragraph with a
  tab after drawing (tab stops as in PowerPoint; CSS `tab-size` differs), so tab paragraphs use `uz-pl-tab` spans.
- Styles are global (`uzivo-tokeni.css`, `pages/uzivo-editor.css`, `pages/uzivo-izvodjenje.css`, `javno/uzivo-javno.css`,
  `@use`d from `src/styles.scss`; class prefix `uz-`), so components stay under the style budget. Exception: rules only a lazy
  teacher screen needs (the transition wrappers of `publika-scena` and the preview dialog) go into that component's `styles`, so
  the initial bundle (and the phone, which loads the global stylesheet) does not carry them. Colours only through
  tokens; projector, console, editor preview and student pages are always day (`rezim-dan uz-dan`: `uz-dan` re-sets the
  text colour, which is inherited as a computed value). The black/white screens (keys B/W) are deliberately pure black and
  white. Destructive Material buttons use `.uz-opasno` (M3 ignores `color="warn"`); confirmations use the shared
  `ConfirmDialog`, and the editor's leave guard is the shared `unsavedChangesGuard` (`tekstNapustanja` gives its text).
- Zoneless: all state is signals (STOMP messages go through `patchState`, the timer interval sets a signal). Component
  specs that render Material form fields under `saLaznimSatom` provide `MATERIAL_ANIMATIONS` with
  `animationsDisabled: true`, otherwise MatFormField leaves 300 ms timers behind.

### Zadatak slide (banka phase 2)

Slide type `ZADATAK`: every phone gets its own random variant of a bank task, the console and projector show results per variant.
- **Editor:** `pages/zadatak-forma.component` + `pages/izbor-grupe.dialog` choose a node of the subject's PREDAVANJE bank through
  `core/api/banka-izbor.api.ts` (`CvorIzbora` over `GET banka/stablo`; `features/uzivo` never imports `features/banka/data-access`,
  `gfs/granice-featurea`), with timer and "broj različitih" (empty = all active). Warnings come from the server
  (`ZadatakSlajdaInfo.upozorenja`), the editor only shows them.
  The side preview and the slide list thumbnails show **one example variant** (`ZadatakSlajdaInfo.primerSvgId`, the SVG of the first
  candidate in draw order at the slide's level) instead of the plain description: `app-slajd-prikaz [primerZadatka]` ->
  `app-zadatak-prikaz [primer]`, only without run state. Only the editor sets it; the console's "Sledeće" panel never does (its
  screen is often mirrored to the projector), and the projector and phones never get the id (backend `ZadatakStanjeTest`).
- **Console / remote:** `pages/zadatak-panel.component` (count for the next opening, `BROJ_VARIJANTI` in CEKA, drawn variants with
  assigned/answered/correct), `Shift+R` = `RESENJE` (`tastatura.ts`; plain `r`/`R` stays `PONOVI`, so Caps Lock never shows the
  solution), the remote has the same toggle. A scored run (`PokreniCmd.boduje`) works with student login (the backend's
  `NalogIdentitet`): a phone without a student session goes to `nalog?nazad=uzivo/<kod>` and comes back; activities from a scored
  run (backend BE-8) are not recorded yet, so do not rely on it for grades.
- **Projector:** renders only `NastavnickiZadatak.javniRezultat` (`ui/zadatak-rezultat.component`, `ui/zadatak-prikaz.component`), whose
  numbers, correctness and solution follow three independent switches on the server; the console's `rezultat` is never on the
  projector. Two separate use cases (`PrikazZadatka`, chosen by `zadatak-prikaz.prikazRezultata`): results on (Space) and solution off
  = `odgovori`: no images, per variant only its name and per field the entered values as big chips (`app-cipovi-odgovora`, the same
  component as free-entry question results) in one wrapping row, most frequent
  first (`198 · 199 (2) · 51`, the count in parentheses only above 1), neutral until `TACAN`; then the correct value comes first, larger,
  with ✓ (a synthetic chip "niko" when nobody had it, so it is never lost behind wrong ones) and the wrong ones with ✗; variants nobody
  answered and paper variants are left out (one "Još nema odgovora." when none remain). Solution on (Shift+R), or only `TACAN` = `resenje`:
  task and solution images, the counters line and "✓ tačno: …", no chips; with both results and solution on the solution wins, and
  switching it off returns to the chips. Sizes are in `cqw` per column count (`kolone`). A field label is shown only when the variant
  has more than one field (`oznakaVidljiva`; old schemas and round snapshots carry "a) …" on single fields).
- **Phone:** `javno/zadatak-ekran` + `javno/zadatak-unos` (lazy, `@defer`) show the participant's own variant (`LicnoStanje.zadatak`:
  field labels through `oznakaNaTelefonu`: on a one-field schema a leading list marker `a) `, `(b) `, `1) ` is stripped, nothing else;
  SVG through `api/public/mediji/<own id>`, the fields of its schema), the outcome after closing, correct values only with `TACAN`
  and the solution only with `RESENJE`. They import only modules already allowed for `features/uzivo/javno` (the allow-list did not
  change). A scored run without a signed-in student (`prijavaObavezna && !prijavljenStudent`, or 403 on join) goes to
  `nalog?nazad=uzivo/<kod>`; after the code login `/nalog` returns to `uzivo/<kod>` (`javnoNazad`) and the phone joins under the
  student's own name without the name form (`e2e/nalog.spec.ts`, "bodovan uživo run").
- **Overview** (`pages/izvodjenje-pregled.page`): a ZADATAK round (`RezultatPitanja.zadatak`, `pitanje`/`rezultat` null) shows the group
  path, `app-zadatak-rezultat` (prikaz `sve`: images, solution, "tačno" line and the same compact chips, no bars) and the participants
  table (variant, column "Uneto" = what was entered per field from `UcesnikZadatka.uneto`, green with ✓ when correct and red with ✗ when
  not, `label: value` only for multi-field variants, `unetoUcesnika`; total). Round cards are
  keyed by slide id (`slajdId`, else the snapshot's `pitanje.slajdId` or `zadatak.slajdId`), never by group id.
- **Level (nivo, 1-3):** the slide form (`zadatak-forma.component`, `ZadatakSlajda.nivo`, `null` = all) has the shared `app-nivo` picker with
  "Svi" and the candidate count of every level (`ZadatakSlajdaInfo.brojAktivnihPoNivou`, also in the option's aria-label); the console
  panel (`zadatak-panel.component`, only in `CEKA`) picks the level for the next opening with `{tip:'NIVO', vrednost}` (`0` = all, `1..3`,
  `null` = as on the slide through the "Kao na slajdu (...)" button; the picker shows `nivoZaOtvaranje` from the server, so a 409 does not
  move it), and each drawn variant card shows its `nivo`; the overview shows the round level (`PregledZadatka.nivo`, only when `nivoi`
  is not empty, so a round from before levels shows none) and a level next to the participant's variant (`nivoi[varijantaId]`). No
  shortcut key: arrows on the radios are handled by the component (`SVOJA_TASTATURA` already skips `role=radio`). Phone and projector do not
  change (no level there).
- **Bundle budget exception:** the student page's static part grew by ~1.9 kB for the task (student login redirect, task screens in
  the store, the `@defer` entry must work before the lazy chunk), so `e2e/lenji-formule.spec.ts` allows `RAST_ZADATKA = 1 300` B on
  top of the old reserve; the task screen itself is a lazy chunk with its own budget. Accepted deliberately (plan FE-5). On
  2026-10-28 Novica approved another `REZERVA_2026_10_28 = 4 000` B of headroom (the closure was 117 512 of 117 518 B; the
  free-entry chips did not change the student page, results are drawn only by teacher views).

### Rang tačnosti (leaderboard)

Spec `docs/superpowers/specs/2026-10-28-rang-tacnosti-design.md` (deploy repo); backend rules in `GFSSystem/CLAUDE.md`, "Rang tačnosti". Order:
accuracy (an unanswered question is wrong), then average answer time, then ★ (question 1, task the variant's level). Teacher only, nothing public.
- **API:** `core/api/rang.api.ts` (`RangApi`: `izvodjenje`, `predavanje`, `student`, `grupa`; `prikazVremena` = "3,2 s"), in `core/api` because
  uživo, predavanja, studenti and grupe use it. Table: `shared/ui/rang-tacnosti-tabela.ts` (`RangTacnostiTabela`: place, name with optional
  student link and "gost" chip, accuracy "67% 2/3", average, ★, optional columns `poeni`/`izvodjenja`/`casova`; a row without a place is dimmed).
- **Console:** the card "Učesnici i rang" (`pages/rang-konzola.component.ts`) has tabs "Ovo pitanje" (`UcesniciPanelComponent`: who answered the
  current round, fastest first (`redosledOdgovora`), with time, ✓/✗ and the short answer; the rest below in join order), "Prezentacija" (`GET
  izvodjenja/{id}/rang`) and "Predavanje" (only when the run has a lecture). A rank tab loads only while it is open, on a change of round, phase,
  answer count, `TACAN` or participant count, at most once per 2 s (`RANG_OSVEZAVANJE_MS`, `throttleTime` leading + trailing).
  The tabs are plain ARIA tabs (`role="tab"`, arrows/Home/End) in the card's title row, **not `MatTabGroup`**: the card must not make the console
  taller than 768 px at 1366 x 768, or a page scrollbar narrows the mini projector and `e2e/uzivo-formule-tekst.spec.ts` (visible scrollbars) fails.
- **Projector:** `L` = `RANG_LISTA` (run rank, always allowed), `Shift+L` = `RANG_PREDAVANJA` (allowed when `imaRangPredavanja`); console buttons
  "Rang-lista" and "Rang predavanja". `PublikaScenaComponent` draws `javniRangTacnosti` with `ui/rang-tacnosti-projektor.component.ts` (title
  "Rang predavanja" for the lecture rank; it stays at KRAJ over "Hvala!"); in takmičenje `L` keeps the points list (`javnaRangLista`) and the podium.
- **Pages:** run overview (`izvodjenje-pregled`) has "Rang tačnosti" on top; the lecture page (`predavanja/ui/prezentacije-na-predavanju.ts`,
  store `PrezentacijePredavanjaStore.rang`) shows one report for one run with questions, the lecture aggregate (column "Izvođenja") for more, and
  polls every 10 s (`RANG_PREDAVANJA_OSVEZAVANJE_MS`, plain `setInterval`) while a run is in progress and the tab is visible; student links only on
  a finished lecture. Student profile tab `/studenti/:id/uzivo` (`StudentUzivoTab`: totals and one row per class with "2 od 4") and group tab
  `/grupe/:id/uzivo` (`GrupaUzivoTab`, roster rank with "Časova"); both filter by subject and school year locally (not in the URL).
- e2e: `e2e/mock-api.ts` answers the four endpoints with empty ranks (an unknown route fails a test).

## Banka zadataka (`features/banka`)

Bank of tasks (zadaci) per subject, written in LaTeX and rendered to SVG by the backend; teacher only, **nothing in it is public**
(no `javno/`, no public route, no backend endpoint under `/public` of its own; the only `api/public/` URL it reads is the existing
`api/public/mediji/{uuid}` for the rendered SVGs, unguessable UUIDs like the Uživo media, see `svgUrl`). Backend detail: `GFSSystem/CLAUDE.md`.
Since MCP A1 (spec `docs/superpowers/specs/2026-10-18-mcp-nastava-design.md` in `Novke/GFS-deploy`, sections 6.1-6.3) Claude fills
the bank with drafts through the backend's MCP server (`/mcp`, no front code); the front shows who made what, the excluded topics
and Claude's series, and reviews the drafts one by one (below).

- **Routes** (`banka.routes.ts`, loaded with `loadChildren` under the shell route `banka`, side nav entry "Banka zadataka",
  breadcrumbs "Nastava > Banka zadataka"; lazy on purpose, outside FE-4's file list: a static route table pushed the initial
  closure over the budget of `e2e/lenji-editor.spec.ts` (then 785 000 B; 790 000 B since the teacher session, see "Prijava"; after
  merging MCP and the Zadatak slide into prijava the initial closure is 789 083 B; 800 000 B since release tracking, 796 491 B), so nothing new goes into the initial chunk): `banka?predmet&namena&grupa` (tree + variants), `banka/pregled?predmet&izvor&serija&grupa&status&od`
  (draft review, title and last breadcrumb "Pregled nacrta"; declared before `grupe/:id`), `banka/grupe/:id` (group detail),
  `banka/varijante/nova?grupa=` and `banka/varijante/:id` (the same `VarijantaEditorPage`, optional `?povratak`). Ids must be numeric
  (`putanjaSaId`, otherwise 404 without an API call); the last two routes and `grupe/:id` carry `unsavedChangesGuard`.
- **`data-access/`**: `banka.models.ts` mirrors the backend `dto/banka/*` (same keys; commands are full-replacement `PUT`s, so nullable
  fields are always sent; the MCP fields `izvor` on groups, search rows and topics (variants have had it since phase 1), `serija`,
  `ikadOdobrena`, `zamenjuje`, `brojClaudeNacrta`, `iskljucena`, `iskljucenjeId` and the types `SerijaInfo`, `PonistavanjeInfo`/`StavkaPonistavanja`, `IskljucenaTemaCmd`/`IskljucenaTemaInfo` are the
  A1 contract, new backend fields are always appended at the end of the record); `banka.api.ts` (`BankaApi`, all calls accept
  `{ tiho: true }`; `pretraga` also sends `izvor` and `serija` and leaves out `predmetId` when it is `null` (every subject), plus `serije`, `odbaciSeriju` (series `encodeURIComponent`-ed),
  `iskljuceneTeme`, `iskljuciTemu` (no UI uses it) and `ukljuciTemu`); `banka.store.ts` (`BankaStore`, NgRx
  SignalStore provided by the `banka` page: tree, selected group, its variants, status and source filters (`filterStatusa`,
  `filterIzvora`; `imaFiltera`, `ocisti()` resets both), the subject's series and excluded topics (`serije`, `teme`: per subject, not
  per namena, loaded on a subject change and on a retry after an error; a failure empties the list, and both share one snackbar
  group); every change reloads the tree and the group, the series too when the subject has any, the topics after `ukljuciTemu` and,
  when the subject has topics, after deleting, renaming or moving a group (a topic's `putanja` or `grupaId` changes); while a create,
  duplicate or delete is in flight `zauzeto` disables those buttons); `pregled-nacrta.store.ts` (`PregledNacrtaStore`, draft review,
  below); `polja.ts` (pure field-schema and answer rules,
  mirror of the server `BankaPP`: same messages, same order; `prekrsajiPolja` lists every broken rule with its field and input,
  `prekrsajPolja` is the first); `greske.ts` (`TIHO` and `razlogBanke`, the one error-to-text mapping of the feature: 503 = the
  server's render-service message; 504 of a write (`razlogBanke(e, UPIS)`: create, save, status change, duplicate, delete, preamble
  `PUT`) = "Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja." because create and duplicate are not
  idempotent, 504 of a load or a re-render = "Zahtev je istekao, pokušaj ponovo."; anything else as `toApiError`); `render-proba.ts` (live preview, below); `poruka-posle-cuvanja.ts`
  (`PorukaPosleCuvanja`: one-shot, in-memory message a new variant leaves for its own edit page, keyed by variant id; not in
  `history.state`, which would resurface on reload and Back/Forward).
- **Pages**: `banka.page` (subject + Predavanja/Testovi toggle, `PreferencesStore` key `banka` remembers the choice; left tree, right
  variant cards; "Nova varijanta" only for a leaf with a difficulty `tezina`), `grupa-detalj.page` (name, description, difficulty,
  instructions and the **field schema** editor; a type of a field stays locked while the group has active variants, adding a field to such
  a group warns first and turns them into drafts), `varijanta-editor.page` (three columns: LaTeX tabs Tekst / Rešenje, live preview,
  answers + attachments), `pregled.page` (draft review, below). Both editing pages also ask on tab close and reload
  (`(window:beforeunload)` with the same condition as `unsavedChangesGuard`). A dialog opened from a ⋮ menu (tree or card) would
  restore focus to the removed menu item, so the pages put it back on that ⋮ button (cancel) or on the new/moved tree item
  (success), only when focus fell to `<body>`.
- **`ui/`**: `stablo-grupa` (WAI-ARIA tree, roving tabindex, F2 rename, context menu), `varijanta-kartica`, `polja-editor`,
  `odgovori-forma`, `latex-editor` (textarea with line-number gutter, error line highlight, Tab = two spaces, Ctrl+Enter = preview now),
  `svg-pregled`, `prilozi`, the sections `iskljucene-teme` and `serije` (shared `sekcije-stabla.css`), `odgovori-pregled` (read-only
  answers of the review), and the dialogs `grupa-dialog`, `premesti-dialog`, `preambula-dialog` (per-subject LaTeX preamble; after
  saving it calls `renderuj-sve` until `preostalo` is 0, at most 10 rounds, then offers "Nastavi renderovanje", as after an error;
  `renderovano` and `neuspelo` are summed over the rounds). `renderuj-sve` never demotes: a failed variant keeps its status and its last
  good SVG (the phone keeps using it), only `renderStatus` becomes `GRESKA`. So the dialog closes itself only when nothing failed;
  with `neuspelo > 0` it stays open with a warning ("N varijanti nije renderovano (greška u preambuli ili u samoj varijanti) ...")
  and focus moves to the preamble text, "Sačuvaj" saves a corrected preamble again (after a save it waits for a text change),
  and on close the page shows an error toast instead of success. The server counts each failed variant once per flow (it
  retries failed ones only when nothing is stale), so the dialog sums the rounds; there is no "Nastavi" after a complete round
  with failures. A preamble that does not compile is refused by `PUT` itself (400 "Preambula se ne kompajlira (linija N): ...",
  nothing saved, shown in the dialog's error strip).
  Field-schema errors in `polja-editor` sit in a polite live region (`role="status"`, always in the DOM): the first violation among
  the inputs the user has left (blur), and after a save attempt (click or focus on the `disabledInteractive` "Sačuvaj" of
  `grupa-detalj`, `otkrijGreske`) the first of all; the input it names gets `aria-invalid` and `aria-describedby` (through
  `MatInput`, not `attr.`).
- **Live preview**: `pregledUzivo` turns the form content into `POST api/banka/render-proba` (always `tiho`, errors are a state, never a
  snackbar). 800 ms of quiet before a request (`KASNJENJE_PREGLEDA`), the same content (JSON key) is not sent again, new content
  cancels both the wait and the request in flight (`switchMap` over `timer`). States `prazno | ceka | ok | greska | zauzet | nedostupan`;
  429 (busy: at most 3 at once per backend, `MAX_PROBA`, shared with MCP) is `zauzet` ("Render servis je zauzet, pokušaj za koji
  trenutak"), 503, 504 and no connection are `nedostupan` ("trenutno nije dostupan"), never a toast; any other error (e.g. 400 for a denied LaTeX command) is
  `greska` **without a line**; a real LaTeX error carries `linija` (relative to the part) and `deo` (`tekst | resenje`). When only the
  solution fails, the task SVG stays (the server sends it in `svg`; without it the last one shown is kept). **A saved variant does not
  spend a probe on open**: while text, solution and attachments equal the saved ones, the preview is the saved render
  (`SadrzajPregleda.sacuvan`: `svgId`/`resenjeSvgId` fetched as text through `BankaApi.svg`, i.e. `api/public/mediji/{id}`, falling back
  to a probe if that fails; a saved error in the text shows that error without a probe, while an error only in the solution still
  probes, so the task preview stays visible). The first edit (or Ctrl+Enter) starts probing.
  `vazecaGreska` gives the saved render error until the live one arrives, `panelZadatka`/`panelResenja` pick what each panel shows.
  The frame is 84 mm wide at most; in a narrower column (about 1100-1410 px viewports) the caption says "Umanjeno" instead of
  claiming phone width (a `ResizeObserver` on the frame).
- **SVG preview is never HTML.** `ocistiSvg` (in `svg-pregled.component.ts`) parses the server SVG with `DOMParser` and keeps only
  the elements and attributes `pdftocairo` emits (element allow-list, **attribute allow-list** `ATRIBUTI` plus `xlink:href`,
  `xmlns`/`xmlns:xlink`, `xml:space`, so `class`, `cursor`, `tabindex`, `data-*` and foreign namespaces are dropped: `class` plus the
  global CSS of `ViewEncapsulation.None` could stretch the SVG over the page; `style` property allow-list, `href` only `#id` or raster
  `data:image/*`, `url(#id)` / `rgb()` / transform functions only, no comments, PI or CDATA, no `on*`). The lists were checked
  against full real output of cairo 1.16 (render container) and 1.18 (TikZ automata, opacity, shadings, fadings, transparency
  groups, PNG: `mask`, `filter` + `feColorMatrix`, `radialGradient`); ids and their references
  get a per-panel prefix (text and solution share glyph ids). The result goes in with `importNode`; **never `innerHTML` or
  `bypassSecurityTrustHtml`**. Keep new SVG elements/properties out unless the render really needs them.
- **Attachments**: PNG, JPEG or PDF up to 10 MB through `POST api/banka/prilozi` (multipart `fajl`); the name LaTeX uses matches
  `^[a-z0-9_-]{1,60}$`, is not `dokument` and unique; "Ubaci u tekst" inserts `\includegraphics[width=\linewidth]{ime}` at the cursor of
  the active tab (the wrapper is `varwidth=84mm`, a bare image would overflow the phone). A PDF attachment is not served publicly.
- **Answers follow the group schema** (`odgovori`, one entry per field key, only the property of the field's type is set, the rest
  `null`): BROJ `{broj}` (decimal comma or point accepted, an invalid entry is `NaN` and counts as missing), TEKST `{prihvatljivi[]}`
  (1-10 answers of 1-200 chars; a chip is added by Enter or leaving the input, **never by a comma**: `(1,0)` or `q0, q1` are one
  answer; the TEKST field's checkbox "Zanemari vodeće nule" (`Polje.zanemariVodeceNule`, sent only when on, like the server stores
  it) makes `01111111` equal `1111111`: only where a leading zero does not change the result, never for complement or fixed width), JEDAN_TACAN `{tacna}` (option id), VISE_TACNIH `{tacne[]}`. Option ids are stable and **never
  reused**: a new option gets an id above every option the field has or had when saved (the server matches options by id, so a reused
  id would silently become another answer); a new field's key likewise never equals a key of a saved field, even one removed in the form.
- **Save semantics** (`VarijantaEditorPage.sacuvaj`): `POST`/`PUT` render synchronously (up to 2 x 30 s), so the form is disabled with
  a progress bar meanwhile. Only `renderStatus === 'OK'` (and, for "Sačuvaj i odobri", a successful `odobri`) navigates back to
  `/banka?predmet&namena&grupa` (or to the draft review in `?povratak`, below); anything else **stays on the page**, shows the
  message in the error strip and highlights the line of the part with the error (`renderGreska` + `renderDeo`). A new variant that
  fails to render already exists as a draft, so the page moves to `banka/varijante/:id` with `replaceUrl` (message via
  `PorukaPosleCuvanja`); a new variant that succeeds goes back to `/banka` with `replaceUrl` too, so Back does not reopen an empty
  "Nova varijanta" form. Buttons by status: NACRT "Sačuvaj kao nacrt"
  + "Sačuvaj i odobri", ARHIVIRANA "Sačuvaj" + "Sačuvaj i odobri", AKTIVNA only "Sačuvaj" (the server turns an active variant with
  a failed render back into a draft and the message says so; only `renderuj-sve` keeps the status). 503 on save = the server's
  "Render servis nije dostupan." plus "Varijanta nije sačuvana, pokušaj ponovo za koji minut."; 504 = the `razlogBanke` timeout text.
- **Source and series (MCP A1).** Groups, variants and excluded topics carry `izvor`: `RUCNO` (Novica in the UI) or `CLAUDE` (written
  through MCP); everything Claude writes carries `serija`, the label of one Claude job (`^[a-z0-9-]{3,60}$`, e.g. `uvoz-kol1-2024`; the
  server answers 400 "Serija mora imati 3 do 60 malih slova, cifara ili crtica." otherwise). Claude never changes an approved or a
  manual variant in place: the server makes a copy with `zamenjuje` = the original's id, and approving the copy archives the original
  in the same transaction (the front only reloads). `ikadOdobrena` stays `true` after a variant goes back to draft. UI: chip "Izvor"
  (Svi / Ručno / Claude) next to "Status" in the filter bar of a leaf ("Očisti filter" in the filter bar and in the empty list clears
  both); tree badge `bk-bedz-claude` "Klod: N" (`brojClaudeNacrta`, Claude's drafts, summed over the subtree like the other
  counters; also in the item's name through `opisBrojaca`); label "Claude" next to the status chip in the editor header. Below the
  tree (also below an empty tree: both lists are per subject, not per namena; on a narrow screen after the selected group) two
  sections that render nothing when empty: `app-iskljucene-teme` ("Isključene teme": description, group path or "bez grupe",
  "Uključi") and `app-serije` ("Klodove serije", newest `poslednja` first, counts of drafts, approved, groups and slides, time of the
  last write, link "Pregledaj" -> `/banka/pregled?predmet&serija`).
- **Excluded topics** (topics Claude must not offer): a topic over a group excludes that group **and its whole subtree**; a topic
  without a group is only a text for Claude (a topic the bank does not have yet). `iskljucena` on `GrupaCvor`/`GrupaDetails` means the
  group or an ancestor has a topic, `iskljucenjeId` is the topic of the nearest such node (own before an ancestor's). The tree dims
  such an item (`bk-iskljucen`, badge "Isključeno", "isključeno" in its name), the group page shows "Isključeno" and "Uključi" in its
  header. "Uključi" (list and group page) confirms with `potvrdiUkljucivanje` ("Uključi temu ponovo?" / "Klod je opet može nuditi.")
  and sends `DELETE iskljucene-teme/{id}`; on the group page that is the nearest topic, so a group under another excluded ancestor
  stays excluded, and only `iskljucena`/`iskljucenjeId` are taken from the re-read group (typed edits stay). When that nearest topic
  belongs to an ancestor (the page reads `GET predmeti/{id}/iskljucene-teme` first, `pretakIskljucenja`; a failed read is an error
  toast and no dialog), deleting it re-enables the ancestor's whole subtree, so the dialog names the ancestor ("Uključi celu grupu
  „X“?", "Ova grupa je isključena preko nadređene grupe „X“." and that the exclusion is lifted from X and its whole subtree, button
  "Uključi celu grupu"). In the list `BankaStore.temeUToku` holds the topics whose `DELETE` is in flight: their button waits
  (`disabledInteractive`, no dialog), a second call is ignored, and after success the topic leaves `teme` at once (before the
  reload), so a second `DELETE` (a 404) cannot be sent; after a failure it stays and can be retried. Focus that fell to `<body>`
  goes to the topic now in the removed one's place (or to the tree), on the group page to the name. **There is no form to add a
  topic** (spec decision): Novica tells Claude, which calls the MCP tool `iskljuci_temu`.
- **Draft review** (`pages/pregled.page`, `data-access/pregled-nacrta.store`; no "approve all" by design): one variant at a time. The
  filter comes from the query (`filterPregleda`: an invalid value means no filter, `status` defaults to `NACRT`, `serija` must match the
  server pattern); the MCP link (`<front>/banka/pregled?serija=<s>`) carries only the series, so without `predmet` the review covers
  every subject. The backend's `predmetId` is optional (`BankaFilter`: `BankaSpecs.predmet(null)` is no subject filter, an unknown id
  is an empty page, not 404), so that is **one** search without `predmetId` (`BankaFilter.predmetId: null`, which `BankaApi.pretraga`
  leaves out): no subject list from `ReferenceStore`, no request per subject. The list is
  `GET banka/pretraga` with `sort=id,asc` (creation order, stable while reviewing: the default `izmenjeno,desc` would move an edited
  variant to the front), pages of 100, at most 10 pages (1 000 variants, `NAJVISE_U_PREGLEDU`) in total, with or without a subject; more
  are not loaded, and when the server has more (`totalElements` of the first page) `skraceno` shows a note above the list
  ("Učitano je najviše 1000 varijanti, pa lista nije cela. ..."; the rest are the newest, they come after a reload). `grupa`
  (a group and its subtree) is filtered on the client by `putanja`. `od` (`pocetakPregleda`) starts at that variant or, when it has
  left the list (approved in the editor, deleted), at the first one created after it, or at the end when none is newer (Nazad returns
  the last). That deliberately departs from the plan's "otherwise from the first": after "Sačuvaj i odobri" in the editor the variant
  is no longer a draft, and starting from the first would bring back the drafts skipped before it. The page shows the
  group path, name (Claude writes the source into it, e.g. "Kol. 1, 2024/25, zad. 3"), status, source, series, task and solution SVG
  (`<img [src]="svgUrl(...)">` on a day canvas, or the LaTeX error with its line), the answers per field (`ui/odgovori-pregled`: BROJ
  "45 ± 0,1 m" or "45 kN ± 10 %", TEKST every accepted answer, JEDAN_TACAN / VISE_TACNIH the option texts), and for a copy the
  original next to it with "Zamenjuje: <name or #id>". Actions and keys: Odobri `O` (render OK and not AKTIVNA), Obriši `Delete`
  (immediately only for a Claude draft that was never approved, otherwise `ConfirmDialog`: deliberately stricter than the plan's
  "confirm only RUCNO", so an active, archived or ever-approved Claude variant asks too), Uredi `U`, Preskoči `→`, Nazad `←`; after
  approve or delete the variant leaves the list and the next one shows (approving a copy also drops its original, `zamenjuje`, which the
  server archived; otherwise `O` on it would approve it next to the copy); one deleted meanwhile (404) is skipped; actions run one at a
  time (`radi`), and an action's response after a new `ucitaj` is ignored. Keys do nothing while focus is in
  `input`/`textarea`/`select`/`[contenteditable]` or inside a CDK overlay (`.cdk-overlay-container`, e.g. the shell's theme
  `mat-menu`: a vertical menu neither handles `←`/`→` nor prevents letters, so they would act on the draft behind it), while any
  `MatDialog` is open (`openDialogs.length`), with Ctrl/Alt/Meta/Shift (Shift+O, Shift+Delete and Shift+arrows are not shortcuts; `O`
  under Caps Lock without Shift is) and on auto-repeat; letters on a Cyrillic layout are read by `e.code`, as in the uživo console. Progress "12 / 48" (`role="progressbar"`;
  a polite status region names the draft now shown). "Odbaci celu seriju" (only with `serija`) -> `POST banka/serije/{serija}/odbaci`:
  the server deletes the series' never-approved Claude drafts in every subject and group and the Claude groups left empty, approved
  and manual items stay and come back in `preskoceno`, presentations are untouched. The confirmation says exactly that and shows
  **no number** (the plan asked for one): the list is narrowed by `predmet`, `grupa`, `status` and the page limit and does not know
  `ikadOdobrena`, so its count could be far from what an irreversible action deletes, `SerijaInfo.nacrta` is per subject and counts
  ever-approved drafts too, and the dry run (`potvrdjeno: false`) exists only in MCP. Then the snackbar `porukaOdbacivanja`
  ("Obrisano: 2 varijante, 1 grupa." plus " Preskočeno: N.", with Serbian plural forms through `sRecju`: 1 varijanta, 2 varijante,
  5 varijanti; the plan's literal was "X varijanti, Y grupa") and the list again. After the last one:
  "Nema više nacrta." with a link to `/banka` (and "Nazad" while skipped ones remain); focus that fell to `<body>` after an action
  goes to that link. No animations under `prefers-reduced-motion`.
- **Return from the editor**: "Uredi" opens `banka/varijante/:id?povratak=<review URL with od=<id>>`. After a successful save the
  editor goes to `povratak` only when it is a `/banka/pregled` URL (`povratakNaPregled`, `^\/banka\/pregled(?:\?[^\\#]*)?$`; an
  external URL or another page falls back to `/banka`), so "Sačuvaj kao nacrt" returns to the same draft and "Sačuvaj i odobri" to
  the next one (the approved variant left the list, `pocetakPregleda`). A failed render stays in the editor as before.
- **Proxy timeout**: `docker/nginx.conf` `location ^~ /api/` sets `proxy_read_timeout` / `proxy_send_timeout` to **120s** (default
  60 s would cut a save of two slow renders plus upload). Create and duplicate are not idempotent, so a 504 followed by a retry would
  duplicate the variant. The WebSocket locations keep 3600s; the host nginx snippet has 300s.
- **Tests**: Vitest next to each file; subset `npx ng test --watch=false --include 'src/app/features/banka/**/*.spec.ts'`. Playwright
  `e2e/banka.spec.ts` (tree, groups, field schema, preamble, leave guard) and `e2e/banka-varijanta.spec.ts` (editor: live preview,
  save/approve, error line, attachments) run against the in-memory mock `e2e/mock-banka.ts` (routes registered in `e2e/mock-api.ts`,
  data `e2e/fixtures/banka.json`: subject 1, PREDAVANJE "Konverzije brojeva"). The mock renders everything except text containing
  `\foo` (error "Undefined control sequence \foo" on that line) or a subject preamble containing `\foo` (every render of the subject
  fails, without a line); like the server, `renderuj-sve` counts only successful renders in `renderovano`, reports `neuspelo` and
  keeps statuses, render-proba sends the task SVG when only the solution fails, and the default preamble has no `\documentclass`. It
  does not compile LaTeX, so the real renderer never runs in these specs. MCP A1 data in the fixture: group 4 "8 → 2 (Klod)" (CLAUDE,
  series `uvoz-kol1-2024`: 15 an active manual variant, 16-18 Claude drafts of the series, 16 `zamenjuje` 15), group 5 "Razlomljeni
  brojevi (demo)" (no variants, excluded by topic 1), topic 2 without a group; existing rows are `RUCNO` without a series. The mock
  serves `banka/serije`, `banka/serije/:serija/odbaci`, `predmeti/:id/iskljucene-teme` (GET, POST) and `iskljucene-teme/:id` (DELETE),
  answers `banka/serije` for an unknown subject with 404 "Predmet nije pronađen." (as `SerijaService.serije`),
  filters `pretraga` by `izvor` and `serija` (like the server: without `predmetId` over every subject, an unknown subject is an empty
  page, a non-numeric one 400) and sorts it like `PageableUtil` (an unknown `sort` field is 400), archives the original
  when a copy is approved, computes `brojClaudeNacrta`, `iskljucena` and `iskljucenjeId`, and sets a topic's `grupaId` to `null` when
  its group is deleted (`ON DELETE SET NULL`). `e2e/banka.spec.ts` also covers the source chip, "Uključi" and "Pregledaj";
  `e2e/banka-pregled.spec.ts` the review (series link without a subject, copy next to the original, `O` twice, "Uredi" and back to
  the same position, "Uredi" + "Sačuvaj i odobri" to the next one, keys, the end, the confirmation of a manual draft while keys do
  nothing, keys while the theme menu is open, "Odbaci celu seriju"); `pristupacnost.spec.ts` the bank with both sections, the excluded group page and three review
  states, day and night.

### Level of a variant (nivo)

`shared/ui/nivo.component` (`app-nivo`, also exports `NIVOI`, `opisNivoa`, `zvezdiceNivoa`): ★/★★/★★★ as SVG stars (tokens `--star`,
`--warn`, `--muted`; `aria-label` "Nivo N od 3 (lakši|srednji|teži)"; never "zvezdica" in UI text). Display mode is a `role="img"`;
`izbor` makes it a radio group (arrows, Home/End, roving tabindex, `stopPropagation` so page shortcuts do not react), `saSvima` adds
"Svi" (emits `null`), `brojevi` shows a count per level. The picker is controlled: the parent shows what it gets and reverts on error.
- **Where:** variant card (`varijanta-kartica`, output `nivoPromena`; stays above the whole-card link with `z-index: 1`), review
  (`/banka/pregled`: picker for the draft, display for the original, level filter `?nivo=` with `natpisTekst="Prikaži nivo"`), variant
  editor (new variant: default 2, sent in the create command; existing variant: PATCH at once).
- **Saving:** only `BankaApi.promeniNivo` = `PATCH banka/varijante/{id}/nivo` `{nivo}` (never `PUT`, which does not carry it).
  `data-access/promene-nivoa.ts` keeps the last confirmed level and the in-flight count per variant: the request queue is serialized
  (`concatMap`), the screen shows the chosen level at once and returns to the confirmed one after the last failed request (snackbar).
  The stores (`BankaStore`, `PregledNacrtaStore`) do not reload the tree after it. The group label "Težina" is now "Težina tipa" (the
  group's difficulty, not the variant's level).
- **Tests:** `e2e/banka-nivo.spec.ts` (card, review, filter, new and existing variant), `e2e/uzivo-zadatak-konzola.spec.ts` and
  `uzivo-zadatak-editor.spec.ts` (console and slide form); the mocks keep `nivo` per variant (`mock-banka.ts`, `PATCH`, `nivo` filter,
  `brojAktivnihPoNivou`) and the console mock handles `NIVO` (`mock-izvodjenje.ts`).

## Releases and stale tabs (`core/izdanje`)

A tab opened before a deploy keeps running the old build. It breaks the moment it asks for a lazy chunk the new build no longer
has (hashed names, 404: routes, `@defer`, every dialog and import opened with `import()`) or sends a request the new backend
changed. Real case (2026-10-28): a tab from 21.10 created a presentation "Iz PowerPointa", then the import chunk was a 404, so an
empty presentation stayed behind. The fix is one mechanism, not a guard per call site:

- **Release id.** `scripts/oznaci-izdanje.mjs` (Dockerfile, right after `ng build`) hashes `index.html` (it lists the hashed initial
  files, so the id changes exactly when the front changes; the same source built twice gives the same id) and writes it to
  `<meta name="gfs-izdanje">` in `index.html` (what this tab loaded) and `assets/izdanje.json` (what the server serves now;
  `assets/` is `no-store` in `docker/nginx.conf` and public in the staging regex, so phones read it too). `ng serve`, unit tests and
  the e2e build have no meta, and then `Izdanje` does nothing at all (no request, no listener).
- **`Izdanje`** (root, created by `provideAppInitializer`) reads `assets/izdanje.json` with `fetch` (`cache: 'no-store'`, outside the
  HTTP interceptors). It asks every 10 min while the tab is visible, on `visibilitychange` back to visible and on `online` (at most
  once a minute), and "hitno" (at most every 5 s) after a failed chunk: `NavigationError`, `GfsErrorHandler` (the app's `ErrorHandler`),
  an unhandled rejection and a 404 of a hashed file in Resource Timing (`responseStatus`; not in Safari). `izdanjeInterceptor` asks
  (normal rate) after a 4xx other than 401/403/409/429. A failed chunk is recognised by `jeGreskaUcitavanja` (Chromium, Firefox and
  Safari messages, also wrapped in `cause`/`error`/`reason`).
- **When a newer release is known:** the next navigation to **another path** (after the deactivate guards, `GuardsCheckEnd`)
  loads that URL fully from the server, so the teacher gets the new version without doing anything; a query-only change (list
  filters) never does. A route whose chunk fails loads its target URL fully, but only when the server really has a newer release (a
  missing chunk of the same release is a real fault: no reload, no loop). Never automatically while `NesacuvaneIzmene` has unsaved
  work, and at most once towards the same release within 5 min (`sessionStorage` `gfs.izdanje.osvezavanje`), so a cache or proxy
  that keeps serving the old page cannot loop. `IzdanjeTraka` (in `AppComponent`) shows "Dostupna je nova verzija GFS-a."
  with "Osveži" (plain reload; the browser asks when there is unsaved work) and "Kasnije" (hidden until an even newer release); not
  on routes with `data: { projekcija: true }` (lecture projector, onboarding QR, uživo audience), which are seen on the wall.
- **Everything of it lives in the initial bundle** (+6 974 B; the budget became 800 000 B): a stale tab cannot load any lazy chunk,
  so nothing here may be lazy, and nothing here may import a feature. Do not "optimise" it into a `@defer` or a dynamic import.
- **A flow that creates something before it needs a lazy chunk** must load the chunk first: "Nova prezentacija" -> "Iz PowerPointa"
  awaits `UvozPptxOtvarac.pripremi()` before `POST /prezentacije` (a failed load shows `PORUKA_UVOZ_NIJE_UCITAN` in the dialog and
  creates nothing; a dialog closed while it loads creates nothing either). Follow the same order in any new flow of that kind.
- **Tests:** `core/izdanje/*.spec.ts` (fake fetch through `DOHVATI_IZDANJE`, page loads through `UCITAVANJE_STRANE`),
  `e2e/izdanje.spec.ts` (a simulated deploy: the spec adds the meta to every document, serves `assets/izdanje.json` and answers 404 for
  chunks the tab has not loaded yet until the next full load; banner, next navigation, route with a missing chunk, a real fault with
  the same release, the PowerPoint flow, axe day and night) and `e2e/oznaci-izdanje.spec.ts` (the script and its Dockerfile step).

## Routes and paths

- Old routes (`predavanje/...`, `domaci/new`, `test/...`, ...) redirect to the new ones in
  `features/legacy-redirects.ts` until the end of the semester; printed QR codes and shared links use `upis/:token`
  and `uzivo/:kod`, which never change (the uživo teacher paths kept their pre-redesign URLs too).
- All URLs are **relative** (`api/...`, `assets/...`, `new URL('upis/' + token, document.baseURI)`): the app is built with
  a `BASE_HREF` (`/` on staging and prod, `/gfs/` historically), so never write root-relative `/api` or `/assets`.

## Markdown images and CSP

MCP A1 (spec 6.5): Claude writes slides through MCP, so a Markdown image may only point into GFS, and the browser enforces it.

- **Markdown** (`features/uzivo/ui/markdown.ts`: INFO `sadrzaj` through `renderMarkdown`, question text through `markdownSaFormulama`,
  two own `Marked` instances, raw HTML dropped) renders an image only when its resolved target is exactly
  `api/public/mediji/<uuid>` (`DOZVOLJENA_SLIKA`, lower-case UUID, relative to `<base href>`), in the inline form and in the
  reference form alike (`![a][r]` with `[r]: url`: `marked` resolves the reference first, so a reference to a GFS medium draws);
  `renderer.image` returns `''` for any other target in **both** instances (external URL, `data:`, another path, or a reference whose
  definition points there), so nothing is drawn and no request is made. Same rule as the backend (`SlajdPP` / `PrezentacijaService`: 400 "Slika u tekstu mora biti otpremljena u GFS.",
  and only media of kind `SLIKA`), which guards every write; the front rule is the second layer and covers rows written before the
  backend rule. Option text is plain text on the front (no Markdown images). `markdown.ts` is on the public allow-list (phone), so
  the regex lives in it with no new import.
  A new image source for slides means changing this regex, the backend rule and the CSP together.
- **CSP** of the frontend container: `img-src 'self' data: blob:; connect-src 'self' ws: wss:` (`docker/nginx.conf`, `add_header ...
  always` in `location /` **and** in the hashed-file location, because `add_header` is not inherited into a location with its own;
  `/api/` responses do not get it: they are JSON and media served by the backend, and the bank's render SVGs carry the backend's own
  CSP). It restricts only images and connections: images and `fetch`/XHR are limited to the app's own origin, but `ws:`/`wss:` are
  scheme sources, so a WebSocket to **any** host is allowed (uživo uses its own origin; narrowing it to explicit hosts would be a
  deliberate later change); scripts, styles, fonts and workers are deliberately free (MathLive, pdf.js and its web worker, the inline theme script of `index.html`). The same string is
  `CSP` in `e2e/csp.ts` (no imports: Node runs `e2e/staticki-server.ts` directly, and it sends `CSP` on every response, so every e2e
  spec runs under it). `e2e/csp.spec.ts` checks that `nginx.conf` has exactly that line in both locations and no other CSP header,
  that the browser enforces it (off-origin image and `fetch` refused), that the bank, the variant editor, the presentation editor
  with the canvas and the projector with a formula log no "Content Security Policy" message, and that a slide with
  `![x](https://primer.invalid/x.png)` makes no request to it on the projector (INFO) or the phone (PITANJE) while a GFS image still
  draws.
- **A new image or connection source** (a CDN, another API origin; a WebSocket host needs nothing while `ws:`/`wss:` stay) goes into
  `e2e/csp.ts` and both `add_header` lines of `docker/nginx.conf` in one change (`csp.spec.ts` fails otherwise), and is checked by
  running the whole e2e suite; restricting
  `script-src`/`default-src` would also need `worker-src 'self'` and `script-src 'self' 'wasm-unsafe-eval'` for PDF import (see
  "Uživo", phase 5d) and a check of MathLive. Never add an off-origin source just for a Markdown image: upload it into GFS instead.

## Design

Theme "Nacrt": `src/styles/_tokens.scss` is the only source of colours (`--bg`, `--surface`, `--ink`, `--primary`, ...),
day/night via `data-mode` on `<html>`, `.rezim-dan` forces day tokens (projector screens). The focus ring is always
`--focus`; dark shell bars use `.ljuska-tamna`, which switches `--focus` to `--side-focus`. No hex colours in
components. Check layouts at 390 px (no horizontal scroll from 360 px) and 1280 px, day and night.

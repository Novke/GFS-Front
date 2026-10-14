# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GFS-Front is the teacher tool of Građevinski fakultet Subotica (lectures, homework, tests, grade proposals, live
presentations "uživo") plus two public student areas (the intake form `upis` and the live student pages `uzivo`). The backend is `Novke/GFSSystem` (Spring Boot); deploy, staging and branching rules live in the
wrapper repo `Novke/GFS-deploy` (`CLAUDE.md`, `README.md`). This repo is **public**: no secrets, no real data.

## Stack

Angular 22, standalone components only, **zoneless** (`provideZonelessChangeDetection()`, no zone.js), OnPush
everywhere, signals + NgRx SignalStore (`@ngrx/signals`), Angular Material 22 (M3) on our own tokens, STOMP over WebSocket
(`@stomp/rx-stomp`) and `marked` for uživo, Vitest + jsdom
through `ng test` (no browser; `src/test-setup.ts` stubs canvas `getContext`, `Range.getClientRects` /
`getBoundingClientRect` and `document.elementFromPoint` for ProseMirror in jsdom, and a global `beforeEach` gives every spec
`UCITAJ_FORMULE` / `UCITAJ_STIL_FORMULA` loaders that never resolve, so a formula stays the LaTeX source unless the spec
provides its own), ESLint (angular-eslint) with two project rules
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
`e2e/staticki-server.ts` (SPA fallback, port 4300 or `E2E_PORT`) and every browser spec imports `test` from `e2e/fixture.ts`,
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
files too, e.g. a lazy chunk) gets 401 and fails the test, as on staging; `dozvoljeniApi` lists the allowed `/api/` calls.
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

`upis/:token` and `uzivo`, `uzivo/:kod` are opened by students on a phone **without basic-auth**, so they may only request
`assets/*` and `api/public/*` (`upis`: `api/public/upis/*`; uživo: `api/public/uzivo/*`, `api/public/mediji/*`,
`api/public/ws`); any other `/api/*` call returns 401 and pops the browser's password dialog. Both live in
`PublicLayout` (no shell; a wrong link under `/upis` or `/uzivo` stays a public 404). `gfs/javna-ruta-uvozi` enforces
this fail-closed: a public feature (`features/upis`, `features/uzivo/javno`) may import only itself plus
`dozvoljenoZa(feature)` in `eslint-rules/javna-ruta-konfig.js` = the shared list (`JAVNO_DOZVOLJENO`) plus a per-feature
addition (`DOZVOLJENO_PO_FEATURE`). The rule checks direct imports only, so every addition must be read together with its
own imports (the comment next to each entry says why it is safe). Never add teacher-shell code (stores, `core/state`,
shell, teacher API clients) to it. npm packages are free for public features except `ZABRANJENI_PAKETI_JAVNO` in the same
file (heavy slide-builder editor/import libraries, today `fflate`, the seven `prosemirror-*` packages and `mathlive`, with
`mathlive/ssr`; subpaths such as `fflate/esm` count too): the rule reports them as `zabranjenPaket`. The public part imports
nothing of the slide editor, the formula view or the PPTX import. Path for phase 5 (formulas on the phone): `DOZVOLJENO_PO_FEATURE['features/uzivo/javno']`
would get `ui/formula-prikaz.component`, `ui/formula-ucitavanje` and `ui/formula-markup` after reading their imports; `mathlive`
stays forbidden (the rule sees direct imports only, so the full `<math-field>` build can never enter public code that way);
the CSS and KaTeX fonts already sit under `assets/mathlive/`. On the backend, anything mapped under `/public/**` is reachable from the internet
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
  `prezentacije/:id/izvodjenja` and `izvodjenja/:id/pregled` in the shell; `izvodjenja/:id/publika|konzola|daljinski` in
  `ProjectorLayout`; `uzivo`, `uzivo/:kod` in `PublicLayout`. The last two layouts get `data: { celaStrana: true }` (no
  content frame), because these pages draw the whole screen themselves. `daljinski` also gets `pratiRezim: true`
  (`ProjectorLayout` then drops `.rezim-dan`, so the phone follows day/night); projector and console stay day.
- `javno/` may import exactly: `uzivo-putanje`, `data-access/uzivo.models`, `data-access/stomp`, `data-access/sat`,
  `data-access/razlog-greske`, `ui/format`, `ui/markdown`, `ui/opcija-oblik`, `ui/rang-lista.component`,
  `ui/tajmer.component` (and `lazni-sat.testing` in specs). Never `prezentacije.api`, `izvodjenja.api`, the stores,
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
  `GET stanje` and `POST komande` in `MockApi`), `e2e/lazni-stomp.ts` (fake STOMP broker over `page.routeWebSocket`, also
  used by `uzivo-javno`), `e2e/uzivo-nastavnik.ts` (teacher broker, Wake Lock stub), specs `uzivo-konzola` and
  `uzivo-daljinski` (360 x 740 long notes, double tap, 409/410/aborted command, sleep and wake).
- **PowerPoint import (phase 2):** `uvoz-pptx/` holds the import as pure TS functions without Angular (`paket`, `xml`, `tema`,
  `preset-boje`, `tipovi`, `kontekst`, `nasledjivanje`, `tekst`, `oblik`, `slika`, `tabela`/`tabela-stilovi`, `crtez`,
  `formula`/`omml-latex`, `png`, `animacije`, `beleske`, `granice`, `ime-fajla`, `format-slike`, `slike`, `slanje`,
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
  kljuc`), so it is a lazy chunk: nothing outside `editor-platna/` imports it statically, and the host attribute
  `data-oznaka="gfs-editor-platna"` (`OZNAKA_EDITORA_PLATNA` in `oznake.ts`) marks the chunk. `e2e/lenji-editor.spec.ts`
  (no browser, over `dist/`) checks it with the helpers of `e2e/chunkovi.ts` and records sizes as test annotations
  (`velicina`): the initial closure (scripts and `modulepreload` of `index.html`, everything they import statically, plus
  the global stylesheet once) has no editor string from `e2e/nizovi-editora.ts` and stays <= 785 000 B; the editor page
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
  view in `ui/`. **Text** (`editor-platna/tekst/`): ProseMirror directly (not TipTap); the schema (`pm-sema.ts`) has `pasus` (paragraph
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
  below it: from the text Ctrl+Z then does nothing, from the panels and the toolbar the next undo ends the session and undoes the
  last canvas step (the frame change, then the cut). Redo during a session goes **only** to ProseMirror (nothing to redo = nothing
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
  content and no IME composition runs. Lists: bullet `•` or `ARAPSKI_TACKA` from 1, indent `18 + 36 * level`, first line `-18` (PowerPoint
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
  (`otvoreni`, keyed by its `PlatnoEditorStore`) allows one dialog at a time, also while its lazy chunk is still loading. The static view is **not** in the editor: `ui/formula-markup.ts` is the only import of
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
  again** (`formula-sanitizer.spec` "isti elementi i atributi kao sirov MathLive" shows what would be lost). In front of it:
  `ui/formula-komande.ts` has the forbidden commands (the whole `\html…` family, `\href`, `\url`, `\style`, `\class`, `\cssId`, `\csname`)
  and `^^` (it can spell a backslash), one list for the regex and the dialog message; and `trosakFormule` (structural cost, one linear
  pass before MathLive): depth <= 32 (braces, `\bgroup`, `\left`, `\begin`, argument-taking commands), stretchy constructs inside each
  other <= 16, roots <= 32, structural commands <= 200, rows <= 100 (LaTeX <= 5000 characters). A formula over a limit, a markup over
  450 kB or an exception is **drawn as the LaTeX source**, and the dialog refuses to save it. **This protection exists only in the
  client**: the server (unchanged in 4b) still accepts and stores such LaTeX, and the projector then draws it as the source. The
  `math-field` receives LaTeX only if it passes the lists and `markupNepromenjen` (the sanitizer changes nothing in MathLive's own
  markup); `\mathtip` / `\texttip` make a `position: fixed` bubble and are therefore deleted by the sanitizer.
  **Animations** (`animacije.ts` pure, panel `panel-animacije`): the list is in execution order (CDK drag-drop plus "Pomeri gore/dole" for
  the keyboard), a KLIK row shows its group number, the others are indented with the trigger icon, group 0 (before the first click) is
  marked "Kreće sama"; for a TEXT layer the target is the whole layer, "Po pasusima" (one KLIK per non-empty paragraph) or one paragraph.
  Defaults FADE, 500 ms, KLIK; ISCRTAJ is offered only for CRTEZ; a change of effect keeps `smer` and POJAVI = 0 valid like the server; a
  function that changes nothing returns the same object (no empty step). **A locked layer may still change its animations** (like its
  z-order, decision 14: locking keeps the look and content, the rest is slide layout).
  **Pregled** (`pregled.ts`, `pregled-platna.component.ts`, `PlatnoEditorStore.postaviRezim`): one toolbar button switches between
  "Uređivanje" and "Pregled"; the preview is the real `app-platno-prikaz` with the full document, with "Korak nazad/napred", "Pusti slajd"
  (all steps, 400 ms between groups, `planPustanja`), "Pusti od izabrane" (from the group before the selected animation; group 0 or 1
  plays the whole slide), "Zaustavi" and Esc. In Pregled the tools are removed, the tabs are disabled and their content is hidden by a
  **global** rule in `pages/uzivo-editor.css` (`.uz-ep-paneli--pregled .mat-mdc-tab-body-wrapper`): the inside of `mat-tab-group` is outside
  the component's encapsulation, the same reason as the sticky tab header rule next to it (that is the precedent); Ctrl+Z is ignored there.
  The group badges on the canvas (tab "Animacije" only) are drawn by the overlay.
  **Budgets** (`e2e/lenji-editor.spec.ts`, measured on the 4b tip): initial 781 776 B (<= 785 000), editor page file 208 345 B (<= 215 000),
  the editor's own closure 445 326 B / 132 077 B gzip (<= 450 000 / 140 000), `mathlive/ssr` 343 565 B (<= 380 000), the formula dialog
  839 450 B (<= 900 000, counted with a "fence" in `potpunoZatvorenje`: files of initial + page + editor are neither counted nor followed,
  otherwise the dialog would drag in the editor's lazy chunks). Nothing of ProseMirror or MathLive is in the initial closure or the page
  file, and public routes load none of it (`NIZOVI_EDITORA`; `JavnaMreza` fails a public test on any `/assets/mathlive/` request).
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
  `@use`d from `src/styles.scss`; class prefix `uz-`), so components stay under the style budget. Colours only through
  tokens; projector, console, editor preview and student pages are always day (`rezim-dan uz-dan`: `uz-dan` re-sets the
  text colour, which is inherited as a computed value). The black/white screens (keys B/W) are deliberately pure black and
  white. Destructive Material buttons use `.uz-opasno` (M3 ignores `color="warn"`); confirmations use the shared
  `ConfirmDialog`, and the editor's leave guard is the shared `unsavedChangesGuard` (`tekstNapustanja` gives its text).
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

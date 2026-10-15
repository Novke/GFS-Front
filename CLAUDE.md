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
By default the fixture is strict (no JS with any `NIZOVI_EDITORA` string, `ML__latex` included, and no request under
`assets/mathlive/`: `upis` and uživo without a formula); `test.use({ formule: true })` (uživo with a formula, 5a) checks
`zabranjeniJavno` instead (`e2e/nizovi-editora.ts`: editor, ProseMirror, formula dialog and `NIZ_MATHLIVE_CEO`, i.e. the full
`mathlive`; `mathlive/ssr` is allowed) and lets `assets/mathlive/` through.
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

After a successful submit `upis` shows "Pridruži se WhatsApp grupi" when the `POST` response carries `waLink`; it renders
only a canonical `https://chat.whatsapp.com/<code>` (`waLinkZaPrikaz` in `upis.pravila`, the server enforces the same), so
the `href` is never an arbitrary URL. The teacher side lives on the group's Studenti tab: "Kontakti za telefon" is a plain
`<a download>` to `api/grupe/{id}/kontakti.vcf` (vCard; the phone offers the import into Contacts), "Pošalji WA link" is a
`mailto:` built by `mailtoWaLinka` (`core/api/grupe.models.ts`: shown students' addresses in BCC, RFC 6068 encoding) that
opens the teacher's own mail app, and `ui/wa-link-dialog` sets the link (`PATCH grupe/{id}/wa-link`).

## Uživo (`features/uzivo`)

Interactive presentation with live questions (spec `docs/superpowers/specs/2026-10-07-interaktivna-prezentacija-design.md`
in `Novke/GFS-deploy`). The server is the only source of truth: every change arrives as a whole snapshot with `verzija`
over STOMP; teacher commands are REST.

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
  (file with `NIZ_STUDENTA` minus the initial closure) <= `OSNOVA_STUDENTA` 108 218 + 8 000 B (114 615 B on 2026-10-15, after the
  fix wave of the final review; 113 568 B after F2 fix 3) and without `ML__latex`, editor strings, `tabelaZaglavlje`, `Carlito`
  or `--uz-formula-k` (only in `mera-formule`: the phone has no measuring code; ~2.4 kB, below the reserve, so the byte limit
  alone would not catch it); `mathlive/ssr` only dynamically imported, outside the
  initial and student closure, own closure <= measured + 5 % (348 195 B -> 365 604 B, never above 380 000) and <= 105 000 B
  gzip (102 932); `tekst-formule*.ts` never import `mathlive` nor contain `ML__latex`. Network of one formula on the phone
  (`uzivo-javno.spec.ts`, annotation `mreza-formule`; JS, CSS and woff2 after the question, app fonts from `media/` not
  counted): 404 112 B, limit measured + 10 % and never above 450 000 B; no `KaTeX_AMS*`/`KaTeX_Size*`, nothing off-origin.
  The editor page file is 211 166 B after 5a (<= 215 000; the form's formula check, ~1-1.4 kB, is the first candidate for a
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
  `putanjaPoteza`) on the projector, the console and in the editor (Uređivanje and Pregled have the whole document, so they never
  ask for strokes). The image (`medijId`, still required by the server) is the fallback (`[data-crtez="slika"]`) by **one rule:
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
  **Known limitation:** an ISCRTAJ that started over the image before the strokes arrived (group 0 of the first slide, or a click
  right after entering) finishes as BRISANJE over the vector: the content stays the same element on purpose, so the running
  animation is neither cut nor restarted; the next run draws stroke by stroke. Within one group the content box and the stroke
  paths of the same layer are separate targets and are not chained: after a content animation of the layer (e.g. FADE IZLAZ) the
  paths of a following ISCRTAJ get `fill: forwards` and are visible during their delay instead of starting hidden.
  E2E: slide 105 of run 7 (`uzivo-izvodjenje.json`) and slide 53 of presentation 5 (`prezentacije.json`) carry CRTEZ `crtez2` with 2
  invented strokes and one ISCRTAJ KLIK of 3000 ms; `MockIzvodjenje` strips strokes from the snapshot like the server,
  `GET slajdovi/:id/potezi` answers from the fixture, `MockApi.brojZahtevaPoteza` counts requests; `uzivo-platno.spec.ts` (block
  "5b": vector from exactly one GET, second stroke's delay = first's delay + duration; 500 -> image and no second request within
  the pause, waited on the 500 response itself (the image is also shown while the request runs); after the pause the request
  repeats by itself, with no new snapshot (`page.clock.fastForward`), and the vector appears; editor without any GET).
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

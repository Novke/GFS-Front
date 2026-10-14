import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, DestroyRef, DOCUMENT, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router } from '@angular/router';
import { catchError, debounceTime, filter, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { formatDatum } from '../../shared/util/datum.pipe';
import { formatIndeks } from '../../shared/util/indeks.pipe';
import { PORUKA_SISTEM, toApiError } from '../api/api-error';
import { PretragaApi, PretragaRezultat } from './pretraga.api';

/** Pauza posle poslednjeg znaka pre zahteva. */
export const DEBOUNCE_PRETRAGE_MS = 200;
/** Kraći upit server ne pretražuje. */
export const MIN_ZNAKOVA = 2;

export type GrupaRezultata = 'Studenti' | 'Predavanja' | 'Testovi' | 'Grupe';

/** Jedan rezultat u spljoštenoj listi kroz koju idu strelice (redosled: grupe pa stavke u grupi). */
export interface StavkaPretrage {
  grupa: GrupaRezultata;
  id: number;
  naslov: string;
  podnaslov: string;
  url: string;
}

export interface GrupaStavki {
  naziv: GrupaRezultata;
  /** Stavke sa svojim rednim brojem u spljoštenoj listi (`opcija-<indeks>`). */
  stavke: { indeks: number; stavka: StavkaPretrage }[];
}

const spoji = (...delovi: (string | null | undefined)[]): string => delovi.filter(d => !!d && d !== '—').join(' · ') || '—';

/** Rezultati servera u spljoštenu listu (Studenti, Predavanja, Testovi, Grupe); nedostajući nizovi su prazni. */
export function stavkeIzRezultata(r: PretragaRezultat | null): StavkaPretrage[] {
  if (!r) {
    return [];
  }
  return [
    ...(r.studenti ?? []).map((s): StavkaPretrage => ({
      grupa: 'Studenti',
      id: s.id,
      naslov: spoji(`${s.ime ?? ''} ${s.prezime ?? ''}`.trim()),
      podnaslov: spoji(formatIndeks(s.indeks, s.godina), s.grupa?.naziv),
      url: `/studenti/${s.id}`,
    })),
    ...(r.predavanja ?? []).map((p): StavkaPretrage => ({
      grupa: 'Predavanja',
      id: p.id,
      naslov: p.tema ? `Predavanje ${p.rb} · ${p.tema}` : `Predavanje ${p.rb}`,
      podnaslov: spoji(p.predmet?.naziv, p.grupa?.naziv, formatDatum(p.datum)),
      url: `/predavanja/${p.id}`,
    })),
    ...(r.testovi ?? []).map((t): StavkaPretrage => ({
      grupa: 'Testovi',
      id: t.id,
      naslov: t.tipTesta?.naziv ?? 'Test',
      podnaslov: spoji(t.predmet?.naziv, t.grupa?.naziv, formatDatum(t.datum)),
      url: `/testovi/${t.id}`,
    })),
    ...(r.grupe ?? []).map((g): StavkaPretrage => ({
      grupa: 'Grupe',
      id: g.id,
      naslov: g.naziv,
      podnaslov: spoji(g.godinaUpisa ? `upis ${g.godinaUpisa}` : null, g.brojStudenata != null ? `${g.brojStudenata} studenata` : null),
      url: `/grupe/${g.id}`,
    })),
  ];
}

/** Sledeći aktivan indeks pri strelici (kružno preko granica grupa); `n` = broj stavki. */
export function sledeciIndeks(trenutni: number, smer: 1 | -1, n: number): number {
  return n === 0 ? 0 : (trenutni + smer + n) % n;
}

type Stanje = 'prazno' | 'rezultati' | 'greska';

const ID_DIJALOGA = 'globalna-pretraga';

/**
 * Globalna pretraga (dijalog; Ctrl+K, Cmd+K ili `/` kad fokus nije u polju): upit se šalje posle {@link DEBOUNCE_PRETRAGE_MS} ms
 * i najmanje {@link MIN_ZNAKOVA} znaka, rezultati su grupisani (Studenti, Predavanja, Testovi, Grupe). Tastatura: strelice
 * gore/dole kroz sve rezultate (kružno, i preko granica grupa), Enter otvara aktivan rezultat, Esc zatvara.
 * Spisak je "svež" kad je za upit u polju (bez razmaka na krajevima) stigao odgovor; Enter na zastareo spisak ne radi ništa
 * (zato razmak na kraju ili izmena pa vraćanje ne gase Enter). U stanju greške Enter ponavlja zahtev. Dok traje novi zahtev,
 * stari rezultati ostaju prikazani, prigušeni (bez treperenja i skoka visine).
 * Dijalog otvara samo ljuska, pa javna ruta nikad ne zove `api/pretraga`.
 */
@Component({
  selector: 'app-globalna-pretraga',
  imports: [MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="polje">
      <mat-icon svgIcon="search" aria-hidden="true" />
      <input
        #polje
        type="text"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        aria-label="Pretraga"
        aria-autocomplete="list"
        placeholder="Student, indeks, tema…"
        aria-controls="pretraga-lista"
        [attr.aria-expanded]="prikaziListu()"
        [attr.aria-activedescendant]="aktivnaOpcija()"
        [value]="upit()"
        (input)="promena($event)"
        (keydown)="tipka($event)"
      />
      <kbd aria-hidden="true">Esc</kbd>
    </div>

    <div class="telo" [attr.aria-busy]="traje()">
      <!-- Uvek prisutan: čitač ekrana najavljuje promene (broj rezultata, "nema rezultata", greška, traženje). -->
      <span class="sr-only" role="status" aria-live="polite" data-status>{{ status() }}</span>
      <div id="pretraga-lista" role="listbox" aria-label="Rezultati pretrage" [class.zamucena]="traje()" [hidden]="!prikaziListu()">
        @for (g of grupe(); track g.naziv) {
          <div role="group" [attr.aria-labelledby]="'pretraga-grupa-' + g.naziv">
            <div class="grupa" [id]="'pretraga-grupa-' + g.naziv">{{ g.naziv }}</div>
            @for (s of g.stavke; track s.indeks) {
              <!-- Opcije combobox-a nisu fokusabilne: tastatura radi preko polja (strelice, Enter), klik je samo za miš. -->
              <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
              <div
                role="option"
                class="opcija"
                [id]="'pretraga-opcija-' + s.indeks"
                [class.aktivna]="s.indeks === aktivan()"
                [attr.aria-selected]="s.indeks === aktivan()"
                (click)="otvori(s.stavka)"
                (mousemove)="aktivan.set(s.indeks)"
              >
                <span class="naslov">{{ s.stavka.naslov }}</span>
                <span class="podnaslov">{{ s.stavka.podnaslov }}</span>
              </div>
            }
          </div>
        }
      </div>
      @if (stanje() === 'rezultati' && stavke().length === 0) {
        <p class="poruka" data-nema [class.zamucena]="traje()">Nema rezultata za „{{ pretrazeno() }}“.</p>
      } @else if (stanje() === 'greska') {
        <p class="poruka greska" data-greska [class.zamucena]="traje()">{{ greska() }} <span class="savet">Enter ponavlja pretragu.</span></p>
      } @else if (stanje() === 'prazno') {
        @if (traje()) {
          <p class="poruka" data-trazim>Tražim…</p>
        } @else {
          <p class="poruka" data-uputstvo>Upiši bar {{ minZnakova }} znaka: ime, prezime, indeks, temu ili grupu.</p>
        }
      }
    </div>

    <div class="podnozje" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd> izbor</span><span><kbd>Enter</kbd> otvori</span><span><kbd>Esc</kbd> zatvori</span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .polje { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .polje .mat-icon { flex: none; color: var(--muted); }
    input { flex: 1; min-width: 0; padding: 6px 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: 17px; }
    input::placeholder { color: var(--muted); }
    .polje:focus-within { box-shadow: inset 0 -2px 0 var(--focus); }
    kbd { padding: 1px 6px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface-2); color: var(--muted);
      font-family: var(--font-mono); font-size: 11.5px; }
    .telo { max-height: min(60vh, 460px); overflow-y: auto; padding: 4px 0 8px; }
    [hidden] { display: none; }
    .zamucena { opacity: .55; transition: opacity .15s; }
    .grupa { padding: 10px 16px 4px; color: var(--muted); font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
    .opcija { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; padding: 8px 16px; cursor: pointer; }
    .opcija.aktivna { background: var(--primary-soft); color: var(--primary-soft-ink); box-shadow: inset 3px 0 0 var(--primary); }
    .naslov { font-weight: 600; overflow-wrap: anywhere; }
    .podnaslov { color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
    .opcija.aktivna .podnaslov { color: inherit; opacity: .85; }
    .poruka { margin: 0; padding: 20px 16px; color: var(--ink-2); }
    .poruka.greska { color: var(--danger); }
    .savet { color: var(--muted); }
    .podnozje { display: flex; gap: 16px; padding: 8px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    .podnozje kbd { margin-right: 4px; }
    @media (max-width: 599.98px) { .podnozje { display: none; } }
    @media (prefers-reduced-motion: reduce) { .zamucena { transition: none; } }
  `,
})
export class GlobalnaPretraga {
  private readonly api = inject(PretragaApi);
  private readonly router = inject(Router);
  private readonly dialogRef = inject<MatDialogRef<GlobalnaPretraga>>(MatDialogRef);
  private readonly dokument = inject(DOCUMENT);
  private readonly polje = viewChild.required<ElementRef<HTMLInputElement>>('polje');

  protected readonly minZnakova = MIN_ZNAKOVA;
  protected readonly upit = signal('');
  protected readonly stanje = signal<Stanje>('prazno');
  protected readonly rezultat = signal<PretragaRezultat | null>(null);
  protected readonly greska = signal('');
  /** Upit za koji je prikazani spisak (za poruku "Nema rezultata"). */
  protected readonly pretrazeno = signal('');
  /** Zahtev je u toku (stari spisak ostaje prikazan, prigušen). */
  protected readonly traje = signal(false);
  protected readonly aktivan = signal(0);

  /** Poslednji upit koji je krenuo u pretragu (da isti upit ne ide dvaput; posle greške sme ponovo). */
  private poslednjiUpit = '';
  private readonly ponovi = new Subject<string>();

  protected readonly stavke = computed(() => stavkeIzRezultata(this.rezultat()));
  protected readonly grupe = computed<GrupaStavki[]>(() => {
    const redosled: GrupaRezultata[] = ['Studenti', 'Predavanja', 'Testovi', 'Grupe'];
    const sve = this.stavke();
    return redosled
      .map(naziv => ({
        naziv,
        stavke: sve.map((stavka, indeks) => ({ indeks, stavka })).filter(x => x.stavka.grupa === naziv),
      }))
      .filter(g => g.stavke.length > 0);
  });
  protected readonly prikaziListu = computed(() => this.stanje() === 'rezultati' && this.stavke().length > 0);
  protected readonly aktivnaOpcija = computed(() => (this.prikaziListu() ? `pretraga-opcija-${this.aktivan()}` : null));
  /** Spisak je za upit koji je sada u polju (razmaci na krajevima se ne računaju) i nema zahteva u toku. */
  private readonly svez = computed(() => this.stanje() === 'rezultati' && !this.traje() && this.upit().trim() === this.pretrazeno());
  /** Tekst za stalnu živu regiju. */
  protected readonly status = computed(() => {
    if (this.traje()) {
      return 'Tražim…';
    }
    switch (this.stanje()) {
      case 'rezultati':
        return this.stavke().length > 0 ? `${this.stavke().length} rezultata` : `Nema rezultata za ${this.pretrazeno()}.`;
      case 'greska':
        return this.greska();
      default:
        return '';
    }
  });

  constructor() {
    afterNextRender(() => this.polje().nativeElement.focus());
    const unos$ = toObservable(this.upit).pipe(
      map(u => u.trim()),
      debounceTime(DEBOUNCE_PRETRAGE_MS),
      filter(q => q !== this.poslednjiUpit || this.stanje() === 'greska'),
    );
    merge(unos$, this.ponovi)
      .pipe(
        tap(q => (this.poslednjiUpit = q)),
        switchMap(q =>
          q.length < MIN_ZNAKOVA
            ? of({ kraj: true, stanje: 'prazno' as Stanje, q, rezultat: null as PretragaRezultat | null, greska: '' })
            : this.api.trazi(q).pipe(
                map(rezultat => ({ kraj: true, stanje: 'rezultati' as Stanje, q, rezultat: rezultat as PretragaRezultat | null, greska: '' })),
                catchError((e: unknown) =>
                  of({
                    kraj: true,
                    stanje: 'greska' as Stanje,
                    q,
                    rezultat: null as PretragaRezultat | null,
                    greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM,
                  }),
                ),
                startWith({ kraj: false, stanje: this.stanje(), q, rezultat: this.rezultat(), greska: '' }),
              ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(s => {
        this.traje.set(!s.kraj);
        if (s.kraj) {
          this.stanje.set(s.stanje);
          this.greska.set(s.greska);
          this.rezultat.set(s.rezultat);
          this.pretrazeno.set(s.q);
          this.aktivan.set(0);
        }
      });

    // aktivna opcija ostaje u vidnom polju pri kretanju strelicama
    effect(() => {
      const id = this.aktivnaOpcija();
      if (id) {
        untracked(() => this.dokument.getElementById(id)?.scrollIntoView?.({ block: 'nearest' }));
      }
    });
  }

  /**
   * Otvara dijalog; ako je pretraga već otvorena, vraća nju. Dok je otvoren neki drugi dijalog (potvrda, izmena) ne otvara
   * ništa (`null`): Ctrl+K i `/` ne smeju da prekriju formu sa nesačuvanim izmenama.
   */
  static otvori(dialog: MatDialog): MatDialogRef<GlobalnaPretraga> | null {
    const postojeci = dialog.getDialogById(ID_DIJALOGA);
    if (postojeci) {
      return postojeci as MatDialogRef<GlobalnaPretraga>;
    }
    if (dialog.openDialogs.length > 0) {
      return null;
    }
    return dialog.open(GlobalnaPretraga, {
      id: ID_DIJALOGA,
      width: '640px',
      maxWidth: '94vw',
      position: { top: '10vh' },
      autoFocus: false, // polje preuzima fokus samo (afterNextRender), nezavisno od trenutka kad kontejner pokuša
      restoreFocus: true,
      ariaLabel: 'Globalna pretraga',
    });
  }

  protected promena(e: Event): void {
    this.upit.set((e.target as HTMLInputElement).value);
  }

  protected tipka(e: KeyboardEvent): void {
    if (e.isComposing) {
      return;
    }
    const n = this.stavke().length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (this.prikaziListu()) {
          this.aktivan.update(a => sledeciIndeks(a, e.key === 'ArrowDown' ? 1 : -1, n));
        }
        break;
      case 'Enter': {
        e.preventDefault();
        const stavka = this.stavke()[this.aktivan()];
        const q = this.upit().trim();
        if (this.svez() && stavka) {
          this.otvori(stavka);
        } else if (this.stanje() === 'greska' && !this.traje() && q.length >= MIN_ZNAKOVA) {
          this.ponovi.next(q);
        }
        break;
      }
    }
  }

  protected otvori(stavka: StavkaPretrage): void {
    this.dialogRef.close();
    void this.router.navigateByUrl(stavka.url);
  }
}

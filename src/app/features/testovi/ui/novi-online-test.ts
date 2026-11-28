import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { StudentPicker } from '../../../shared/ui/student-picker';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { Rezim, SablonInfo, StudentKratko } from '../data-access/online.models';
import { NAZIV_REZIMA, formatPoena } from '../data-access/online.pravila';

function danas(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Forma „Online test“ na `/testovi/novo` (plan 6, spec 8.1): grupa, tip, šablon (poslednji izmenjen za tip), datum, trajanje,
 * raspodela, broj grupa i spisak studenata (grupa čekirana, stariji nečekirani, „Dodaj studenta“ zajedničkim biračem) →
 * „Generiši“ (`POST test/online`) i prelaz na test (priprema). Tip testa se bira među postojećim tipovima predmeta šablona.
 */
@Component({
  selector: 'app-novi-online-test',
  imports: [FormErrorBanner, MatButton, MatCheckbox, MatIcon, MatProgressSpinner, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forma" data-online-forma>
      <app-form-error-banner [poruka]="greska()" />
      <div class="polja">
        <label class="polje">Predmet
          <select [value]="predmetId() ?? ''" (change)="postaviPredmet($any($event.target).value)" data-o-predmet>
            <option value="" [selected]="'' === (predmetId() ?? '')" disabled>Izaberi predmet</option>
            @for (p of reference.predmeti(); track p.id) { <option [value]="p.id" [selected]="(p.id) === (predmetId() ?? '')">{{ p.naziv }}</option> }
          </select>
        </label>
        <label class="polje">Grupa
          <select [value]="grupaId() ?? ''" (change)="grupaId.set($any($event.target).value ? +$any($event.target).value : null)" data-o-grupa>
            <option value="" [selected]="'' === (grupaId() ?? '')" disabled>Izaberi grupu</option>
            @for (g of reference.grupe(); track g.id) { <option [value]="g.id" [selected]="(g.id) === (grupaId() ?? '')">{{ g.naziv }}</option> }
          </select>
        </label>
        <label class="polje">Tip testa
          <select [value]="tipId() ?? ''" (change)="postaviTip($any($event.target).value)" [disabled]="predmetId() === null" data-o-tip>
            <option value="" [selected]="'' === (tipId() ?? '')" disabled>Izaberi tip</option>
            @for (t of tipovi(); track t.id) { <option [value]="t.id" [selected]="(t.id) === (tipId() ?? '')">{{ t.naziv }}</option> }
          </select>
        </label>
        <label class="polje">Šablon
          <select [value]="sablonId() ?? ''" (change)="postaviSablon($any($event.target).value)" [disabled]="!sabloni().length" data-o-sablon>
            <option value="" [selected]="'' === (sablonId() ?? '')" disabled>{{ sabloni().length ? 'Izaberi šablon' : 'Predmet nema šablona' }}</option>
            @for (s of sabloni(); track s.id) { <option [value]="s.id" [selected]="(s.id) === (sablonId() ?? '')">{{ s.naziv }} ({{ poeni(s.maxPoena) }} p.)</option> }
          </select>
        </label>
        <label class="polje">Datum
          <input type="date" [value]="datum()" (input)="datum.set($any($event.target).value)" data-o-datum />
        </label>
        <label class="polje">Trajanje (min)
          <input type="number" min="5" max="300" [value]="trajanje()" (input)="trajanje.set(+$any($event.target).value)" data-o-trajanje />
        </label>
        <label class="polje">Raspodela
          <select [value]="rezim()" (change)="rezim.set($any($event.target).value)" data-o-rezim>
            <option value="GRUPE" [selected]="'GRUPE' === (rezim())">{{ nazivRezima.GRUPE }}</option>
            <option value="POJEDINACNO" [selected]="'POJEDINACNO' === (rezim())">{{ nazivRezima.POJEDINACNO }}</option>
          </select>
        </label>
        @if (rezim() === 'GRUPE') {
          <label class="polje">Broj grupa
            <select [value]="brojGrupa()" (change)="brojGrupa.set(+$any($event.target).value)" data-o-broj-grupa>
              @for (n of [1, 2, 3, 4]; track n) { <option [value]="n" [selected]="(n) === (brojGrupa())">{{ n }}</option> }
            </select>
          </label>
        }
      </div>
      @if (predmetId() !== null && !sabloni().length && sabloniUcitani()) {
        <p class="napomena">Nema šablona za ovaj predmet. <a routerLink="/testovi/sabloni/novo" [queryParams]="{ predmet: predmetId() }">Napravi šablon</a>.</p>
      }

      <section class="studenti" data-o-studenti>
        <header class="glava">
          <strong>Studenti ({{ izabrani().size }})</strong>
          <button matButton="outlined" type="button" [disabled]="grupaId() === null" (click)="dodaj()" data-o-dodaj-studenta>
            <mat-icon svgIcon="person_add" aria-hidden="true" />Dodaj studenta
          </button>
        </header>
        @if (grupaId() === null) {
          <p class="napomena">Izaberi grupu i predmet.</p>
        }
        <ul class="lista">
          @for (s of studenti(); track s.id) {
            <li>
              <mat-checkbox [checked]="izabrani().has(s.id)" (change)="prebaci(s.id)" [attr.data-o-student]="s.id">
                {{ s.prezime }} {{ s.ime }} <span class="tiho">{{ s.indeks }}/{{ s.godina }}@if (s.stariji) { · stariji }</span>
              </mat-checkbox>
            </li>
          }
        </ul>
      </section>

      <div class="dugmad">
        <a matButton routerLink="/testovi">Odustani</a>
        <button matButton="filled" type="button" [disabled]="salje()" (click)="generisi()" data-generisi>
          @if (salje()) { <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Pravljenje" /> }
          Generiši test
        </button>
      </div>
    </div>
  `,
  styles: `
    .forma { display: flex; flex-direction: column; gap: 12px; max-width: 760px; padding: 20px 16px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .polja { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .polje { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .polje input, .polje select { min-height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px;
      background: var(--surface); color: var(--ink); font: inherit; font-weight: 400; }
    .napomena { margin: 0; color: var(--ink-2); }
    .napomena a { color: var(--primary); }
    .glava { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0 12px; margin: 6px 0 0; padding: 0; list-style: none; }
    .tiho { color: var(--ink-2); }
    .dugmad { display: flex; justify-content: flex-end; gap: 8px; }
    .dugmad mat-progress-spinner { display: inline-block; margin-right: 8px; }
  `,
})
export class NoviOnlineTest {
  readonly pocetniPredmet = input<number | null>(null);
  readonly pocetnaGrupa = input<number | null>(null);

  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly predmetId = signal<number | null>(null);
  protected readonly grupaId = signal<number | null>(null);
  protected readonly tipId = signal<number | null>(null);
  protected readonly sablonId = signal<number | null>(null);
  protected readonly datum = signal(danas());
  protected readonly trajanje = signal(45);
  protected readonly rezim = signal<Rezim>('GRUPE');
  protected readonly brojGrupa = signal(2);
  protected readonly sviSabloni = signal<SablonInfo[]>([]);
  protected readonly sabloniUcitani = signal(false);
  protected readonly studenti = signal<StudentKratko[]>([]);
  protected readonly izabrani = signal<ReadonlySet<number>>(new Set());
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly nazivRezima = NAZIV_REZIMA;
  protected readonly poeni = formatPoena;
  /** Forma je dirnuta (čuvar napuštanja). */
  dirnuto = false;

  protected readonly tipovi = computed(() => {
    const p = this.predmetId();
    return p === null ? [] : this.reference.tipoviTesta(p)();
  });
  /** Šabloni izabranog tipa prvo (najnoviji gore), pa ostali. */
  protected readonly sabloni = computed(() => {
    const t = this.tipId();
    const svoj = (s: SablonInfo) => Number(t !== null && s.tipTestaId === t);
    return [...this.sviSabloni()].sort((a, b) => svoj(b) - svoj(a) || b.izmenjeno.localeCompare(a.izmenjeno));
  });
  private sabloniSub?: Subscription;
  private studentiSub?: Subscription;

  constructor() {
    effect(() => {
      const p = this.pocetniPredmet();
      const g = this.pocetnaGrupa();
      untracked(() => {
        if (p !== null && this.predmetId() === null) this.postaviPredmet(String(p));
        if (g !== null && this.grupaId() === null) this.grupaId.set(g);
      });
    });
    effect(() => {
      const p = this.predmetId();
      untracked(() => this.ucitajSablone(p));
    });
    effect(() => {
      const g = this.grupaId();
      const p = this.predmetId();
      untracked(() => this.ucitajStudente(g, p));
    });
  }

  private ucitajSablone(p: number | null): void {
    this.sabloniSub?.unsubscribe();
    this.sviSabloni.set([]);
    this.sabloniUcitani.set(false);
    if (p === null) return;
    this.sabloniSub = this.api.sabloni(p, false, { tiho: true }).subscribe({
      next: l => {
        this.sviSabloni.set(l);
        this.sabloniUcitani.set(true);
        if (this.sablonId() === null) this.izaberiPoslednji();
      },
      error: () => this.sabloniUcitani.set(true),
    });
  }

  private ucitajStudente(g: number | null, p: number | null): void {
    this.studentiSub?.unsubscribe();
    if (g === null || p === null) {
      this.studenti.set([]);
      this.izabrani.set(new Set());
      return;
    }
    this.studentiSub = this.api.kandidatiStudenti(g, p, { tiho: true }).subscribe({
      next: k => {
        this.studenti.set([...k.grupa, ...k.stariji]);
        this.izabrani.set(new Set(k.grupa.map(s => s.id)));
      },
      error: (e: unknown) => this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM),
    });
  }

  /** Poslednji izmenjen šablon izabranog tipa (ili bilo koji kad tip nema svoj). */
  private izaberiPoslednji(): void {
    const s = this.sabloni()[0];
    if (s) this.postaviSablon(String(s.id));
  }

  protected postaviPredmet(v: string): void {
    this.predmetId.set(v ? Number(v) : null);
    this.tipId.set(null);
    this.sablonId.set(null);
    this.dirnuto = true;
  }

  protected postaviTip(v: string): void {
    this.tipId.set(v ? Number(v) : null);
    const s = this.sabloni()[0];
    if (s && s.tipTestaId === this.tipId()) this.postaviSablon(String(s.id));
    this.dirnuto = true;
  }

  protected postaviSablon(v: string): void {
    const s = this.sviSabloni().find(x => x.id === Number(v));
    this.sablonId.set(s?.id ?? null);
    if (s) {
      this.trajanje.set(s.trajanjeMin);
      this.rezim.set(s.rezim);
      this.brojGrupa.set(s.brojGrupa);
      if (this.tipId() === null && s.tipTestaId !== null) this.tipId.set(s.tipTestaId);
    }
    this.dirnuto = true;
  }

  protected prebaci(id: number): void {
    const s = new Set(this.izabrani());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.izabrani.set(s);
    this.dirnuto = true;
  }

  protected dodaj(): void {
    const g = this.grupaId();
    if (g === null) return;
    StudentPicker.otvori(this.dialog, { grupaId: g, iskljuci: this.studenti().map(s => s.id), naslov: 'Dodaj studenta', pocetniRezim: 'stariji' })
      .subscribe(lista => {
        const novi: StudentKratko[] = lista.map(s => ({
          id: s.id, ime: s.ime, prezime: s.prezime, indeks: s.indeks, godina: s.godina ?? 0, stariji: true,
        }));
        this.studenti.update(l => [...l, ...novi.filter(n => !l.some(x => x.id === n.id))]);
        this.izabrani.update(s => new Set([...s, ...novi.map(n => n.id)]));
      });
  }

  protected generisi(): void {
    const sablonId = this.sablonId();
    const grupaId = this.grupaId();
    const tipTestaId = this.tipId();
    const ids = [...this.izabrani()];
    const greska = sablonId === null ? 'Izaberi šablon.'
      : grupaId === null ? 'Izaberi grupu.'
      : tipTestaId === null ? 'Izaberi tip testa.'
      : !/^\d{4}-\d{2}-\d{2}$/u.test(this.datum()) ? 'Unesi datum.'
      : this.trajanje() < 5 || this.trajanje() > 300 ? 'Trajanje je od 5 do 300 minuta.'
      : ids.length === 0 ? 'Izaberi bar jednog studenta.'
      : ids.length > 300 ? 'Najviše 300 studenata.'
      : null;
    if (greska) {
      this.greska.set(greska);
      return;
    }
    this.greska.set(null);
    this.salje.set(true);
    this.api.napravi({
      sablonId: sablonId!, grupaId: grupaId!, tipTestaId: tipTestaId!, datum: this.datum(), trajanjeMin: this.trajanje(),
      rezim: this.rezim(), brojGrupa: this.rezim() === 'GRUPE' ? this.brojGrupa() : 1, studentIds: ids,
    }, { tiho: true }).subscribe({
      next: t => {
        this.dirnuto = false;
        void this.router.navigate(['/testovi', t.testId]);
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}

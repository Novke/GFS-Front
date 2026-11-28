import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { IzvorStavke, Rezim, SablonCmd, SablonDetails, StavkaSablona } from '../data-access/online.models';
import { greskaStavke, maxPoenaStavki, zvezdice } from '../data-access/online.pravila';
import { IzvorDialog } from '../ui/izvor-dialog';
import { HttpErrorResponse } from '@angular/common/http';

/** Lokalna stavka u editoru (izvori sa nazivima za prikaz). */
interface StavkaForme {
  kljuc: number;
  naziv: string;
  poeni: number;
  broj: number;
  nivoi: number[];
  istiTip: boolean;
  rucno: boolean;
  izvori: IzvorStavke[];
}

/** Zadržavanje pre `POST sabloni-testa/provera` dok nastavnik kuca. */
export const PROVERA_MS = 500;

let brojac = 0;
const novaStavka = (rb: number): StavkaForme =>
  ({ kljuc: ++brojac, naziv: `Zadatak ${rb}`, poeni: 5, broj: 1, nivoi: [], istiTip: false, rucno: false, izvori: [] });

const izDetalja = (s: StavkaSablona): StavkaForme => ({
  kljuc: ++brojac, naziv: s.naziv, poeni: s.poeni, broj: s.broj, nivoi: [...s.nivoi], istiTip: s.istiTip, rucno: s.rucno, izvori: [...s.izvori],
});

/**
 * Editor šablona online testa (`/testovi/sabloni/novo?predmet=`, `/testovi/sabloni/:id`; spec 7, plan 4.1): predmet, tip testa,
 * naziv, opis, trajanje, raspodela, broj grupa, prag, i stavke (naziv, poeni po zadatku, broj zadataka, nivoi ★, „isti tip“,
 * „ručno“, izvori iz stabla banke namene TEST). Kandidati i upozorenja se računaju uživo (`POST provera`, bez čuvanja).
 */
@Component({
  selector: 'app-sablon-editor',
  imports: [ErrorPanel, FormErrorBanner, MatButton, MatCheckbox, MatIcon, PageHeader, RouterLink, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (greskaUcitavanja(); as g) {
      <app-error-panel naslov="Šablon nije učitan." [poruka]="g" (ponovo)="ucitaj()" />
    } @else if (spreman()) {
      <app-page-header [naslov]="sablonId() ? 'Šablon: ' + naziv() : 'Nov šablon'" [podnaslov]="'Ukupno ' + ukupno() + ' poena · ' + stavke().length + ' stavki'">
        <div akcije class="akcije">
          <a matButton routerLink="/testovi/sabloni">Nazad</a>
          <button matButton="filled" type="button" [disabled]="salje()" (click)="sacuvaj()" data-sacuvaj-sablon>
            <mat-icon svgIcon="check" aria-hidden="true" />Sačuvaj
          </button>
        </div>
      </app-page-header>
      <app-form-error-banner [poruka]="greska()" />

      <section class="kartica osnovno">
        <label class="polje">Predmet
          <select [value]="predmetId() ?? ''" (change)="postaviPredmet($any($event.target).value)" data-predmet>
            <option value="" disabled>Izaberi predmet</option>
            @for (p of reference.predmeti(); track p.id) { <option [value]="p.id">{{ p.naziv }}</option> }
          </select>
        </label>
        <label class="polje">Tip testa
          <select [value]="tipTestaId() ?? ''" (change)="tipTestaId.set($any($event.target).value ? +$any($event.target).value : null); izmena()" data-tip>
            <option value="">Bez tipa</option>
            @for (t of tipovi(); track t.id) { <option [value]="t.id">{{ t.naziv }}</option> }
          </select>
        </label>
        <label class="polje siroko">Naziv
          <input [value]="naziv()" (input)="naziv.set($any($event.target).value); izmena()" maxlength="120" data-naziv />
        </label>
        <label class="polje siroko">Opis (za tebe)
          <input [value]="opis()" (input)="opis.set($any($event.target).value); izmena()" maxlength="500" />
        </label>
        <label class="polje">Trajanje (min)
          <input type="number" min="5" max="300" [value]="trajanje()" (input)="trajanje.set(+$any($event.target).value); izmena()" data-trajanje />
        </label>
        <label class="polje">Raspodela
          <select [value]="rezim()" (change)="rezim.set($any($event.target).value); izmena()" data-rezim>
            <option value="GRUPE">Po grupama (A, B, …)</option>
            <option value="POJEDINACNO">Svako svoj primerak</option>
          </select>
        </label>
        @if (rezim() === 'GRUPE') {
          <label class="polje">Broj grupa
            <select [value]="brojGrupa()" (change)="brojGrupa.set(+$any($event.target).value); izmena()" data-broj-grupa>
              @for (n of [1, 2, 3, 4]; track n) { <option [value]="n">{{ n }}</option> }
            </select>
          </label>
        }
        <label class="polje">Prag prolaza (poeni)
          <input type="number" min="0" [value]="prag() ?? ''" (input)="postaviPrag($any($event.target).value)" data-prag />
        </label>
      </section>

      @if (provera()?.upozorenja?.length) {
        <ul class="upozorenja" data-upozorenja-sablona>
          @for (u of provera()!.upozorenja; track $index) { <li>{{ u }}</li> }
        </ul>
      }

      @for (s of stavke(); track s.kljuc; let i = $index) {
        @let pr = provera()?.stavke?.[i];
        <section class="kartica stavka" [attr.data-stavka]="i + 1">
          <header class="glava">
            <strong>{{ i + 1 }}.</strong>
            <input class="naziv" [value]="s.naziv" (input)="menjaj(i, { naziv: $any($event.target).value })" aria-label="Naziv stavke" data-naziv-stavke />
            <span class="razmak"></span>
            <button matButton type="button" [disabled]="i === 0" (click)="pomeri(i, -1)" aria-label="Pomeri gore"><mat-icon svgIcon="arrow_upward" aria-hidden="true" /></button>
            <button matButton type="button" [disabled]="i === stavke().length - 1" (click)="pomeri(i, 1)" aria-label="Pomeri dole"><mat-icon svgIcon="arrow_downward" aria-hidden="true" /></button>
            <button matButton type="button" class="opasno" [disabled]="stavke().length === 1" (click)="ukloni(i)" data-ukloni-stavku>Ukloni</button>
          </header>
          <div class="red">
            <label class="polje malo">Poena po zadatku
              <input type="number" min="1" max="100" [value]="s.poeni" (input)="menjaj(i, { poeni: +$any($event.target).value })" data-poeni />
            </label>
            <label class="polje malo">Broj zadataka
              <input type="number" min="1" max="20" [value]="s.broj" (input)="menjaj(i, { broj: +$any($event.target).value })" data-broj />
            </label>
            <fieldset class="nivoi">
              <legend>Nivoi (prazno = svi)</legend>
              @for (n of [1, 2, 3]; track n) {
                <mat-checkbox [checked]="s.nivoi.includes(n)" (change)="prebaciNivo(i, n)" [attr.data-nivo]="n">{{ zvezdice(n) }}</mat-checkbox>
              }
            </fieldset>
            <mat-checkbox [checked]="s.istiTip" (change)="menjaj(i, { istiTip: $event.checked })" data-isti-tip>Isti tip za sve zadatke stavke</mat-checkbox>
            <mat-checkbox [checked]="s.rucno" (change)="menjaj(i, { rucno: $event.checked })" data-rucno>Pregledam ručno</mat-checkbox>
          </div>
          <div class="izvori">
            <span class="oznaka">Izvori:</span>
            @for (iz of s.izvori; track iz.grupaId) {
              <span class="izvor" [class.obrisan]="iz.obrisan">{{ iz.putanja.length ? iz.putanja.join(' › ') + ' › ' : '' }}{{ iz.naziv }}
                <button type="button" class="x" (click)="ukloniIzvor(i, iz.grupaId)" [attr.aria-label]="'Ukloni izvor ' + iz.naziv">×</button></span>
            }
            <button matButton="outlined" type="button" [disabled]="predmetId() === null" (click)="dodajIzvore(i)" data-dodaj-izvor>
              <mat-icon svgIcon="add" aria-hidden="true" />Izvori iz banke
            </button>
          </div>
          @if (greskaStavke(s); as g) {
            <p class="greska">{{ g }}</p>
          } @else if (pr) {
            <p class="kandidati" data-kandidati>Kandidata: {{ pr.kandidati.ukupno }} ({{ pr.kandidati.tipova }} tipova · ★ {{ pr.kandidati.poNivou[0] }} · ★★ {{ pr.kandidati.poNivou[1] }} · ★★★ {{ pr.kandidati.poNivou[2] }})</p>
            @for (u of pr.upozorenja; track $index) { <p class="upozorenje">{{ u }}</p> }
          }
        </section>
      }
      <button matButton="outlined" type="button" [disabled]="stavke().length >= 30" (click)="dodajStavku()" data-dodaj-stavku>
        <mat-icon svgIcon="add" aria-hidden="true" />Dodaj stavku
      </button>
    } @else {
      <app-skeleton-rows [redovi]="5" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .akcije { display: flex; gap: 8px; }
    .kartica { padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .osnovno { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .polje { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .polje.siroko { grid-column: span 2; }
    .polje input, .polje select, .naziv { min-height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px;
      background: var(--surface); color: var(--ink); font: inherit; font-weight: 400; }
    .polje.malo input { width: 7em; }
    .glava { display: flex; align-items: center; gap: 8px; }
    .naziv { flex: 1; min-width: 0; font-weight: 600; }
    .razmak { flex: 0; }
    .red { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 20px; margin-top: 10px; }
    .nivoi { margin: 0; padding: 0; border: 0; }
    .nivoi legend { font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .izvori { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
    .oznaka { color: var(--ink-2); font-size: 13px; font-weight: 600; }
    .izvor { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border-radius: 999px; background: var(--primary-soft);
      color: var(--primary-soft-ink); font-size: 13px; }
    .izvor.obrisan { background: var(--danger-soft); text-decoration: line-through; }
    .x { width: 24px; height: 24px; border: 0; border-radius: 50%; background: none; color: inherit; font-size: 16px; cursor: pointer; }
    .kandidati { margin: 8px 0 0; color: var(--ink-2); font-size: 13px; }
    .upozorenje, .greska { margin: 4px 0 0; font-size: 13px; }
    .upozorenje { color: var(--warn); }
    .greska { color: var(--danger); }
    .upozorenja { margin: 0; padding: 10px 12px 10px 28px; border: 1px solid var(--warn); border-radius: var(--radius-sm); background: var(--warn-soft); }
    .opasno { color: var(--danger); }
    @media (max-width: 599.98px) { .polje.siroko { grid-column: auto; } }
  `,
})
export class SablonEditor implements OnInit, NemaNesacuvanih {
  readonly id = input<string>();
  readonly predmet = input<string>();

  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly sablonId = computed(() => {
    const v = this.id();
    return v !== undefined && JE_ID.test(v) ? Number(v) : null;
  });
  protected readonly spreman = signal(false);
  protected readonly greskaUcitavanja = signal<string | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly salje = signal(false);

  protected readonly predmetId = signal<number | null>(null);
  protected readonly tipTestaId = signal<number | null>(null);
  protected readonly naziv = signal('');
  protected readonly opis = signal('');
  protected readonly trajanje = signal(45);
  protected readonly rezim = signal<Rezim>('GRUPE');
  protected readonly brojGrupa = signal(2);
  protected readonly prag = signal<number | null>(null);
  protected readonly stavke = signal<StavkaForme[]>([novaStavka(1)]);
  protected readonly provera = signal<SablonDetails | null>(null);
  private izmenjen = false;
  private sacuvan = false;

  protected readonly zvezdice = zvezdice;
  protected readonly greskaStavke = greskaStavke;
  protected readonly ukupno = computed(() => maxPoenaStavki(this.stavke()));
  protected readonly tipovi = computed(() => {
    const p = this.predmetId();
    return p === null ? [] : this.reference.tipoviTesta(p)();
  });
  protected readonly cmd = computed<SablonCmd | null>(() => {
    const p = this.predmetId();
    if (p === null) return null;
    return {
      predmetId: p,
      tipTestaId: this.tipTestaId(),
      naziv: this.naziv().trim(),
      opis: this.opis().trim() || null,
      trajanjeMin: this.trajanje(),
      rezim: this.rezim(),
      brojGrupa: this.rezim() === 'GRUPE' ? this.brojGrupa() : 1,
      pragProlaza: this.prag(),
      stavke: this.stavke().map(s => ({
        naziv: s.naziv.trim(), poeni: s.poeni, broj: s.broj, nivoi: [...s.nivoi].sort(), istiTip: s.istiTip, rucno: s.rucno,
        izvori: s.izvori.map(x => x.grupaId),
      })),
    };
  });

  private proveraTajmer: ReturnType<typeof setTimeout> | null = null;
  private proveraSub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.proveraTajmer) clearTimeout(this.proveraTajmer);
      this.proveraSub?.unsubscribe();
    });
    effect(() => {
      this.sablonId();
      untracked(() => this.ucitaj());
    });
    // kandidati i upozorenja uživo: posle zadržavanja, samo kad svaka stavka ima izvor
    effect(() => {
      const c = this.cmd();
      if (!this.spreman() || !c || c.stavke.some(s => s.izvori.length === 0)) return;
      if (this.proveraTajmer) clearTimeout(this.proveraTajmer);
      this.proveraTajmer = setTimeout(() => {
        this.proveraSub?.unsubscribe();
        this.proveraSub = this.api.proveriSablon(c, { tiho: true }).subscribe({ next: d => this.provera.set(d), error: () => undefined });
      }, PROVERA_MS);
    });
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  imaNesacuvanihIzmena(): boolean {
    return this.izmenjen && !this.sacuvan;
  }

  ucitaj(): void {
    const id = this.sablonId();
    this.greskaUcitavanja.set(null);
    if (id === null) {
      const p = this.predmet();
      this.predmetId.set(p !== undefined && JE_ID.test(p) ? Number(p) : null);
      this.spreman.set(true);
      return;
    }
    this.spreman.set(false);
    this.api.sablon(id, { tiho: true }).subscribe({
      next: d => this.primi(d),
      error: () => this.greskaUcitavanja.set('Proveri vezu i pokušaj ponovo.'),
    });
  }

  private primi(d: SablonDetails): void {
    this.predmetId.set(d.predmetId);
    this.tipTestaId.set(d.tipTestaId);
    this.naziv.set(d.naziv);
    this.opis.set(d.opis ?? '');
    this.trajanje.set(d.trajanjeMin);
    this.rezim.set(d.rezim);
    this.brojGrupa.set(d.brojGrupa);
    this.prag.set(d.pragProlaza);
    this.stavke.set(d.stavke.length ? d.stavke.map(izDetalja) : [novaStavka(1)]);
    this.provera.set(d);
    this.spreman.set(true);
    this.izmenjen = false;
  }

  protected izmena(): void {
    this.izmenjen = true;
  }

  protected postaviPredmet(v: string): void {
    this.predmetId.set(v ? Number(v) : null);
    this.tipTestaId.set(null);
    // izvori pripadaju banci predmeta: novi predmet ih briše
    this.stavke.update(l => l.map(s => ({ ...s, izvori: [] })));
    this.izmena();
  }

  protected postaviPrag(v: string): void {
    this.prag.set(v === '' ? null : Number(v));
    this.izmena();
  }

  protected menjaj(i: number, d: Partial<StavkaForme>): void {
    this.stavke.update(l => l.map((s, j) => (j === i ? { ...s, ...d } : s)));
    this.izmena();
  }

  protected prebaciNivo(i: number, n: number): void {
    const s = this.stavke()[i];
    this.menjaj(i, { nivoi: s.nivoi.includes(n) ? s.nivoi.filter(x => x !== n) : [...s.nivoi, n] });
  }

  protected pomeri(i: number, d: number): void {
    const l = [...this.stavke()];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    this.stavke.set(l);
    this.izmena();
  }

  protected ukloni(i: number): void {
    this.stavke.update(l => l.filter((_, j) => j !== i));
    this.izmena();
  }

  protected dodajStavku(): void {
    this.stavke.update(l => [...l, novaStavka(l.length + 1)]);
    this.izmena();
  }

  protected ukloniIzvor(i: number, grupaId: number): void {
    this.menjaj(i, { izvori: this.stavke()[i].izvori.filter(x => x.grupaId !== grupaId) });
  }

  protected dodajIzvore(i: number): void {
    const p = this.predmetId();
    if (p === null) return;
    IzvorDialog.otvori(this.dialog, { predmetId: p, izabrani: this.stavke()[i].izvori.map(x => x.grupaId) }).subscribe(l => {
      if (l) this.menjaj(i, { izvori: l });
    });
  }

  protected sacuvaj(): void {
    const c = this.cmd();
    if (!c) {
      this.greska.set('Izaberi predmet.');
      return;
    }
    if (!c.naziv) {
      this.greska.set('Unesi naziv šablona.');
      return;
    }
    if (c.trajanjeMin < 5 || c.trajanjeMin > 300) {
      this.greska.set('Trajanje je od 5 do 300 minuta.');
      return;
    }
    const g = this.stavke().map(greskaStavke).find(x => x !== null);
    if (g) {
      this.greska.set(g);
      return;
    }
    this.greska.set(null);
    this.salje.set(true);
    const id = this.sablonId();
    (id === null ? this.api.noviSablon(c, { tiho: true }) : this.api.izmeniSablon(id, c, { tiho: true })).subscribe({
      next: d => {
        this.salje.set(false);
        this.sacuvan = true;
        this.izmenjen = false;
        if (id === null) {
          void this.router.navigate(['/testovi/sabloni', d.id], { replaceUrl: true });
        } else {
          this.primi(d);
          this.sacuvan = false;
        }
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}

import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { PredmetInfo } from '../../../core/api/reference.api';
import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { Heatmap, HeatmapKolona, HeatmapRed, StanjePrisustva } from '../../../shared/ui/heatmap';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { formatIndeks } from '../../../shared/util/indeks.pipe';
import { formatSkolskaGodina, opcijeSkolskihGodina, tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PredavanjeListItem } from '../../../core/api/predavanja.models';
import { GrupaStore } from '../data-access/grupa.store';
import { GrupeApi } from '../../../core/api/grupe.api';
import { imeStudenta, PrisustvoMatricaInfo, stanjeCelije } from '../../../core/api/grupe.models';

/** Koliko predavanja grupe u godini se čita da bi se našli predmeti (max veličina strane na serveru). */
const MAX_PREDAVANJA_ZA_PREDMETE = 100;

/** Red heatmape sa tipovima aktivnosti po predavanju (predavanjeId -> tip). */
export interface RedPrisustva extends HeatmapRed {
  tip: Readonly<Record<string, string>>;
}

/**
 * Vrednost ćelije za `Heatmap` (G3): stabilna referenca (modulska funkcija), čita samo red i kolonu. ZADATAK i
 * SA_ZVEZDICOM su prisustvo sa aktivnošću, pa ih "Ukupno" broji kao prisutne.
 */
export function vrednostCelije(r: HeatmapRed, k: HeatmapKolona): StanjePrisustva {
  return stanjeCelije((r as RedPrisustva).tip?.[String(k.kljuc)]);
}

/** Matrica sa servera u redove i kolone heatmape. */
export function uHeatmapu(m: PrisustvoMatricaInfo | null): { redovi: RedPrisustva[]; kolone: HeatmapKolona[] } {
  if (!m) {
    return { redovi: [], kolone: [] };
  }
  const kolone = (m.predavanja ?? []).map(p => ({
    kljuc: p.id,
    labela: String(p.rb),
    naslov: [`Predavanje ${p.rb}`, formatDatum(p.datum), p.tema?.trim()].filter(Boolean).join(' · '),
  }));
  const redovi = (m.studenti ?? []).map(r => ({
    kljuc: r.student.id,
    labela: imeStudenta(r.student),
    podlabela: formatIndeks(r.student.indeks, r.student.godina),
    tip: r.tip ?? {},
  }));
  return { redovi, kolone };
}

/** Različiti predmeti sa predavanja, po nazivu. */
export function predmetiSaPredavanja(predavanja: readonly PredavanjeListItem[]): PredmetInfo[] {
  const mapa = new Map<number, PredmetInfo>();
  for (const p of predavanja) {
    if (p.predmet?.id && !mapa.has(p.predmet.id)) {
      mapa.set(p.predmet.id, p.predmet);
    }
  }
  return [...mapa.values()].sort((a, b) => (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr'));
}

/** Školska godina iz URL-a: ceo broj 2000-2100, inače tekuća (bez navigacije). */
export function parseGodina(v: unknown, sada: Date = new Date()): number {
  const n = typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : NaN;
  return n >= 2000 && n <= 2100 ? n : tekucaSkolskaGodina(sada);
}

/**
 * Tab Prisustvo (G3): matrica studenti × predavanja kao heatmap za izabrani predmet i školsku godinu (`?predmet`,
 * `?godina`). Predmet je obavezan: podrazumevano prvi (po nazivu) predmet koji grupa ima u toj godini; nepoznat ili
 * neispravan predmet iz linka pada na podrazumevani bez navigacije. Godina se uvek šalje (server bez nje vraća sve).
 */
@Component({
  selector: 'app-grupa-prisustvo-tab',
  imports: [ChipSelect, EmptyState, ErrorPanel, Heatmap, MatButton, MatIcon, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filteri ne-stampaj">
      <app-chip-select labela="Predmet" [opcije]="opcijePredmeta()" [vrednost]="predmetId()" (vrednostChange)="promeniPredmet($event)" />
      <app-chip-select labela="Školska godina" [opcije]="opcijeGodina()" [vrednost]="godinaUpit()" (vrednostChange)="promeniGodinu($event)" />
      <button matButton="outlined" type="button" class="stampa-dugme" [disabled]="!matrica()" (click)="stampaj()" data-stampaj>
        <mat-icon svgIcon="print" aria-hidden="true" />Štampaj
      </button>
    </div>
    <h2 class="samo-stampa">Prisustvo · {{ store.naziv() }} · {{ nazivPredmeta() }} · {{ skolskaGodina() }}</h2>

    @if (greska(); as g) {
      <app-error-panel [poruka]="g" (ponovo)="ponovo()" />
    } @else if (predmeti() === null || (predmetId() !== null && matrica() === null)) {
      <app-skeleton-rows [redovi]="6" />
    } @else if (predmetId() === null) {
      <app-empty-state naslov="Nema predavanja" ikona="co_present"
        [tekst]="'Grupa nema nijedno predavanje u školskoj godini ' + skolskaGodina() + '. Izaberi drugu godinu.'" />
    } @else if (heatmapa().kolone.length === 0) {
      <app-empty-state naslov="Nema predavanja iz ovog predmeta" ikona="co_present"
        [tekst]="'Grupa nema predavanja iz predmeta ' + nazivPredmeta() + ' u školskoj godini ' + skolskaGodina() + '.'" />
    } @else {
      @defer (on idle) {
        <app-heatmap [naslov]="'Prisustvo: ' + nazivPredmeta()" [redovi]="heatmapa().redovi" [kolone]="heatmapa().kolone" [vrednost]="vrednost" />
      } @placeholder {
        <app-skeleton-rows [redovi]="6" />
      }
    }
  `,
  styles: `
    :host { display: block; }
    .filteri { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
    .stampa-dugme { margin-left: auto; }
    .samo-stampa { display: none; }
    @media print { .samo-stampa { display: block; margin: 0 0 8px; } }
  `,
})
export class GrupaPrisustvoTab implements OnInit {
  protected readonly store = inject(GrupaStore);
  private readonly api = inject(GrupeApi);
  private readonly predavanjaApi = inject(PredavanjaApi);
  private readonly reference = inject(ReferenceStore);
  private readonly router = inject(Router);
  private readonly dokument = inject(DOCUMENT);

  /** Query parametri (`withComponentInputBinding`). */
  readonly predmet = input<string>();
  readonly godina = input<string>();

  protected readonly vrednost = vrednostCelije;

  /** Predmeti sa predavanjima grupe u godini (`null` dok se ne učitaju). */
  protected readonly predmeti = signal<PredmetInfo[] | null>(null);
  protected readonly matrica = signal<PrisustvoMatricaInfo | null>(null);
  protected readonly greska = signal<string | null>(null);

  protected readonly godinaUpit = computed(() => parseGodina(this.godina()));
  protected readonly skolskaGodina = computed(() => formatSkolskaGodina(this.godinaUpit()));
  private readonly grupaId = computed(() => this.store.grupa()?.id ?? null);

  /** Predmet iz URL-a ako je ispravan i postoji (dok predmeti nisu učitani, veruje se URL-u), inače podrazumevani. */
  protected readonly predmetId = computed<number | null>(() => {
    const lista = this.predmeti();
    if (lista === null) {
      return null;
    }
    const sirovo = this.predmet();
    const izUrl = sirovo && JE_ID.test(sirovo) ? Number(sirovo) : null;
    const poznati = this.reference.predmeti();
    const postoji = izUrl !== null && (lista.some(p => p.id === izUrl) || poznati.some(p => p.id === izUrl) || this.reference.status() !== 'loaded');
    return postoji ? izUrl : (lista[0]?.id ?? null);
  });

  protected readonly opcijePredmeta = computed<ChipOpcija<number>[]>(() => {
    const opcije = (this.predmeti() ?? []).map(p => ({ vrednost: p.id, labela: p.naziv }));
    const id = this.predmetId();
    if (id !== null && !opcije.some(o => o.vrednost === id)) {
      const p = this.reference.predmeti().find(x => x.id === id);
      opcije.push({ vrednost: id, labela: p?.naziv ?? `Predmet ${id}` });
    }
    return opcije;
  });

  protected readonly opcijeGodina = computed<ChipOpcija<number>[]>(() => {
    const opcije = opcijeSkolskihGodina(6).map(o => ({ vrednost: o.vrednost, labela: o.labela }));
    const g = this.godinaUpit();
    if (!opcije.some(o => o.vrednost === g)) {
      opcije.push({ vrednost: g, labela: formatSkolskaGodina(g) });
      opcije.sort((a, b) => b.vrednost - a.vrednost);
    }
    return opcije;
  });

  protected readonly nazivPredmeta = computed(() => this.opcijePredmeta().find(o => o.vrednost === this.predmetId())?.labela ?? '—');
  protected readonly heatmapa = computed(() => uHeatmapu(this.matrica()));

  private zahtevPredmeta: Subscription | null = null;
  private zahtevMatrice: Subscription | null = null;

  constructor() {
    effect(() => {
      const id = this.grupaId();
      const godina = this.godinaUpit();
      if (id !== null) {
        untracked(() => this.ucitajPredmete(id, godina));
      }
    });
    effect(() => {
      const id = this.grupaId();
      const predmet = this.predmetId();
      const godina = this.godinaUpit();
      if (id !== null && predmet !== null) {
        untracked(() => this.ucitajMatricu(id, predmet, godina));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.zahtevPredmeta?.unsubscribe();
      this.zahtevMatrice?.unsubscribe();
    });
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  private poruka(e: unknown): string {
    return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
  }

  private ucitajPredmete(grupaId: number, godina: number): void {
    this.zahtevPredmeta?.unsubscribe();
    this.predmeti.set(null);
    this.matrica.set(null);
    this.greska.set(null);
    this.zahtevPredmeta = this.predavanjaApi
      .pretraga(
        {
          filteri: { predmet: null, grupa: grupaId, godina, status: null, q: null, od: null, do: null },
          sort: 'datum,desc',
          strana: 1,
          velicina: MAX_PREDAVANJA_ZA_PREDMETE,
        },
        { tiho: true },
      )
      .subscribe({
        next: s => this.predmeti.set(predmetiSaPredavanja(s?.content ?? [])),
        error: (e: unknown) => this.greska.set(this.poruka(e)),
      });
  }

  private ucitajMatricu(grupaId: number, predmetId: number, godina: number): void {
    this.zahtevMatrice?.unsubscribe();
    this.matrica.set(null);
    this.greska.set(null);
    this.zahtevMatrice = this.api.prisustvo(grupaId, predmetId, godina, { tiho: true }).subscribe({
      next: m => this.matrica.set(m ?? { predavanja: [], studenti: [] }),
      error: (e: unknown) => this.greska.set(this.poruka(e)),
    });
  }

  protected ponovo(): void {
    const id = this.grupaId();
    if (id === null) {
      return;
    }
    const predmet = this.predmetId();
    if (this.predmeti() === null) {
      this.ucitajPredmete(id, this.godinaUpit());
    } else if (predmet !== null) {
      this.ucitajMatricu(id, predmet, this.godinaUpit());
    }
  }

  protected promeniPredmet(id: number | null): void {
    // predmet je obavezan: ✕ vraća podrazumevani
    void this.router.navigate([], { queryParams: { predmet: id }, queryParamsHandling: 'merge' });
  }

  protected promeniGodinu(g: number | null): void {
    // druga godina ima druge predmete: predmet se bira ponovo
    void this.router.navigate([], {
      queryParams: { godina: g === null || g === tekucaSkolskaGodina() ? null : g, predmet: null },
      queryParamsHandling: 'merge',
    });
  }

  protected stampaj(): void {
    this.dokument.defaultView?.print();
  }
}

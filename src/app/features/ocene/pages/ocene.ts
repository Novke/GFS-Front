import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { JE_ID } from '../../../core/route-matchers';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { OcenePregled } from '../ui/ocene-pregled';

/** Ključ zapamćenog izbora u `PreferencesStore` (vraća se kad `/ocene` nema parametre). */
export const KLJUC_OCENA = 'ocene';

/** `?predmet=` / `?grupa=`: pozitivan ceo broj ili `null` (neispravna vrednost iz linka je "nije izabrano"). */
export function parseIdParametra(v: unknown): number | null {
  return typeof v === 'string' && JE_ID.test(v) ? Number(v) : null;
}

/**
 * Predlog ocena (`/ocene?predmet&grupa`): traka filtera sa predmetom i grupom (oba obavezna, URL je izvor istine),
 * pa isti sadržaj kao tab Ocene u hubu predmeta (`OcenePregled`). Koeficijenti se uređuju u hubu (Podešavanja), ovde
 * je samo link. Bez parametara u URL-u vraća poslednji izbor (jednom, `replaceUrl`).
 */
@Component({
  selector: 'app-ocene',
  imports: [ChipSelect, EmptyState, FilterBar, OcenePregled, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Ocene" podnaslov="Predlog ocena po predmetu i grupi" />
    <section class="lista-kartica filteri" aria-label="Izbor predmeta i grupe">
      <app-filter-bar [imaFiltera]="predmetId() !== null || grupaId() !== null" (ocisti)="postavi({ predmet: null, grupa: null })">
        <app-chip-select labela="Predmet" [opcije]="predmeti()" [vrednost]="predmetId()" (vrednostChange)="postavi({ predmet: $event })" />
        <app-chip-select labela="Grupa" [opcije]="grupe()" [vrednost]="grupaId()" (vrednostChange)="postavi({ grupa: $event })" />
      </app-filter-bar>
    </section>
    @if (predmetId() !== null && grupaId() !== null) {
      <app-ocene-pregled [predmetId]="predmetId()!" [grupaId]="grupaId()!" />
    } @else {
      <app-empty-state naslov="Izaberi predmet i grupu" ikona="bar_chart"
        tekst="Predlog ocena se računa za jednu grupu na jednom predmetu, po koeficijentima predmeta." />
    }
  `,
  styles: `
    :host { display: block; }
    .filteri { margin-bottom: 16px; }
    .filteri app-filter-bar { border-bottom: 0; }
  `,
})
export class Ocene implements OnInit {
  private readonly reference = inject(ReferenceStore);
  private readonly preference = inject(PreferencesStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Query parametri (`withComponentInputBinding`). */
  readonly predmet = input<string>();
  readonly grupa = input<string>();

  protected readonly predmetId = computed(() => parseIdParametra(this.predmet()));
  protected readonly grupaId = computed(() => parseIdParametra(this.grupa()));
  protected readonly predmeti = computed<ChipOpcija<number>[]>(() =>
    this.reference.predmeti().map(p => ({ vrednost: p.id, labela: p.naziv })),
  );
  protected readonly grupe = computed<ChipOpcija<number>[]>(() =>
    [...this.reference.grupe()].sort((a, b) => (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr')).map(g => ({ vrednost: g.id, labela: g.naziv })),
  );

  ngOnInit(): void {
    this.reference.ucitaj();
    const pm = this.route.snapshot.queryParamMap;
    if (!pm.has('predmet') && !pm.has('grupa')) {
      const sacuvano = this.preference.filteri(KLJUC_OCENA);
      const params: Params = {
        predmet: parseIdParametra(sacuvano?.['predmet']),
        grupa: parseIdParametra(sacuvano?.['grupa']),
      };
      if (params['predmet'] !== null || params['grupa'] !== null) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: params, replaceUrl: true });
      }
    }
  }

  protected postavi(izmena: { predmet?: number | null; grupa?: number | null }): void {
    const params = { predmet: this.predmetId(), grupa: this.grupaId(), ...izmena };
    this.preference.sacuvajFiltere(KLJUC_OCENA, Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])));
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}

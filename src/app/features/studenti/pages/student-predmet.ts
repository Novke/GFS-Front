import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { StudentPregledAktivnostInfo, StudentPregledDomaciInfo, StudentPregledTestInfo } from '../../../core/api/studenti.api';
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe, formatDatum } from '../../../shared/util/datum.pipe';
import { formatIndeks } from '../../../shared/util/indeks.pipe';
import { StudentPredmetStore } from '../data-access/student.store';
import { formatBroj, punoIme, sortirajPolaganja, sortirajPoDatumu, tipAktivnostiTekst } from '../data-access/studenti.models';

/** Red tabele testova: polaganje (ili `null` za tip bez polaganja) sa nazivom tipa i oznakom najboljeg. */
export interface RedTesta {
  kljuc: string;
  tip: string;
  polaganje: StudentPregledTestInfo | null;
  najbolje: boolean;
}

/** Svi tipovi testa kao redovi; polaganja jednog tipa su najnovije prva, tip bez polaganja ima jedan prazan red. */
export function redoviTestova(
  testoviPoTipu: readonly { tipTesta: { id: number; naziv: string } | null; polaganja: StudentPregledTestInfo[]; najboljePolaganje: { id: number } | null }[],
): RedTesta[] {
  return testoviPoTipu.flatMap((t, i): RedTesta[] => {
    const tip = t.tipTesta?.naziv?.trim() || 'Test';
    const polaganja = sortirajPolaganja(t.polaganja ?? []);
    return polaganja.length === 0
      ? [{ kljuc: `tip${t.tipTesta?.id ?? i}`, tip, polaganje: null, najbolje: false }]
      : polaganja.map(p => ({ kljuc: `p${p.id}`, tip, polaganje: p, najbolje: t.najboljePolaganje?.id === p.id }));
  });
}

const daNe = (v: boolean | null | undefined): string => (v === true ? 'Da' : v === false ? 'Ne' : '—');

/**
 * Student na jednom predmetu (`/studenti/:id/predmeti/:pid`): ukupni poeni aktivnosti i domaćih, aktivnosti na
 * predavanjima, urađeni domaći i polaganja po tipu testa kao tabela (S4; najbolje polaganje tipa je označeno).
 * Redosled iz servera nije određen, pa se sve sortira ovde (najnovije prvo, pa veći id).
 */
@Component({
  selector: 'app-student-predmet',
  imports: [DatumPipe, ErrorPanel, MatButton, MatIcon, PageHeader, RouterLink, SkeletonRows, StatTile, StatusChip],
  providers: [StudentPredmetStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.podaci(); as d) {
      <app-page-header [naslov]="ime()">
        <div kontekst class="kontekst">
          <span class="oznaka mono" data-indeks><span class="sr-only">Indeks: </span>{{ indeks() }}</span>
          <span class="oznaka ton-info" data-predmet><span class="sr-only">Predmet: </span>{{ d.predmet?.naziv ?? '—' }}</span>
          <span class="oznaka" data-grupa><span class="sr-only">Grupa: </span>{{ d.grupaNaziv || 'Bez grupe' }}</span>
        </div>
        <a akcije matButton="outlined" [routerLink]="['/studenti', d.student.id]" data-profil>
          <mat-icon svgIcon="person" aria-hidden="true" />Profil studenta
        </a>
      </app-page-header>

      <div class="kpi" role="group" aria-label="Poeni na predmetu">
        <app-stat-tile labela="poena za aktivnost" [vrednost]="poeni(d.ukupnoPoenaAktivnost)" data-kpi-aktivnost />
        <app-stat-tile labela="poena za domaće" [vrednost]="poeni(d.ukupnoPoenaDomaci)" data-kpi-domaci />
      </div>

      <section aria-labelledby="h-aktivnosti">
        <h2 id="h-aktivnosti">Aktivnosti na predavanjima</h2>
        @if (aktivnosti().length > 0) {
          <div class="lista-kartica" data-aktivnosti>
            <div class="tabela-okvir">
              <table class="lista-tabela bez-klika">
                <caption class="sr-only">Aktivnosti na predavanjima</caption>
                <thead><tr><th scope="col">Predavanje</th><th scope="col">Datum</th><th scope="col">Aktivnost</th><th scope="col">Napomena</th></tr></thead>
                <tbody>
                  @for (a of aktivnosti(); track a.id) {
                    <tr>
                      <td class="c-glavno">
                        @if (a.predavanjeId) {
                          <a class="veza" [routerLink]="['/predavanja', a.predavanjeId]">{{ a.tema?.trim() || 'Predavanje bez teme' }}</a>
                        } @else {
                          {{ a.tema?.trim() || 'Predavanje bez teme' }}
                        }
                      </td>
                      <td class="samo-desktop mono brojevi-sitno">{{ a.datum | datum }}</td>
                      <td class="samo-desktop">{{ tip(a) }}</td>
                      <td class="samo-desktop" [class.nema]="!a.napomene?.trim()">{{ a.napomene?.trim() || '—' }}</td>
                      <td class="c-meta">{{ metaAktivnosti(a) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <p class="prazno">Nema zabeleženih aktivnosti na ovom predmetu.</p>
        }
      </section>

      <section aria-labelledby="h-domaci">
        <h2 id="h-domaci">Domaći</h2>
        @if (domaci().length > 0) {
          <div class="lista-kartica" data-domaci>
            <div class="tabela-okvir">
              <table class="lista-tabela bez-klika">
                <caption class="sr-only">Urađeni domaći</caption>
                <thead><tr><th scope="col">Domaći</th><th scope="col">Datum</th><th scope="col">Bodovi</th><th scope="col">Prepisivao</th><th scope="col">Napomena</th></tr></thead>
                <tbody>
                  @for (x of domaci(); track x.id) {
                    <tr>
                      <td class="c-glavno">
                        @if (x.domaciId) {
                          <a class="veza" [routerLink]="['/domaci', x.domaciId]">{{ x.naslov?.trim() || 'Domaći bez naslova' }}</a>
                        } @else {
                          {{ x.naslov?.trim() || 'Domaći bez naslova' }}
                        }
                      </td>
                      <td class="samo-desktop mono brojevi-sitno">{{ x.datum | datum }}</td>
                      <td class="samo-desktop brojevi-sitno">
                        @if (x.oslobodjen) {
                          <app-status-chip tekst="Oslobođen" ton="info" />
                        } @else {
                          <span class="mono">{{ poeni(x.bodovi) }}</span>
                        }
                      </td>
                      <td class="samo-desktop">{{ daNe(x.prepisivanje) }}</td>
                      <td class="samo-desktop" [class.nema]="!x.napomene?.trim()">{{ x.napomene?.trim() || '—' }}</td>
                      <td class="c-meta">{{ metaDomaceg(x) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <p class="prazno">Nema urađenih domaćih na ovom predmetu.</p>
        }
      </section>

      <section aria-labelledby="h-testovi">
        <h2 id="h-testovi">Testovi po tipu</h2>
        @if (testovi().length > 0) {
          <div class="lista-kartica" data-testovi>
            <div class="tabela-okvir">
              <table class="lista-tabela bez-klika">
                <caption class="sr-only">Polaganja po tipu testa</caption>
                <thead><tr><th scope="col">Tip testa</th><th scope="col">Datum</th><th scope="col">Poeni</th><th scope="col">Položio</th><th scope="col">Prepisivao</th></tr></thead>
                <tbody>
                  @for (r of testovi(); track r.kljuc) {
                    <tr [attr.data-najbolji]="r.najbolje ? '' : null">
                      <td class="c-glavno">
                        {{ r.tip }}
                        @if (r.najbolje) {
                          <app-status-chip tekst="Najbolji" ton="ok" ikona="star" />
                        }
                      </td>
                      @if (r.polaganje; as p) {
                        <td class="samo-desktop mono brojevi-sitno">
                          @if (p.testId) {
                            <a class="veza" [routerLink]="['/testovi', p.testId]">{{ p.datum | datum }}</a>
                          } @else {
                            {{ p.datum | datum }}
                          }
                        </td>
                        <td class="samo-desktop mono brojevi-sitno">{{ poeni(p.ostvareniPoeni) }}</td>
                        <td class="samo-desktop">{{ daNe(p.polozio) }}</td>
                        <td class="samo-desktop">{{ daNe(p.prepisivao) }}</td>
                        <td class="c-meta">{{ metaPolaganja(p) }}</td>
                      } @else {
                        <td class="samo-desktop nema">—</td>
                        <td class="samo-desktop nema">—</td>
                        <td class="samo-desktop nema">—</td>
                        <td class="samo-desktop nema">—</td>
                        <td class="c-meta">nema polaganja</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <p class="prazno">Predmet nema tipove testa.</p>
        }
      </section>
    } @else if (store.imaGresku()) {
      <app-error-panel naslov="Podaci nisu učitani." [poruka]="store.greska()" (ponovo)="ponovo()" />
      @if (sId(); as id) {
        <a matButton [routerLink]="['/studenti', id]"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Profil studenta</a>
      }
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .kontekst { display: flex; flex-wrap: wrap; gap: 6px; }
    .kpi { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
    section { margin-bottom: 24px; }
    h2 { margin: 0 0 8px; font-size: 17px; }
    .prazno { margin: 0; color: var(--muted); }
    .bez-klika tbody tr { cursor: default; }
    .veza { color: var(--primary); text-decoration: none; }
    .veza:hover { text-decoration: underline; }
    tr[data-najbolji] { background: var(--ok-soft); }
    .c-glavno app-status-chip { margin-left: 8px; }
  `,
})
export class StudentPredmet {
  protected readonly store = inject(StudentPredmetStore);
  private readonly mrvice = inject(BreadcrumbService);

  /** Id-evi iz putanje (`withComponentInputBinding`); matcher rute već propušta samo brojeve. */
  readonly id = input.required<string>();
  readonly pid = input.required<string>();

  protected readonly sId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  private readonly pId = computed(() => (JE_ID.test(this.pid()) ? Number(this.pid()) : null));

  protected readonly ime = computed(() => {
    const s = this.store.podaci()?.student;
    return s ? punoIme(s) : '';
  });
  protected readonly indeks = computed(() => {
    const s = this.store.podaci()?.student;
    return s ? formatIndeks(s.indeks, s.godina) : '';
  });
  protected readonly aktivnosti = computed(() => sortirajPoDatumu(this.store.podaci()?.aktivnosti ?? []));
  protected readonly domaci = computed(() => sortirajPoDatumu(this.store.podaci()?.domaci ?? []));
  protected readonly testovi = computed(() => redoviTestova(this.store.podaci()?.testoviPoTipu ?? []));
  /** Mrvice: predmet je poslednja, ime studenta pretposlednja (umesto opšteg "Student"); string, pa se menja samo sa tekstom. */
  private readonly mrviceLabele = computed(
    () => {
      const naziv = this.store.podaci()?.predmet?.naziv;
      return naziv ? { naziv, ime: this.ime() } : null;
    },
    { equal: (a, b) => a?.naziv === b?.naziv && a?.ime === b?.ime },
  );

  constructor() {
    effect(() => {
      const [s, p] = [this.sId(), this.pId()];
      if (s !== null && p !== null) {
        untracked(() => this.store.ucitaj(s, p));
      }
    });

    effect(() => {
      const l = this.mrviceLabele();
      if (l) {
        untracked(() => this.mrvice.postavi(l.naziv, l.ime && l.ime !== '—' ? l.ime : undefined));
      }
    });
  }

  protected ponovo(): void {
    const [s, p] = [this.sId(), this.pId()];
    if (s !== null && p !== null) {
      this.store.ucitaj(s, p);
    }
  }

  protected poeni(p: number | null | undefined): string {
    return formatBroj(p);
  }

  protected daNe = daNe;

  protected tip(a: StudentPregledAktivnostInfo): string {
    return tipAktivnostiTekst(a.tip);
  }

  /** Red kartice na telefonu: `14. 10. 2025. · Zadatak · napomena`. */
  protected metaAktivnosti(a: StudentPregledAktivnostInfo): string {
    return [formatDatum(a.datum), this.tip(a), a.napomene?.trim()].filter(Boolean).join(' · ');
  }

  protected metaDomaceg(x: StudentPregledDomaciInfo): string {
    return [
      formatDatum(x.datum),
      x.oslobodjen ? 'oslobođen' : `${formatBroj(x.bodovi)} bodova`,
      x.prepisivanje ? 'prepisivao' : null,
      x.napomene?.trim(),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected metaPolaganja(p: StudentPregledTestInfo): string {
    return [
      formatDatum(p.datum),
      `${formatBroj(p.ostvareniPoeni)} poena`,
      p.polozio === true ? 'položio' : p.polozio === false ? 'nije položio' : null,
      p.prepisivao ? 'prepisivao' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}

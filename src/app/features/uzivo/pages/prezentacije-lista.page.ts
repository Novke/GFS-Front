import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ErrorHandler, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, from, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import {
  FILTER_VRSTE, nazivVezbe, OZNAKA_VRSTE, porediPoVezbi, VRSTE_PREZENTACIJE, VrstaPrezentacije, zaPretragu,
} from '../../../core/api/redosled-prezentacija';
import { opisSadrzaja } from '../../../shared/ui/izbor-prezentacije';
import { StatusChip, TonStatusa } from '../../../shared/ui/status-chip';
import { UzivoPutanje } from '../uzivo-putanje';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { PredmetKratko, PrezentacijaInfo } from '../data-access/uzivo.models';
import { NovaPrezentacijaIshod, otvoriNovuPrezentaciju } from './nova-prezentacija.dialog';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';

/** Sortiranje liste; `vezbe` grupiše po broju vežbe (podrazumevano), ostala su ravna lista. */
export type SortListe = 'vezbe' | 'naziv' | 'kreirano' | 'izmenjeno' | 'pustanje';

export const SORTIRANJA: readonly { vrednost: SortListe; labela: string }[] = [
  { vrednost: 'vezbe', labela: 'Po vežbama' },
  { vrednost: 'naziv', labela: 'Po nazivu' },
  { vrednost: 'kreirano', labela: 'Najnovije napravljene' },
  { vrednost: 'izmenjeno', labela: 'Poslednje izmenjene' },
  { vrednost: 'pustanje', labela: 'Poslednje puštane' },
];

const TON_VRSTE: Record<VrstaPrezentacije, TonStatusa> = { GRADIVO: 'neutral', PITANJA: 'info', ZADACI: 'warn' };

export interface UpitListe {
  predmet: number | null;
  vrsta: VrstaPrezentacije | null;
  sort: SortListe;
  q: string;
}

/** Upit iz URL-a; neispravna vrednost znači "bez filtera" (lista se ne "ispravlja" navigacijom). */
export function upitIzUrla(q: ParamMap): UpitListe {
  const p = q.get('predmet');
  const v = q.get('vrsta');
  const s = q.get('sort');
  return {
    predmet: p !== null && /^\d+$/.test(p) && Number(p) > 0 ? Number(p) : null,
    vrsta: (VRSTE_PREZENTACIJE as readonly string[]).includes(v ?? '') ? v as VrstaPrezentacije : null,
    sort: SORTIRANJA.some(x => x.vrednost === s) ? s as SortListe : 'vezbe',
    q: (q.get('q') ?? '').slice(0, 100),
  };
}

function poDatumuOpadajuce(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

/** Sortira prema izboru; bez filtera predmeta "po vežbama" ide prvo po predmetu, da se vežbe dva predmeta ne mešaju. */
export function sortirajListu(lista: readonly PrezentacijaInfo[], sort: SortListe, poPredmetu: boolean): PrezentacijaInfo[] {
  const naziv = (a: PrezentacijaInfo, b: PrezentacijaInfo) =>
    a.naziv.localeCompare(b.naziv, 'sr-Latn', { sensitivity: 'base' }) || a.id - b.id;
  const predmet = (a: PrezentacijaInfo, b: PrezentacijaInfo) =>
    poPredmetu ? a.predmet.naziv.localeCompare(b.predmet.naziv, 'sr-Latn') || a.predmet.id - b.predmet.id : 0;
  const poredi: Record<SortListe, (a: PrezentacijaInfo, b: PrezentacijaInfo) => number> = {
    vezbe: (a, b) => predmet(a, b) || porediPoVezbi(a, b),
    naziv,
    kreirano: (a, b) => poDatumuOpadajuce(a.kreirano, b.kreirano) || b.id - a.id,
    izmenjeno: (a, b) => poDatumuOpadajuce(a.izmenjeno, b.izmenjeno) || b.id - a.id,
    pustanje: (a, b) => poDatumuOpadajuce(a.poslednjePustanje, b.poslednjePustanje) || naziv(a, b),
  };
  return [...lista].sort(poredi[sort]);
}

interface GrupaListe {
  kljuc: string;
  naslov: string | null;
  stavke: PrezentacijaInfo[];
}

/**
 * Lista prezentacija: filter predmeta i vrste, pretraga po nazivu i sortiranje, sve u URL-u (`predmet`, `vrsta`, `q`,
 * `sort`). Podrazumevano grupisano po vežbama (spec redosled prezentacija); "Nova prezentacija", "U toku" za aktivno izvođenje.
 */
@Component({
  selector: 'app-prezentacije-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule,
    MatSelectModule, StatusChip,
  ],
  template: `
    <div class="uz-ed-strana">
      <header class="uz-ed-strana-zaglavlje">
        <h1>Prezentacije</h1>
        <button mat-flat-button type="button" (click)="nova()">
          <mat-icon svgIcon="add" />Nova prezentacija
        </button>
      </header>

      <div class="uz-ed-lista-filteri">
        <mat-form-field class="uz-ed-filter" subscriptSizing="dynamic">
          <mat-label>Predmet</mat-label>
          <mat-select [value]="upit().predmet" (selectionChange)="postavi({ predmet: $event.value })" data-filter-predmet>
            <mat-option [value]="null">Svi predmeti</mat-option>
            @for (p of predmeti(); track p.id) {
              <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="uz-ed-filter-uzi" subscriptSizing="dynamic">
          <mat-label>Vrsta</mat-label>
          <mat-select [value]="upit().vrsta" (selectionChange)="postavi({ vrsta: $event.value })" data-filter-vrsta>
            <mat-option [value]="null">Sve vrste</mat-option>
            @for (v of vrste; track v) {
              <mat-option [value]="v">{{ filterVrste[v] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="uz-ed-filter-uzi" subscriptSizing="dynamic">
          <mat-label>Sortiraj</mat-label>
          <mat-select [value]="upit().sort" (selectionChange)="postavi({ sort: $event.value })" data-sort>
            @for (s of sortiranja; track s.vrednost) {
              <mat-option [value]="s.vrednost">{{ s.labela }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="uz-ed-filter" subscriptSizing="dynamic">
          <mat-label>Traži po nazivu</mat-label>
          <input matInput type="search" [value]="upit().q" (input)="trazi($any($event.target).value)" data-pretraga />
        </mat-form-field>
      </div>

      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }

      @if (lista(); as l) {
        @if (grupe().length) {
          <div class="uz-ed-tabela-okvir">
            <table class="uz-ed-tabela">
              <thead>
                <tr>
                  <th scope="col">Naziv</th>
                  <th scope="col">Vrsta</th>
                  @if (!upit().predmet) {
                    <th scope="col">Predmet</th>
                  }
                  <th scope="col">Sadržaj</th>
                  <th scope="col">Poslednje puštanje</th>
                  <th scope="col">{{ upit().sort === 'kreirano' ? 'Napravljeno' : 'Izmenjeno' }}</th>
                </tr>
              </thead>
              @for (g of grupe(); track g.kljuc) {
                <tbody>
                  @if (g.naslov) {
                    <tr class="uz-ed-grupa-red">
                      <th scope="colgroup" [attr.colspan]="brojKolona()" data-grupa-vezbe>{{ g.naslov }}</th>
                    </tr>
                  }
                  @for (p of g.stavke; track p.id) {
                    <tr [attr.data-prezentacija]="p.id">
                      <td>
                        <a class="uz-ed-veza" [routerLink]="'/' + rute.prezentacija(p.id)">{{ p.naziv }}</a>
                        @if (p.aktivnoIzvodjenjeId) {
                          <span class="uz-cip uz-ed-u-toku">U toku</span>
                        }
                        @if (p.opis) {
                          <div class="uz-ed-opis-red">{{ p.opis }}</div>
                        }
                      </td>
                      <td><app-status-chip [tekst]="oznakaVrste[p.vrsta]" [ton]="tonVrste[p.vrsta]" [ikona]="null" /></td>
                      @if (!upit().predmet) {
                        <td>{{ p.predmet.naziv }}</td>
                      }
                      <td class="uz-ed-nowrap">{{ sadrzaj(p) }}</td>
                      <td class="uz-ed-nowrap">
                        @if (p.poslednjePustanje) { {{ p.poslednjePustanje | date: 'd.M.yyyy.' }} } @else { <span class="uz-ed-tiho">nikad</span> }
                      </td>
                      <td class="uz-ed-nowrap">{{ (upit().sort === 'kreirano' ? p.kreirano : p.izmenjeno) | date: 'd.M.yyyy. HH:mm' }}</td>
                    </tr>
                  }
                </tbody>
              }
            </table>
          </div>
        } @else if (l.length) {
          <p class="uz-ed-prazno-filter" data-bez-rezultata>
            Nijedna prezentacija ne odgovara izboru.
            <button mat-button type="button" (click)="ocisti()">Očisti filtere</button>
          </p>
        } @else {
          <section class="uz-ed-prazno-stanje">
            <mat-icon aria-hidden="true" svgIcon="co_present" />
            <h2>{{ upit().predmet ? 'Ovaj predmet još nema prezentacija.' : 'Još nema prezentacija.' }}</h2>
            <p>
              Prezentacija je niz slajdova sa tekstom i pitanjima. Tokom predavanja je pokreneš, studenti uđu preko QR
              koda sa telefona i odgovaraju na pitanja, a ti biraš kada se vide rezultati.
            </p>
            <button mat-flat-button type="button" (click)="nova()">
              <mat-icon svgIcon="add" />Nova prezentacija
            </button>
          </section>
        }
      } @else if (!greska()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje prezentacija" />
      }
    </div>
  `,
})
export class PrezentacijeListaPage {
  private readonly api = inject(PrezentacijeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly greske = inject(ErrorHandler);
  private readonly otvarac = inject(UvozPptxOtvarac);
  private readonly osvezi$ = new Subject<void>();

  protected readonly rute = UzivoPutanje;
  protected readonly vrste = VRSTE_PREZENTACIJE;
  protected readonly filterVrste = FILTER_VRSTE;
  protected readonly oznakaVrste = OZNAKA_VRSTE;
  protected readonly tonVrste = TON_VRSTE;
  protected readonly sortiranja = SORTIRANJA;
  protected readonly sadrzaj = opisSadrzaja;

  protected readonly upit = toSignal(this.route.queryParamMap.pipe(map(upitIzUrla)), {
    initialValue: { predmet: null, vrsta: null, sort: 'vezbe', q: '' } satisfies UpitListe,
  });
  protected readonly predmeti = signal<PredmetKratko[]>([]);
  protected readonly lista = signal<PrezentacijaInfo[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  private readonly predmetiUcitani = computed(() => this.predmeti().length > 0);
  protected readonly brojKolona = computed(() => (this.upit().predmet ? 5 : 6));

  protected readonly grupe = computed<GrupaListe[]>(() => {
    const { predmet, vrsta, sort, q } = this.upit();
    const t = zaPretragu(q);
    const izabrane = (this.lista() ?? []).filter(p => (!vrsta || p.vrsta === vrsta) && (!t || zaPretragu(p.naziv).includes(t)));
    const poredane = sortirajListu(izabrane, sort, !predmet);
    if (sort !== 'vezbe') return poredane.length ? [{ kljuc: 'sve', naslov: null, stavke: poredane }] : [];
    const grupe: GrupaListe[] = [];
    for (const p of poredane) {
      const kljuc = `${predmet ? '' : p.predmet.id}:${p.vezba ?? '-'}`;
      const poslednja = grupe[grupe.length - 1];
      if (poslednja?.kljuc === kljuc) poslednja.stavke.push(p);
      else grupe.push({ kljuc, naslov: predmet ? nazivVezbe(p.vezba) : `${p.predmet.naziv} · ${nazivVezbe(p.vezba)}`, stavke: [p] });
    }
    return grupe;
  });

  constructor() {
    this.api.predmeti().pipe(takeUntilDestroyed()).subscribe({
      next: p => this.predmeti.set(p),
      error: e => this.greska.set(razlogGreske(e, 'Predmeti nisu učitani.')),
    });
    this.route.queryParamMap.pipe(
      map(q => upitIzUrla(q).predmet),
      distinctUntilChanged(),
      switchMap(id => this.osvezi$.pipe(startWith(undefined), map(() => id))),
      tap(() => this.lista.set(null)),
      switchMap(id => this.api.lista(id).pipe(catchError(e => {
        this.greska.set(razlogGreske(e, 'Prezentacije nisu učitane.'));
        return of(null);
      }))),
      takeUntilDestroyed(),
    ).subscribe(l => {
      if (l) this.greska.set(null);
      this.lista.set(l);
    });
  }

  /** Podrazumevane vrednosti ne ulaze u URL (`sort=vezbe`, prazna pretraga). */
  protected postavi(promena: Partial<UpitListe>, zameni = false): void {
    const u = { ...this.upit(), ...promena };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { predmet: u.predmet, vrsta: u.vrsta, sort: u.sort === 'vezbe' ? null : u.sort, q: u.q.trim() ? u.q : null },
      queryParamsHandling: 'merge',
      replaceUrl: zameni,
    });
  }

  protected trazi(q: string): void {
    this.postavi({ q }, true);
  }

  protected ocisti(): void {
    this.postavi({ vrsta: null, q: '' });
  }

  protected nova(): void {
    if (!this.predmetiUcitani()) {
      this.greska.set('Predmeti još nisu učitani. Pokušaj ponovo za trenutak.');
      return;
    }
    otvoriNovuPrezentaciju(this.dialog, { predmeti: this.predmeti(), predmetId: this.upit().predmet })
      .subscribe(ishod => this.posleDijaloga(ishod));
  }

  /**
   * Prazna prezentacija ide pravo u editor. Sa fajlom se otvara dijalog uvoza (lenjo); `'osvezi'` i `undefined` ostaju
   * na listi i ponovo je čitaju (nova prezentacija je napravljena ili obrisana u dijalogu, ovde se nikad ne briše).
   */
  private posleDijaloga(ishod: NovaPrezentacijaIshod | undefined): void {
    if (!ishod) return;
    const { prezentacija, fajl } = ishod;
    if (!fajl) {
      this.router.navigate(['/' + UzivoPutanje.prezentacija(prezentacija.id)]);
      return;
    }
    from(this.otvarac.otvori(this.dialog, {
      prezentacijaId: prezentacija.id, brojSlajdova: 0, izabraniId: null, izabraniRb: null, fajl, nova: true,
    })).pipe(switchMap(zatvaranje => zatvaranje)).subscribe({
      next: p => {
        if (p && p !== 'osvezi') this.router.navigate(['/' + UzivoPutanje.prezentacija(p.id)]);
        else this.osvezi$.next();
      },
      error: e => {
        this.greske.handleError(e);
        this.greska.set('Dijalog uvoza nije učitan. Osveži stranicu i pokušaj ponovo; prezentacija je napravljena i vidi se u listi.');
        this.osvezi$.next();
      },
    });
  }
}

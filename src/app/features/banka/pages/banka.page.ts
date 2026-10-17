import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DOCUMENT, effect, ElementRef, inject, Injector, input, untracked,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { PredmetInfo } from '../../../core/api/reference.api';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatTile } from '../../../shared/ui/stat-tile';
import { sRecju } from '../../../shared/util/mnozina';
import { GrupaCvor, Namena, nadjiCvor, putanjaDo, StatusVarijante, VarijantaInfo } from '../data-access/banka.models';
import { BankaStore } from '../data-access/banka.store';
import { GrupaDialog } from '../ui/grupa-dialog';
import { PreambulaDialog } from '../ui/preambula-dialog';
import { PremestiDialog } from '../ui/premesti-dialog';
import { opisBrojaca, StabloGrupaComponent } from '../ui/stablo-grupa.component';
import { imeVarijante, VarijantaKarticaComponent } from '../ui/varijanta-kartica.component';

/** Ključ zapamćenog predmeta i namene u `PreferencesStore` (vraćaju se kad `/banka` nema `?predmet`). */
export const KLJUC_BANKE = 'banka';

const NAMENE: readonly Namena[] = ['PREDAVANJE', 'TEST'];

/** `?predmet=` / `?grupa=`: pozitivan ceo broj ili `null` (neispravna vrednost iz linka je "nije izabrano"). */
export function parseId(v: unknown): number | null {
  return typeof v === 'string' && JE_ID.test(v) ? Number(v) : null;
}

/** `?namena=`: PREDAVANJE | TEST ili `null`. */
export function parseNamena(v: unknown): Namena | null {
  return NAMENE.includes(v as Namena) ? (v as Namena) : null;
}

const STATUSI: readonly ChipOpcija<StatusVarijante>[] = [
  { vrednost: 'NACRT', labela: 'Nacrt' },
  { vrednost: 'AKTIVNA', labela: 'Aktivna' },
  { vrednost: 'ARHIVIRANA', labela: 'Arhivirana' },
];

/**
 * Banka zadataka (`/banka?predmet&namena&grupa`): izbor predmeta i namene (Predavanja | Testovi) u zaglavlju, levo stablo
 * grupa, desno izabrana grupa. List: filter statusa i mreža kartica varijanti, "Nova varijanta" (samo grupa sa težinom);
 * unutrašnji čvor: zbirni brojači i podgrupe. URL je izvor istine za predmet, namenu i izbor; bez `?predmet` vraća se
 * zapamćen predmet (ili prvi po nazivu), jednom i sa `replaceUrl`. Izbor u stablu menja `?grupa` bez novog unosa u
 * istoriji. `BankaStore` je ovde (feature store stranice); izmene i greške idu kroz njega.
 */
@Component({
  selector: 'app-banka-page',
  imports: [
    ChipSelect, EmptyState, ErrorPanel, FilterBar, MatButton, MatButtonToggle, MatButtonToggleGroup, MatFormField, MatIcon,
    MatLabel, MatOption, MatSelect, MatTooltip, PageHeader, RouterLink, SkeletonRows, StabloGrupaComponent, StatTile,
    VarijantaKarticaComponent,
  ],
  providers: [BankaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../banka.css',
  template: `
    <app-page-header naslov="Banka zadataka" podnaslov="LaTeX zadaci po grupama, za predavanja uživo i za testove">
      <div kontekst class="bk-biraci">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="bk-predmet">
          <mat-label>Predmet</mat-label>
          <mat-select [value]="predmetId()" (selectionChange)="promeni({ predmet: $event.value })" data-predmet>
            @for (p of predmeti(); track p.id) {
              <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-button-toggle-group aria-label="Namena zadataka" hideSingleSelectionIndicator [value]="namenaV()"
          (change)="promeni({ namena: $event.value })" data-namena>
          <mat-button-toggle value="PREDAVANJE">Predavanja</mat-button-toggle>
          <mat-button-toggle value="TEST">Testovi</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <button akcije matButton="outlined" type="button" [disabled]="predmetId() === null" (click)="podesavanja()" data-preambula>
        <mat-icon svgIcon="settings" aria-hidden="true" />Podešavanja LaTeX-a
      </button>
      <button akcije matButton="filled" type="button" [disabled]="!spremno() || store.zauzeto()" (click)="novaGrupa(null)" data-nova-grupa>
        <mat-icon svgIcon="add" aria-hidden="true" />Nova grupa
      </button>
    </app-page-header>

    @if (predmetId() === null) {
      @if (predmet() === undefined && reference.status() !== 'loaded' && !reference.imaGresku()) {
        <app-skeleton-rows [redovi]="4" />
      } @else if (reference.status() === 'loaded' && predmeti().length === 0) {
        <app-empty-state naslov="Još nema predmeta" ikona="menu_book" tekst="Banka zadataka se vodi po predmetu; prvo dodaj predmet.">
          <a matButton="filled" routerLink="/predmeti"><mat-icon svgIcon="menu_book" aria-hidden="true" />Predmeti</a>
        </app-empty-state>
      } @else {
        <app-empty-state naslov="Izaberi predmet" ikona="quiz" tekst="Zadaci banke se vode po predmetu; izaberi ga iznad." />
      }
    } @else if (store.imaGresku()) {
      <app-error-panel [poruka]="store.greska()" (ponovo)="ucitajPonovo()" />
    } @else if (!spremno()) {
      <app-skeleton-rows [redovi]="6" />
    } @else if (store.stablo().length === 0) {
      <section class="lista-kartica" aria-label="Grupe zadataka">
        <app-empty-state naslov="Nema grupa: napravi prvu" ikona="quiz"
          [tekst]="'Grupa je fascikla zadataka ' + (store.namena() === 'TEST' ? 'za testove' : 'za predavanja') + '; u grupi su paralelne varijante jednog zadatka, a grupe mogu imati podgrupe.'">
          <button matButton="filled" type="button" [disabled]="store.zauzeto()" (click)="novaGrupa(null)" data-prva-grupa>
            <mat-icon svgIcon="add" aria-hidden="true" />Nova grupa
          </button>
        </app-empty-state>
      </section>
    } @else {
      <div class="bk-raspored">
        <section class="lista-kartica bk-panel-stabla" aria-labelledby="bk-naslov-stabla">
          <h2 id="bk-naslov-stabla" class="bk-panel-naslov">Grupe</h2>
          <app-stablo-grupa [cvorovi]="store.stablo()" [izabrano]="store.izabranaGrupaId()" [zauzeto]="store.zauzeto()"
            (izaberi)="store.izaberi($event)" (dodajPodgrupu)="novaGrupa($event)" (preimenuj)="store.preimenuj($event.id, $event.naziv)"
            (premesti)="premesti($event)" (obrisi)="obrisiGrupu($event)" />
        </section>

        <section class="lista-kartica bk-panel-grupe" aria-labelledby="bk-naslov-grupe" [attr.aria-busy]="!grupaUcitana() && !store.greskaGrupe()" data-grupa-panel>
          @if (cvor(); as c) {
            <header class="bk-zaglavlje-grupe">
              @if (store.putanja().length > 1) {
                <ol class="bk-putanja" aria-label="Putanja grupe">
                  @for (p of store.putanja(); track p.id; let poslednji = $last) {
                    <li>
                      @if (poslednji) {
                        <span aria-current="location">{{ p.naziv }}</span>
                      } @else {
                        <button type="button" class="bk-putanja-veza" (click)="store.izaberi(p.id)">{{ p.naziv }}</button>
                      }
                    </li>
                  }
                </ol>
              }
              <div class="bk-naslov-red">
                <h2 id="bk-naslov-grupe">{{ c.naziv }}</h2>
                @if (c.list) {
                  @if (c.tezina !== null) {
                    <span class="oznaka" data-tezina>Težina {{ c.tezina }}</span>
                  } @else {
                    <span class="oznaka ton-warn" data-tezina>Bez težine</span>
                  }
                }
              </div>
              <div class="bk-akcije-grupe">
                <button matButton type="button" (click)="izmeniGrupu(c)" data-izmeni-grupu><mat-icon svgIcon="edit" aria-hidden="true" />Izmeni</button>
                <a matButton [routerLink]="['/banka/grupe', c.id]" data-detalj-grupe>
                  <mat-icon svgIcon="open_in_new" aria-hidden="true" />{{ c.list ? 'Šema i uputstvo' : 'Opis grupe' }}
                </a>
                @if (!c.list) {
                  <button matButton="filled" type="button" [disabled]="store.zauzeto()" (click)="novaGrupa(c.id)" data-nova-podgrupa>
                    <mat-icon svgIcon="add" aria-hidden="true" />Nova podgrupa
                  </button>
                } @else if (c.tezina !== null) {
                  <a matButton="filled" routerLink="/banka/varijante/nova" [queryParams]="{ grupa: c.id }" data-nova-varijanta>
                    <mat-icon svgIcon="add" aria-hidden="true" />Nova varijanta
                  </a>
                } @else {
                  <button matButton="filled" type="button" disabled disabledInteractive matTooltip="Prvo zadaj težinu grupe" data-nova-varijanta>
                    <mat-icon svgIcon="add" aria-hidden="true" />Nova varijanta
                  </button>
                }
              </div>
            </header>

            @if (c.list) {
              @if (c.tezina === null) {
                <div class="bk-upozorenje" data-bez-tezine>
                  <mat-icon svgIcon="info" aria-hidden="true" />
                  <span>Grupa nema težinu, pa još ne prima varijante. Težina (1-5) je zajednička svim varijantama grupe.</span>
                  <button matButton="outlined" type="button" (click)="izmeniGrupu(c, true)">Zadaj težinu</button>
                </div>
              }
              <app-filter-bar [imaFiltera]="store.filterStatusa() !== 'SVE'" (ocisti)="store.postaviFilter('SVE')">
                <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="filterChipa()" (vrednostChange)="store.postaviFilter($event ?? 'SVE')" />
              </app-filter-bar>
              @if (store.greskaGrupe(); as g) {
                <app-error-panel naslov="Varijante grupe nisu učitane." [poruka]="g" (ponovo)="store.osveziStablo()" />
              } @else if (!grupaUcitana()) {
                <app-skeleton-rows [redovi]="3" />
              } @else if (store.varijante().length === 0) {
                <app-empty-state naslov="Grupa još nema varijanti" ikona="quiz"
                  tekst="Varijanta je jedan zadatak u LaTeX-u sa tačnim odgovorom; paralelne varijante iste grupe dobijaju se ravnomerno." />
              } @else if (store.filtriraneVarijante().length === 0) {
                <app-empty-state naslov="Nema varijanti sa izabranim statusom" ikona="filter_alt_off">
                  <button matButton="outlined" type="button" (click)="store.postaviFilter('SVE')">Očisti filter</button>
                </app-empty-state>
              } @else {
                <ul class="bk-mreza" aria-label="Varijante grupe">
                  @for (v of store.filtriraneVarijante(); track v.id) {
                    <li>
                      <app-varijanta-kartica [varijanta]="v" [zauzeto]="store.zauzeto()" (odobri)="promenaStatusa(v, 'odobri')"
                        (arhiviraj)="promenaStatusa(v, 'arhiviraj')" (vratiUNacrt)="promenaStatusa(v, 'vratiUNacrt')"
                        (dupliraj)="store.dupliraj(v.id)" (obrisi)="obrisiVarijantu(v)" />
                    </li>
                  }
                </ul>
              }
            } @else {
              @let b = store.brojaciIzabrane();
              <div class="bk-zbir" data-zbir>
                <app-stat-tile labela="Varijanti" ikona="quiz" [vrednost]="b.brojVarijanti" />
                <app-stat-tile labela="Aktivnih" ikona="check_circle" [vrednost]="b.brojAktivnih" />
                <app-stat-tile labela="Nacrta" ikona="edit" [vrednost]="b.brojNacrta" />
                <app-stat-tile labela="Grešaka u LaTeX-u" ikona="error" [vrednost]="b.brojGresaka" />
              </div>
              <p class="bk-objasnjenje">Na času se iz ove grupe biraju aktivne varijante svih njenih podgrupa.</p>
              <h3 class="bk-podnaslov">Podgrupe</h3>
              <ul class="bk-podgrupe">
                @for (d of c.deca; track d.id) {
                  <li>
                    <button type="button" class="bk-podgrupa" (click)="store.izaberi(d.id)" [attr.data-podgrupa]="d.id">
                      <span class="bk-podgrupa-naziv">{{ d.naziv }}</span><span class="sr-only">, </span>
                      <span class="bk-podgrupa-meta">{{ meta(d) }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
          }
        </section>
      </div>
    }
  `,
})
export class BankaPage {
  protected readonly store = inject(BankaStore);
  protected readonly reference = inject(ReferenceStore);
  private readonly preference = inject(PreferencesStore);
  private readonly obavestenja = inject(NotificationStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  /** Kartica posle čije radnje može da nestane (filter ili brisanje): njen indeks za fokus na sledeću. */
  private nestajeKartica: { grupaId: number | null; id: number; indeks: number } | null = null;
  /** "Zadaj težinu": kad grupa dobije težinu, dugme i upozorenje nestaju, pa fokus ide na "Nova varijanta". */
  private tezinaZaGrupu: number | null = null;

  /** Query parametri (`withComponentInputBinding`). */
  readonly predmet = input<string>();
  readonly namena = input<string>();
  readonly grupa = input<string>();

  protected readonly statusi = STATUSI;
  protected readonly predmetId = computed(() => parseId(this.predmet()));
  protected readonly namenaV = computed<Namena>(() => parseNamena(this.namena()) ?? 'PREDAVANJE');
  private readonly grupaIzUrla = computed(() => parseId(this.grupa()));
  protected readonly predmeti = computed<PredmetInfo[]>(() =>
    [...this.reference.predmeti()].sort((a, b) => (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr')),
  );
  /** Stablo predmeta iz URL-a je učitano (posle greške ili tokom učitavanja nije). */
  protected readonly spremno = computed(() => this.store.status() === 'loaded' && this.store.predmetId() === this.predmetId());
  protected readonly cvor = computed(() => nadjiCvor(this.store.stablo(), this.store.izabranaGrupaId()));
  protected readonly grupaUcitana = computed(() => this.store.grupa()?.id === this.store.izabranaGrupaId());
  protected readonly filterChipa = computed(() => (this.store.filterStatusa() === 'SVE' ? null : (this.store.filterStatusa() as StatusVarijante)));

  constructor() {
    this.reference.ucitaj();

    // bez ?predmet: zapamćen predmet i namena, inače prvi predmet po nazivu (čim stignu)
    effect(() => {
      if (this.predmet() !== undefined) {
        return;
      }
      const sacuvano = untracked(() => this.preference.filteri(KLJUC_BANKE));
      const predmet = parseId(sacuvano?.['predmet']) ?? this.predmeti()[0]?.id ?? null;
      if (predmet !== null) {
        const namena = parseNamena(untracked(this.namena)) ?? parseNamena(sacuvano?.['namena']) ?? 'PREDAVANJE';
        untracked(() => this.navigiraj({ predmet, namena }, true));
      }
    });

    // predmet ili namena iz URL-a: stablo iznova (izbor iz ?grupa ako ga ima u stablu), i pamte se
    effect(() => {
      const predmet = this.predmetId();
      const namena = this.namenaV();
      if (predmet !== null) {
        untracked(() => {
          this.preference.sacuvajFiltere(KLJUC_BANKE, { predmet: String(predmet), namena });
          this.store.ucitaj(predmet, namena, this.grupaIzUrla());
        });
      }
    });

    // ?grupa promenjen spolja (link, istorija): izbor u store-u, ako grupa postoji u učitanom stablu
    effect(() => {
      const grupa = this.grupaIzUrla();
      untracked(() => {
        if (grupa !== null && this.store.status() === 'loaded' && grupa !== this.store.izabranaGrupaId() && nadjiCvor(this.store.stablo(), grupa)) {
          this.store.izaberi(grupa);
        }
      });
    });

    // prva nova lista posle radnje nad karticom: ako je kartica nestala (filter statusa ili brisanje), fokus na karticu na
    // njenom mestu, inače na traku filtera; ako je još tu (ili je izabrana druga grupa), fokus se ne dira
    effect(() => {
      const lista = this.store.filtriraneVarijante();
      untracked(() => {
        const k = this.nestajeKartica;
        if (!k) {
          return;
        }
        this.nestajeKartica = null;
        if (k.grupaId === this.store.izabranaGrupaId() && !lista.some(v => v.id === k.id)) {
          this.posleCrtanja(() => {
            const veze = this.host.nativeElement.querySelectorAll<HTMLElement>('app-varijanta-kartica .bk-kartica-veza');
            return veze[Math.min(k.indeks, veze.length - 1)] ?? this.host.nativeElement.querySelector<HTMLElement>('app-filter-bar button');
          });
        }
      });
    });

    // "Zadaj težinu" uspelo: fokus na link "Nova varijanta" (dugme koje je imalo fokus je nestalo)
    effect(() => {
      const c = this.cvor();
      untracked(() => {
        const id = this.tezinaZaGrupu;
        if (id === null || !c) {
          return;
        }
        if (c.id !== id) {
          this.tezinaZaGrupu = null;
        } else if (c.tezina !== null) {
          this.tezinaZaGrupu = null;
          this.posleCrtanja(() => this.host.nativeElement.querySelector<HTMLElement>('a[data-nova-varijanta]'));
        }
      });
    });

    // izbor u store-u (klik, prvi list, nova ili obrisana grupa) -> ?grupa, bez novog unosa u istoriji
    effect(() => {
      const izabrana = this.store.izabranaGrupaId();
      const ucitano = this.store.status() === 'loaded';
      untracked(() => {
        if (ucitano && izabrana !== this.grupaIzUrla() && this.store.predmetId() === this.predmetId()) {
          this.navigiraj({ grupa: izabrana }, true);
        }
      });
    });
  }

  protected promeni(izmena: { predmet?: number; namena?: Namena }): void {
    this.navigiraj({ predmet: izmena.predmet ?? this.predmetId(), namena: izmena.namena ?? this.namenaV(), grupa: null }, false);
  }

  protected ucitajPonovo(): void {
    const predmet = this.predmetId();
    if (predmet !== null) {
      this.store.ucitaj(predmet, this.namenaV(), this.grupaIzUrla());
    }
  }

  protected meta(c: GrupaCvor): string {
    const opis = opisBrojaca(c);
    return c.list ? opis || 'bez varijanti' : `${sRecju(c.deca.length, 'podgrupa', 'podgrupe', 'podgrupa')}${opis ? ' · ' + opis : ''}`;
  }

  /** Nova grupa u korenu (`null`) ili podgrupa; nova grupa je posle uspeha izabrana. */
  protected novaGrupa(roditeljId: number | null): void {
    const predmetId = this.store.predmetId();
    const roditelj = nadjiCvor(this.store.stablo(), roditeljId);
    if (predmetId === null || this.store.zauzeto() || (roditeljId !== null && !roditelj)) {
      return;
    }
    const braca = roditelj ? roditelj.deca : this.store.stablo();
    GrupaDialog.otvori(this.dialog, {
      naslov: roditelj ? `Nova podgrupa u „${roditelj.naziv}“` : 'Nova grupa',
      zauzetiNazivi: braca.map(b => b.naziv),
      potvrdi: 'Napravi grupu',
    })
      .pipe(filter(Boolean))
      .subscribe(r => {
        const sadrzaj = { naziv: r.naziv, tezina: r.tezina, opis: null, uputstvo: null, polja: null };
        this.store.kreirajGrupu(roditelj ? { roditeljId: roditelj.id, ...sadrzaj } : { predmetId, namena: this.store.namena(), roditeljId: null, ...sadrzaj });
      });
  }

  /** Odobri, arhiviraj, vrati u nacrt; kartica može da nestane zbog filtera statusa. */
  protected promenaStatusa(v: VarijantaInfo, radnja: 'odobri' | 'arhiviraj' | 'vratiUNacrt'): void {
    this.zapamtiKarticu(v);
    this.store[radnja](v.id);
  }

  /**
   * Naziv i težina (list); unutrašnji čvor samo naziv. Šema i uputstvo su na detalju grupe. `zadajTezinu`: poziv iz upozorenja
   * "Zadaj težinu" (posle uspeha fokus ide na "Nova varijanta").
   */
  protected izmeniGrupu(c: GrupaCvor, zadajTezinu = false): void {
    const stablo = this.store.stablo();
    const roditelj = nadjiCvor(stablo, putanjaDo(stablo, c.id).at(-2)?.id ?? null);
    GrupaDialog.otvori(this.dialog, {
      naslov: 'Izmeni grupu',
      naziv: c.naziv,
      tezina: c.tezina,
      bezTezine: !c.list,
      tezinaObavezna: c.brojVarijanti > 0,
      zauzetiNazivi: (roditelj ? roditelj.deca : stablo).filter(b => b.id !== c.id).map(b => b.naziv),
    })
      .pipe(filter(Boolean))
      .subscribe(r => {
        if (r.naziv !== c.naziv || (c.list && r.tezina !== c.tezina)) {
          this.tezinaZaGrupu = zadajTezinu && r.tezina !== null ? c.id : null;
          this.store.preimenuj(c.id, r.naziv, c.list ? r.tezina : undefined);
        }
      });
  }

  protected premesti(id: number): void {
    PremestiDialog.otvori(this.dialog, { stablo: this.store.stablo(), id })
      .pipe(filter((r): r is number | null => r !== undefined))
      .subscribe(roditeljId => this.store.premesti(id, { roditeljId, rb: null }));
  }

  protected obrisiGrupu(id: number): void {
    const c = nadjiCvor(this.store.stablo(), id);
    if (!c) {
      return;
    }
    const tekst = c.brojVarijanti > 0
      ? [`Briše se i ${sRecju(c.brojVarijanti, 'varijanta', 'varijante', 'varijanti')} ove grupe, trajno.`,
        'Grupa čije su varijante korišćene na času se ne briše; njih arhiviraj.']
      : 'Grupa nema varijanti.';
    ConfirmDialog.otvori(this.dialog, { naslov: `Obrisati grupu „${c.naziv}“?`, tekst, potvrdi: 'Obriši grupu', destruktivno: true })
      .pipe(filter(Boolean))
      .subscribe(() => this.store.obrisiGrupu(id));
  }

  protected obrisiVarijantu(v: VarijantaInfo): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Obrisati varijantu „${imeVarijante(v)}“?`,
      tekst: ['Varijanta i njen render se brišu trajno.', 'Varijanta korišćena na času se ne briše; nju arhiviraj.'],
      potvrdi: 'Obriši varijantu',
      destruktivno: true,
    })
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.zapamtiKarticu(v);
        this.store.obrisiVarijantu(v.id);
      });
  }

  protected podesavanja(): void {
    const predmetId = this.predmetId();
    if (predmetId === null) {
      return;
    }
    const predmet = this.reference.predmeti().find(p => p.id === predmetId)?.naziv ?? null;
    PreambulaDialog.otvori(this.dialog, { predmetId, predmet })
      .pipe(filter(Boolean))
      .subscribe(r => {
        this.obavestenja.uspeh(r.preostalo > 0
          ? `Preambula je sačuvana. Renderovano ${r.renderovano}, preostalo ${r.preostalo}.`
          : `Preambula je sačuvana. Renderovano varijanti: ${r.renderovano}.`);
        this.store.osveziStablo();
      });
  }

  private zapamtiKarticu(v: VarijantaInfo): void {
    this.nestajeKartica = {
      grupaId: this.store.izabranaGrupaId(), id: v.id, indeks: this.store.filtriraneVarijante().findIndex(x => x.id === v.id),
    };
  }

  /**
   * Posle sledećeg crtanja fokus na `cilj()`, ali samo ako je fokus nestao (fokusiran element je uklonjen); korisnikov novi
   * fokus se ne dira.
   */
  private posleCrtanja(cilj: () => HTMLElement | null | undefined): void {
    afterNextRender(() => {
      const aktivni = this.document.activeElement;
      if (!aktivni || aktivni === this.document.body) {
        cilj()?.focus();
      }
    }, { injector: this.injector });
  }

  private navigiraj(queryParams: Record<string, string | number | null>, replaceUrl: boolean): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl });
  }
}

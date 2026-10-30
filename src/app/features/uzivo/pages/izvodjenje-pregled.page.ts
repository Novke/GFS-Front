import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { UzivoPutanje } from '../uzivo-putanje';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { opisVeze } from '../data-access/izvodjenje-pravila';
import { razlogGreske } from '../data-access/razlog-greske';
import { meriFormule } from '../ui/mera-formule';
import { IzvodjenjeRezultati, PregledZadatka, RezultatPitanja, UcesnikZadatka, medijUrl } from '../data-access/uzivo.models';
import { RangListaComponent } from '../ui/rang-lista.component';
import { RezultatPrikazComponent } from '../ui/rezultat-prikaz.component';
import { MERA_FORMULE, TekstFormuleComponent } from '../ui/tekst-formule.component';
import { ZadatakRezultatComponent, oznakaVidljiva } from '../ui/zadatak-rezultat.component';
import { NivoComponent } from '../../../shared/ui/nivo.component';
import { RangTacnostiTabela } from '../../../shared/ui/rang-tacnosti-tabela';
import { RangApi, RangTacnostiStavka } from '../../../core/api/rang.api';
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';

/** "Odgovora 23 · tačnih 61 %"; bez procenta kad pitanje nema tačan odgovor ili niko nije odgovorio. */
export function procenatTacnihTekst(p: Pick<RezultatPitanja, 'brojOdgovora' | 'procenatTacnih'>): string {
  const odgovora = `Odgovora ${p.brojOdgovora}`;
  return p.procenatTacnih === null || p.procenatTacnih === undefined ? odgovora : `${odgovora} · tačnih ${p.procenatTacnih} %`;
}

export interface OznakaRunde {
  /** Redni broj runde istog slajda (1, 2, ...). */
  runda: number;
  /** Koliko rundi je taj slajd imao. */
  ukupno: number;
}

/**
 * Runde istog slajda (nastavnik je pitanje ponovio) dobijaju "1. runda", "2. runda"; slajd sa jednom rundom nema oznaku
 * (`ukupno` = 1). Slajd je isti po `slajdId`, a kad slajda više nema, po `slajdId` iz snimka (pitanja ili zadatka; sva tri su
 * id-jevi slajdova, nikad id grupe), pa po `pitanjeId` iz snimka pitanja. Niz je poravnat sa ulazom.
 */
export function oznakeRundi(pitanja: readonly RezultatPitanja[]): OznakaRunde[] {
  const kljuc = (p: RezultatPitanja) =>
    p.slajdId ?? p.pitanje?.slajdId ?? p.zadatak?.slajdId
      ?? (p.pitanje ? `pitanje-${p.pitanje.pitanjeId}` : `runda-${p.rundaId}`);
  const ukupno = new Map<number | string, number>();
  for (const p of pitanja) {
    ukupno.set(kljuc(p), (ukupno.get(kljuc(p)) ?? 0) + 1);
  }
  // `redniBroj` na serveru je broj runde unutar slajda, pa se runde broje po redosledu (pitanja su po redu otvaranja).
  const vidjeno = new Map<number | string, number>();
  return pitanja.map(p => {
    const k = kljuc(p);
    const runda = (vidjeno.get(k) ?? 0) + 1;
    vidjeno.set(k, runda);
    return { runda, ukupno: ukupno.get(k) ?? 1 };
  });
}

/** Putanja grupe zadatka od korena: "Konverzije › 2 → 10". */
export function putanjaTekst(z: Pick<PregledZadatka, 'putanja' | 'grupaNaziv'>): string {
  return z.putanja.length ? z.putanja.map(g => g.naziv).join(' › ') : z.grupaNaziv;
}

/** Runda od pre nivoa nema `nivoi`: njen nivo se ne prikazuje (`nivo` `null` bi se pogrešno čitao kao "svi"). */
export function imaNivoe(z: Pick<PregledZadatka, 'nivoi'>): boolean {
  return Object.keys(z.nivoi ?? {}).length > 0;
}

/** Nivo izvučene varijante iz snimka runde (`null` za varijantu bez nivoa u snimku ili učesnika bez varijante). */
export function nivoVarijante(z: Pick<PregledZadatka, 'nivoi'>, varijantaId: number | null): number | null {
  return varijantaId === null ? null : (z.nivoi?.[String(varijantaId)] ?? null);
}

/** Jedno uneto polje učesnika: oznaka (samo kad varijanta ima više polja), šta je uneo i da li je tačno. */
export interface UnetoPolje { kljuc: string; oznaka: string | null; vrednost: string; tacno: boolean; formula: boolean; }

/**
 * Šta je učesnik uneo, po polju redom šeme njegove varijante (iz snimka runde u rezultatu): `uneto` sa servera (vrednost
 * kako je uneta, opcije njihovim tekstom) i `polja` (tačnost). Oznaka polja samo kad varijanta ima više polja (kao na tabli,
 * `oznakaVidljiva`). Bez odgovora prazna lista; polje bez unete vrednosti (stariji server) je "—".
 */
export function unetoUcesnika(z: PregledZadatka, u: UcesnikZadatka): UnetoPolje[] {
  if (!u.polja) return [];
  const ishod = u.polja;
  const varijanta = z.rezultat.varijante.find(v => v.varijantaId === u.varijantaId);
  const sema = varijanta?.polja ?? [];
  const kljucevi = [...sema.map(p => p.kljuc).filter(k => k in ishod), ...Object.keys(ishod).filter(k => !sema.some(p => p.kljuc === k))];
  const visePolja = varijanta ? oznakaVidljiva(varijanta) : kljucevi.length > 1;
  return kljucevi.map(kljuc => {
    const p = sema.find(x => x.kljuc === kljuc);
    return {
      kljuc, oznaka: visePolja ? (p?.oznaka ?? kljuc) : null, vrednost: u.uneto?.[kljuc] ?? '—', tacno: ishod[kljuc] === true,
      formula: p?.tip === 'JEDAN_TACAN' || p?.tip === 'VISE_TACNIH',
    };
  });
}

/** Ukupno za učesnika: "tačno", "netačno", "bez odgovora" (rad na papiru i neodgovoreni). */
export function ishodUkupno(u: UcesnikZadatka): string {
  if (!u.odgovorio) return 'bez odgovora';
  return u.tacno === true ? 'tačno' : u.tacno === false ? 'netačno' : '—';
}

/** Pregled sačuvanog izvođenja posle časa (spec 6.2): pitanja i zadaci po redu otvaranja sa rezultatima i rang-lista. */
@Component({
  selector: 'app-izvodjenje-pregled',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, RangListaComponent, RezultatPrikazComponent,
    TekstFormuleComponent, ZadatakRezultatComponent, NivoComponent, RangTacnostiTabela],
  template: `
    <div class="uz-ed-strana uz-pr">
      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }

      @if (podaci(); as r) {
        <header class="uz-pr-zaglavlje">
          <a mat-icon-button [routerLink]="'/' + rute.prezentacijaIzvodjenja(r.izvodjenje.prezentacija.id)"
             aria-label="Nazad na izvođenja">
            <mat-icon svgIcon="arrow_back" />
          </a>
          <div class="uz-pr-naslovi">
            <h1>{{ r.izvodjenje.prezentacija.naziv }}</h1>
            <p class="uz-pr-meta">
              <span>{{ r.izvodjenje.pocetak | date: 'd.M.yyyy. HH:mm' }}</span>
              <span>{{ veza() }}</span>
              <span>Učesnika: {{ r.izvodjenje.brojUcesnika }}</span>
            </p>
          </div>
          @if (r.izvodjenje.status === 'AKTIVNO') {
            <a mat-flat-button [routerLink]="'/' + rute.izvodjenjeKonzola(r.izvodjenje.id)">Nastavi</a>
          }
        </header>

        @if (!r.izvodjenje.cuvanje) {
          <section class="uz-ed-prazno-stanje">
            <mat-icon aria-hidden="true" svgIcon="visibility_off" />
            <h2>Rezultati ovog izvođenja nisu čuvani.</h2>
            <p>Odgovori studenata postoje samo tokom izvođenja.</p>
          </section>
        } @else {
          @if (r.izvodjenje.status === 'AKTIVNO') {
            <p class="uz-ed-napomena">Izvođenje je još u toku, rezultati se menjaju.</p>
          }
          <section class="rezim-dan uz-dan uz-pr-karta" aria-labelledby="pr-rang-tacnosti" data-rang-tacnosti>
            <header class="uz-pr-karta-zaglavlje"><h2 id="pr-rang-tacnosti">Rang tačnosti</h2></header>
            <div class="uz-pr-sadrzaj">
              @if (rangGreska(); as g) {
                <p class="uz-ed-greska" role="alert">{{ g }}</p>
              } @else if (rang(); as rangLista) {
                <app-rang-tacnosti-tabela [stavke]="rangLista" [kolone]="takmicenje() ? ['poeni'] : []" [linkoviStudenata]="true" />
                <p class="uz-ed-napomena">Redosled: više ★ (pitanje 1, zadatak nivo varijante), pa kraće prosečno vreme. Tačnost (neodgovoreno je netačno) je podatak; klik na ★, ✓ ili ⏱ sortira.</p>
              } @else {
                <mat-progress-bar mode="indeterminate" aria-label="Učitavanje ranga" />
              }
            </div>
          </section>
          @for (k of kartice(); track k.p.rundaId; let i = $index) {
            <section class="rezim-dan uz-dan uz-pr-karta" [attr.aria-labelledby]="'pitanje-' + k.p.rundaId">
              <header class="uz-pr-karta-zaglavlje">
                <h2 [id]="'pitanje-' + k.p.rundaId">{{ k.p.zadatak ? 'Zadatak' : 'Pitanje' }} {{ i + 1 }}</h2>
                @if (k.p.rbSlajda) {
                  <span class="uz-ed-napomena">slajd {{ k.p.rbSlajda }}</span>
                }
                @if (k.oznaka.ukupno > 1) {
                  <span class="uz-cip uz-cip--jos">{{ k.oznaka.runda }}. runda</span>
                }
                @if (k.p.zadatak; as z) {
                  @if (imaNivoe(z)) {
                    <app-nivo [nivo]="z.nivo" natpisTekst="Nivo runde" data-nivo-runde />
                  }
                }
              </header>
              <div class="uz-pr-sadrzaj">
                @if (k.p.pitanje; as pitanje) {
                  <app-tekst-formule class="uz-md uz-pr-tekst" [tekst]="pitanje.tekst" [markdown]="true" />
                  @if (pitanje.slikaId; as slika) {
                    <img class="uz-pr-slika" [src]="url(slika)" alt="Slika uz pitanje">
                  }
                  @if (k.p.rezultat; as rezultat) {
                    <app-rezultat-prikaz [rezultat]="rezultat" [pitanje]="pitanje" [prikaziTacnih]="false" />
                  }
                } @else if (k.p.zadatak; as z) {
                  <p class="uz-pr-tekst">{{ putanja(z) }}</p>
                  <app-zadatak-rezultat [rezultat]="z.rezultat" />
                  @if (z.ucesnici.length) {
                    <table class="uz-ed-tabela uz-pr-ucesnici">
                      <caption class="uz-ed-napomena">Učesnici i njihove varijante</caption>
                      <thead>
                        <tr>
                          <th scope="col">Učesnik</th>
                          <th scope="col">Varijanta</th>
                          <th scope="col">Uneto</th>
                          <th scope="col">Ukupno</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (u of z.ucesnici; track u.ucesnikId) {
                          <tr>
                            <td>{{ u.ime }}</td>
                            <td>
                              {{ u.varijantaNaziv ?? '—' }}
                              @if (nivoVarijante(z, u.varijantaId); as nivo) {
                                <app-nivo [nivo]="nivo" [natpis]="false" data-nivo-varijante />
                              }
                            </td>
                            <td>
                              @for (f of uneto(z, u); track f.kljuc) {
                                <span class="uz-pr-uneto" [class.uz-pr-uneto--tacno]="f.tacno" [class.uz-pr-uneto--netacno]="!f.tacno"
                                      [attr.data-uneto]="f.kljuc">
                                  @if (f.oznaka) { <span class="uz-pr-uneto-oznaka">{{ f.oznaka }}:</span> }
                                  <span class="uz-pr-uneto-vrednost">@if (f.formula) { <app-tekst-formule [tekst]="f.vrednost" /> } @else { {{ f.vrednost }} }</span>
                                  <span class="uz-pr-uneto-znak" aria-hidden="true">{{ f.tacno ? '✓' : '✗' }}</span>
                                  <span class="uz-sr">{{ f.tacno ? 'tačno' : 'netačno' }}</span>
                                </span>
                              } @empty {
                                —
                              }
                            </td>
                            <td>{{ ukupnoUcesnika(u) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                }
              </div>
              <p class="uz-pr-podnozje">
                {{ tekst(k.p) }}
                @if (k.oznaka.ukupno > 1 && takmicenje() && k.oznaka.runda < k.oznaka.ukupno) {
                  <span class="uz-ed-napomena">Za poene važi samo poslednja runda.</span>
                }
              </p>
            </section>
          } @empty {
            <section class="uz-ed-prazno-stanje">
              <mat-icon aria-hidden="true" svgIcon="quiz" />
              <h2>U ovom izvođenju nije bilo pitanja.</h2>
            </section>
          }

          @if (takmicenje()) {
            <section class="rezim-dan uz-dan uz-pr-karta" aria-labelledby="pr-rang">
              <header class="uz-pr-karta-zaglavlje"><h2 id="pr-rang">Rang-lista</h2></header>
              <div class="uz-pr-sadrzaj"><app-rang-lista [stavke]="r.rangLista" /></div>
            </section>
          }
        }
      } @else if (!greska()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje pregleda" />
      }
    </div>
  `,
})
export class IzvodjenjePregledPage {
  private readonly api = inject(IzvodjenjaApi);
  private readonly mrvice = inject(BreadcrumbService);

  protected readonly rute = UzivoPutanje;
  protected readonly podaci = signal<IzvodjenjeRezultati | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly rang = signal<RangTacnostiStavka[] | null>(null);
  protected readonly rangGreska = signal<string | null>(null);
  private readonly rangApi = inject(RangApi);

  protected readonly url = medijUrl;
  protected readonly tekst = procenatTacnihTekst;
  protected readonly putanja = putanjaTekst;
  protected readonly uneto = unetoUcesnika;
  protected readonly ukupnoUcesnika = ishodUkupno;
  protected readonly imaNivoe = imaNivoe;
  protected readonly nivoVarijante = nivoVarijante;
  protected readonly veza = computed(() => {
    const r = this.podaci();
    return r ? opisVeze(r.izvodjenje) : '';
  });
  protected readonly takmicenje = computed(() => this.podaci()?.takmicenje ?? false);
  protected readonly kartice = computed(() => {
    const pitanja = this.podaci()?.pitanja ?? [];
    const oznake = oznakeRundi(pitanja);
    return pitanja.map((p, i) => ({ p, oznaka: oznake[i] }));
  });

  constructor() {
    const id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    this.api.rezultati(id).subscribe({
      next: r => {
        this.podaci.set(r);
        this.mrvice.postavi(`Pregled · ${r.izvodjenje.prezentacija.naziv}`);
      },
      error: e => this.greska.set(razlogGreske(e, 'Pregled nije učitan.')),
    });
    this.rangApi.izvodjenje(id).subscribe({
      next: r => this.rang.set(r),
      error: e => this.rangGreska.set(razlogGreske(e, 'Rang nije učitan.')),
    });
  }
}

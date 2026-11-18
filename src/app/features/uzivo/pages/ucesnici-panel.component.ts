import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { NastavnickiZadatak, UcesnikStanje, Utisanje } from '../data-access/uzivo.models';
import { grupisiCifre } from '../ui/format';
import { prikazVremena } from '../../../core/api/rang.api';

/** Ime učesnika: 1-40 znakova posle `trim` (kao server, spec 2.8). */
export const IME_MAKS = 40;

/** Dijalog za novo ime učesnika; vraća ime bez razmaka na krajevima ili `undefined`. */
@Component({
  selector: 'app-preimenuj-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <form (ngSubmit)="sacuvaj()">
      <h2 mat-dialog-title>Preimenuj učesnika</h2>
      <mat-dialog-content>
        <mat-form-field class="uz-kon-polje">
          <mat-label>Ime</mat-label>
          <input matInput [formControl]="ime" [maxlength]="maks" autocomplete="off" cdkFocusInitial>
          <mat-hint align="end">{{ ime.value.length }}/{{ maks }}</mat-hint>
          @if (ime.invalid) { <mat-error>Ime ima od 1 do {{ maks }} znakova.</mat-error> }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Otkaži</button>
        <button mat-flat-button type="submit">Sačuvaj</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class PreimenujDialog {
  private readonly ref = inject<MatDialogRef<PreimenujDialog, string>>(MatDialogRef);
  protected readonly maks = IME_MAKS;
  protected readonly ime = new FormControl(inject<string>(MAT_DIALOG_DATA), {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(IME_MAKS), Validators.pattern(/\S/)],
  });

  protected sacuvaj(): void {
    this.ime.markAsTouched();
    if (this.ime.invalid) return;
    this.ref.close(this.ime.value.trim());
  }
}

/** Podaci dijaloga izbacivanja: ime, da li izvođenje ima predavanje, da li je učesnik prijavljen student (ima karton). */
export interface IzbaciPodaci { ime: string; predavanje: boolean; student: boolean; }
/** Ishod dijaloga izbacivanja: samo iz ovog izvođenja ili do kraja predavanja; `undefined` = odustao. */
export type IzbaciIshod = 'izvodjenje' | 'predavanje';

/**
 * Izbacivanje (moderacija, spec 2026-11-18): "Samo iz ove prezentacije" ili, kad je izvođenje pokrenuto sa predavanja,
 * "Do kraja predavanja". Ni gost ne ulazi ponovo sa istog telefona (kolačić), pa tekst ne nudi "novo ime".
 */
@Component({
  selector: 'app-izbaci-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  styles: `
    .destruktivno {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
  template: `
    <h2 mat-dialog-title>Izbaciti „{{ p.ime }}“?</h2>
    <mat-dialog-content id="uz-izbaci-opis">
      <p>Učesnik više ne može da odgovara, a njegovi odgovori nestaju sa table. Sa istog telefona ne može ponovo da uđe.</p>
      @if (p.predavanje) {
        <p>„Do kraja predavanja“ ga ne pušta ni u ostale prezentacije ovog predavanja.</p>
      }
      @if (p.student) { <p>Na kartonu studenta ostaje oznaka.</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton data-odustani [mat-dialog-close]="undefined" cdkFocusInitial>Odustani</button>
      <button matButton="filled" class="destruktivno" data-izbaci-izvodjenje [mat-dialog-close]="'izvodjenje'">
        Samo iz ove prezentacije
      </button>
      @if (p.predavanje) {
        <button matButton="filled" class="destruktivno" data-izbaci-predavanje [mat-dialog-close]="'predavanje'">
          Do kraja predavanja
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class IzbaciDialog {
  protected readonly p = inject<IzbaciPodaci>(MAT_DIALOG_DATA);
}

/** Šta konzola traži od servera za jednog učesnika (meni moderacije). */
export type Moderacija =
  | { vrsta: 'izbaci'; id: number; predavanje: boolean }
  | { vrsta: 'utisaj'; id: number; utisan: Utisanje | null }
  | { vrsta: 'sakrij'; id: number; rundaId: number; sakriven: boolean };

/** Kratak opis utišavanja uz ime. */
export const OPIS_UTISANJA: Record<Utisanje, string> = { PITALICE: 'utišan: pitalice', SVE: 'utišan: pitalice i zadaci' };

/** Varijanta učesnika u trenutnoj Zadatak rundi: naziv (ili redni broj izvučene) i da li se radi na papiru. */
interface VarijantaUcesnika { naziv: string; papir: boolean; }

/**
 * Učesnik u spisku "Ovo pitanje": `rb` je redni broj odgovora u trenutnoj rundi (1 = najbrži), `null` za one koji nisu
 * odgovorili.
 */
interface UcesnikRed { u: UcesnikStanje; rb: number | null; }

/**
 * Redosled za "Ovo pitanje" (rang tačnosti, spec 5): ko je odgovorio na trenutnu rundu, po vremenu odgovora (najbrži
 * prvi; stari backend bez `vremeMs` ostavlja redosled prijave), pa ostali redom prijave.
 */
export function redosledOdgovora(ucesnici: readonly UcesnikStanje[]): UcesnikRed[] {
  const odgovorili = ucesnici.filter(u => u.odgovorio)
    .map((u, i) => ({ u, i }))
    .sort((a, b) => (a.u.vremeMs ?? Number.MAX_SAFE_INTEGER) - (b.u.vremeMs ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map(({ u }, i) => ({ u, rb: i + 1 }));
  return [...odgovorili, ...ucesnici.filter(u => !u.odgovorio).map(u => ({ u, rb: null }))];
}

/**
 * Spisak učesnika (spec 2.8, 6.4): ime, povezan (tačka i tekst), odgovorio na trenutnu rundu, poeni uz takmičenje;
 * preimenuj u dijalogu, izbaci uz potvrdu. Oni koji su odgovorili na trenutnu rundu su gore, po brzini, sa vremenom,
 * ishodom (✓/✗ kad pitanje ima tačan odgovor) i kratkim odgovorom; ostali ispod, redom prijave (rang tačnosti, spec 5).
 * U Zadatak rundi uz ime još dodeljena varijanta i ishod (tačno, netačno, nije odgovorio; na papiru bez ishoda), samo u
 * konzoli (banka spec 4.2.5).
 */
@Component({
  selector: 'app-ucesnici-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  host: { class: 'uz-kon-ucesnici' },
  // Zadatak runda: varijanta i ishod uz ime (u komponenti: početni paket je na granici budžeta)
  styles: `
    /* red se lomi: ime dobija bar 10 em (pre toga je u uskoj konzoli ostajalo ~30 px i ime se lomilo slovo po slovo), a čip
       varijante, ishod, vreme i dugmad idu u sledeći red kad ne staju */
    .uz-kon-ucesnik { flex-wrap: wrap; row-gap: 0; }
    .uz-kon-ucesnik .uz-kon-ucesnik-ime { flex: 1 1 10em; overflow-wrap: break-word; padding: 6px 0; }
    .uz-kon-ucesnik-stanje { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-left: auto; padding-bottom: 4px; }
    .uz-kon-akcije { display: flex; flex: none; align-items: center; margin-left: auto; }
    .uz-kon-ucesnik-stanje + .uz-kon-akcije { margin-left: 0; }
    .uz-kon-varijanta {
      flex: none; max-width: 7em; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px;
      font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .uz-kon-ishod { flex: none; color: var(--muted); font-size: 13px; }
    .uz-kon-ishod--tacno { color: var(--ok); font-weight: 600; }
    .uz-kon-ishod--netacno { color: var(--danger); font-weight: 600; }
    .uz-kon-rb { flex: none; min-width: 1.6em; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; }
    .uz-kon-odgovor { display: block; color: var(--ink-2); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .uz-kon-odgovor--sakriven { color: var(--muted); font-style: italic; }
    .uz-kon-vreme { flex: none; color: var(--muted); font-size: 13px; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .uz-kon-ikona-tacno { flex: none; color: var(--ok); }
    .uz-kon-ikona-netacno { flex: none; color: var(--danger); }
    /* moderacija: student koji na ovom predavanju već ima oznaku ponašanja */
    .uz-kon-ucesnik--oznacen { background: color-mix(in srgb, var(--warn) 16%, var(--surface)); border-radius: 6px; }
    .uz-kon-ucesnik--oznacen .uz-kon-ucesnik-ime { color: var(--ink); }
    .uz-kon-oznake { margin-left: 6px; color: var(--warn); font-size: 13px; font-weight: 600; white-space: nowrap; }
    .uz-kon-utisan { display: inline-block; margin-left: 6px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px;
      color: var(--muted); font-size: 12px; white-space: nowrap; }
  `,
  template: `
    <p class="uz-kon-zbir">Povezano {{ povezanih() }} od {{ ucesnici().length }}</p>
    @if (ucesnici().length) {
      <ul class="uz-kon-ucesnici-lista">
        @for (r of redosled(); track r.u.id) {
          @let u = r.u;
          <li class="uz-kon-ucesnik" [class.uz-kon-ucesnik--odsutan]="!u.povezan" [class.uz-kon-ucesnik--oznacen]="u.oznacen"
              [attr.data-ucesnik]="u.id">
            <span class="uz-kon-rb">{{ r.rb ? r.rb + '.' : '' }}</span>
            <span class="uz-kon-tacka" [class.uz-kon-tacka--da]="u.povezan" aria-hidden="true"></span>
            <span class="uz-kon-ucesnik-ime">
              {{ u.ime }}<span class="uz-sr">{{ u.povezan ? ', povezan' : ', nije povezan' }}{{ u.oznacen ? ', već označen na ovom predavanju' : '' }}</span>
              @if (u.brojOznaka) {
                <span class="uz-kon-oznake" data-oznake [title]="'Oznaka ponašanja na kartonu: ' + u.brojOznaka">
                  <span aria-hidden="true">⚑ {{ u.brojOznaka }}</span><span class="uz-sr">, oznaka na kartonu: {{ u.brojOznaka }}</span>
                </span>
              }
              @if (u.utisan; as ut) { <span class="uz-kon-utisan" data-utisan>{{ opisUtisanja[ut] }}</span> }
              @if (u.odgovorio && u.odgovor) {
                <span class="uz-kon-odgovor" [class.uz-kon-odgovor--sakriven]="u.odgovorSakriven" [title]="u.odgovor">
                  {{ u.odgovorSakriven ? '(sakriveno) ' : '' }}{{ u.odgovor }}
                </span>
              }
            </span>
            <span class="uz-kon-ucesnik-stanje">
              @if (varijantaOd(u); as v) {
                <span class="uz-kon-varijanta" [title]="'Varijanta ' + v.naziv">{{ v.naziv }}</span>
                @if (v.papir) {
                  <span class="uz-kon-ishod">na papiru</span>
                } @else {
                  @let ishod = u.tacno === true ? 'tačno' : u.tacno === false ? 'netačno' : u.odgovorio ? 'odgovorio' : 'nije odgovorio';
                  <span class="uz-kon-ishod" [class.uz-kon-ishod--tacno]="u.tacno === true" [class.uz-kon-ishod--netacno]="u.tacno === false">{{ ishod }}</span>
                }
              }
              @if (u.odgovorio && u.vremeMs !== null && u.vremeMs !== undefined) { <span class="uz-kon-vreme">{{ vreme(u.vremeMs) }}</span> }
              @if (u.odgovorio) {
                @if (varijantaOd(u)) {
                  <mat-icon class="uz-kon-odgovorio" aria-label="odgovorio" svgIcon="check" />
                } @else if (u.tacno === true) {
                  <mat-icon class="uz-kon-ikona-tacno" aria-label="tačno" svgIcon="check_circle" />
                } @else if (u.tacno === false) {
                  <mat-icon class="uz-kon-ikona-netacno" aria-label="netačno" svgIcon="cancel" />
                } @else {
                  <mat-icon class="uz-kon-odgovorio" aria-label="odgovorio" svgIcon="check" />
                }
              }
              @if (takmicenje()) { <span class="uz-kon-poeni">{{ poeni(u.poeni) }}</span> }
            </span>
            <span class="uz-kon-akcije">
              <button mat-icon-button type="button" [attr.aria-label]="'Preimenuj ' + u.ime" (click)="preimenujDialog(u)">
                <mat-icon svgIcon="edit" />
              </button>
              <button mat-icon-button type="button" [attr.aria-label]="'Moderacija: ' + u.ime" [matMenuTriggerFor]="meni"
                      [matMenuTriggerData]="{ u }" data-moderacija>
                <mat-icon svgIcon="more_vert" />
              </button>
            </span>
          </li>
        }
      </ul>
    } @else {
      <p class="uz-prazno">Još niko nije ušao.</p>
    }
    <mat-menu #meni="matMenu">
      <ng-template matMenuContent let-u="u">
        @if (mozeSakriti(u)) {
          @if (u.odgovorSakriven) {
            <button mat-menu-item type="button" data-vrati-odgovor (click)="sakrij(u, false)">
              <mat-icon svgIcon="visibility" />Vrati odgovor na tablu
            </button>
          } @else {
            <button mat-menu-item type="button" data-sakrij-odgovor (click)="sakrij(u, true)">
              <mat-icon svgIcon="visibility_off" />Sakrij odgovor sa table
            </button>
          }
        }
        @if (u.utisan !== 'PITALICE') {
          <button mat-menu-item type="button" data-utisaj="PITALICE" (click)="utisaj(u, 'PITALICE')">
            <mat-icon svgIcon="pause" />Utišaj pitalice
          </button>
        }
        @if (u.utisan !== 'SVE') {
          <button mat-menu-item type="button" data-utisaj="SVE" (click)="utisaj(u, 'SVE')">
            <mat-icon svgIcon="pause" />Utišaj pitalice i zadatke
          </button>
        }
        @if (u.utisan) {
          <button mat-menu-item type="button" data-ukloni-utisavanje (click)="utisaj(u, null)">
            <mat-icon svgIcon="play_arrow" />Ukloni utišavanje
          </button>
        }
        <button mat-menu-item type="button" data-izbaci (click)="izbaciPotvrda(u)">
          <mat-icon svgIcon="person_remove" />Izbaci…
        </button>
      </ng-template>
    </mat-menu>
  `,
})
export class UcesniciPanelComponent {
  readonly ucesnici = input<readonly UcesnikStanje[]>([]);
  readonly takmicenje = input<boolean>(false);
  /** Zadatak trenutnog slajda (`null` van njega): nazivi izvučenih varijanti i rad na papiru. */
  readonly zadatak = input<NastavnickiZadatak | null>(null);
  /** Izvođenje je pokrenuto sa predavanja: izbacivanje nudi i "Do kraja predavanja". */
  readonly predavanje = input<boolean>(false);
  /** Trenutna runda kad je pitanje kratak tekst (`null` inače): tada meni nudi sakrivanje odgovora učesnika. */
  readonly tekstRunda = input<number | null>(null);
  readonly preimenuj = output<{ id: number; ime: string }>();
  readonly moderacija = output<Moderacija>();

  private readonly dialog = inject(MatDialog);
  protected readonly poeni = grupisiCifre;
  protected readonly vreme = prikazVremena;
  protected readonly opisUtisanja = OPIS_UTISANJA;
  protected readonly redosled = computed(() => redosledOdgovora(this.ucesnici()));
  protected readonly povezanih = computed(() => this.ucesnici().filter(u => u.povezan).length);
  protected readonly varijante = computed(() => {
    const z = this.zadatak();
    const papir = new Set((z?.rezultat?.varijante ?? []).filter(r => r.polja.length === 0).map(r => r.varijantaId));
    return new Map<number, VarijantaUcesnika>((z?.varijante ?? []).map((v, i) => [
      v.varijantaId, { naziv: v.naziv ?? `V${i + 1}`, papir: papir.has(v.varijantaId) },
    ]));
  });

  /** Dodeljena varijanta u trenutnoj Zadatak rundi (`null` van nje i dok učesnik nema dodelu). */
  protected varijantaOd(u: UcesnikStanje): VarijantaUcesnika | null {
    return u.varijantaId == null ? null : this.varijante().get(u.varijantaId) ?? null;
  }

  protected preimenujDialog(u: UcesnikStanje): void {
    this.dialog.open<PreimenujDialog, string, string>(PreimenujDialog, { data: u.ime, width: '400px', maxWidth: '95vw' })
      .afterClosed().subscribe(ime => {
        if (ime && ime !== u.ime) this.preimenuj.emit({ id: u.id, ime });
      });
  }

  /** Sakrivanje odgovora iz menija: samo kratak tekst u trenutnoj rundi i samo kad učesnik ima odgovor. */
  protected mozeSakriti(u: UcesnikStanje): boolean {
    return this.tekstRunda() != null && u.odgovorio && !!u.odgovor;
  }

  protected sakrij(u: UcesnikStanje, sakriven: boolean): void {
    const rundaId = this.tekstRunda();
    if (rundaId != null) this.moderacija.emit({ vrsta: 'sakrij', id: u.id, rundaId, sakriven });
  }

  protected utisaj(u: UcesnikStanje, utisan: Utisanje | null): void {
    this.moderacija.emit({ vrsta: 'utisaj', id: u.id, utisan });
  }

  protected izbaciPotvrda(u: UcesnikStanje): void {
    const data: IzbaciPodaci = { ime: u.ime, predavanje: this.predavanje(), student: !!u.student };
    this.dialog.open<IzbaciDialog, IzbaciPodaci, IzbaciIshod>(IzbaciDialog, {
      data, width: '480px', maxWidth: '95vw', role: 'alertdialog', ariaDescribedBy: 'uz-izbaci-opis',
    }).afterClosed().subscribe(ishod => {
      if (ishod) this.moderacija.emit({ vrsta: 'izbaci', id: u.id, predavanje: ishod === 'predavanje' });
    });
  }
}

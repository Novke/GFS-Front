import { ENTER } from '@angular/cdk/keycodes';
import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, input, output, signal, viewChildren } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChipGrid, MatChipInput, MatChipInputEvent, MatChipRemove, MatChipRow } from '@angular/material/chips';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';

import { StatusChip } from '../../../shared/ui/status-chip';
import { OdgovorPolja, Polje } from '../data-access/banka.models';
import { odgovorPopunjen, prazanOdgovor } from '../data-access/polja';
import { brojIzUnosa, prikazBroja } from './polja-editor.component';

/** Granice prihvatljivih odgovora polja TEKST (`BankaPP`). */
export const MAX_PRIHVATLJIVIH = 10;
export const MAX_PRIHVATLJIV = 200;

let sledeci = 0;

/**
 * Tačni odgovori varijante po šemi polja grupe, polje po polje (`fieldset` sa oznakom, ključem i bedžom "Popunjeno" /
 * "Nedostaje" po `odgovorPopunjen`): BROJ je tekstualno polje sa decimalnim zarezom ili tačkom (čuva se kao broj, neispravan
 * unos je `NaN` i ostaje "Nedostaje"), TEKST lista prihvatljivih odgovora kao čipovi (Enter ili izlazak iz polja dodaje, zarez
 * je deo odgovora; do 10, svaki do 200 znakova), JEDAN_TACAN radio i VISE_TACNIH kvačice nad opcijama polja. Kontrolisana komponenta, kao `app-polja-editor`:
 * svaka izmena emituje sve odgovore (`odgovoriPromena`, tačno ključevi šeme, nepopunjeni prazni), roditelj ih vraća kroz
 * `odgovori`. U svakom odgovoru je postavljeno samo svojstvo tipa polja (server odbija ostala).
 */
@Component({
  selector: 'app-odgovori-forma',
  imports: [
    MatCheckbox, MatChipGrid, MatChipInput, MatChipRemove, MatChipRow, MatError, MatFormField, MatHint, MatIcon, MatInput, MatLabel,
    MatRadioButton, MatRadioGroup, MatSuffix, StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './odgovori-forma.component.css',
  template: `
    @if (polja().length === 0) {
      <p class="bk-of-prazno">Grupa nema polja odgovora: varijanta nema tačan odgovor koji se proverava (rad na papiru).</p>
    }
    @for (p of polja(); track p.kljuc) {
      @let o = odgovor(p);
      @let id = idPolja + '-' + p.kljuc;
      <fieldset class="bk-of-polje" [attr.data-polje]="p.kljuc">
        <legend class="bk-of-legenda" [id]="id + '-naziv'">
          <span class="bk-of-naziv">{{ p.oznaka }}</span>
          <span class="bk-of-kljuc">ključ <code>{{ p.kljuc }}</code></span>
          <app-status-chip data-bedz [tekst]="popunjeno(p) ? 'Popunjeno' : 'Nedostaje'" [ton]="popunjeno(p) ? 'ok' : 'warn'" />
        </legend>
        @switch (p.tip) {
          @case ('BROJ') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="bk-of-broj">
              <mat-label>Tačan broj</mat-label>
              <input matInput inputmode="decimal" autocomplete="off" [value]="prikazBroja(p)" [disabled]="onemoguceno()"
                [errorStateMatcher]="neispravanBroj(p.kljuc)" (input)="promeniBroj(p, $event)" data-broj />
              @if (p.jedinica) {
                <span matTextSuffix>&nbsp;{{ p.jedinica }}</span>
              }
              <mat-hint>{{ opisOdstupanja(p) }}</mat-hint>
              <mat-error>Unesi broj, npr. 12 ili 0,25.</mat-error>
            </mat-form-field>
          }
          @case ('TEKST') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="bk-of-siroko">
              <mat-label>Prihvatljivi odgovori</mat-label>
              <mat-chip-grid #lista [attr.aria-label]="'Prihvatljivi odgovori: ' + p.oznaka" [disabled]="onemoguceno()">
                @for (a of o.prihvatljivi ?? []; track $index) {
                  <mat-chip-row (removed)="ukloniPrihvatljiv(p, $index)">
                    {{ a }}
                    <button matChipRemove type="button" [attr.aria-label]="'Ukloni ' + a"><mat-icon svgIcon="cancel" aria-hidden="true" /></button>
                  </mat-chip-row>
                }
              </mat-chip-grid>
              <!-- polje je pored mreže, ne u njoj: role="grid" sme da sadrži samo redove (axe aria-required-children) -->
              <input class="bk-of-unos" placeholder="Upiši odgovor pa Enter" autocomplete="off" [matChipInputFor]="lista"
                [matChipInputSeparatorKeyCodes]="separatori" matChipInputAddOnBlur (matChipInputTokenEnd)="dodajPrihvatljiv(p, $event)" data-prihvatljiv />
              <mat-hint>{{ porukaTeksta()[p.kljuc] ?? opisTeksta(p) }}</mat-hint>
            </mat-form-field>
          }
          @case ('JEDAN_TACAN') {
            <mat-radio-group class="bk-of-izbor" [attr.aria-labelledby]="id + '-naziv'" [value]="o.tacna" [disabled]="onemoguceno()"
              (change)="promeni(p, { tacna: $event.value })">
              @for (op of p.opcije ?? []; track op.id) {
                <mat-radio-button [value]="op.id">{{ op.tekst }}</mat-radio-button>
              }
            </mat-radio-group>
          }
          @case ('VISE_TACNIH') {
            <div class="bk-of-izbor" role="group" [attr.aria-labelledby]="id + '-naziv'">
              @for (op of p.opcije ?? []; track op.id) {
                <mat-checkbox [checked]="(o.tacne ?? []).includes(op.id)" [disabled]="onemoguceno()" (change)="prebaci(p, op.id, $event.checked)">
                  {{ op.tekst }}
                </mat-checkbox>
              }
            </div>
          }
        }
      </fieldset>
    }
  `,
})
export class OdgovoriFormaComponent {
  readonly polja = input.required<readonly Polje[]>();
  readonly odgovori = input.required<Readonly<Record<string, OdgovorPolja>>>();
  readonly onemoguceno = input(false);
  readonly odgovoriPromena = output<Record<string, OdgovorPolja>>();

  protected readonly idPolja = `bk-of-${++sledeci}`;
  /** Samo Enter (i izlazak iz polja): zarez je deo odgovora, npr. `(1,0)` ili `q0, q1`. */
  protected readonly separatori = [ENTER] as const;
  /** Odgovor svakog polja šeme (prazan kad ga nema), samo ključevi šeme. */
  private readonly sviOdgovori = computed(() => Object.fromEntries(this.polja().map(p => [p.kljuc, this.odgovori()[p.kljuc] ?? prazanOdgovor(p)])));
  /** BROJ kako je otkucan, po ključu: prikazuje se dok mu vrednost odgovora odgovara (kao odstupanje u `app-polja-editor`). */
  private readonly unosBroja = signal<Readonly<Record<string, string>>>({});
  /** Poruka odbijenog prihvatljivog odgovora (umesto uputstva), po ključu, do sledećeg dodavanja. */
  protected readonly porukaTeksta = signal<Readonly<Record<string, string>>>({});
  private readonly matcheri = new Map<string, ErrorStateMatcher>();
  private readonly brojevi = viewChildren(MatInput);

  constructor() {
    // `MatInput` bez `ngControl` ne računa grešku sam (ni `aria-invalid`): posle svakih novih odgovora, iz `neispravanBroj`
    afterRenderEffect(() => {
      this.sviOdgovori();
      for (const i of this.brojevi()) {
        i.updateErrorState();
      }
    });
  }

  protected odgovor(p: Polje): OdgovorPolja {
    return this.sviOdgovori()[p.kljuc] ?? prazanOdgovor(p);
  }

  protected popunjeno(p: Polje): boolean {
    return odgovorPopunjen(p, this.odgovor(p));
  }

  protected prikazBroja(p: Polje): string {
    const otkucano = this.unosBroja()[p.kljuc];
    const broj = this.odgovor(p).broj;
    return otkucano !== undefined && Object.is(brojIzUnosa(otkucano), broj) ? otkucano : prikazBroja(broj);
  }

  /** Greška polja (i `aria-invalid`) dok je otkucano nešto što nije broj. */
  protected neispravanBroj(kljuc: string): ErrorStateMatcher {
    let m = this.matcheri.get(kljuc);
    if (!m) {
      m = { isErrorState: () => Number.isNaN(this.sviOdgovori()[kljuc]?.broj) };
      this.matcheri.set(kljuc, m);
    }
    return m;
  }

  protected opisOdstupanja(p: Polje): string {
    const odstupanje = p.odstupanje ?? 0;
    if (odstupanje === 0) {
      return 'Decimalni zarez ili tačka; tačan je samo ovaj broj';
    }
    return `Decimalni zarez ili tačka; prihvata se ± ${prikazBroja(odstupanje)}${p.odstupanjeTip === 'PROCENAT' ? ' %' : ''}`;
  }

  protected opisTeksta(p: Polje): string {
    const zanemari = [p.zanemariVelicinu !== false ? 'velika slova' : null, p.zanemariRazmake !== false ? 'razmake' : null].filter(Boolean);
    return `Enter dodaje, do ${MAX_PRIHVATLJIVIH}${zanemari.length ? `; poređenje zanemaruje ${zanemari.join(' i ')}` : ''}`;
  }

  protected promeniBroj(p: Polje, e: Event): void {
    const tekst = (e.target as HTMLInputElement).value;
    this.unosBroja.update(u => ({ ...u, [p.kljuc]: tekst }));
    this.promeni(p, { broj: brojIzUnosa(tekst) });
  }

  protected dodajPrihvatljiv(p: Polje, e: MatChipInputEvent): void {
    const tekst = (e.value ?? '').trim();
    if (!tekst) {
      e.chipInput.clear();
      return;
    }
    const lista = this.odgovor(p).prihvatljivi ?? [];
    if (lista.length >= MAX_PRIHVATLJIVIH) {
      this.porukaZa(p, `Najviše ${MAX_PRIHVATLJIVIH} prihvatljivih odgovora.`);
      return;
    }
    if ([...tekst].length > MAX_PRIHVATLJIV) {
      this.porukaZa(p, `Odgovor može imati najviše ${MAX_PRIHVATLJIV} znakova.`);
      return;
    }
    this.porukaZa(p, null);
    e.chipInput.clear();
    if (!lista.includes(tekst)) {
      this.promeni(p, { prihvatljivi: [...lista, tekst] });
    }
  }

  protected ukloniPrihvatljiv(p: Polje, i: number): void {
    this.porukaZa(p, null);
    this.promeni(p, { prihvatljivi: (this.odgovor(p).prihvatljivi ?? []).filter((_, j) => j !== i) });
  }

  protected prebaci(p: Polje, id: number, ukljuceno: boolean): void {
    const izabrane = new Set(this.odgovor(p).tacne ?? []);
    if (ukljuceno) {
      izabrane.add(id);
    } else {
      izabrane.delete(id);
    }
    this.promeni(p, { tacne: (p.opcije ?? []).map(o => o.id).filter(x => izabrane.has(x)) });
  }

  /** Nov odgovor polja: prazan za tip polja plus izmena, pa je postavljeno samo svojstvo tog tipa. */
  protected promeni(p: Polje, izmena: Partial<OdgovorPolja>): void {
    if (!this.onemoguceno()) {
      this.odgovoriPromena.emit({ ...this.sviOdgovori(), [p.kljuc]: { ...prazanOdgovor(p), ...izmena } });
    }
  }

  private porukaZa(p: Polje, poruka: string | null): void {
    this.porukaTeksta.update(m => {
      const ostale = Object.fromEntries(Object.entries(m).filter(([k]) => k !== p.kljuc));
      return poruka === null ? ostale : { ...ostale, [p.kljuc]: poruka };
    });
  }
}

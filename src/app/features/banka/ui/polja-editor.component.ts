import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, output, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';

import { OdstupanjeTip, Polje, TipPolja } from '../data-access/banka.models';
import {
  imaOpcije, MAX_JEDINICA, MAX_OPCIJA, MAX_OZNAKA, MAX_POLJA, MAX_TEKST_OPCIJE, MIN_OPCIJA, novaOpcija, novoPolje, proveriPolja,
} from '../data-access/polja';

const TIPOVI: readonly { vrednost: TipPolja; labela: string }[] = [
  { vrednost: 'BROJ', labela: 'Broj' },
  { vrednost: 'TEKST', labela: 'Tekst' },
  { vrednost: 'JEDAN_TACAN', labela: 'Jedan tačan' },
  { vrednost: 'VISE_TACNIH', labela: 'Više tačnih' },
];

const ODSTUPANJA: readonly { vrednost: OdstupanjeTip; labela: string }[] = [
  { vrednost: 'APSOLUTNO', labela: 'Apsolutno' },
  { vrednost: 'PROCENAT', labela: 'Procenat (%)' },
];

/**
 * Broj iz unosa sa decimalnim zarezom ili tačkom: prazno je `null`, neispravno `NaN` (`proveriPolja` ga odbija). Polje je
 * tekstualno, jer `type="number"` u mnogim lokalima daje prazno za "0,5".
 */
export function brojIzUnosa(tekst: string): number | null {
  const t = tekst.trim().replace(',', '.');
  if (t === '') {
    return null;
  }
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** Broj za prikaz, sa decimalnim zarezom; `null` i `NaN` su prazni. */
export function prikazBroja(v: number | null): string {
  return v === null || Number.isNaN(v) ? '' : String(v).replace('.', ',');
}

/**
 * Šema odgovora grupe banke: polja redom, svako sa ključem (dodeljuje ga `novoPolje`, posle se ne menja), oznakom i tipom,
 * i po tipu: odstupanje, vrsta odstupanja i jedinica (BROJ), zanemarivanje velikih slova i razmaka (TEKST), 2 do 6 opcija
 * (JEDAN_TACAN, VISE_TACNIH). Kontrolisana komponenta: ne čuva listu, svaka izmena emituje novu (`poljaPromena`), a
 * roditelj je vraća kroz `polja`. Ispod liste je poruka prve prekršene provere (`proveriPolja`, iste poruke kao server).
 *
 * `tipZakljucan` (grupa ima aktivne varijante): tip polja iz `sacuvanaPolja` se ne menja (server bi odbio, 409); novo polje
 * bira tip slobodno. Novo polje nikad ne dobija ključ sačuvanog polja, ni obrisanog: server bi ga smatrao istim poljem.
 * Dugmad koja mogu postati onemogućena dok imaju fokus (pomeranje na kraj, granice broja polja i opcija) su
 * `disabledInteractive`, pa rukovaoci proveravaju isti uslov.
 */
@Component({
  selector: 'app-polja-editor',
  imports: [MatButton, MatCheckbox, MatFormField, MatHint, MatIcon, MatIconButton, MatInput, MatLabel, MatOption, MatSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './polja-editor.component.css',
  template: `
    @if (polja().length === 0) {
      <p class="bk-pe-prazno">Grupa još nema polja: varijante nemaju tačan odgovor koji se proverava.</p>
    }
    <ol class="bk-pe-lista" aria-label="Polja odgovora">
      @for (p of polja(); track p.kljuc; let i = $index, prvo = $first, poslednje = $last) {
        <li class="bk-pe-polje" [attr.data-polje]="p.kljuc">
          <fieldset class="bk-pe-okvir">
            <legend class="bk-pe-naslov">Polje {{ i + 1 }} <span class="bk-pe-kljuc" data-kljuc>ključ <code>{{ p.kljuc }}</code></span></legend>
            <div class="bk-pe-dugmad">
              <button matIconButton type="button" disabledInteractive [disabled]="prvo" (click)="pomeri(i, -1)"
                [attr.aria-label]="'Pomeri polje ' + p.kljuc + ' gore'" data-gore><mat-icon svgIcon="arrow_upward" aria-hidden="true" /></button>
              <button matIconButton type="button" disabledInteractive [disabled]="poslednje" (click)="pomeri(i, 1)"
                [attr.aria-label]="'Pomeri polje ' + p.kljuc + ' dole'" data-dole><mat-icon svgIcon="arrow_downward" aria-hidden="true" /></button>
              <button matIconButton type="button" (click)="obrisiPolje(i)" [attr.aria-label]="'Obriši polje ' + p.kljuc" data-obrisi-polje>
                <mat-icon svgIcon="delete" aria-hidden="true" />
              </button>
            </div>
            <div class="bk-pe-red">
              <mat-form-field appearance="outline" class="bk-pe-siroko">
                <mat-label>Oznaka</mat-label>
                <input matInput [value]="p.oznaka" (input)="promeni(i, { oznaka: unos($event) })" [attr.maxlength]="maxOznaka" autocomplete="off" data-oznaka />
                <mat-hint>Šta student vidi uz polje za odgovor</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="bk-pe-usko">
                <mat-label>Tip</mat-label>
                <mat-select [value]="p.tip" [disabled]="zakljucan(p)" (selectionChange)="promeniTip(i, $event.value)" data-tip>
                  @for (t of tipovi; track t.vrednost) {
                    <mat-option [value]="t.vrednost">{{ t.labela }}</mat-option>
                  }
                </mat-select>
                @if (zakljucan(p)) {
                  <mat-hint>Grupa ima aktivne varijante: tip polja se ne menja</mat-hint>
                }
              </mat-form-field>
            </div>
            @switch (p.tip) {
              @case ('BROJ') {
                <div class="bk-pe-red">
                  <mat-form-field appearance="outline" class="bk-pe-usko">
                    <mat-label>Dozvoljeno odstupanje</mat-label>
                    <input matInput inputmode="decimal" [value]="prikazOdstupanja(p)" (input)="promeniOdstupanje(i, p.kljuc, unos($event))"
                      autocomplete="off" data-odstupanje />
                    <mat-hint>0 = tačno taj broj</mat-hint>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="bk-pe-usko">
                    <mat-label>Odstupanje se meri</mat-label>
                    <mat-select [value]="p.odstupanjeTip ?? 'APSOLUTNO'" (selectionChange)="promeni(i, { odstupanjeTip: $event.value })" data-odstupanje-tip>
                      @for (o of odstupanja; track o.vrednost) {
                        <mat-option [value]="o.vrednost">{{ o.labela }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="bk-pe-usko">
                    <mat-label>Jedinica (opciono)</mat-label>
                    <input matInput [value]="p.jedinica ?? ''" (input)="promeni(i, { jedinica: unos($event) || null })" [attr.maxlength]="maxJedinica"
                      autocomplete="off" data-jedinica />
                  </mat-form-field>
                </div>
              }
              @case ('TEKST') {
                <div class="bk-pe-prekidaci">
                  <mat-checkbox [checked]="p.zanemariVelicinu ?? true" (change)="promeni(i, { zanemariVelicinu: $event.checked })" data-zanemari-velicinu>
                    Zanemari velika i mala slova
                  </mat-checkbox>
                  <mat-checkbox [checked]="p.zanemariRazmake ?? true" (change)="promeni(i, { zanemariRazmake: $event.checked })" data-zanemari-razmake>
                    Zanemari razmake
                  </mat-checkbox>
                </div>
              }
              @default {
                @let opcije = p.opcije ?? [];
                <fieldset class="bk-pe-opcije">
                  <legend class="bk-pe-podnaslov">Ponuđeni odgovori</legend>
                  <p class="bk-pe-napomena">Od {{ minOpcija }} do {{ maxOpcija }}; tekst sme da ima formulu, npr. $x^2$.</p>
                  @for (o of opcije; track o.id; let j = $index) {
                    <div class="bk-pe-opcija">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="bk-pe-siroko">
                        <mat-label>Opcija {{ j + 1 }}</mat-label>
                        <input matInput [value]="o.tekst" (input)="promeniOpciju(i, j, unos($event))" [attr.maxlength]="maxTekstOpcije" autocomplete="off" data-opcija />
                      </mat-form-field>
                      <button matIconButton type="button" disabledInteractive [disabled]="opcije.length <= minOpcija" (click)="obrisiOpciju(i, j)"
                        [attr.aria-label]="'Obriši opciju ' + (j + 1) + ' polja ' + p.kljuc" data-obrisi-opciju>
                        <mat-icon svgIcon="close" aria-hidden="true" />
                      </button>
                    </div>
                  }
                  <button matButton type="button" disabledInteractive [disabled]="opcije.length >= maxOpcija" (click)="dodajOpciju(i)" data-dodaj-opciju>
                    <mat-icon svgIcon="add" aria-hidden="true" />Dodaj opciju
                  </button>
                </fieldset>
              }
            }
          </fieldset>
        </li>
      }
    </ol>
    <div class="bk-pe-dno">
      <button matButton="outlined" type="button" disabledInteractive [disabled]="polja().length >= maxPolja" (click)="dodajPolje()" data-dodaj-polje>
        <mat-icon svgIcon="add" aria-hidden="true" />Dodaj polje
      </button>
      <span class="bk-pe-broj">{{ polja().length }} od najviše {{ maxPolja }} polja</span>
    </div>
    @if (greska(); as g) {
      <p class="bk-pe-greska" role="alert" data-greska-polja>{{ g }}</p>
    }
  `,
})
export class PoljaEditorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly polja = input.required<readonly Polje[]>();
  /** Šema kakva je na serveru: njihovim ključevima se zaključava tip (`tipZakljucan`), i nijedan se ne dodeljuje novom polju. */
  readonly sacuvanaPolja = input<readonly Polje[]>([]);
  /** Grupa ima aktivne varijante: tip sačuvanog polja se ne menja. */
  readonly tipZakljucan = input(false);
  readonly poljaPromena = output<Polje[]>();

  protected readonly tipovi = TIPOVI;
  protected readonly odstupanja = ODSTUPANJA;
  protected readonly maxPolja = MAX_POLJA;
  protected readonly maxOznaka = MAX_OZNAKA;
  protected readonly maxJedinica = MAX_JEDINICA;
  protected readonly maxTekstOpcije = MAX_TEKST_OPCIJE;
  protected readonly minOpcija = MIN_OPCIJA;
  protected readonly maxOpcija = MAX_OPCIJA;

  protected readonly greska = computed(() => proveriPolja(this.polja()));
  private readonly sacuvaniKljucevi = computed(() => new Set(this.sacuvanaPolja().map(p => p.kljuc)));
  /**
   * Odstupanje kako ga je korisnik otkucao, po ključu polja: prikazuje se dok mu vrednost polja odgovara ("1,50", "abc" dok je
   * vrednost NaN), pa kucanje ne prepisuje polje. Kad vrednost dođe spolja (Odbaci, čuvanje), prikazuje se ona.
   */
  private readonly unosOdstupanja = signal<Readonly<Record<string, string>>>({});

  protected zakljucan(p: Polje): boolean {
    return this.tipZakljucan() && this.sacuvaniKljucevi().has(p.kljuc);
  }

  protected unos(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected prikazOdstupanja(p: Polje): string {
    const otkucano = this.unosOdstupanja()[p.kljuc];
    return otkucano !== undefined && Object.is(brojIzUnosa(otkucano), p.odstupanje) ? otkucano : prikazBroja(p.odstupanje);
  }

  protected promeni(i: number, izmena: Partial<Polje>): void {
    this.emituj(this.polja().map((p, k) => (k === i ? { ...p, ...izmena } : p)));
  }

  protected promeniOdstupanje(i: number, kljuc: string, tekst: string): void {
    this.unosOdstupanja.update(u => ({ ...u, [kljuc]: tekst }));
    this.promeni(i, { odstupanje: brojIzUnosa(tekst) });
  }

  /** Nov tip: izbor (JEDAN_TACAN, VISE_TACNIH) zadržava postojeće opcije ili dobija dve prazne; ostali tipovi nemaju opcije. */
  protected promeniTip(i: number, tip: TipPolja): void {
    const p = this.polja()[i];
    if (!p || p.tip === tip || this.zakljucan(p)) {
      return;
    }
    const opcije = imaOpcije(tip) ? (p.opcije?.length ? p.opcije : novoPolje(tip, []).opcije) : null;
    this.promeni(i, { tip, opcije });
  }

  protected dodajPolje(): void {
    const polja = this.polja();
    if (polja.length >= MAX_POLJA) {
      return;
    }
    const novo = novoPolje('BROJ', [...polja, ...this.sacuvanaPolja()]);
    this.emituj([...polja, novo]);
    this.fokusiraj(`[data-polje="${novo.kljuc}"] [data-oznaka]`);
  }

  protected obrisiPolje(i: number): void {
    const polja = this.polja();
    const ostala = polja.filter((_, k) => k !== i);
    this.emituj(ostala);
    const sledece = ostala[Math.min(i, ostala.length - 1)];
    this.fokusiraj(sledece ? `[data-polje="${sledece.kljuc}"] [data-obrisi-polje]` : '[data-dodaj-polje]');
  }

  /** Pomera polje za jedno mesto; fokus ostaje na istom dugmetu pomerenog polja (red se premešta u DOM-u). */
  protected pomeri(i: number, smer: -1 | 1): void {
    const polja = [...this.polja()];
    const j = i + smer;
    if (j < 0 || j >= polja.length) {
      return;
    }
    [polja[i], polja[j]] = [polja[j], polja[i]];
    this.emituj(polja);
    this.fokusiraj(`[data-polje="${polja[j].kljuc}"] ${smer < 0 ? '[data-gore]' : '[data-dole]'}`);
  }

  protected promeniOpciju(i: number, j: number, tekst: string): void {
    const opcije = this.polja()[i]?.opcije ?? [];
    this.promeni(i, { opcije: opcije.map((o, k) => (k === j ? { ...o, tekst } : o)) });
  }

  protected dodajOpciju(i: number): void {
    const p = this.polja()[i];
    const opcije = p?.opcije ?? [];
    if (!p || opcije.length >= MAX_OPCIJA) {
      return;
    }
    this.promeni(i, { opcije: [...opcije, novaOpcija(opcije)] });
    this.fokusiraj(`[data-polje="${p.kljuc}"] [data-opcija]`, opcije.length);
  }

  protected obrisiOpciju(i: number, j: number): void {
    const p = this.polja()[i];
    const opcije = p?.opcije ?? [];
    if (!p || opcije.length <= MIN_OPCIJA) {
      return;
    }
    this.promeni(i, { opcije: opcije.filter((_, k) => k !== j) });
    this.fokusiraj(`[data-polje="${p.kljuc}"] [data-opcija]`, Math.min(j, opcije.length - 2));
  }

  private emituj(polja: Polje[]): void {
    this.poljaPromena.emit(polja);
  }

  /** Posle crtanja nove liste: fokus na `indeks`-ti element za `selektor` (dugme ili polje koje je zamenilo staro). */
  private fokusiraj(selektor: string, indeks = 0): void {
    afterNextRender(() => this.host.nativeElement.querySelectorAll<HTMLElement>(selektor)[indeks]?.focus(), { injector: this.injector });
  }
}

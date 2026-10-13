// Panel "Tabela" (F14, odluka 19): struktura izabrane tabele nad opsegom ćelija (klik i Shift+klik u tabelu, ili četiri
// polja "Ćelije": put tastaturom; bez izbora ćelija opseg je cela tabela). Redovi i kolone (ubaci iznad/ispod, levo/desno,
// obriši), spajanje i razdvajanje, popuna, ivice (vrsta, boja, debljina, "Primeni"), sidro, širina kolone i visina reda.
// Radnja koja bi prešla 30 redova/kolona ili 2880 se odbija porukom (`NotificationStore`) i ne menja dokument; svaka
// uspela radnja je jedan korak istorije (polja mera: isti ključ u roku od 1 s). Tekst opsega menja panel teksta ispod.
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { NotificationStore } from '../../../core/state/notification.store';
import type { Celija, Sidro, TabelaSloj, Tema } from '../data-access/platno.models';
import { TEME } from '../ui/teme';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import { IzborBojeComponent } from './izbor-boje.component';
import { izmeniSlojeve } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';
import {
  MAX_KOLONA, MAX_REDOVA, type Opseg, PREVELIKA_TABELA, type VrstaIvica, dodajKolonu, dodajRed, izmeniCelije, obrisiKolonu,
  obrisiRed, postaviIvice, razdvoji, sirinaKolone, spoji, visinaReda,
} from './tabela';

const VRSTE_IVICA: readonly { v: VrstaIvica; naziv: string }[] = [
  { v: 'SVE', naziv: 'Sve' }, { v: 'SPOLJNE', naziv: 'Spoljne' }, { v: 'UNUTRASNJE', naziv: 'Unutrašnje' }, { v: 'NIJEDNA', naziv: 'Bez ivica' },
];
const SIDRA: readonly { v: Sidro; naziv: string; ikona: string }[] = [
  { v: 'VRH', naziv: 'Vrh', ikona: 'vertical_align_top' },
  { v: 'SREDINA', naziv: 'Sredina', ikona: 'vertical_align_center' },
  { v: 'DNO', naziv: 'Dno', ikona: 'vertical_align_bottom' },
];
const POLJA_OPSEGA: readonly { k: keyof Opseg; naziv: string }[] = [
  { k: 'r1', naziv: 'Od reda' }, { k: 'r2', naziv: 'Do reda' }, { k: 'k1', naziv: 'Od kolone' }, { k: 'k2', naziv: 'Do kolone' },
];

/** Jedna vrednost ako je ista za sve, inače null (mešano). */
function jedna<T>(v: readonly T[]): T | null {
  return v.length && v.every((x) => x === v[0]) ? v[0] : null;
}

@Component({
  selector: 'app-svojstva-tabele',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrojcanoPoljeComponent, IzborBojeComponent, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSelectModule],
  template: `
    @let o = opseg();
    @let z = sloj().zakljucan;
    <h3 class="uz-ep-odeljak">Tabela</h3>
    <div class="uz-ep-polja" role="group" aria-label="Ćelije">
      @for (f of poljaOpsega; track f.k) {
        <app-brojcano-polje [oznaka]="f.naziv" [vrednost]="o[f.k] + 1" [min]="1" [max]="f.k[0] === 'r' ? redova() : kolona()"
                            (promena)="postaviOpseg(f.k, $event)" />
      }
    </div>
    <div class="uz-ep-dugmad">
      <button mat-stroked-button type="button" [disabled]="z" (click)="dodajRed(o.r1 - 1)">Ubaci red iznad</button>
      <button mat-stroked-button type="button" [disabled]="z" (click)="dodajRed(o.r2)">Ubaci red ispod</button>
      <button mat-stroked-button type="button" [disabled]="z" (click)="dodajKolonu(o.k1 - 1)">Ubaci kolonu levo</button>
      <button mat-stroked-button type="button" [disabled]="z" (click)="dodajKolonu(o.k2)">Ubaci kolonu desno</button>
      <button mat-stroked-button type="button" [disabled]="z || o.r2 - o.r1 + 1 >= redova()" (click)="obrisiRedove()">Obriši red</button>
      <button mat-stroked-button type="button" [disabled]="z || o.k2 - o.k1 + 1 >= kolona()" (click)="obrisiKolone()">Obriši kolonu</button>
      <button mat-stroked-button type="button" [disabled]="z || !viseCelija()" (click)="izmeni(spojeno)">
        <mat-icon svgIcon="cell_merge" />Spoji ćelije
      </button>
      <button mat-stroked-button type="button" [disabled]="z || !imaSpajanje()" (click)="izmeni(razdvojeno)">Razdvoji</button>
    </div>
    <app-izbor-boje oznaka="Popuna ćelija" [tema]="tema()" [vrednost]="popuna()" [dozvoliPrazno]="true" [onemoguceno]="z"
                    (izbor)="celijama({ popuna: $event })" />
    <h3 class="uz-ep-odeljak">Ivice</h3>
    <mat-form-field subscriptSizing="dynamic">
      <mat-label>Vrsta ivica</mat-label>
      <mat-select [value]="vrstaIvica()" [disabled]="z" (selectionChange)="vrstaIvica.set($event.value)">
        @for (v of vrsteIvica; track v.v) { <mat-option [value]="v.v">{{ v.naziv }}</mat-option> }
      </mat-select>
    </mat-form-field>
    <app-izbor-boje oznaka="Boja ivica" [tema]="tema()" [vrednost]="bojaIvica() ?? bojaTeme()" [onemoguceno]="z"
                    (izbor)="bojaIvica.set($event)" />
    <div class="uz-ep-polja">
      <app-brojcano-polje oznaka="Debljina ivica" jedinica="pt" [vrednost]="debljinaIvica()" [min]="0.25" [max]="20"
                          [onemoguceno]="z" (promena)="debljinaIvica.set($event)" />
      <button mat-stroked-button type="button" aria-label="Primeni ivice" [disabled]="z" (click)="primeniIvice()">
        <mat-icon svgIcon="border_all" />Primeni
      </button>
    </div>
    <h3 class="uz-ep-odeljak">Raspored ćelija</h3>
    <mat-button-toggle-group aria-label="Sidro ćelija" hideSingleSelectionIndicator [value]="sidro()" [disabled]="z"
                             (change)="celijama({ sidro: $event.value })">
      @for (s of sidra; track s.v) {
        <mat-button-toggle [value]="s.v" [aria-label]="s.naziv" [title]="s.naziv"><mat-icon [svgIcon]="s.ikona" /></mat-button-toggle>
      }
    </mat-button-toggle-group>
    <div class="uz-ep-polja">
      <app-brojcano-polje oznaka="Širina kolone" [vrednost]="sirina()" [min]="1" [max]="2880" [onemoguceno]="z"
                          (promena)="postaviSirinu($event)" />
      <app-brojcano-polje oznaka="Visina reda" [vrednost]="visina()" [min]="1" [max]="2880" [onemoguceno]="z"
                          (promena)="postaviVisinu($event)" />
    </div>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-polja { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; align-items: center; }
    .uz-ep-dugmad { display: flex; flex-wrap: wrap; gap: 4px; }
    mat-button-toggle-group { justify-self: start; }
  `,
})
export class SvojstvaTabeleComponent {
  readonly sloj = input.required<TabelaSloj>();
  readonly tema = input.required<Tema>();

  private readonly store = inject(PlatnoEditorStore);
  private readonly obavestenja = inject(NotificationStore);
  protected readonly poljaOpsega = POLJA_OPSEGA;
  protected readonly vrsteIvica = VRSTE_IVICA;
  protected readonly sidra = SIDRA;

  protected readonly redova = computed(() => this.sloj().redovi.length);
  protected readonly kolona = computed(() => this.sloj().kolone.length);
  /** Izabrane ćelije, ili cela tabela kad ćelije nisu izabrane. */
  protected readonly opseg = computed<Opseg>(
    () => this.store.opsegCelijaIzbora() ?? { r1: 0, k1: 0, r2: this.redova() - 1, k2: this.kolona() - 1 },
  );
  /** Vlasnici (nepokrivene ćelije) u opsegu. */
  private readonly vlasnici = computed(() => {
    const { r1, k1, r2, k2 } = this.opseg();
    return this.sloj().celije.slice(r1, r2 + 1).flatMap((red) => red.slice(k1, k2 + 1)).filter((c) => !c.pokrivena);
  });
  protected readonly viseCelija = computed(() => this.vlasnici().length > 1);
  protected readonly imaSpajanje = computed(() => this.vlasnici().some((c) => c.spojDesno || c.spojDole));
  protected readonly popuna = computed(() => jedna(this.vlasnici().map((c) => c.popuna)));
  protected readonly sidro = computed(() => jedna(this.vlasnici().map((c) => c.sidro)));
  protected readonly sirina = computed(() => jedna(this.sloj().kolone.slice(this.opseg().k1, this.opseg().k2 + 1)));
  protected readonly visina = computed(() => jedna(this.sloj().redovi.slice(this.opseg().r1, this.opseg().r2 + 1)));

  protected readonly vrstaIvica = signal<VrstaIvica>('SVE');
  /** null = boja teksta teme (dok se ne izabere druga). */
  protected readonly bojaIvica = signal<string | null>(null);
  protected readonly bojaTeme = computed(() => TEME[this.tema()].tekst);
  protected readonly debljinaIvica = signal(1);

  protected readonly spojeno = (t: TabelaSloj) => spoji(t, this.opseg());
  protected readonly razdvojeno = (t: TabelaSloj) => {
    const { r1, k1, r2, k2 } = this.opseg();
    let n = t;
    for (let r = r1; r <= r2; r++) for (let k = k1; k <= k2; k++) n = razdvoji(n, { r, k });
    return n;
  };

  /** Izmena izabrane tabele kao jedan korak; null iz `f` = odbijeno (poruka), dokument ostaje isti. */
  protected izmeni(f: (t: TabelaSloj) => TabelaSloj | null, poruka = PREVELIKA_TABELA, kljuc?: string): void {
    if (this.store.zakljucanUIzboru()) return;
    let odbijeno = false;
    this.store.primeni((p) => izmeniSlojeve(p, new Set([this.sloj().id]), (s) => {
      if (s.tip !== 'TABELA') return s;
      const n = f(s);
      odbijeno = !n;
      return n ?? s;
    }), kljuc);
    if (odbijeno) this.obavestenja.greska(poruka);
  }

  /** Polje opsega (1-based u panelu): nov opseg, proširen na spojena polja (store). */
  protected postaviOpseg(k: keyof Opseg, v: number): void {
    this.store.postaviOpsegCelija({ ...this.opseg(), [k]: Math.round(v) - 1 });
  }

  protected dodajRed(posle: number): void {
    this.izmeni((t) => dodajRed(t, posle),
      this.redova() >= MAX_REDOVA ? `Tabela može imati najviše ${MAX_REDOVA} redova.` : PREVELIKA_TABELA);
  }

  protected dodajKolonu(posle: number): void {
    this.izmeni((t) => dodajKolonu(t, posle),
      this.kolona() >= MAX_KOLONA ? `Tabela može imati najviše ${MAX_KOLONA} kolona.` : PREVELIKA_TABELA);
  }

  /** Briše redove opsega odozdo (indeksi gornjih se ne pomeraju); ceo opseg sme da ostavi bar jedan red (dugme). */
  protected obrisiRedove(): void {
    const { r1, r2 } = this.opseg();
    this.izmeni((t) => {
      let n: TabelaSloj | null = t;
      for (let r = r2; r >= r1 && n; r--) n = obrisiRed(n, r);
      return n;
    });
  }

  protected obrisiKolone(): void {
    const { k1, k2 } = this.opseg();
    this.izmeni((t) => {
      let n: TabelaSloj | null = t;
      for (let k = k2; k >= k1 && n; k--) n = obrisiKolonu(n, k);
      return n;
    });
  }

  /** Popuna ili sidro svih vlasnika opsega; ćelija koja već ima tu vrednost ostaje ista. */
  protected celijama(izmena: Partial<Pick<Celija, 'popuna' | 'sidro'>>): void {
    const kljucevi = Object.keys(izmena) as (keyof typeof izmena)[];
    this.izmeni((t) => izmeniCelije(t, this.opseg(), (c) => (kljucevi.every((k) => c[k] === izmena[k]) ? c : { ...c, ...izmena })));
  }

  protected primeniIvice(): void {
    const ivica = { boja: this.bojaIvica() ?? this.bojaTeme(), debljina: this.debljinaIvica(), crtica: 'PUNA' as const };
    this.izmeni((t) => postaviIvice(t, this.opseg(), this.vrstaIvica(), ivica));
  }

  /** Širina svih kolona opsega (zbir = širina sloja); preko 2880 -> poruka. */
  protected postaviSirinu(v: number): void {
    const { k1, k2 } = this.opseg();
    this.izmeni((t) => {
      let n: TabelaSloj | null = t;
      for (let k = k1; k <= k2 && n; k++) n = sirinaKolone(n, k, v);
      return n;
    }, PREVELIKA_TABELA, `tabela-sirina:${this.sloj().id}:${k1}-${k2}`);
  }

  protected postaviVisinu(v: number): void {
    const { r1, r2 } = this.opseg();
    this.izmeni((t) => {
      let n: TabelaSloj | null = t;
      for (let r = r1; r <= r2 && n; r++) n = visinaReda(n, r, v);
      return n;
    }, PREVELIKA_TABELA, `tabela-visina:${this.sloj().id}:${r1}-${r2}`);
  }
}

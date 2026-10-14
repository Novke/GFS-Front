// Panel "Animacije" editora platna (F17, odluka 21): "Dodaj ulaz" / "Dodaj izlaz" (meni efekata izabranog sloja; za
// TEKST uz "Cilj": ceo sloj, po pasusima ili jedan pasus), lista redom izvršavanja (prevlačenje i "Pomeri gore/dole" za
// tastaturu; broj grupe samo na KLIK redu, kao PowerPoint) i detalji izabrane animacije. Svaka izmena je jedan korak
// (`primeni`; brojčana polja sa ključem polja i animacije), a granica od 400 animacija daje poruku iz `prekoGranica`.
// Tab je onemogućen dok traje uređivanje teksta, pa se pasus bira ovde, ne u tekstu.
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, linkedSignal, signal, viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { NotificationStore } from '../../../core/state/notification.store';
import type { Animacija, Efekat, VrstaAnimacije } from '../data-access/platno.models';
import {
  NAZIVI_EFEKATA, NAZIVI_OKIDACA, NAZIVI_SMEROVA, NAZIVI_SMEROVA_IZLAZA, SMEROVI, brojeviGrupa, dodajAnimaciju, dodajPoPasusima, efektiZa,
  izmeniAnimaciju, obrisiAnimaciju, premestiAnimaciju,
} from './animacije';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import { nazivSloja } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';

/** "Cilj" za TEKST: ceo sloj, po pasusima, ili indeks pasusa (>= 0). */
const CEO = -2;
const PO_PASUSIMA = -1;

@Component({
  selector: 'app-panel-animacije',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrojcanoPoljeComponent, CdkDrag, CdkDragHandle, CdkDropList, MatButtonModule, MatFormFieldModule, MatIconModule,
    MatMenuModule, MatSelectModule,
  ],
  template: `
    @let s = store.jedan();
    @if (pasusi(); as ps) {
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Cilj</mat-label>
        <mat-select [value]="ciljSada()" (selectionChange)="cilj.set($event.value)">
          <mat-option [value]="-2">Ceo sloj</mat-option>
          <mat-option [value]="-1">Po pasusima</mat-option>
          @for (x of ps; track x.i) { <mat-option [value]="x.i">Pasus {{ x.i + 1 }}: {{ x.tekst }}</mat-option> }
        </mat-select>
      </mat-form-field>
    }
    <div class="uz-ep-anim-dodaj">
      <button #dodaj mat-stroked-button type="button" [disabled]="!s" [matMenuTriggerFor]="meni" (click)="vrsta.set('ULAZ')">Dodaj ulaz</button>
      <button mat-stroked-button type="button" [disabled]="!s" [matMenuTriggerFor]="meni" (click)="vrsta.set('IZLAZ')">Dodaj izlaz</button>
    </div>
    <mat-menu #meni="matMenu">
      @if (s) { @for (e of efektiZa(s); track e) { <button mat-menu-item type="button" (click)="dodajNovu(e)">{{ efekti[e] }}</button> } }
    </mat-menu>
    @if (redovi().length) {
      <ol class="uz-ep-anim" aria-label="Animacije redom izvršavanja" cdkDropList (cdkDropListDropped)="spusteno($event)">
        @for (r of redovi(); track r.a.id) {
          <li class="uz-ep-anim-red" cdkDrag cdkDragLockAxis="y" [attr.data-animacija]="r.a.id"
              [class.uz-ep-anim--izabrana]="r.izabrana" [class.uz-ep-anim--uvucena]="!r.broj">
            <mat-icon class="uz-ep-rucka" cdkDragHandle aria-hidden="true" svgIcon="drag_indicator" />
            <button type="button" [attr.aria-pressed]="r.izabrana" (click)="store.izaberiAnimaciju(r.a.id)">
              @if (r.broj) { <b>{{ r.broj }} </b> } @else {
                <!-- statički aria-hidden="false": inače ga MatIcon sam postavlja na true, pa okidač ne bi bio u imenu reda -->
                <mat-icon role="img" aria-hidden="false" [attr.aria-label]="okidaci[r.a.okidac]"
                          [svgIcon]="r.a.okidac === 'SA_PRETHODNIM' ? 'animation' : 'motion_photos_on'" />
              }
              <span>{{ r.naziv }} </span>
              <span>{{ r.a.vrsta === 'ULAZ' ? 'Ulaz' : 'Izlaz' }} · {{ efekti[r.a.efekat] }}</span>
            </button>
          </li>
        }
      </ol>
    } @else {
      <p #prazno class="uz-ep-napomena" tabindex="-1">Slajd nema animacija. Izaberi sloj i dodaj ulaz ili izlaz.</p>
    }
    @if (izabrana(); as a) {
      @let i = indeks();
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Efekat</mat-label>
        <mat-select [value]="a.efekat" (selectionChange)="izmeni({ efekat: $event.value })">
          @for (e of efektiIzabrane(); track e) { <mat-option [value]="e">{{ efekti[e] }}</mat-option> }
        </mat-select>
      </mat-form-field>
      @if (smerovi[a.efekat].length) {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Smer</mat-label>
          <mat-select [value]="a.smer" (selectionChange)="izmeni({ smer: $event.value })">
            @for (x of smerovi[a.efekat]; track x) {
              <mat-option [value]="x">{{ (a.vrsta === 'IZLAZ' ? naziviIzlaza : nazivSmera)[x] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Okidač</mat-label>
        <mat-select [value]="a.okidac" (selectionChange)="izmeni({ okidac: $event.value })">
          @for (o of sviOkidaci; track o[0]) { <mat-option [value]="o[0]">{{ o[1] }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <app-brojcano-polje oznaka="Trajanje (s)" [vrednost]="a.trajanjeMs / 1000" [min]="0" [max]="10"
                          [onemoguceno]="a.efekat === 'POJAVI'" (promena)="izmeni({ trajanjeMs: $event * 1000 }, 'trajanje')" />
      <app-brojcano-polje oznaka="Kašnjenje (s)" [vrednost]="a.kasnjenjeMs / 1000" [min]="0" [max]="10"
                          (promena)="izmeni({ kasnjenjeMs: $event * 1000 }, 'kasnjenje')" />
      <div class="uz-ep-anim-dodaj">
        <!-- disabledInteractive: na kraju liste fokus ostaje na dugmetu (ne pada na body); čuvar je u pomeri() -->
        <button mat-button type="button" disabledInteractive [disabled]="i === 0" (click)="pomeri(a, i - 1)">Pomeri gore</button>
        <button mat-button type="button" disabledInteractive [disabled]="i === redovi().length - 1" (click)="pomeri(a, i + 1)">
          Pomeri dole
        </button>
        <button mat-button type="button" (click)="obrisi(a, i)">Obriši</button>
      </div>
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; padding-top: 8px; }
    .uz-ep-anim-dodaj { display: flex; flex-wrap: wrap; gap: 8px; }
    .uz-ep-anim { list-style: none; margin: 0; padding: 0; }
    .uz-ep-anim-red { display: flex; align-items: center; min-height: 40px; border-radius: var(--radius-sm); background: var(--surface); }
    .uz-ep-anim-red > button {
      flex: 1; min-width: 0; display: grid; grid-template-columns: 24px 1fr; column-gap: 6px; padding: 4px 6px; border: 0;
      border-radius: var(--radius-sm); background: none; color: inherit; font: inherit; text-align: start; cursor: pointer;
    }
    .uz-ep-anim-red > button > span { grid-column: 2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .uz-ep-anim-red > button > span + span { font-size: 12px; }
    .uz-ep-anim-red > button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
    .uz-ep-anim--uvucena > button { padding-inline-start: 18px; }
    .uz-ep-anim--izabrana { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .uz-ep-rucka { flex: none; color: var(--muted); cursor: grab; }
    .cdk-drag-preview { box-shadow: var(--shadow); }
    .cdk-drag-placeholder { opacity: 0.4; }
    .uz-ep-napomena { margin: 4px; color: var(--ink-2); }
  `,
})
export class PanelAnimacijeComponent {
  protected readonly store = inject(PlatnoEditorStore);
  private readonly obavestenja = inject(NotificationStore);
  protected readonly efekti = NAZIVI_EFEKATA;
  protected readonly okidaci = NAZIVI_OKIDACA;
  protected readonly sviOkidaci = Object.entries(NAZIVI_OKIDACA);
  protected readonly smerovi = SMEROVI;
  protected readonly nazivSmera = NAZIVI_SMEROVA;
  protected readonly naziviIzlaza = NAZIVI_SMEROVA_IZLAZA;
  private readonly injector = inject(Injector);
  protected readonly efektiZa = efektiZa;
  private readonly dugmeDodaj = viewChild<string, ElementRef<HTMLButtonElement>>('dodaj', { read: ElementRef });
  private readonly prazno = viewChild<ElementRef<HTMLElement>>('prazno');

  /** Vrsta za meni efekata (meni je zajednički za "Dodaj ulaz" i "Dodaj izlaz"). */
  protected readonly vrsta = signal<VrstaAnimacije>('ULAZ');
  /**
   * Neprazni pasusi jedinog izabranog TEKST sloja (ceo tekst, kao "Po pasusima"), prikazani sa prvih 20 znakova; null =
   * "Cilj" se ne prikazuje.
   */
  protected readonly pasusi = computed(() => {
    const s = this.store.jedan();
    if (s?.tip !== 'TEKST') return null;
    return s.pasusi.map((p, i) => ({ i, tekst: p.delovi.map((d) => d.tekst).join('') })).filter((x) => x.tekst.trim())
      .map((x) => ({ i: x.i, tekst: Array.from(x.tekst).slice(0, 20).join('') }));
  });
  /** Cilj se vraća na "Ceo sloj" pri promeni sloja, a i kad izabranog pasusa više nema (npr. posle poništavanja). */
  protected readonly cilj = linkedSignal({ source: () => this.store.jedan()?.id, computation: () => CEO });
  protected readonly ciljSada = computed(() => {
    const c = this.cilj();
    return c < 0 || this.pasusi()?.some((x) => x.i === c) ? c : CEO;
  });
  protected readonly redovi = computed(() => {
    const p = this.store.platno();
    const grupe = brojeviGrupa(p);
    const izabrana = this.store.izabranaAnimacija();
    return p.animacije.map((a) => {
      const s = p.slojevi.find((x) => x.id === a.slojId);
      const naziv = (s ? nazivSloja(p, s) : '') + (a.pasus === null ? '' : ` · pasus ${a.pasus + 1}`);
      return { a, naziv, izabrana: a.id === izabrana, broj: a.okidac === 'KLIK' ? grupe.get(a.id) : 0 };
    });
  });
  protected readonly indeks = computed(() => this.store.platno().animacije.findIndex((a) => a.id === this.store.izabranaAnimacija()));
  protected readonly izabrana = computed(() => this.store.platno().animacije[this.indeks()] ?? null);
  protected readonly efektiIzabrane = computed(() => {
    const a = this.izabrana();
    const s = a && this.store.platno().slojevi.find((x) => x.id === a.slojId);
    const l = s ? efektiZa(s) : [];
    // uvezen efekat koji sloj inače ne nudi (ISCRTAJ na obliku) ostaje izabran
    return !a || l.includes(a.efekat) ? l : [...l, a.efekat];
  });

  protected dodajNovu(e: Efekat): void {
    const s = this.store.jedan();
    const c = this.ciljSada();
    if (!s) return;
    let ids: string[] = [];
    const tekst = s.tip === 'TEKST';
    this.store.primeni((p) => {
      if (tekst && c === PO_PASUSIMA) {
        const r = dodajPoPasusima(p, s.id, this.vrsta(), e);
        if (!r.ids.length) this.obavestenja.info('Tekst nema pasusa sa sadržajem.');
        ids = r.ids;
        return r.platno;
      }
      const r = dodajAnimaciju(p, s.id, this.vrsta(), e, tekst && c >= 0 ? c : null);
      ids = [r.id];
      return r.platno;
    });
    if (this.store.platno().animacije.some((a) => a.id === ids[0])) this.store.izaberiAnimaciju(ids[0]);
  }

  /** Uzastopne izmene istog brojčanog polja iste animacije u roku od 1 s su jedan korak. */
  protected izmeni(izmena: Partial<Omit<Animacija, 'id' | 'slojId' | 'pasus'>>, polje?: string): void {
    const id = this.store.izabranaAnimacija();
    if (id) this.store.primeni((p) => izmeniAnimaciju(p, id, izmena), polje && `animacija-${polje}:${id}`);
  }

  /** Čuvar: `disabledInteractive` ne blokira klik, pa indeks van liste ne radi ništa. */
  protected pomeri(a: Animacija, indeks: number): void {
    if (indeks >= 0 && indeks < this.redovi().length) this.store.primeni((p) => premestiAnimaciju(p, a.id, indeks));
  }

  /**
   * Posle brisanja bira se sledeća (ili prethodna); bez ijedne fokus ide na "Dodaj ulaz", a kad je ono onemogućeno (nije
   * izabran tačno jedan sloj) na poruku praznog panela, posle crtanja.
   */
  protected obrisi(a: Animacija, i: number): void {
    if (!this.store.primeni((p) => obrisiAnimaciju(p, a.id))) return;
    const ostale = this.store.platno().animacije;
    const sledeca = ostale[Math.min(i, ostale.length - 1)];
    if (sledeca) this.store.izaberiAnimaciju(sledeca.id);
    else {
      afterNextRender(() => {
        const d = this.dugmeDodaj()?.nativeElement;
        (d && !d.disabled ? d : this.prazno()?.nativeElement)?.focus();
      }, { injector: this.injector });
    }
  }

  protected spusteno(e: CdkDragDrop<unknown>): void {
    const a = this.store.platno().animacije[e.previousIndex];
    if (a) this.pomeri(a, e.currentIndex);
  }
}

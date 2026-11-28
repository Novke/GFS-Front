import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Subscription, filter } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { StudentPicker } from '../../../shared/ui/student-picker';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { GrupaTesta, IzvuciCmd, OnlineTest, StavkaTesta, StudentKonzole, VarijantaZaIzbor, ZadatakIzbora } from '../data-access/online.models';
import { formatPoena, svgUrl, zvezdice } from '../data-access/online.pravila';

const KLJUC = (g: string | null, z: ZadatakIzbora) => `${g ?? '-'}:${z.stavkaId}:${z.mesto}`;

/**
 * Tab **Priprema** online testa (spec 8, plan 6): izvučeni zadaci po grupi testa (GRUPE) ili sve različite varijante po mestima
 * (POJEDINACNO), sa slikom, nivoom i (na zahtev) rešenjem; „Izvuci ponovo“, „Izaberi tip“, „Nivo“ (za ceo test) i „Izaberi
 * varijantu“ (samo GRUPE). Spisak studenata testa sa „Dodaj studenta“ i uklanjanjem. Menja se dok test ne počne.
 */
@Component({
  selector: 'app-online-priprema',
  imports: [MatButton, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = test();
    @if (!menja()) {
      <p class="napomena">Test je počeo: izvučeni zadaci se više ne menjaju.</p>
    }
    @for (g of t.izbor; track g.grupaTesta ?? '-') {
      <section class="grupa" [attr.data-grupa-testa]="g.grupaTesta ?? 'sve'">
        <h2>{{ g.grupaTesta ? 'Grupa ' + g.grupaTesta : 'Varijante po mestima' }} <span class="tiho">· {{ g.studenata }} studenata</span></h2>
        <div class="zadaci">
          @for (z of g.zadaci; track $index) {
            @let s = stavka(z.stavkaId);
            @let k = kljuc(g.grupaTesta, z);
            <article class="zadatak" [attr.data-zadatak]="k">
              <header class="glava">
                <strong>{{ oznaka(s?.rb, s?.broj, z.mesto) }} {{ s?.naziv }}</strong>
                <span class="tiho">{{ z.tip }} · <span [attr.aria-label]="'nivo ' + z.nivo">{{ zvezdice(z.nivo) }}</span> · {{ formatPoena(z.maxPoena) }} p.
                  @if (t.rezim === 'POJEDINACNO') { · {{ z.studenata }} stud. }</span>
              </header>
              <img class="slika" [src]="svg(z.svgId)" [alt]="'Zadatak ' + oznaka(s?.rb, s?.broj, z.mesto)" loading="lazy" />
              @if (resenja().has(k) && z.resenjeSvgId) {
                <img class="slika" [src]="svg(z.resenjeSvgId)" alt="Rešenje" loading="lazy" data-resenje />
              }
              <div class="alati">
                @if (z.resenjeSvgId) {
                  <button matButton type="button" (click)="prebaciResenje(k)">{{ resenja().has(k) ? 'Sakrij rešenje' : 'Rešenje' }}</button>
                }
                @if (menja()) {
                  <button matButton type="button" [disabled]="radi()" (click)="izvuci(z, g.grupaTesta, {})" data-izvuci-ponovo>
                    <mat-icon svgIcon="replay" aria-hidden="true" />Izvuci ponovo
                  </button>
                  @if (s && s.tipovi.length > 1) {
                    <label class="izbor">Tip
                      <select [value]="z.tipId" (change)="izvuci(z, g.grupaTesta, { tipId: +$any($event.target).value })" [disabled]="radi()" data-izaberi-tip>
                        @for (tp of s.tipovi; track tp.tipId) { <option [value]="tp.tipId" [selected]="(tp.tipId) === (z.tipId)">{{ tp.naziv }}</option> }
                      </select>
                    </label>
                  }
                  <label class="izbor">Nivo
                    <select [value]="s?.izabraniNivo ?? 0" (change)="nivo(z, +$any($event.target).value)" [disabled]="radi()" data-izaberi-nivo>
                      <option [value]="0" [selected]="(0) === (s?.izabraniNivo ?? 0)">po šablonu</option>
                      @for (n of [1, 2, 3]; track n) { <option [value]="n" [selected]="(n) === (s?.izabraniNivo ?? 0)">{{ zvezdice(n) }}</option> }
                    </select>
                  </label>
                  @if (t.rezim === 'GRUPE') {
                    <button matButton type="button" [disabled]="radi()" (click)="otvoriVarijante(k, z)" data-izaberi-varijantu>Izaberi varijantu</button>
                  }
                }
              </div>
              @if (biraVarijantu() === k) {
                <div class="varijante" role="group" aria-label="Varijante tipa">
                  @for (v of varijante(); track v.id) {
                    <button type="button" class="varijanta" [class.trenutna]="v.id === z.varijantaId" [disabled]="radi() || v.id === z.varijantaId"
                            (click)="izvuci(z, g.grupaTesta, { varijantaId: v.id })" [attr.data-varijanta]="v.id">
                      #{{ v.rb }} {{ v.naziv ?? '' }} <span class="tiho">{{ zvezdice(v.nivo) }}</span>
                    </button>
                  } @empty { <p class="tiho">Učitavanje varijanti…</p> }
                </div>
              }
            </article>
          }
        </div>
      </section>
    }

    <section class="studenti" data-studenti-pripreme>
      <header class="glava">
        <h2>Studenti ({{ studenti().length }})</h2>
        @if (menja()) {
          <button matButton="outlined" type="button" (click)="dodaj()" data-dodaj-studenta>
            <mat-icon svgIcon="person_add" aria-hidden="true" />Dodaj studenta
          </button>
        }
      </header>
      <ul class="lista">
        @for (s of studenti(); track s.studentId) {
          <li [attr.data-student]="s.studentId">
            <span>{{ s.prezime }} {{ s.ime }} <span class="tiho">{{ s.indeks }}@if (s.grupaTesta) { · grupa {{ s.grupaTesta }} }</span></span>
            @if (menja() && s.stanje === 'NIJE_USAO') {
              <button matButton type="button" (click)="ukloni(s)" [attr.aria-label]="'Ukloni ' + s.ime + ' ' + s.prezime">Ukloni</button>
            }
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    h2 { margin: 0; font-size: 17px; }
    .tiho { color: var(--ink-2); font-weight: 400; }
    .napomena { margin: 0; color: var(--ink-2); }
    .grupa { display: flex; flex-direction: column; gap: 8px; }
    .zadaci { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
    .zadatak { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); }
    .glava { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
    .slika { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
    .alati { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .izbor { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--ink-2); }
    .izbor select { min-height: 32px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; }
    .varijante { display: flex; flex-wrap: wrap; gap: 6px; }
    .varijanta { min-height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
      color: var(--ink); font: inherit; cursor: pointer; }
    .varijanta.trenutna { border-color: var(--primary); }
    .studenti { padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .lista { display: flex; flex-direction: column; margin: 8px 0 0; padding: 0; list-style: none; }
    .lista li { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; border-top: 1px solid var(--line); }
  `,
})
export class OnlinePriprema {
  readonly test = input.required<OnlineTest>();
  readonly promena = output<OnlineTest>();

  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  protected readonly radi = signal(false);
  protected readonly resenja = signal<ReadonlySet<string>>(new Set());
  protected readonly biraVarijantu = signal<string | null>(null);
  protected readonly varijante = signal<VarijantaZaIzbor[]>([]);
  protected readonly studenti = signal<StudentKonzole[]>([]);
  protected readonly menja = computed(() => this.test().stanje === 'PRIPREMA' || this.test().stanje === 'ULAZ');

  protected readonly kljuc = KLJUC;
  protected readonly zvezdice = zvezdice;
  protected readonly formatPoena = formatPoena;
  protected readonly svg = svgUrl;
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    effect(() => {
      void this.test().studenti;
      untracked(() => this.ucitajStudente());
    });
  }

  /** Oznaka zadatka: broj stavke, a kad stavka izvlači više zadataka i redni broj mesta (`mesto` je od 0): 2.1, 2.2, … */
  protected oznaka(rb: number | undefined, broj: number | undefined, mesto: number): string {
    if (rb === undefined) return '';
    return (broj ?? 1) > 1 ? `${rb}.${mesto + 1}` : `${rb}.`;
  }

  protected stavka(id: number): StavkaTesta | undefined {
    return this.test().stavke.find(s => s.id === id);
  }

  private ucitajStudente(): void {
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.konzola(this.test().testId, { tiho: true }).subscribe({
      next: k => this.studenti.set([...k.studenti].sort((a, b) => a.prezime.localeCompare(b.prezime, 'sr') || a.ime.localeCompare(b.ime, 'sr'))),
      error: () => undefined,
    });
  }

  protected prebaciResenje(k: string): void {
    const s = new Set(this.resenja());
    if (s.has(k)) s.delete(k); else s.add(k);
    this.resenja.set(s);
  }

  protected izvuci(z: ZadatakIzbora, grupa: GrupaTesta | null, d: Partial<IzvuciCmd>): void {
    const rezim = this.test().rezim;
    this.posalji({
      stavkaId: z.stavkaId,
      grupaTesta: rezim === 'GRUPE' ? grupa : null,
      mesto: z.mesto,
      tipId: null, nivo: null, varijantaId: null,
      ...d,
    });
  }

  /** Nivo važi za stavku na celom testu (sve grupe i mesta): ponovo izvlači njene zadatke. */
  protected nivo(z: ZadatakIzbora, n: number): void {
    this.posalji({ stavkaId: z.stavkaId, grupaTesta: null, mesto: null, tipId: null, nivo: n === 0 ? null : n, varijantaId: null });
  }

  protected otvoriVarijante(k: string, z: ZadatakIzbora): void {
    if (this.biraVarijantu() === k) {
      this.biraVarijantu.set(null);
      return;
    }
    this.biraVarijantu.set(k);
    this.varijante.set([]);
    this.api.varijanteTipa(z.tipId).subscribe(v => this.varijante.set(v.filter(x => x.svgId !== null)));
  }

  private posalji(cmd: IzvuciCmd): void {
    this.radi.set(true);
    this.api.izvuci(this.test().testId, cmd).subscribe({
      next: t => {
        this.radi.set(false);
        this.biraVarijantu.set(null);
        this.promena.emit(t);
      },
      error: () => this.radi.set(false),
    });
  }

  protected dodaj(): void {
    StudentPicker.otvori(this.dialog, {
      grupaId: this.test().grupaId,
      iskljuci: this.studenti().map(s => s.studentId),
      naslov: 'Dodaj studenta na test',
      pocetniRezim: 'stariji',
    }).subscribe(izabrani => {
      for (const s of izabrani) {
        this.api.dodajStudenta(this.test().testId, s.id).subscribe(t => this.promena.emit(t));
      }
    });
  }

  protected ukloni(s: StudentKonzole): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Ukloniti studenta sa testa?', tekst: `${s.ime} ${s.prezime} više neće moći da uđe u test.`, potvrdi: 'Ukloni', destruktivno: true,
    }).pipe(filter(Boolean)).subscribe(() => this.api.ukloniStudenta(this.test().testId, s.studentId).subscribe(t => this.promena.emit(t)));
  }
}

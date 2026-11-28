import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Observable, Subscription, filter } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { StatusChip } from '../../../shared/ui/status-chip';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { KonzolaTesta, StanjeOnline, StudentKonzole } from '../data-access/online.models';
import {
  KONZOLA_MS, NAZIV_STANJA_PRIMERKA, TON_STANJA_PRIMERKA, formatPoena, formatSata, vremeIzIso,
} from '../data-access/online.pravila';
import { UnosDialog } from './unos-dialog';

/**
 * Tab **Uživo** online testa (spec 12, plan 4.3): konzola na 3 s dok je strana vidljiva. Po studentu stanje, popunjenost, preostalo
 * vreme, meki znaci (napuštanja, promena uređaja, druga mreža, računar) i radnje: produži (jednom ili svima), vrati predat
 * primerak, poništi (sa napomenom), prepisivao. Kad se stanje testa promeni (pokrenut, završen), javlja roditelju.
 */
@Component({
  selector: 'app-online-konzola',
  imports: [MatButton, MatCheckbox, MatIcon, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (k(); as k) {
      <div class="vrh">
        <p class="zbir" data-zbir>Ušlo {{ k.usli }} · predalo {{ k.predalo }} od {{ k.ukupno }}</p>
        @if (k.stanje === 'U_TOKU') {
          <button matButton="outlined" type="button" (click)="produzi(null)" data-produzi-svima>
            <mat-icon svgIcon="timer" aria-hidden="true" />Produži svima
          </button>
        }
      </div>
      <div class="tabela-okvir">
        <table class="tabela">
          <caption class="sr-only">Konzola testa</caption>
          <thead>
            <tr>
              <th scope="col">Student</th><th scope="col">Grupa</th><th scope="col">Stanje</th><th scope="col">Popunjeno</th>
              <th scope="col">Vreme</th><th scope="col">Znaci</th><th scope="col">Prepisivao</th>
              @if (k.stanje === 'ZAVRSEN') { <th scope="col">Poeni</th> }
              <th scope="col"><span class="sr-only">Radnje</span></th>
            </tr>
          </thead>
          <tbody>
            @for (s of k.studenti; track s.primerakId) {
              <tr [attr.data-primerak]="s.primerakId">
                <td>{{ s.prezime }} {{ s.ime }} <span class="tiho">{{ s.indeks }}</span></td>
                <td>{{ s.grupaTesta ?? '—' }}</td>
                <td><app-status-chip [tekst]="stanjePrimerka(s)" [ton]="ton(s)" /></td>
                <td class="broj">{{ s.popunjeno }}/{{ s.ukupnoPolja }}</td>
                <td class="broj">{{ vreme(s) }}@if (s.produzenjeMin) { <span class="tiho"> (+{{ s.produzenjeMin }})</span> }</td>
                <td class="znaci">
                  @if (s.racunar) { <span title="Radi na računaru u laboratoriji">računar</span> }
                  @if (s.napustanja) { <span class="znak" data-napustanja>izašao {{ s.napustanja }}× ({{ s.napustanjaSekundi }} s)</span> }
                  @if (s.promenaUredjaja) { <span class="znak" data-promena-uredjaja>uređaj {{ s.promenaUredjaja }}×</span> }
                  @if (s.drugaMreza) { <span class="znak" data-druga-mreza>druga mreža</span> }
                </td>
                <td><mat-checkbox [checked]="s.prepisivao" (change)="prepisivao(s, $event.checked)"
                                  [aria-label]="'Prepisivao: ' + s.ime + ' ' + s.prezime" data-prepisivao /></td>
                @if (k.stanje === 'ZAVRSEN') { <td class="broj">{{ formatPoena(s.poeni) }}</td> }
                <td class="radnje">
                  @if (s.stanje === 'RADI' || s.stanje === 'CEKA') {
                    <button matButton type="button" (click)="produzi(s)" data-produzi>Produži</button>
                  }
                  @if (s.stanje === 'PREDAO' && k.stanje === 'U_TOKU') {
                    <button matButton type="button" (click)="vrati(s)" data-vrati>Vrati</button>
                  }
                  @if (s.stanje !== 'PONISTEN' && s.stanje !== 'NIJE_USAO') {
                    <button matButton type="button" class="opasno" (click)="ponisti(s)" data-ponisti>Poništi</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="tiho">Učitavanje konzole…</p>
    }
  `,
  styles: `
    :host { display: block; }
    .vrh { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .zbir { margin: 0; font-size: 18px; font-weight: 600; }
    .tiho { color: var(--ink-2); }
    .tabela-okvir { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
    .tabela th { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; text-align: left; white-space: nowrap; }
    .tabela td { padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    .broj { font-family: var(--font-mono); white-space: nowrap; }
    .znaci { display: flex; flex-wrap: wrap; gap: 4px; font-size: 12.5px; }
    .znak { padding: 1px 6px; border-radius: 999px; background: var(--warn-soft); }
    .radnje { white-space: nowrap; }
    .opasno { color: var(--danger); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
})
export class OnlineKonzola {
  readonly testId = input.required<number>();
  readonly stanjeTesta = input.required<StanjeOnline>();
  readonly promenaStanja = output<void>();

  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  private readonly dokument = inject(DOCUMENT);
  protected readonly k = signal<KonzolaTesta | null>(null);
  private readonly pomak = signal(0);
  private readonly sada = signal(Date.now());
  protected readonly formatPoena = formatPoena;
  private zahtev?: Subscription;
  protected readonly stanjePrimerka = (s: StudentKonzole) => NAZIV_STANJA_PRIMERKA[s.stanje];
  protected readonly ton = (s: StudentKonzole) => TON_STANJA_PRIMERKA[s.stanje];
  private readonly rok = computed(() => this.k()?.smena.rokMs ?? null);

  constructor() {
    const upit = () => {
      if (this.dokument.visibilityState === 'hidden' || (this.zahtev && !this.zahtev.closed)) return;
      this.zahtev = this.api.konzola(this.testId(), { tiho: true }).subscribe({ next: k => this.primi(k), error: () => undefined });
    };
    const t = setInterval(upit, KONZOLA_MS);
    const tik = setInterval(() => this.sada.set(Date.now()), 1_000);
    const slusalac = () => upit();
    this.dokument.addEventListener('visibilitychange', slusalac);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(t);
      clearInterval(tik);
      this.dokument.removeEventListener('visibilitychange', slusalac);
      this.zahtev?.unsubscribe();
    });
    effect(() => {
      this.testId();
      queueMicrotask(upit);
    });
  }

  private primi(k: KonzolaTesta): void {
    this.k.set(k);
    this.pomak.set(k.serverVremeMs - Date.now());
    if (k.stanje !== this.stanjeTesta()) {
      this.promenaStanja.emit();
    }
  }

  protected vreme(s: StudentKonzole): string {
    if (s.stanje === 'PREDAO') return s.predato ? `predao ${vremeIzIso(s.predato)}` : 'predao';
    const rok = s.rokMs ?? this.rok();
    if (rok === null || (s.stanje !== 'RADI' && s.stanje !== 'CEKA')) return '—';
    return formatSata(rok - (this.sada() + this.pomak()));
  }

  private akcija(o: Observable<KonzolaTesta>): void {
    o.subscribe(k => this.primi(k));
  }

  protected produzi(s: StudentKonzole | null): void {
    UnosDialog.otvori(this.dialog, {
      naslov: s ? `Produži: ${s.ime} ${s.prezime}` : 'Produži svima',
      tekst: s ? 'Koliko minuta dodaješ ovom studentu?' : 'Koliko minuta dodaješ svima koji još rade?',
      labela: 'Minuti', potvrdi: 'Produži', pocetno: '5', pomoc: 'Od 1 do 120.',
      proveri: v => (/^\d{1,3}$/u.test(v) && +v >= 1 && +v <= 120 ? null : 'Unesi ceo broj od 1 do 120.'),
    }).pipe(filter((v): v is string => typeof v === 'string'))
      .subscribe(v => this.akcija(this.api.produzi(this.testId(), Number(v), s?.primerakId ?? null)));
  }

  protected vrati(s: StudentKonzole): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Vratiti predat test?', tekst: `${s.ime} ${s.prezime} ponovo može da menja odgovore do svog roka.`, potvrdi: 'Vrati',
    }).pipe(filter(Boolean)).subscribe(() => this.akcija(this.api.vrati(this.testId(), s.primerakId)));
  }

  protected ponisti(s: StudentKonzole): void {
    UnosDialog.otvori(this.dialog, {
      naslov: `Poništiti test: ${s.ime} ${s.prezime}?`,
      tekst: 'Primerak se zatvara i ne boduje se. Napomena ostaje uz primerak.',
      labela: 'Napomena', potvrdi: 'Poništi', destruktivno: true,
    }).pipe(filter((v): v is string => typeof v === 'string'))
      .subscribe(n => this.akcija(this.api.ponisti(this.testId(), s.primerakId, n)));
  }

  protected prepisivao(s: StudentKonzole, da: boolean): void {
    this.akcija(this.api.prepisivao(this.testId(), s.primerakId, da));
  }
}

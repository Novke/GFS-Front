import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { tacanBroj } from '../../uzivo/ui/format';
import { SlajdPrikazComponent } from '../../uzivo/ui/slajd-prikaz.component';
import type { PitanjeDetails, SlajdZaPrikaz } from '../../uzivo/ui/slajd-za-prikaz';
import { porukaGreske } from '../data-access/nalog.pravila';
import { PortalApi } from '../data-access/portal.api';
import { PregledPrezentacije, SlajdPregleda } from '../data-access/portal.models';
import { idIzRute, putanjaPrijave, status } from '../data-access/portal.pravila';
import { MojZadatakKartica } from '../ui/moj-zadatak.component';
import { NalogOkvir } from '../ui/nalog-okvir.component';

/** PLATNO u pregledu: krajnje stanje (svi koraci); `stanjeSlojeva` staje na broju grupa animacija. */
const SVI_KORACI = 10_000;

/** Pitanja koja imaju tačan odgovor (anketa i skala nemaju). */
const SA_TACNIM = new Set(['JEDAN_TACAN', 'VISE_TACNIH', 'TACNO_NETACNO', 'BROJ', 'KRATAK_TEKST']);

/** Tačan odgovor BROJ i KRATAK_TEKST pitanja kao tekst (opcije označava sam renderer). */
export function tacanTekst(p: PitanjeDetails): string | null {
  if (p.tip === 'BROJ' && typeof p.brojTacno === 'number') {
    const odstupanje = typeof p.brojOdstupanje === 'number' && p.brojOdstupanje > 0
      ? ` (± ${tacanBroj(p.brojOdstupanje)}${p.odstupanjeTip === 'PROCENAT' ? ' %' : ''})`
      : '';
    return tacanBroj(p.brojTacno) + (p.jedinica ? ' ' + p.jedinica : '') + odstupanje;
  }
  if (p.tip === 'KRATAK_TEKST' && p.prihvatljiviOdgovori?.length) {
    return p.prihvatljiviOdgovori.join(', ');
  }
  return null;
}

/**
 * Pregled prezentacije za ponavljanje (`/nalog/prezentacija/:id`, spec studentskog dela 6.1 i 12.9 tačke 8 i 11): samo
 * slajdovi koje je grupa studenta videla u završenom izvođenju (server ne šalje ostale, ni beleške), redom, svaki u krajnjem
 * stanju. INFO, PLATNO i PITANJE crta projektorski renderer (`app-slajd-prikaz`, tema prezentacije), tek kad slajd uđe u
 * vidno polje (`@defer (on viewport)`). Uz PITANJE "Tvoj odgovor" (kad je student odgovarao prijavljen) i "Prikaži tačan
 * odgovor" (samo prikaz: odgovor je već u odgovoru servera, čas je završen). ZADATAK slajd nije projektorska kartica nego
 * naziv tipa, sopstveni zadaci sa časa i "Vežbaj ovaj tip". Lenja strana: renderer slajda nije u početnom paketu ni u ljusci.
 */
@Component({
  selector: 'app-pregled-prezentacije-page',
  imports: [MatButton, MatProgressSpinner, MojZadatakKartica, NalogOkvir, RouterLink, SlajdPrikazComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir [naslov]="pregled()?.naziv ?? 'Prezentacija'">
      @if (pregled(); as p) {
        <a class="nazad" [routerLink]="['/nalog/predmet', p.predmetId]">← Nazad na predmet</a>
        <h2>Slajdovi sa časa</h2>
        @if (p.slajdovi.length === 0) {
          <p class="prazno">Nema slajdova za pregled.</p>
        }
        <ol class="slajdovi">
          @for (s of p.slajdovi; track s.id; let i = $index) {
            <li class="slajd" [attr.data-slajd]="s.id" [attr.aria-label]="'Slajd ' + (i + 1) + ' od ' + p.slajdovi.length">
              @if (s.tip === 'ZADATAK') {
                <section class="zadatak-slajd" [attr.aria-labelledby]="'zs-' + s.id">
                  <h3 [id]="'zs-' + s.id">{{ s.naslov || 'Zadatak' }}</h3>
                  @if (s.zadatak; as z) {
                    @if (z.naziv) { <p class="opis">Tip: {{ z.naziv }}</p> }
                    @if (z.moji.length) {
                      <p class="podnaslov">Tvoj zadatak sa časa</p>
                      @for (m of z.moji; track m.rundaId) {
                        <app-moj-zadatak [zadatak]="m" [predmetId]="p.predmetId" [prikaziIzvor]="false" />
                      }
                    } @else {
                      <p class="prazno">Na ovom slajdu nisi dobio zadatak.</p>
                    }
                    @if (z.tipovi.length) {
                      <div class="vezbaj">
                        @for (t of z.tipovi; track t.tipId) {
                          <a class="dugme-link" [routerLink]="['/nalog/predmet', p.predmetId, 'vezbanje', t.tipId]" data-vezbaj>
                            Vežbaj: {{ t.naziv }}</a>
                        }
                      </div>
                    }
                  }
                </section>
              } @else {
                @defer (on viewport) {
                  <app-slajd-prikaz class="okvir" [slajd]="zaPrikaz(s)" [tema]="p.tema ?? 'NACRT'" [korak]="sviKoraci"
                                    [tacanPrikazan]="prikazanTacan().has(s.id)" />
                } @placeholder {
                  <div class="okvir mesto" aria-hidden="true"></div>
                }
                @if (s.pitanje; as q) {
                  <div class="pitanje-dno">
                    @if (s.mojOdgovor; as o) {
                      <p data-moj-odgovor>Tvoj odgovor: <strong>{{ o.tekst ?? '—' }}</strong>
                        @if (o.tacno === true) { <span class="ok"> · tačno</span> }
                        @if (o.tacno === false) { <span class="lose"> · netačno</span> }
                      </p>
                    }
                    @if (imaTacan(q)) {
                      <button type="button" class="dugme-link" [attr.aria-pressed]="prikazanTacan().has(s.id)"
                              (click)="prekidac(s.id)" data-tacan>
                        {{ prikazanTacan().has(s.id) ? 'Sakrij tačan odgovor' : 'Prikaži tačan odgovor' }}
                      </button>
                      @if (prikazanTacan().has(s.id) && tacanTekst(q); as t) {
                        <p class="ok" data-tacan-tekst>Tačan odgovor: {{ t }}</p>
                      }
                    }
                  </div>
                }
              }
            </li>
          }
        </ol>
      } @else if (nema()) {
        <a class="nazad" routerLink="/nalog/predmeti">← Svi predmeti</a>
        <h2>Prezentacija</h2>
        <p class="poruka info" role="alert" data-nema>Prezentacija nije pronađena.</p>
      } @else if (greska(); as g) {
        <h2>Prezentacija</h2>
        <p class="poruka opasnost" role="alert">{{ g }}</p>
        <button type="button" mat-flat-button class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
      } @else {
        <h2>Prezentacija</h2>
        <p class="stanje" role="status"><mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...</p>
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 12px; font-size: 18px; }
    h3 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
    .nazad { display: inline-flex; align-items: center; min-height: 44px; margin: -8px 0 4px; color: var(--primary); font-weight: 600; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0; color: var(--muted); }
    .prazno, .opis { margin: 0; color: var(--ink-2); }
    .podnaslov { margin: 4px 0 0; font-weight: 600; }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .poruka.info { border-color: var(--line); }
    .slajdovi { display: flex; flex-direction: column; gap: 18px; margin: 0; padding: 0; list-style: none; }
    .slajd { display: flex; flex-direction: column; gap: 8px; }
    .okvir { display: block; width: 100%; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
    .mesto { aspect-ratio: 16 / 9; background: var(--surface-2); }
    .zadatak-slajd { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--line);
      border-radius: var(--radius-sm); background: var(--surface-2); }
    .pitanje-dno { display: flex; flex-direction: column; gap: 6px; }
    .pitanje-dno p { margin: 0; overflow-wrap: anywhere; }
    .ok { color: var(--ok); }
    .lose { color: var(--danger); }
    .vezbaj { display: flex; flex-wrap: wrap; gap: 8px; }
    .dugme-link { display: inline-flex; align-self: flex-start; align-items: center; min-height: 44px; padding: 0 14px;
      border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--primary); font: inherit;
      font-weight: 600; text-decoration: none; cursor: pointer; }
    .dugme-link:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  `,
})
export class PregledPrezentacijePage {
  /** `:id` iz rute (`withComponentInputBinding`). */
  readonly id = input<string | null | undefined>(null);

  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);

  private readonly prezentacijaId = computed(() => idIzRute(this.id()));
  protected readonly pregled = signal<PregledPrezentacije | null>(null);
  protected readonly nema = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly prikazanTacan = signal<ReadonlySet<number>>(new Set());
  protected readonly sviKoraci = SVI_KORACI;
  protected readonly tacanTekst = tacanTekst;
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    effect(() => {
      this.prezentacijaId();
      untracked(() => this.ucitaj());
    });
  }

  protected ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.pregled.set(null);
    this.greska.set(null);
    this.prikazanTacan.set(new Set());
    const id = this.prezentacijaId();
    this.nema.set(id === null);
    if (id === null) {
      return;
    }
    this.zahtev = this.api.pregled(id).subscribe({
      next: p => this.pregled.set(p),
      error: (e: unknown) => {
        const s = status(e);
        if (s === 401) {
          void this.router.navigateByUrl(putanjaPrijave(this.router.url));
        } else if (s === 404) {
          this.nema.set(true);
        } else {
          this.greska.set(porukaGreske(e));
        }
      },
    });
  }

  /** Ulaz renderera: isti slajd bez ZADATAK dela (`zadatak` studentskog pregleda nije opis slajda iz editora). */
  protected zaPrikaz(s: SlajdPregleda): SlajdZaPrikaz {
    return {
      id: s.id, tip: s.tip, naslov: s.naslov, sadrzaj: s.sadrzaj, slika: s.slika, pitanje: s.pitanje, platno: s.platno,
      zadatak: null,
    };
  }

  protected imaTacan(p: PitanjeDetails): boolean {
    return SA_TACNIM.has(p.tip);
  }

  protected prekidac(id: number): void {
    this.prikazanTacan.update(s => {
      const n = new Set(s);
      if (!n.delete(id)) {
        n.add(id);
      }
      return n;
    });
  }
}

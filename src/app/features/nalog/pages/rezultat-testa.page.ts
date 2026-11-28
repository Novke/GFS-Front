import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { DatumPipe } from '../../../shared/util/datum.pipe';
import { tacnoPolja } from '../../uzivo/ui/polja-zadatka';
import { TekstFormuleComponent } from '../../uzivo/ui/tekst-formule.component';
import { porukaGreske } from '../data-access/nalog.pravila';
import { putanjaPrijave, status } from '../data-access/portal.pravila';
import { TestoviStudentaApi } from '../data-access/testovi-studenta.api';
import { PoljeRezultata, RezultatTestaStudenta } from '../data-access/testovi-studenta.models';
import { formatPoena } from '../data-access/testovi-studenta.pravila';
import { SlikaZadatka } from '../ui/slika-zadatka.component';

/**
 * Rezultat objavljenog testa (`nalog/test/:id/rezultat`, u ljusci tabova; spec online testova 14): poeni po zadatku i polju, šta je
 * student uneo, a tačne vrednosti i slika rešenja samo kad je nastavnik objavio sa „Pokaži tačne odgovore“ (`tacniPrikazani`).
 * Test na papiru: samo ukupni poeni. 404 dok nije objavljen.
 */
@Component({
  selector: 'app-rezultat-testa-page',
  imports: [RouterLink, DatumPipe, SlikaZadatka, TekstFormuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="nazad" routerLink="/nalog/predmeti">← Predmeti</a>
    @if (greska(); as g) {
      <p class="greska" role="alert" data-greska>{{ g }}</p>
    } @else if (r(); as r) {
      <section class="kartica" data-rezultat>
        <p class="nad">{{ r.predmet }} · {{ r.datum | datum }}</p>
        <h2>{{ r.tipTesta }}</h2>
        <p class="ukupno" data-ukupno>{{ poeni(r.poeni) }} od {{ poeni(r.maxPoena) }}
          @if (r.polozio !== null) { · <strong [class.ok]="r.polozio">{{ r.polozio ? 'položeno' : 'nije položeno' }}</strong> }
        </p>
        @if (!r.tacniPrikazani && r.zadaci.length) {
          <p class="tiho">Nastavnik nije objavio tačne odgovore; vidiš svoje odgovore i poene.</p>
        }
      </section>
      @for (z of r.zadaci; track z.rb) {
        <section class="kartica" [attr.data-zadatak]="z.rb">
          <header class="glava">
            <h3>{{ z.rb }}. {{ z.naziv }}</h3>
            <span class="poeni">{{ poeni(z.poeni) }} / {{ poeni(z.maxPoena) }}</span>
          </header>
          <app-slika-zadatka [svgId]="z.svgId" oznaka="zadatak" />
          @if (z.polja.length) {
            <dl class="polja">
              @for (p of z.polja; track p.kljuc) {
                <div class="polje">
                  <dt>{{ p.oznaka }}</dt>
                  <dd>
                    <span data-uneto>Tvoj odgovor: @if (uneto(p); as u) { <app-tekst-formule [tekst]="u" /> } @else { <em>prazno</em> }</span>
                    <span class="udeo">{{ procenat(p.udeo) }}</span>
                    @if (r.tacniPrikazani && tacno(p); as t) {
                      <span class="tacno" data-tacno>Tačno: <app-tekst-formule [tekst]="t" /></span>
                    }
                  </dd>
                </div>
              }
            </dl>
          }
          @if (r.tacniPrikazani && z.resenjeSvgId; as id) {
            <app-slika-zadatka [svgId]="id" naziv="Rešenje" oznaka="resenje" />
          }
        </section>
      }
    } @else {
      <p class="tiho">Učitavam…</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .nazad { align-self: flex-start; color: var(--primary); font-weight: 600; }
    .kartica { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); }
    .nad { margin: 0; color: var(--ink-2); font-size: 14px; }
    h2, h3 { margin: 0; }
    .ukupno { margin: 0; font-size: 20px; font-family: var(--font-mono); }
    .ok { color: var(--ok); }
    .tiho { margin: 0; color: var(--ink-2); }
    .greska { margin: 0; padding: 12px 16px; border: 1px solid var(--danger); border-radius: 8px; background: var(--danger-soft); }
    .glava { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .poeni { flex: none; font-family: var(--font-mono); color: var(--ink-2); }
    .polja { display: flex; flex-direction: column; gap: 8px; margin: 0; }
    .polje { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
    dt { font-weight: 600; }
    dd { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; overflow-wrap: anywhere; }
    .udeo { color: var(--ink-2); font-family: var(--font-mono); }
    .tacno { color: var(--ok); }
  `,
})
export class RezultatTestaPage {
  readonly id = input.required({ transform: numberAttribute });

  private readonly api = inject(TestoviStudentaApi);
  private readonly router = inject(Router);
  protected readonly r = signal<RezultatTestaStudenta | null>(null);
  protected readonly greska = signal<string | null>(null);
  private zahtev?: Subscription;

  protected readonly poeni = formatPoena;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.zahtev?.unsubscribe();
        this.zahtev = this.api.rezultat(id).subscribe({
          next: r => this.r.set(r),
          error: (e: unknown) => {
            if (status(e) === 401) {
              void this.router.navigateByUrl(putanjaPrijave(this.router.url));
            } else {
              this.greska.set(status(e) === 404 ? 'Rezultat još nije objavljen.' : porukaGreske(e));
            }
          },
        });
      });
    });
  }

  protected procenat(udeo: number): string {
    return `${Math.round((udeo ?? 0) * 100)} %`;
  }

  protected uneto(p: PoljeRezultata): string {
    const v = p.uneto;
    if (v === null || v === undefined || v === '') return '';
    if (p.tip === 'JEDAN_TACAN' || p.tip === 'VISE_TACNIH') {
      const ids = Array.isArray(v) ? v : [v];
      return (p.opcije ?? []).filter(o => ids.includes(o.id)).map(o => o.tekst).join(', ');
    }
    return String(v) + (p.jedinica ? ' ' + p.jedinica : '');
  }

  protected tacno(p: PoljeRezultata): string {
    return tacnoPolja({ ...p, odstupanje: null, odstupanjeTip: null, zanemariVelicinu: null, zanemariRazmake: null }, p.tacno);
  }
}

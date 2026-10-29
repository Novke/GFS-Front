import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { jeOpcija, oznakaNaTelefonu, tacnoPolja } from '../../uzivo/ui/polja-zadatka';
import { TekstFormuleComponent } from '../../uzivo/ui/tekst-formule.component';
import { MojZadatak } from '../data-access/portal.models';
import { SlikaZadatka } from './slika-zadatka.component';
import { DatumPipe } from '../../../shared/util/datum.pipe';

/**
 * Sopstveni zadatak sa časa (spec studentskog dela 5.5; Istorija predmeta i ZADATAK slajd u pregledu prezentacije): slika
 * varijante koju je student dobio, šta je uneo po polju i da li je tačno, "Prikaži rešenje" (tačne vrednosti i slika rešenja
 * iz snimka runde; izvođenje je završeno) i "Vežbaj ovaj tip" kad je tip otvoren grupi. Bez HTTP-a osim slika.
 */
@Component({
  selector: 'app-moj-zadatak',
  imports: [DatumPipe, RouterLink, SlikaZadatka, TekstFormuleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let z = zadatak();
    <article class="zadatak" [attr.data-moj-zadatak]="z.rundaId">
      <header>
        <h4>{{ z.tip ?? 'Zadatak' }}</h4>
        @if (prikaziIzvor()) {
          <p class="izvor">{{ z.prezentacija }}@if (z.slajd) { · {{ z.slajd }}}@if (z.vreme) { · {{ z.vreme | datum: 'kratko' }}}</p>
        }
        <p class="ishod">
          @if (z.tacno === true) { <span class="ok">Tačno</span> }
          @else if (z.tacno === false) { <span class="lose">Netačno</span> }
          @else if (z.polja.length === 0) { <span>Rad na papiru</span> }
          @else { <span>Bez odgovora</span> }
        </p>
      </header>
      <app-slika-zadatka [svgId]="z.svgId" oznaka="zadatak" />
      @if (z.polja.length) {
        <ul class="polja">
          @for (p of z.polja; track p.kljuc) {
            @let uneto = z.uneto?.[p.kljuc];
            @let o = z.ishod?.[p.kljuc];
            <li>
              <p>
                <span class="oznaka">{{ oznaka(p) }}:</span>
                @if (uneto) {
                  @if (opcija(p)) { <app-tekst-formule [tekst]="uneto" /> } @else { <strong>{{ uneto }}</strong> }
                } @else { <span class="prigusen">bez odgovora</span> }
                @if (o !== undefined && o !== null) {
                  <span [class.ok]="o" [class.lose]="!o"> · {{ o ? 'tačno' : 'netačno' }}</span>
                }
              </p>
              @if (resenje() && tacno(p); as t) {
                <p class="tacno" data-tacno>Tačno: @if (opcija(p)) { <app-tekst-formule [tekst]="t" /> } @else { {{ t }} }</p>
              }
            </li>
          }
        </ul>
      }
      <div class="akcije">
        @if (imaResenje()) {
          <button type="button" class="dugme" [attr.aria-expanded]="resenje()" (click)="resenje.set(!resenje())">
            {{ resenje() ? 'Sakrij rešenje' : 'Prikaži rešenje' }}
          </button>
        }
        @if (z.vezbanjeOtvoreno && z.tipId !== null && predmetId() !== null) {
          <a class="dugme" [routerLink]="['/nalog/predmet', predmetId(), 'vezbanje', z.tipId]" data-vezbaj>Vežbaj ovaj tip</a>
        }
      </div>
      @if (resenje() && z.resenjeSvgId; as r) {
        <app-slika-zadatka [svgId]="r" naziv="Rešenje" oznaka="resenje" />
      }
    </article>
  `,
  styles: `
    :host { display: block; }
    .zadatak { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--line);
      border-radius: var(--radius-sm); background: var(--surface); }
    header { display: flex; flex-direction: column; gap: 2px; }
    h4 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
    .izvor { margin: 0; color: var(--ink-2); font-size: 14px; overflow-wrap: anywhere; }
    .ishod { margin: 0; font-weight: 700; }
    .ok { color: var(--ok); }
    .lose { color: var(--danger); }
    .prigusen { color: var(--muted); }
    .polja { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .polja p { margin: 0; overflow-wrap: anywhere; }
    .oznaka { color: var(--ink-2); margin-right: 4px; }
    .tacno { color: var(--ok); }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .dugme { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 1px solid var(--line);
      border-radius: 8px; background: var(--surface); color: var(--primary); font: inherit; font-weight: 600;
      text-decoration: none; cursor: pointer; }
    .dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    :host ::ng-deep .uz-formula--spremna { max-width: 100%; overflow-x: auto; overflow-y: hidden; padding-block: 0.25em; margin-block: -0.25em; }
  `,
})
export class MojZadatakKartica {
  readonly zadatak = input.required<MojZadatak>();
  /** Predmet za "Vežbaj ovaj tip" (`null` = bez dugmeta). */
  readonly predmetId = input<number | null>(null);
  /** Prezentacija, slajd i datum iznad zadatka (Istorija); u pregledu prezentacije to već piše iznad. */
  readonly prikaziIzvor = input(true);

  protected readonly resenje = signal(false);
  protected readonly opcija = jeOpcija;
  protected readonly imaResenje = computed(() => {
    const z = this.zadatak();
    return !!z.resenjeSvgId || Object.keys(z.tacneVrednosti ?? {}).length > 0;
  });

  protected oznaka(p: { oznaka: string }): string {
    return oznakaNaTelefonu(p, this.zadatak().polja.length);
  }

  protected tacno(p: Parameters<typeof tacnoPolja>[0]): string {
    return tacnoPolja(p, this.zadatak().tacneVrednosti?.[p.kljuc]);
  }
}

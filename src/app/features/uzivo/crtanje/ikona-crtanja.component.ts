import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TipElementa } from './crtanje.models';

export type IkonaCrtanja =
  | TipElementa | 'ponisti' | 'vrati' | 'obrisi' | 'bela' | 'slajd' | 'oko' | 'zatvori' | 'sat' | 'plus' | 'tabla';

/**
 * Lokalne SVG ikonice crtanja (kao na maketi; Material nema ove oblike). Ukrasne su (`aria-hidden`): ime alata je u
 * `aria-label` i oblačiću dugmeta.
 */
@Component({
  selector: 'app-ikona-crtanja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `:host { display: inline-grid; width: 28px; height: 28px; } svg { width: 100%; height: 100%; }`,
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
      @switch (ime()) {
        @case ('OLOVKA') { <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/> }
        @case ('LINIJA') { <path d="M5 19L19 5"/> }
        @case ('ISPREKIDANA') { <path d="M5 19L19 5" stroke-dasharray="3.2 3.2" stroke-linecap="butt"/> }
        @case ('STRELICA') { <path d="M5 19L19 5"/><path d="M10 5h9v9"/> }
        @case ('PRAVOUGAONIK') { <rect x="3.5" y="6" width="17" height="12" rx="1"/> }
        @case ('KRUG') { <circle cx="12" cy="12" r="8"/> }
        @case ('ELIPSA') { <ellipse cx="12" cy="12" rx="9.5" ry="5.5"/> }
        @case ('ponisti') { <path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/> }
        @case ('vrati') { <path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/> }
        @case ('obrisi') { <path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/> }
        @case ('bela') { <rect x="3" y="4" width="18" height="12" rx="1" fill="#fff"/><path d="M8 21l4-5 4 5"/> }
        @case ('slajd') { <rect x="3" y="4" width="18" height="12" rx="1"/><path d="M7 8h7M7 11h10"/><path d="M8 21l4-5 4 5"/> }
        @case ('tabla') { <rect x="3" y="4" width="18" height="12" rx="1"/><path d="M7 12c2-3 3 1 5-2s3 0 5-2"/><path d="M8 21l4-5 4 5"/> }
        @case ('oko') { <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/> }
        @case ('zatvori') { <path d="M6 6l12 12M18 6L6 18"/> }
        @case ('sat') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/> }
        @case ('plus') { <path d="M12 5v14M5 12h14" stroke-width="3"/> }
      }
    </svg>
  `,
})
export class IkonaCrtanjaComponent {
  readonly ime = input.required<IkonaCrtanja>();
}

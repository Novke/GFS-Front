import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Kurirana lista Material Symbols (Outlined, težina 400) iz `@material-symbols/svg-400`, kopiranih u
 * `src/assets/icons/` (licenca Apache 2.0, `src/assets/icons/LICENSE`). Nova ikona: kopiraj SVG i dodaj ime ovde.
 * `expand_more` je u paketu `keyboard_arrow_down.svg` (isti znak), kopiran pod starim imenom.
 */
export const IKONE = [
  'home', 'co_present', 'description', 'assignment', 'bar_chart', 'groups', 'person', 'menu_book', 'forum', 'search',
  'add', 'close', 'edit', 'delete', 'more_vert', 'expand_more', 'chevron_left', 'chevron_right', 'check', 'check_circle',
  'star', 'task_alt', 'warning', 'error', 'info', 'print', 'content_copy', 'qr_code_2', 'fullscreen', 'dark_mode',
  'light_mode', 'routine', 'logout', 'filter_alt', 'filter_alt_off', 'arrow_back', 'arrow_forward', 'undo', 'schedule',
  'event', 'mail', 'call', 'open_in_new', 'settings', 'history', 'sticky_note_2', 'school', 'person_add', 'swap_horiz',
  'refresh', 'cloud_off', 'menu', 'brightness_auto',
] as const;

export type NazivIkone = (typeof IKONE)[number];

/** Relativna putanja (radi pod `<base href>` `/` i `/gfs/`). */
export const IKONE_PUTANJA = 'assets/icons/';

/**
 * Registruje svaku ikonu iz `IKONE` kao `svgIcon` (`<mat-icon svgIcon="home">`). SVG se preuzima tek kad se
 * ikona prvi put prikaže. Nema font-ikona ni poziva trećim stranama.
 */
export function registrujIkone(registry: MatIconRegistry, sanitizer: DomSanitizer): void {
  for (const ime of IKONE) {
    registry.addSvgIcon(ime, sanitizer.bypassSecurityTrustResourceUrl(`${IKONE_PUTANJA}${ime}.svg`));
  }
}

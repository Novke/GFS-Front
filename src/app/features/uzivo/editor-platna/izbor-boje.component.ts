// Izbor boje (F6, odluka 23): dugme sa uzorkom otvara CDK popover (ne `mat-menu`: meni se zatvara na klik, a njegov
// typeahead guta slova, pa polje `#RRGGBB` u njemu ne bi radilo). Redovi: boje teme, poslednje korišćene
// (`PreferencesStore.poslednjeBoje`) i "Druga boja" (izbornik pregledača i polje). Esc i klik van zatvaraju, fokus se
// vraća na dugme. Uzorci su podatak dokumenta (hex boje teme i dokumenta), ne stil aplikacije.
import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { PreferencesStore } from '../../../core/state/preferences.store';
import type { Tema } from '../data-access/platno.models';
import { TEME } from '../ui/teme';

const HEKS = /^#[0-9A-Fa-f]{6}$/;
const POLOZAJI: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
];

@Component({
  selector: 'app-izbor-boje',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, CdkConnectedOverlay, CdkOverlayOrigin, MatButtonModule],
  template: `
    <span class="uz-ep-boja-oznaka" aria-hidden="true">{{ oznaka() }}</span>
    <button #dugme type="button" class="uz-ep-boja" cdkOverlayOrigin #izvor="cdkOverlayOrigin"
            [disabled]="onemoguceno()" (click)="otvoreno() ? zatvori() : otvori()"
            [attr.aria-label]="oznaka() + ': ' + (vrednost() ?? 'Bez')" aria-haspopup="dialog" [attr.aria-expanded]="otvoreno()">
      <span class="uz-ep-uzorak" [class.uz-ep-uzorak--bez]="!vrednost()" [style.background-color]="vrednost()"></span>
      <span class="uz-ep-boja-tekst">{{ vrednost() ?? 'Bez' }}</span>
    </button>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="izvor" [cdkConnectedOverlayOpen]="otvoreno()"
                 [cdkConnectedOverlayPositions]="polozaji" [cdkConnectedOverlayHasBackdrop]="true"
                 cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                 (backdropClick)="zatvori()" (detach)="zatvori()" (overlayKeydown)="$event.key === 'Escape' && zatvori()">
      <div class="uz-ep-paleta" role="dialog" [attr.aria-label]="oznaka()" cdkTrapFocus cdkTrapFocusAutoCapture>
        <p class="uz-ep-red-naslov" id="{{ id }}-tema">Tema</p>
        <div class="uz-ep-uzorci" role="group" data-red="tema" [attr.aria-labelledby]="id + '-tema'">
          @for (u of uzorciTeme(); track u.naziv) {
            <button type="button" class="uz-ep-uzorak-dugme" [class.uz-ep-izabrana]="u.boja === vrednost()"
                    [attr.aria-label]="u.naziv + ', ' + u.boja" [title]="u.naziv" (click)="izaberi(u.boja)">
              <span class="uz-ep-uzorak" [style.background-color]="u.boja"></span>
            </button>
          }
        </div>
        @if (poslednje().length) {
          <p class="uz-ep-red-naslov" id="{{ id }}-poslednje">Poslednje</p>
          <div class="uz-ep-uzorci" role="group" data-red="poslednje" [attr.aria-labelledby]="id + '-poslednje'">
            @for (b of poslednje(); track b) {
              <button type="button" class="uz-ep-uzorak-dugme" [class.uz-ep-izabrana]="b === vrednost()"
                      [attr.aria-label]="b" [title]="b" (click)="izaberi(b)">
                <span class="uz-ep-uzorak" [style.background-color]="b"></span>
              </button>
            }
          </div>
        }
        <label class="uz-ep-red-naslov" for="{{ id }}-heks">Druga boja</label>
        <div class="uz-ep-druga">
          <input type="color" class="uz-ep-izbornik" aria-label="Izbornik boje" [value]="izbornik()"
                 (input)="heks.set($any($event.target).value.toUpperCase())">
          <input type="text" class="uz-ep-heks" id="{{ id }}-heks" maxlength="7" autocomplete="off" spellcheck="false"
                 placeholder="#RRGGBB" [value]="heks()" [attr.aria-invalid]="heks() !== '' && !ispravna()"
                 (input)="heks.set($any($event.target).value)" (keydown.enter)="primeni()">
          <button mat-stroked-button type="button" [disabled]="!ispravna()" (click)="primeni()">Primeni</button>
        </div>
        @if (dozvoliPrazno()) {
          <button mat-button type="button" class="uz-ep-bez" (click)="izaberiPrazno()">Bez</button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; }
    .uz-ep-boja-oznaka { color: var(--ink-2); }
    .uz-ep-boja {
      display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 10px;
      border: 1px solid var(--muted); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink);
      font: inherit; font-size: 13px; cursor: pointer;
    }
    .uz-ep-boja:disabled { color: var(--muted); border-color: var(--line); cursor: default; }
    .uz-ep-boja:focus-visible, .uz-ep-paleta :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .uz-ep-boja-tekst { font-family: 'IBM Plex Mono', monospace; }
    .uz-ep-uzorak {
      display: block; width: 20px; height: 20px; box-sizing: border-box;
      border: 1px solid var(--muted); border-radius: var(--radius-sm);
    }
    .uz-ep-uzorak--bez {
      background: linear-gradient(to top right, transparent 45%, var(--danger) 45% 55%, transparent 55%);
    }
    .uz-ep-paleta {
      display: grid; gap: 6px; width: 236px; padding: 12px;
      border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink);
      box-shadow: var(--shadow);
    }
    .uz-ep-red-naslov { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-uzorci { display: flex; flex-wrap: wrap; gap: 4px; }
    .uz-ep-uzorak-dugme {
      display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
      border: 2px solid transparent; border-radius: var(--radius-sm); background: none; cursor: pointer;
    }
    .uz-ep-uzorak-dugme .uz-ep-uzorak { width: 24px; height: 24px; }
    .uz-ep-izabrana { border-color: var(--primary); }
    .uz-ep-druga { display: flex; align-items: center; gap: 6px; }
    .uz-ep-izbornik { width: 36px; height: 36px; padding: 2px; border: 1px solid var(--muted); border-radius: var(--radius-sm); background: var(--surface); }
    .uz-ep-heks {
      width: 0; flex: 1; height: 36px; box-sizing: border-box; padding: 0 8px;
      border: 1px solid var(--muted); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink);
      font: 13px 'IBM Plex Mono', monospace;
    }
    .uz-ep-heks[aria-invalid='true'] { border-color: var(--danger); }
    .uz-ep-bez { justify-self: start; }
  `,
})
export class IzborBojeComponent {
  readonly vrednost = input<string | null>(null);
  readonly tema = input.required<Tema>();
  /** Npr. "Popuna": labela pored dugmeta, `aria-label` dugmeta ("Popuna: #FFCC00") i dijaloga. */
  readonly oznaka = input.required<string>();
  /** Dugme "Bez" -> null (popuna, ivica). */
  readonly dozvoliPrazno = input(false);
  readonly onemoguceno = input(false);
  readonly izbor = output<string | null>();

  private readonly prefs = inject(PreferencesStore);
  private readonly injector = inject(Injector);
  private readonly dugme = viewChild.required<ElementRef<HTMLButtonElement>>('dugme');

  private static brojac = 0;
  protected readonly id = `uz-ep-boja-${++IzborBojeComponent.brojac}`;
  protected readonly polozaji = POLOZAJI;
  protected readonly otvoreno = signal(false);
  /** Tekst polja `#RRGGBB` (na otvaranju trenutna boja). */
  protected readonly heks = signal('');
  protected readonly ispravna = computed(() => HEKS.test(this.heks()));
  /** `<input type="color">` traži `#rrggbb` malim slovima. */
  protected readonly izbornik = computed(() => (this.ispravna() ? this.heks() : this.vrednost() ?? '#000000').toLowerCase());
  protected readonly poslednje = this.prefs.poslednjeBoje;
  protected readonly uzorciTeme = computed(() => {
    const t = TEME[this.tema()];
    return [
      { naziv: 'Pozadina', boja: t.pozadina },
      { naziv: 'Tekst', boja: t.tekst },
      { naziv: 'Naslov', boja: t.naslov },
      ...t.akcenti.map((boja, i) => ({ naziv: `Akcent ${i + 1}`, boja })),
    ];
  });

  protected otvori(): void {
    this.heks.set(this.vrednost() ?? '');
    this.otvoreno.set(true);
  }

  /** Gasi popover i vraća fokus na dugme (i posle crtanja: zamka fokusa pri nestanku vraća fokus na element pre nje). */
  protected zatvori(): void {
    if (!this.otvoreno()) return;
    this.otvoreno.set(false);
    const dugme = this.dugme().nativeElement;
    dugme.focus();
    afterNextRender(() => dugme.focus(), { injector: this.injector });
  }

  protected izaberi(boja: string): void {
    const b = boja.toUpperCase();
    this.prefs.zapamtiBoju(b);
    this.izbor.emit(b);
    this.zatvori();
  }

  protected primeni(): void {
    if (this.ispravna()) this.izaberi(this.heks());
  }

  protected izaberiPrazno(): void {
    this.izbor.emit(null);
    this.zatvori();
  }
}

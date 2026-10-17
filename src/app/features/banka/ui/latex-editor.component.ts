import {
  afterRenderEffect, ChangeDetectionStrategy, Component, computed, DOCUMENT, ElementRef, forwardRef, inject, input, output, signal,
  untracked, viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let sledeci = 0;
/** Visina linije kad je CSS ne da (jsdom); ista kao `--bk-le-visina`. */
const VISINA_LINIJE = 20;

/**
 * LaTeX polje editora varijante (`ControlValueAccessor` nad tekstom): `textarea` u monospace fontu bez prelamanja, pa je
 * svaki red tačno jedna linija, i levo gutter sa brojevima linija (pomera se sa skrolom polja kroz `--bk-le-pomak`, bez
 * detekcije promena). `greskaLinija` ističe liniju u gutter-u i iza teksta i, kad korisnik ne kuca u tom polju, pomera je
 * u vidno polje; `opisId` (id poruke greške, npr. u pregledu) ide u `aria-describedby` uz uputstvo ispod polja.
 *
 * Tastatura: Tab ubacuje dva razmaka (Shift+Tab i Tab odmah posle Esc ostaju pregledaču, pa polje nije zamka za tastaturu),
 * Ctrl+Enter (Cmd+Enter) emituje `pregled`. Umetanje (Tab, `ubaci`) ide kroz `execCommand('insertText')` kad ga pregledač
 * ima, da Ctrl+Z pregledača ostane ispravan; inače direktno u vrednost.
 */
@Component({
  selector: 'app-latex-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LatexEditorComponent), multi: true }],
  styleUrl: './latex-editor.component.css',
  template: `
    <label class="bk-le-oznaka" [for]="idPolja">{{ oznaka() }}</label>
    <div class="bk-le-okvir" [class.bk-le-onemoguceno]="onemoguceno()" [style.--bk-le-cifre]="cifre()">
      <div class="bk-le-brojevi" aria-hidden="true">
        <div class="bk-le-pomeri">
          @for (n of linije(); track n) {
            <span class="bk-le-broj" [class.bk-le-istaknuta]="n === istaknuta()">{{ n }}</span>
          }
        </div>
      </div>
      <div class="bk-le-telo">
        @if (istaknuta(); as n) {
          <div class="bk-le-traka" [style.--bk-le-linija]="n - 1"></div>
        }
        <textarea #polje class="bk-le-polje" [id]="idPolja" [rows]="redova()" wrap="off" spellcheck="false" autocapitalize="off"
          autocomplete="off" [value]="vrednost()" [disabled]="onemoguceno()" [attr.aria-invalid]="istaknuta() !== null ? 'true' : null"
          [attr.aria-describedby]="opis()" (input)="unos($event)" (keydown)="taster($event)" (scroll)="sinhronizuj()"
          (blur)="dodirnuto()"></textarea>
      </div>
    </div>
    <p class="bk-le-uputstvo" [id]="idUputstva">Tab ubacuje dva razmaka (Esc pa Tab izlazi iz polja), Ctrl+Enter osvežava pregled.</p>
  `,
})
export class LatexEditorComponent implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  /** Vidljiva labela polja. */
  readonly oznaka = input.required<string>();
  /** Linija (od 1) sa greškom ili `null`. */
  readonly greskaLinija = input<number | null>(null);
  /** Id elementa sa porukom greške (`aria-describedby`); `null` kad greške nema. */
  readonly opisId = input<string | null>(null);
  readonly redova = input(18);
  /** Ctrl+Enter: pregled odmah. */
  readonly pregled = output<void>();

  protected readonly idPolja = `bk-le-${++sledeci}`;
  protected readonly idUputstva = `${this.idPolja}-uputstvo`;
  protected readonly vrednost = signal('');
  protected readonly onemoguceno = signal(false);
  protected readonly linije = computed(() => Array.from({ length: this.vrednost().split('\n').length }, (_, i) => i + 1));
  protected readonly cifre = computed(() => String(this.linije().length).length);
  /** Istaknuta linija samo dok postoji u tekstu. */
  protected readonly istaknuta = computed(() => {
    const n = this.greskaLinija();
    return n !== null && n >= 1 && n <= this.linije().length ? n : null;
  });
  protected readonly opis = computed(() => [this.idUputstva, this.opisId()].filter(Boolean).join(' '));

  private readonly polje = viewChild.required<ElementRef<HTMLTextAreaElement>>('polje');
  private promena: (v: string) => void = () => undefined;
  private dodir: () => void = () => undefined;
  /** Esc pa Tab: taj jedan Tab pomera fokus. */
  private pustiTab = false;

  constructor() {
    // greška se pokaže u vidnom polju, osim dok korisnik kuca baš ovde (živi pregled ne sme da mu odvuče pogled)
    afterRenderEffect(() => {
      const n = this.istaknuta();
      untracked(() => {
        const t = this.polje().nativeElement;
        if (n === null || this.document.activeElement === t) {
          return;
        }
        const visina = Number.parseFloat(getComputedStyle(t).lineHeight) || VISINA_LINIJE;
        const vrh = (n - 1) * visina;
        if (vrh < t.scrollTop || vrh + visina > t.scrollTop + t.clientHeight) {
          t.scrollTop = Math.max(0, vrh - (t.clientHeight - visina) / 2);
        }
        this.sinhronizuj();
      });
    });
  }

  writeValue(v: string | null): void {
    this.vrednost.set(v ?? '');
  }

  registerOnChange(fn: (v: string) => void): void {
    this.promena = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.dodir = fn;
  }

  setDisabledState(onemoguceno: boolean): void {
    this.onemoguceno.set(onemoguceno);
  }

  /** Umeće `tekst` na poslednji položaj kursora (i umesto izbora), pa fokus ostaje u polju iza umetnutog. */
  ubaci(tekst: string): void {
    if (!this.onemoguceno()) {
      this.umetni(tekst);
    }
  }

  protected unos(e: Event): void {
    this.javi((e.target as HTMLTextAreaElement).value);
  }

  protected taster(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.pustiTab = true;
      return;
    }
    const pusti = this.pustiTab;
    this.pustiTab = false;
    if (e.key === 'Tab') {
      if (!pusti && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.umetni('  ');
      }
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.pregled.emit();
    }
  }

  protected sinhronizuj(): void {
    this.host.nativeElement.style.setProperty('--bk-le-pomak', `${-this.polje().nativeElement.scrollTop}px`);
  }

  protected dodirnuto(): void {
    this.pustiTab = false;
    this.dodir();
  }

  private umetni(tekst: string): void {
    const t = this.polje().nativeElement;
    const { selectionStart: od, selectionEnd: do_, value } = t;
    const novo = value.slice(0, od) + tekst + value.slice(do_);
    t.focus();
    // `execCommand` pušta `input` (pa `unos` javlja vrednost) i čuva istoriju poništavanja pregledača
    const nativno = typeof this.document.execCommand === 'function' && this.document.execCommand('insertText', false, tekst);
    if (!nativno || t.value !== novo) {
      t.value = novo;
      t.setSelectionRange(od + tekst.length, od + tekst.length);
      this.javi(novo);
    }
  }

  private javi(v: string): void {
    this.vrednost.set(v);
    this.promena(v);
  }
}

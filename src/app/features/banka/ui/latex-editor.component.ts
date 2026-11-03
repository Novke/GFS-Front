import {
  afterRenderEffect, ChangeDetectionStrategy, Component, computed, DOCUMENT, ElementRef, forwardRef, inject, input, output, signal,
  untracked, viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let sledeci = 0;
/**
 * LaTeX polje editora varijante (`ControlValueAccessor` nad tekstom): `textarea` u monospace fontu koja prelama dugačke
 * redove (meko prelamanje) i raste sa tekstom, pa se ceo tekst vidi bez skrolovanja polja. Brojevi linija su poravnati sa
 * stvarnim linijama teksta (ne sa prelomljenim redovima): svaka linija je red mreže sa brojem i nevidljivim ogledalom teksta
 * iste širine i fonta, koje daje redu visinu, a `textarea` leži preko ogledala. `greskaLinija` ističe ceo red (broj i
 * pozadinu iza teksta) i, kad korisnik ne kuca u tom polju, pomera ga u vidno polje stranice; `opisId` (id poruke greške,
 * npr. u pregledu) ide u `aria-describedby` uz uputstvo ispod polja.
 *
 * Tastatura: Tab ubacuje dva razmaka (Shift+Tab i Tab odmah posle Esc ostaju pregledaču, pa polje nije zamka za tastaturu),
 * Ctrl+Enter (Cmd+Enter) emituje `pregled`, jednom po pritisku (ponavljanje držanog tastera se ne broji). Umetanje (Tab,
 * `ubaci`) ide kroz `execCommand('insertText')` kad ga pregledač ima, da Ctrl+Z pregledača ostane ispravan; inače direktno u
 * vrednost.
 */
@Component({
  selector: 'app-latex-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LatexEditorComponent), multi: true }],
  styleUrl: './latex-editor.component.css',
  template: `
    <label class="bk-le-oznaka" [for]="idPolja">{{ oznaka() }}</label>
    <div class="bk-le-okvir" [class.bk-le-onemoguceno]="onemoguceno()" [style.--bk-le-cifre]="cifre()" [style.--bk-le-redova]="redova()">
      <div class="bk-le-redovi">
        @for (red of redovi(); track $index) {
          <div class="bk-le-red" [class.bk-le-istaknut]="$index + 1 === istaknuta()" aria-hidden="true">
            <span class="bk-le-broj" [class.bk-le-istaknuta]="$index + 1 === istaknuta()">{{ $index + 1 }}</span>
            <span class="bk-le-ogledalo">{{ red }}</span>
          </div>
        }
        <textarea #polje class="bk-le-polje" [id]="idPolja" wrap="soft" spellcheck="false" autocapitalize="off"
          autocomplete="off" [value]="vrednost()" [disabled]="onemoguceno()" [attr.aria-invalid]="istaknuta() !== null ? 'true' : null"
          [attr.aria-describedby]="opis()" (input)="unos($event)" (keydown)="taster($event)" (blur)="dodirnuto()"></textarea>
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
  /** Najmanja visina polja u linijama. */
  readonly redova = input(12);
  /** Ctrl+Enter: pregled odmah. */
  readonly pregled = output<void>();

  protected readonly idPolja = `bk-le-${++sledeci}`;
  protected readonly idUputstva = `${this.idPolja}-uputstvo`;
  protected readonly vrednost = signal('');
  protected readonly onemoguceno = signal(false);
  /** Linije teksta; prazna linija i dalje ima visinu jedne linije (`min-height` u CSS-u). */
  protected readonly redovi = computed(() => this.vrednost().split('\n'));
  protected readonly cifre = computed(() => String(this.redovi().length).length);
  /** Istaknuta linija samo dok postoji u tekstu. */
  protected readonly istaknuta = computed(() => {
    const n = this.greskaLinija();
    return n !== null && n >= 1 && n <= this.redovi().length ? n : null;
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
        if (n === null || this.document.activeElement === this.polje().nativeElement) {
          return;
        }
        this.host.nativeElement.querySelectorAll<HTMLElement>('.bk-le-red')[n - 1]?.scrollIntoView?.({ block: 'nearest' });
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
      // držanje tastera ponavlja događaj: jedan pregled po pritisku, ne rafal render-proba
      if (!e.repeat) {
        this.pregled.emit();
      }
    }
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

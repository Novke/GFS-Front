import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { ElementCrteza, SIRINA_SCENE, TipElementa, VISINA_SCENE } from './crtanje.models';
import { dodajTacku, krajOblika, naDesetinu } from './geometrija';

/**
 * Površina za crtanje preko scene 16:9 (spec 5.1, "Unos crteža"): miš, olovka i prst (`touch-action: none`, svi
 * pomeraji kroz `getCoalescedEvents`), samo jedan pokazivač u isto vreme. Kad se jednom vidi olovka, dodir prstom se
 * ignoriše (dlan na ekranu). Element u nastajanju ide u `uToku` (nov objekat na svaki pomeraj), gotov u `gotov`
 * (proveru veličine i granica radi `Crtac`). `pocetak` javlja prvi pritisak (konzola tada gasi crni ekran).
 */
@Component({
  selector: 'app-povrsina-crtanja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'crt-povrsina',
    '[class.crt-povrsina--neaktivna]': '!aktivna()',
    '(pointerdown)': 'dole($event)',
    '(pointermove)': 'pomeri($event)',
    '(pointerup)': 'gore($event)',
    '(pointercancel)': 'gore($event)',
    '(lostpointercapture)': 'gore($event)',
  },
  styles: `
    :host { position: absolute; inset: 0; z-index: 5; touch-action: none; cursor: crosshair; user-select: none; -webkit-user-select: none; }
    :host(.crt-povrsina--neaktivna) { cursor: not-allowed; }
  `,
  template: '',
})
export class PovrsinaCrtanjaComponent {
  readonly aktivna = input(true);
  readonly alat = input.required<TipElementa>();
  readonly boja = input.required<string>();
  readonly debljina = input.required<number>();
  readonly uToku = output<ElementCrteza | null>();
  readonly gotov = output<ElementCrteza>();
  readonly pocetak = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private pokazivac: number | null = null;
  private videoOlovku = false;
  private element: ElementCrteza | null = null;

  /** Otkazuje potez u toku (Esc); `true` ako ga je bilo. */
  otkazi(): boolean {
    if (!this.element) return false;
    this.oslobodi();
    this.element = null;
    this.uToku.emit(null);
    return true;
  }

  protected dole(e: PointerEvent): void {
    if (e.pointerType === 'pen') this.videoOlovku = true;
    if (this.videoOlovku && e.pointerType === 'touch') return;
    if (!this.aktivna() || e.button !== 0 || this.pokazivac !== null) return;
    e.preventDefault();
    this.pokazivac = e.pointerId;
    try {
      this.host.setPointerCapture?.(e.pointerId);
    } catch {
      // pokazivač više nije aktivan
    }
    this.pocetak.emit();
    const [x, y] = this.tacka(e);
    const tip = this.alat();
    this.element = { tip, boja: this.boja(), debljina: this.debljina(), tacke: tip === 'OLOVKA' ? [x, y] : [x, y, x, y] };
    this.uToku.emit({ ...this.element });
  }

  protected pomeri(e: PointerEvent): void {
    const el = this.element;
    if (e.pointerId !== this.pokazivac || !el) return;
    if (el.tip === 'OLOVKA') {
      let promena = false;
      const dogadjaji = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const d of dogadjaji.length ? dogadjaji : [e]) {
        const [x, y] = this.tacka(d);
        promena = dodajTacku(el.tacke, x, y) || promena;
      }
      if (!promena) return;
    } else {
      const [x, y] = this.tacka(e);
      const t = el.tacke;
      [t[2], t[3]] = krajOblika(el.tip, t[0], t[1], x, y, e.shiftKey);
    }
    this.uToku.emit({ ...el });
  }

  protected gore(e: PointerEvent): void {
    if (e.pointerId !== this.pokazivac) return;
    this.oslobodi();
    const el = this.element;
    this.element = null;
    if (el) this.gotov.emit(el);
  }

  private oslobodi(): void {
    const id = this.pokazivac;
    this.pokazivac = null;
    if (id === null) return;
    try {
      if (this.host.hasPointerCapture?.(id)) this.host.releasePointerCapture(id);
    } catch {
      // već pušten
    }
  }

  /** Tačka pokazivača u jedinicama scene (960 × 540), na jednu decimalu. */
  private tacka(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.host.getBoundingClientRect();
    const w = r.width || 1, h = r.height || 1;
    return [naDesetinu(((e.clientX - r.left) / w) * SIRINA_SCENE), naDesetinu(((e.clientY - r.top) / h) * VISINA_SCENE)];
  }
}

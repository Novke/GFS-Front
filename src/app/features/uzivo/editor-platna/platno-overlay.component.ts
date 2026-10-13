// Sloj izbora preko platna editora (F4b; F5 dodaje gestove: pomeranje, ručke, rotaciju, vođice). Leži apsolutno preko
// `.uz-platno` (iznad `app-platno-prikaz`), pa prima sve događaje pokazivača: klik bira sloj, prevlačenje po praznom crta
// pravougaonik izbora. Crta okvire izabranih slojeva i obeležje praznih tekstova; sve mere idu kroz `--u` kao prikaz.
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import type { Sloj, Tacka } from '../data-access/platno.models';
import { stilSloja } from '../ui/platno-prikaz.component';
import { jedinice, type Stil } from '../ui/platno-tekst';
import { FokusPlatna } from './fokus-platna';
import { type Obuhvat, SIRINA_PLATNA, kutijaSloja, obuhvatSvih, slojNaTacki, uPravougaoniku } from './geometrija';
import { PlatnoEditorStore } from './platno-editor.store';

/** Pomeraj pokazivača (px) do kog je pritisak pa puštanje i dalje klik. */
const PRAG_KLIKA_PX = 3;
/** Tolerancija pogotka sloja u px ekrana (deli se sa px po jedinici). */
const TOLERANCIJA_PX = 4;

interface Pritisak { x: number; y: number; tacka: Tacka; shift: boolean; pogodak: Sloj | null; vuce: boolean; }

const stilObuhvata = (o: Obuhvat): Stil => ({
  left: jedinice(o.x), top: jedinice(o.y), width: jedinice(o.sirina), height: jedinice(o.visina),
});

/** Okvir izbora: samo položaj, veličina i rotacija sloja (bez providnosti i senke prikaza). */
function okvirSloja(s: Sloj): Stil {
  const { left, top, width, height, transform } = stilSloja(s);
  return transform ? { left, top, width, height, transform } : { left, top, width, height };
}

const prazanTekst = (s: Sloj) => s.tip === 'TEKST' && s.pasusi.every((p) => p.delovi.every((d) => d.tekst === ''));

@Component({
  selector: 'app-platno-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'uz-ep-overlay',
    'aria-hidden': 'true',
    '(pointerdown)': 'dole($event)',
    '(pointermove)': 'pomeraj($event)',
    '(pointerup)': 'gore($event)',
    '(pointercancel)': 'prekid()',
  },
  template: `
    @for (p of prazni(); track p.id) {
      <div class="uz-ep-prazan" [style]="p.stil"><span>Dvoklik za tekst</span></div>
    }
    @for (o of okviri(); track o.id) {
      <div class="uz-ep-izbor" [style]="o.stil"></div>
    }
    @if (obuhvatIzbora(); as o) { <div class="uz-ep-obuhvat" [style]="o"></div> }
    @if (pravougaonik(); as r) { <div class="uz-ep-pravougaonik" [style]="r"></div> }
  `,
  styles: `
    :host {
      --u: calc(100cqw / 960);
      position: absolute;
      inset: 0;
      display: block;
      touch-action: none;
      user-select: none;
    }
    :host > div { position: absolute; box-sizing: border-box; pointer-events: none; }
    .uz-ep-izbor { outline: 1px solid var(--primary); outline-offset: 0; }
    .uz-ep-obuhvat { border: 1px dashed var(--primary); }
    .uz-ep-pravougaonik {
      border: 1px solid var(--primary);
      background: color-mix(in srgb, var(--primary) 12%, transparent);
    }
    .uz-ep-prazan {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed var(--muted);
      color: var(--ink-2);
      font-size: calc(var(--u) * 14);
      overflow: hidden;
    }
  `,
})
export class PlatnoOverlayComponent {
  private readonly store = inject(PlatnoEditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private pritisak: Pritisak | null = null;
  /** Pravougaonik izbora dok traje prevlačenje po praznom (jedinice platna). */
  private readonly vucenje = signal<Obuhvat | null>(null);

  private readonly vidljiviIzabrani = computed(() => {
    const skriveni = new Set(this.store.skriveni());
    return this.store.izabraniSlojevi().filter((s) => !skriveni.has(s.id));
  });
  protected readonly okviri = computed(() => this.vidljiviIzabrani().map((s) => ({ id: s.id, stil: okvirSloja(s) })));
  protected readonly obuhvatIzbora = computed(() => {
    const izabrani = this.vidljiviIzabrani();
    if (izabrani.length < 2) return null;
    const o = obuhvatSvih(izabrani.map(kutijaSloja));
    return o ? stilObuhvata(o) : null;
  });
  protected readonly prazni = computed(() =>
    this.store.zaPrikaz().slojevi.filter(prazanTekst).map((s) => ({ id: s.id, stil: okvirSloja(s) })));
  protected readonly pravougaonik = computed(() => {
    const r = this.vucenje();
    return r ? stilObuhvata(r) : null;
  });

  /** Pravougaonik `.uz-platno` i px po jedinici, iz istog merenja (tačka i tolerancija se ne razilaze ni pri promeni veličine). */
  private merilo(): { rect: DOMRect; px: number } {
    const rect = (this.host.closest('.uz-platno') ?? this.host).getBoundingClientRect();
    return { rect, px: rect.width > 0 ? rect.width / SIRINA_PLATNA : 1 };
  }

  private tacka(e: MouseEvent): { tacka: Tacka; px: number } {
    const { rect, px } = this.merilo();
    return { tacka: { x: (e.clientX - rect.left) / px, y: (e.clientY - rect.top) / px }, px };
  }

  protected dole(e: PointerEvent): void {
    // odluka 24: pritisak na platno fokusira okvir, pa prečice odmah rade
    this.fokusPlatna.fokus();
    if (e.button !== 0) return;
    e.preventDefault();
    const pointerId = (e as Partial<PointerEvent>).pointerId;
    if (typeof pointerId === 'number') {
      try {
        this.host.setPointerCapture(pointerId);
      } catch {
        // pokazivač već pušten (npr. dodir prekinut): događaji i dalje stižu domaćinu dok je iznad njega
      }
    }
    const { tacka, px } = this.tacka(e);
    const pogodak = slojNaTacki(this.store.zaPrikaz().slojevi, tacka, TOLERANCIJA_PX / px);
    this.pritisak = { x: e.clientX, y: e.clientY, tacka, shift: e.shiftKey, pogodak, vuce: false };
  }

  protected pomeraj(e: PointerEvent): void {
    const p = this.pritisak;
    if (!p) return;
    if (!p.vuce && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= PRAG_KLIKA_PX) return;
    p.vuce = true;
    // F4b: prevlačenje sloja (pomeranje) dolazi u F5; po praznom se crta pravougaonik izbora
    if (p.pogodak) return;
    const { tacka } = this.tacka(e);
    this.vucenje.set({
      x: Math.min(p.tacka.x, tacka.x), y: Math.min(p.tacka.y, tacka.y),
      sirina: Math.abs(tacka.x - p.tacka.x), visina: Math.abs(tacka.y - p.tacka.y),
    });
  }

  protected gore(e: PointerEvent): void {
    const p = this.pritisak;
    if (!p) return;
    this.pomeraj(e);
    this.pritisak = null;
    const r = this.vucenje();
    this.vucenje.set(null);
    if (p.vuce) {
      if (!r) return;
      const ids = uPravougaoniku(this.store.zaPrikaz().slojevi, r);
      this.store.izaberi(p.shift ? [...this.store.izbor(), ...ids] : ids);
      return;
    }
    if (p.pogodak) {
      if (p.shift) this.store.prebaciIzbor(p.pogodak.id);
      else this.store.izaberi([p.pogodak.id]);
    } else if (!p.shift) {
      this.store.ponistiIzbor();
    }
  }

  protected prekid(): void {
    this.pritisak = null;
    this.vucenje.set(null);
  }
}

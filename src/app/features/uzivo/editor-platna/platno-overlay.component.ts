// Sloj izbora preko platna editora (F4b izbor, F5 gestovi). Leži apsolutno preko `.uz-platno` (iznad
// `app-platno-prikaz`), pa prima sve događaje pokazivača: pritisak na sloj ga bira i prevlačenje ga pomera (sa vođicama
// ka ivicama i centrima), prevlačenje po praznom crta pravougaonik izbora, ručke menjaju veličinu, rotaciju i krajeve
// linije. Gest menja dokument kroz `PlatnoEditorStore.azurirajGest` najviše jednom po kadru (`PoKadru`, odluka 33) i
// beleži se kao jedan korak na `pointerup`; Esc i `pointercancel` ga poništavaju. Sve mere idu kroz `--u` kao prikaz.
// Tekst (F12): dvoklik na TEKST sloj počinje uređivanje; sloj za uređivanje leži IZNAD overlay-a, pa pritisak koji
// stigne ovde je van sloja u uređivanju: prvo završava uređivanje, pa radi izbor.
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import type { OblikSloj, Platno, Sloj, Tacka } from '../data-access/platno.models';
import { stilSloja } from '../ui/platno-prikaz.component';
import { jedinice, type Stil } from '../ui/platno-tekst';
import { FokusPlatna } from './fokus-platna';
import {
  type Obuhvat, type Rucka, SIRINA_PLATNA, type Vodjica, jeLinija, krajIzUgla, krajeviLinije, kutijaSloja, linijaIzKrajeva,
  normalizujUgao, obuhvat, obuhvatSvih, prianjanje, promeniVelicinu, slojNaTacki, uPravougaoniku, uSvetske, ugaoIDuzina,
  ugaoRotacije,
} from './geometrija';
import { izmeniSlojeve, pomeriSlojeve, postaviKutiju } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';
import { PoKadru, RASPORED_KADRA } from './po-kadru';

/** Pomeraj pokazivača (px) do kog je pritisak pa puštanje i dalje klik (i do kog gest ne počinje). */
const PRAG_KLIKA_PX = 3;
/** Tolerancija pogotka sloja u px ekrana (deli se sa px po jedinici). */
const TOLERANCIJA_PX = 4;
/** Prag prianjanja uz vođice u px ekrana (deli se sa px po jedinici). */
const PRAG_PRIANJANJA_PX = 6;
/** Ručka rotacije: centar kruga toliko px iznad gornje ivice (lokalne ose sloja). */
const ROTACIJA_PX = 20;
/** Korak ugla uz Shift: rotacija 15°, kraj linije 45°. */
const KORAK_ROTACIJE = 15;
const KORAK_LINIJE = 45;

/** Ručke okvira: smer od centra i ugao (0 = gore) za kursor. */
const RUCKE: readonly { ime: Rucka; sx: -1 | 0 | 1; sy: -1 | 0 | 1; ugao: number }[] = [
  { ime: 'SZ', sx: -1, sy: -1, ugao: 315 }, { ime: 'S', sx: 0, sy: -1, ugao: 0 }, { ime: 'SI', sx: 1, sy: -1, ugao: 45 },
  { ime: 'I', sx: 1, sy: 0, ugao: 90 }, { ime: 'JI', sx: 1, sy: 1, ugao: 135 }, { ime: 'J', sx: 0, sy: 1, ugao: 180 },
  { ime: 'JZ', sx: -1, sy: 1, ugao: 225 }, { ime: 'Z', sx: -1, sy: 0, ugao: 270 },
];
const KURSORI = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;
/** Kursor ručke posle rotacije sloja (najbliži od četiri smera). */
const kursor = (ugao: number) => KURSORI[Math.round(normalizujUgao(ugao) / 45) % 4];

type Gest =
  | { vrsta: 'POMERANJE'; ids: ReadonlySet<string> }
  | { vrsta: 'RUCKA'; sloj: Sloj; rucka: Rucka; tacka0: Tacka }
  | { vrsta: 'ROTACIJA'; sloj: Sloj; tacka0: Tacka }
  | { vrsta: 'KRAJ'; sloj: OblikSloj; kraj: 0 | 1; krajevi: [Tacka, Tacka] };

/**
 * Šta prevlačenje ovog pritiska radi kad pređe prag: POMERANJE izbora (pritisak na izabran sloj ili nov otključan
 * pogodak), RUCKA (ručka jedinog izabranog sloja; sloj se čita iz dokumenta tek na pragu) ili PRAVOUGAONIK izbora (prazno
 * i zaključan sloj van mešanog izbora: zaključana pozadina preko celog platna ne sme da onemogući pravougaonik).
 */
type Nacin = { vrsta: 'POMERANJE' } | { vrsta: 'RUCKA'; slojId: string; ime: string } | { vrsta: 'PRAVOUGAONIK' };

interface Pritisak {
  /** Pokazivač ovog pritiska; null kad ga događaj nema (jsdom). Događaji drugih pokazivača se ignorišu. */
  id: number | null;
  /** Pokazivač na pritisku (px klijenta) i tačka platna. */
  x: number; y: number; tacka: Tacka;
  /** Px po jedinici iz merenja na pritisku (važi za ceo gest). */
  px: number;
  shift: boolean;
  /** Gornji sloj na tački (klik ga bira); null na praznom i na ručki. */
  pogodak: Sloj | null;
  /** Izbor je promenjen već na pritisku (nov otključan pogodak): klik bez pomeraja posle toga ne menja ništa. */
  izabranoNaDole: boolean;
  nacin: Nacin;
  /** Gest postavljen na pragu; null pre praga i kad je odbijen (zaključan sloj, sloj nestao). */
  gest: Gest | null;
  vuce: boolean;
  /** Gest je počeo u store-u (`pocniGest`). */
  aktivan: boolean;
  /** Pomeranje: obuhvat pomerenih i obuhvati ostalih vidljivih slojeva na početku gesta (za vođice). */
  obuhvat0: Obuhvat | null;
  ostali: Obuhvat[];
}

interface Pokret { x: number; y: number; shift: boolean; alt: boolean; ctrl: boolean; }

const stilObuhvata = (o: Obuhvat): Stil => ({
  left: jedinice(o.x), top: jedinice(o.y), width: jedinice(o.sirina), height: jedinice(o.visina),
});

/** Okvir izbora: samo položaj, veličina i rotacija sloja (bez providnosti i senke prikaza). */
function okvirSloja(s: Sloj): Stil {
  const { left, top, width, height, transform } = stilSloja(s);
  return transform ? { left, top, width, height, transform } : { left, top, width, height };
}

const stilVodjice = (v: Vodjica): Stil => (v.osa === 'x'
  ? { left: jedinice(v.poz), top: jedinice(v.od), height: jedinice(v.do - v.od), width: '1px' }
  : { left: jedinice(v.od), top: jedinice(v.poz), width: jedinice(v.do - v.od), height: '1px' });

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
    '(pointercancel)': 'prekid($event)',
    '(dblclick)': 'dvoklik($event)',
    '(lostpointercapture)': 'prekid($event)',
  },
  template: `
    @for (p of prazni(); track p.id) {
      <div class="uz-ep-prazan" [style]="p.stil"><span>Dvoklik za tekst</span></div>
    }
    @for (o of okviri(); track o.id) {
      <div class="uz-ep-izbor" [style]="o.stil">
        @if (o.zakljucan) {
          <svg class="uz-ep-katanac" viewBox="0 -960 960 960" focusable="false">
            <path d="M220-80q-24.75 0-42.37-17.63Q160-115.25 160-140v-434q0-24.75 17.63-42.38Q195.25-634 220-634h70v-96q0-78.85 55.61-134.42Q401.21-920 480.11-920q78.89 0 134.39 55.58Q670-808.85 670-730v96h70q24.75 0 42.38 17.62Q800-598.75 800-574v434q0 24.75-17.62 42.37Q764.75-80 740-80H220Zm0-60h520v-434H220v434Zm314.5-162.03Q557-324.06 557-355q0-30-22.67-54.5t-54.5-24.5q-31.83 0-54.33 24.5t-22.5 55q0 30.5 22.67 52.5t54.5 22q31.83 0 54.33-22.03ZM350-634h260v-96q0-54.17-37.88-92.08-37.88-37.92-92-37.92T388-822.08q-38 37.91-38 92.08v96ZM220-140v-434 434Z"/>
          </svg>
        }
      </div>
    }
    @if (obuhvatIzbora(); as o) { <div class="uz-ep-obuhvat" [style]="o"></div> }
    @if (rucke(); as r) {
      <div class="uz-ep-rucke" [style]="r.stil">
        @for (h of r.rucke; track h.ime) {
          <span class="uz-ep-rucka" [attr.data-rucka]="h.ime" [style.left.%]="h.levo" [style.top.%]="h.gore"
                [style.cursor]="h.kursor"></span>
        }
        <span class="uz-ep-rucka uz-ep-rotacija" data-rucka="ROTACIJA"></span>
      </div>
    }
    @for (k of krajevi(); track k.ime) {
      <span class="uz-ep-rucka uz-ep-kraj" [attr.data-rucka]="k.ime" [style.left]="k.left" [style.top]="k.top"></span>
    }
    @for (v of vodjiceStil(); track $index) { <div class="uz-ep-vodjica" [style]="v"></div> }
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
    .uz-ep-vodjica { background: var(--accent); }
    .uz-ep-rucka {
      position: absolute;
      width: 8px;
      height: 8px;
      box-sizing: border-box;
      transform: translate(-50%, -50%);
      border: 1px solid var(--primary);
      background: var(--surface);
      pointer-events: auto;
    }
    /* veća meta od nacrtanog kvadrata */
    .uz-ep-rucka::before { content: ''; position: absolute; inset: -4px; }
    .uz-ep-rotacija { left: 50%; top: -20px; width: 10px; height: 10px; border-radius: 50%; cursor: grab; }
    .uz-ep-kraj { border-radius: 50%; width: 10px; height: 10px; cursor: crosshair; }
    .uz-ep-katanac {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 16px;
      height: 16px;
      padding: 1px;
      box-sizing: border-box;
      border-radius: 50%;
      background: var(--surface);
      fill: var(--primary);
    }
    .uz-ep-prazan {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed var(--muted);
      font-size: calc(var(--u) * 14);
      overflow: hidden;
    }
    /* čip sa sopstvenom podlogom (dnevni tokeni platna): čitljiv i na tamnim temama (TAMNA, PONOC) */
    .uz-ep-prazan > span {
      padding: calc(var(--u) * 2) calc(var(--u) * 8);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--ink-2);
      white-space: nowrap;
    }
  `,
})
export class PlatnoOverlayComponent {
  private readonly store = inject(PlatnoEditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly dokument = inject(DOCUMENT);

  private pritisak: Pritisak | null = null;
  /** Pravougaonik izbora dok traje prevlačenje po praznom (jedinice platna). */
  private readonly vucenje = signal<Obuhvat | null>(null);
  /** Vođice dok traje pomeranje. */
  private readonly vodjice = signal<readonly Vodjica[]>([]);
  private readonly kadar: PoKadru<Pokret>;
  /** Esc tokom prevlačenja (faza hvatanja na `document`, samo dok prevlačenje traje): prekida gest, ništa više. */
  private readonly naEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    this.prekid();
  };

  private readonly vidljiviIzabrani = computed(() => {
    const skriveni = new Set(this.store.skriveni());
    return this.store.izabraniSlojevi().filter((s) => !skriveni.has(s.id));
  });
  protected readonly okviri = computed(() =>
    this.vidljiviIzabrani().map((s) => ({ id: s.id, stil: okvirSloja(s), zakljucan: s.zakljucan })));
  protected readonly obuhvatIzbora = computed(() => {
    const izabrani = this.vidljiviIzabrani();
    if (izabrani.length < 2) return null;
    const o = obuhvatSvih(izabrani.map(kutijaSloja));
    return o ? stilObuhvata(o) : null;
  });
  /**
   * Tačno jedan izabran sloj (isti skup kao strelice: `izabraniSlojevi`, i skriveni), vidljiv i otključan: ručke ili
   * krajevi linije.
   */
  private readonly jedanZaRucke = computed(() => {
    const izabrani = this.store.izabraniSlojevi();
    if (izabrani.length !== 1 || izabrani[0].zakljucan || this.store.skriveni().includes(izabrani[0].id)) return null;
    return izabrani[0];
  });
  protected readonly rucke = computed(() => {
    const s = this.jedanZaRucke();
    if (!s || jeLinija(s)) return null;
    return {
      stil: okvirSloja(s),
      rucke: RUCKE.map((r) => ({ ime: r.ime, levo: 50 + r.sx * 50, gore: 50 + r.sy * 50, kursor: kursor(r.ugao + s.rotacija) })),
    };
  });
  protected readonly krajevi = computed(() => {
    const s = this.jedanZaRucke();
    if (!s || !jeLinija(s)) return [];
    return krajeviLinije(s).map((t, i) => ({ ime: i === 0 ? 'KRAJ_A' : 'KRAJ_B', left: jedinice(t.x), top: jedinice(t.y) }));
  });
  protected readonly prazni = computed(() =>
    this.store.zaPrikaz().slojevi.filter(prazanTekst).map((s) => ({ id: s.id, stil: okvirSloja(s) })));
  protected readonly pravougaonik = computed(() => {
    const r = this.vucenje();
    return r ? stilObuhvata(r) : null;
  });
  protected readonly vodjiceStil = computed(() => this.vodjice().map(stilVodjice));

  constructor() {
    const raspored = inject(RASPORED_KADRA);
    this.kadar = new PoKadru<Pokret>((v) => this.obradi(v), (f) => raspored.zakazi(f), (id) => raspored.otkazi(id));
    // uništavanje usred gesta: ono što čeka se odbacuje, a store sam završava i čuva gest (onDestroy -> isprazni)
    inject(DestroyRef).onDestroy(() => {
      this.kadar.prekini();
      this.dokument.removeEventListener('keydown', this.naEsc, true);
    });
  }

  /** Pravougaonik `.uz-platno` i px po jedinici, iz istog merenja (tačka i tolerancija se ne razilaze ni pri promeni veličine). */
  private merilo(): { rect: DOMRect; px: number } {
    const rect = (this.host.closest('.uz-platno') ?? this.host).getBoundingClientRect();
    return { rect, px: rect.width > 0 ? rect.width / SIRINA_PLATNA : 1 };
  }

  private tacka(e: MouseEvent): { tacka: Tacka; px: number } {
    const { rect, px } = this.merilo();
    return { tacka: { x: (e.clientX - rect.left) / px, y: (e.clientY - rect.top) / px }, px };
  }

  /** Događaj pokazivača koji nije pokazivač ovog pritiska (drugi prst, olovka) se ignoriše. */
  private tudji(p: Pritisak, e: Event): boolean {
    const id = (e as Partial<PointerEvent>).pointerId;
    return p.id !== null && typeof id === 'number' && id !== p.id;
  }

  /** Dvoklik na TEKST sloj (gornji vidljivi sloj na tački): uređivanje teksta (zaključan: poruka iz store-a). */
  protected dvoklik(e: MouseEvent): void {
    const { tacka, px } = this.tacka(e);
    const s = slojNaTacki(this.store.zaPrikaz().slojevi, tacka, TOLERANCIJA_PX / px);
    if (s?.tip === 'TEKST') this.store.pocniUredjivanje(s.id);
  }

  protected dole(e: PointerEvent): void {
    // pritisak van sloja u uređivanju (sloj za uređivanje leži iznad overlay-a): tekst u dokument, pa izbor kao inače
    if (this.store.uredjivanje()) this.store.zavrsiUredjivanje();
    // odluka 24: pritisak na platno fokusira okvir, pa prečice odmah rade
    this.fokusPlatna.fokus();
    if (e.button !== 0) return;
    e.preventDefault();
    const pointerId = (e as Partial<PointerEvent>).pointerId;
    const id = typeof pointerId === 'number' ? pointerId : null;
    if (this.pritisak) {
      // drugi pokazivač usred pritiska ne prekida i ne počinje gest; isti pokazivač (izgubljen pointerup) završava stari
      if (this.tudji(this.pritisak, e)) return;
      this.zavrsi();
    }
    if (id !== null && typeof this.host.setPointerCapture === 'function') {
      try {
        this.host.setPointerCapture(id);
      } catch {
        // pokazivač već pušten (npr. dodir prekinut): događaji i dalje stižu domaćinu dok je iznad njega
      }
    }
    const { tacka, px } = this.tacka(e);
    const osnova = {
      id, x: e.clientX, y: e.clientY, tacka, px, shift: e.shiftKey, gest: null, vuce: false, aktivan: false,
      obuhvat0: null, ostali: [],
    };
    const ime = e.target instanceof Element ? e.target.closest('[data-rucka]')?.getAttribute('data-rucka') : null;
    const jedan = this.jedanZaRucke();
    if (ime && jedan) {
      this.pritisak = { ...osnova, pogodak: null, izabranoNaDole: false, nacin: { vrsta: 'RUCKA', slojId: jedan.id, ime } };
      return;
    }
    const vidljivi = this.store.zaPrikaz().slojevi;
    const tolerancija = TOLERANCIJA_PX / px;
    const pogodak = slojNaTacki(vidljivi, tacka, tolerancija);
    const izabrani = this.store.izabraniSlojevi();
    const izbor = new Set(izabrani.map((s) => s.id));
    // pritisak na izabran sloj (i kad ga na toj tački pokriva neizabran) vuče ceo izbor, ako u izboru ima otključanih
    // (sa zaključanim u izboru prevlačenje javlja poruku); izbor samo od zaključanih se ne vuče
    const naIzabranom = izabrani.some((s) => !s.zakljucan)
      && !!slojNaTacki(vidljivi.filter((s) => izbor.has(s.id)), tacka, tolerancija);
    let izabranoNaDole = false;
    let nacin: Nacin = { vrsta: 'PRAVOUGAONIK' };
    if (naIzabranom) {
      nacin = { vrsta: 'POMERANJE' };
    } else if (pogodak && !pogodak.zakljucan) {
      // izbor odmah (prevlačenje ga odmah pomera); klik bez pomeraja posle toga ne menja ništa
      if (e.shiftKey) this.store.prebaciIzbor(pogodak.id);
      else this.store.izaberi([pogodak.id]);
      izabranoNaDole = true;
      nacin = { vrsta: 'POMERANJE' };
    }
    // zaključan pogodak van mešanog izbora: prevlačenje je pravougaonik, klik ga bira na pointerup
    this.pritisak = { ...osnova, pogodak, izabranoNaDole, nacin };
  }

  protected pomeraj(e: PointerEvent): void {
    const p = this.pritisak;
    if (!p || this.tudji(p, e)) return;
    if (p.aktivan && !this.store.gest()) {
      // pražnjenje (Ctrl+S, "Pokreni", ...) je usred gesta upisalo gest: ovaj pritisak je gotov
      this.ocisti();
      return;
    }
    if (!p.vuce) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= PRAG_KLIKA_PX) return;
      this.pocni(p);
    }
    if (p.gest) {
      this.kadar.dodaj({ x: e.clientX, y: e.clientY, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey });
      return;
    }
    if (p.nacin.vrsta !== 'PRAVOUGAONIK') return;   // odbijen gest (zaključan sloj): ništa
    const { tacka } = this.tacka(e);
    this.vucenje.set({
      x: Math.min(p.tacka.x, tacka.x), y: Math.min(p.tacka.y, tacka.y),
      sirina: Math.abs(tacka.x - p.tacka.x), visina: Math.abs(tacka.y - p.tacka.y),
    });
  }

  /**
   * Prag je pređen: gest se postavlja iz TRENUTNOG dokumenta (ne iz snimka sa pritiska) i počinje u store-u; sa
   * zaključanim slojem u izboru gesta nema i ide poruka (jednom po pritisku, kao strelice). Esc se sluša dok traje gest
   * ili pravougaonik.
   */
  private pocni(p: Pritisak): void {
    p.vuce = true;
    if (p.nacin.vrsta === 'PRAVOUGAONIK') {
      this.dokument.addEventListener('keydown', this.naEsc, true);
      return;
    }
    p.gest = this.store.zakljucanUIzboru() ? null : this.napraviGest(p);
    if (!p.gest) return;
    this.store.pocniGest();
    p.aktivan = true;
    this.dokument.addEventListener('keydown', this.naEsc, true);
    if (p.gest.vrsta === 'POMERANJE') {
      const ids = p.gest.ids;
      const slojevi = this.store.zaPrikaz().slojevi;
      p.obuhvat0 = obuhvatSvih(slojevi.filter((s) => ids.has(s.id)).map(kutijaSloja));
      p.ostali = slojevi.filter((s) => !ids.has(s.id)).map((s) => obuhvat(kutijaSloja(s)));
    }
  }

  /** Gest iz trenutnog dokumenta: pomeranje celog izbora (isti skup kao strelice) ili ručka jedinog izabranog sloja. */
  private napraviGest(p: Pritisak): Gest | null {
    if (p.nacin.vrsta === 'POMERANJE') {
      const ids = this.store.izbor();
      return ids.length ? { vrsta: 'POMERANJE', ids: new Set(ids) } : null;
    }
    if (p.nacin.vrsta !== 'RUCKA') return null;
    const { slojId, ime } = p.nacin;
    const s = this.store.platno().slojevi.find((x) => x.id === slojId);
    if (!s) return null;
    const k = kutijaSloja(s);
    if (jeLinija(s)) {
      if (ime !== 'KRAJ_A' && ime !== 'KRAJ_B') return null;
      return { vrsta: 'KRAJ', sloj: s, kraj: ime === 'KRAJ_A' ? 0 : 1, krajevi: krajeviLinije(s) };
    }
    if (ime === 'ROTACIJA') {
      return { vrsta: 'ROTACIJA', sloj: s, tacka0: uSvetske(k, { x: 0, y: -s.visina / 2 - ROTACIJA_PX / p.px }) };
    }
    const r = RUCKE.find((x) => x.ime === ime);
    if (!r) return null;
    return { vrsta: 'RUCKA', sloj: s, rucka: r.ime, tacka0: uSvetske(k, { x: (r.sx * s.sirina) / 2, y: (r.sy * s.visina) / 2 }) };
  }

  /** Jedna obrada po kadru: nov dokument iz POČETKA gesta i pomeraja pokazivača od pritiska. */
  private obradi(v: Pokret): void {
    const p = this.pritisak;
    if (!p?.aktivan || !p.gest) return;
    const dx = (v.x - p.x) / p.px;
    const dy = (v.y - p.y) / p.px;
    const g = p.gest;
    let izmena: (pocetak: Platno) => Platno;
    switch (g.vrsta) {
      case 'POMERANJE': {
        const { mx, my, vodjice } = this.pomerajSaVodjicama(p, dx, dy, v);
        this.vodjice.set(vodjice);
        izmena = (pocetak) => pomeriSlojeve(pocetak, g.ids, mx, my);
        break;
      }
      case 'RUCKA': {
        const k = promeniVelicinu(kutijaSloja(g.sloj), g.rucka, { x: g.tacka0.x + dx, y: g.tacka0.y + dy },
          { odnos: v.shift, odCentra: v.ctrl });
        izmena = (pocetak) => postaviKutiju(pocetak, g.sloj.id, k);
        break;
      }
      case 'ROTACIJA': {
        const k = kutijaSloja(g.sloj);
        const rotacija = ugaoRotacije(k, { x: g.tacka0.x + dx, y: g.tacka0.y + dy }, v.shift ? KORAK_ROTACIJE : undefined);
        izmena = (pocetak) => postaviKutiju(pocetak, g.sloj.id, { ...k, rotacija });
        break;
      }
      case 'KRAJ': {
        const drugi = g.krajevi[1 - g.kraj];
        let pomeren = { x: g.krajevi[g.kraj].x + dx, y: g.krajevi[g.kraj].y + dy };
        if (v.shift) {
          const { ugao, duzina } = ugaoIDuzina(drugi, pomeren);
          pomeren = krajIzUgla(drugi, Math.round(ugao / KORAK_LINIJE) * KORAK_LINIJE, duzina);
        }
        // drugi kraj ostaje; rezultat ima `rotacija: 0` (rotacija se "ispeče" u krajeve, odluka 13)
        const nova = g.kraj === 0 ? linijaIzKrajeva(g.sloj, pomeren, drugi) : linijaIzKrajeva(g.sloj, drugi, pomeren);
        izmena = (pocetak) => izmeniSlojeve(pocetak, new Set([g.sloj.id]), () => nova);
        break;
      }
    }
    this.store.azurirajGest(izmena);
  }

  /**
   * Pomeraj pokazivača plus prianjanje obuhvata pomerenih uz ivice i centre platna i ostalih vidljivih slojeva (prag
   * 6 px ekrana; bez prianjanja uz Alt). Shift ograničava na dominantnu osu, i tada se prianja samo duž nje.
   */
  private pomerajSaVodjicama(p: Pritisak, dx: number, dy: number, v: Pokret): { mx: number; my: number; vodjice: Vodjica[] } {
    let mx = dx;
    let my = dy;
    const osa = v.shift ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
    if (osa === 'x') my = 0;
    if (osa === 'y') mx = 0;
    if (v.alt || !p.obuhvat0) return { mx, my, vodjice: [] };
    const o = p.obuhvat0;
    const r = prianjanje({ ...o, x: o.x + mx, y: o.y + my }, p.ostali, PRAG_PRIANJANJA_PX / p.px);
    const vodjice = r.vodjice.filter((x) => !osa || x.osa === osa);
    if (osa !== 'y') mx += r.dx;
    if (osa !== 'x') my += r.dy;
    return { mx, my, vodjice };
  }

  protected gore(e: PointerEvent): void {
    const p = this.pritisak;
    if (!p || this.tudji(p, e)) return;
    this.pomeraj(e);
    this.zavrsi();
  }

  /** Puštanje: gest u toku se završava (prvo poslednji pokret, pa jedan korak); bez pomeraja je klik (F4b pravila). */
  private zavrsi(): void {
    const p = this.pritisak;
    if (!p) return;
    if (p.aktivan) {
      this.kadar.isprazni();
      this.store.zavrsiGest();
      this.ocisti();
      return;
    }
    const r = this.vucenje();
    this.ocisti();
    if (p.vuce) {
      if (!r) return;
      const ids = uPravougaoniku(this.store.zaPrikaz().slojevi, r);
      this.store.izaberi(p.shift ? [...this.store.izbor(), ...ids] : ids);
      return;
    }
    if (p.nacin.vrsta === 'RUCKA' || p.izabranoNaDole) return;
    if (p.pogodak) {
      if (p.shift) this.store.prebaciIzbor(p.pogodak.id);
      else this.store.izaberi([p.pogodak.id]);
    } else if (!p.shift) {
      this.store.ponistiIzbor();
    }
  }

  /** Esc, `pointercancel`, `lostpointercapture` bez `pointerup`: gest se poništava (dokument kao pre, bez koraka), izbor ostaje. */
  protected prekid(e?: Event): void {
    const p = this.pritisak;
    if (!p || (e && this.tudji(p, e))) return;
    if (p.aktivan) {
      this.kadar.prekini();
      this.store.prekiniGest();
    }
    this.ocisti();
  }

  private ocisti(): void {
    this.pritisak = null;
    this.kadar.prekini();
    this.vucenje.set(null);
    this.vodjice.set([]);
    this.dokument.removeEventListener('keydown', this.naEsc, true);
  }
}

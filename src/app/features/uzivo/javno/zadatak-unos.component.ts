import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, linkedSignal, output, signal, untracked, viewChild,
} from '@angular/core';
import { LicniZadatak, OdgovorPolja, PoljeZadatka, medijUrl } from '../data-access/uzivo.models';
import { tacanBroj } from '../ui/format';
import { TekstFormuleComponent } from '../ui/tekst-formule.component';
import { tekstZaCitac } from '../ui/tekst-formule';
import { normalizujBroj, porukaZaBroj } from './odgovor-unos.component';

/** Vrednost polja kako ide serveru: BROJ i TEKST string, JEDAN_TACAN i VISE_TACNIH lista id-jeva opcija. */
export type VrednostPolja = string | number[];

/** Započet (neposlat) odgovor na svoj zadatak: roditelj ga čuva, pa unos preživi ponovno montiranje. */
export interface NacrtZadatka { rundaId: number; polja: Record<string, VrednostPolja>; }

/** Da li je polje popunjeno ("Pošalji" tek kad su sva): tekst posle skraćivanja, tačno jedna ili bar jedna opcija. */
export function popunjeno(p: PoljeZadatka, v: VrednostPolja | undefined): boolean {
  if (p.tip === 'BROJ' || p.tip === 'TEKST') return typeof v === 'string' && v.trim().length > 0;
  return Array.isArray(v) && (p.tip === 'JEDAN_TACAN' ? v.length === 1 : v.length > 0);
}

/**
 * Tačan odgovor polja za prikaz (isti oblik kao `tacnoTekst` nastavničkog rezultata, ovde nad šemom svoje varijante, jer
 * javni deo ne sme da uvozi `ui/zadatak-rezultat`): BROJ sa svim decimalama i jedinicom, TEKST prihvatljivi spojeni zarezom,
 * opcije njihov tekst (redom opcija; sme da ima `$formule$`). Bez vrednosti prazan tekst.
 */
export function tacnoPolja(p: PoljeZadatka, t: OdgovorPolja | null | undefined): string {
  if (!t) return '';
  switch (p.tip) {
    case 'BROJ':
      return t.broj === null ? '' : tacanBroj(t.broj) + (p.jedinica ? ' ' + p.jedinica : '');
    case 'TEKST':
      return (t.prihvatljivi ?? []).join(', ');
    case 'JEDAN_TACAN':
      return p.opcije?.find(o => o.id === t.tacna)?.tekst ?? '';
    case 'VISE_TACNIH':
      return (p.opcije ?? []).filter(o => t.tacne?.includes(o.id)).map(o => o.tekst).join(', ');
  }
}

const jeOpcija = (p: PoljeZadatka) => p.tip === 'JEDAN_TACAN' || p.tip === 'VISE_TACNIH';

/**
 * Oznaka stavke liste na početku: `a) `, `(b) `, `1) `, `12) ` (jedno slovo ili do dve cifre, zagrada, pa razmak). Server oznaku
 * skraćuje (`BankaPP.normalizujPolja`), pa posle razmaka uvek ima teksta; kratko zbog budžeta telefona (`e2e/lenji-formule.spec.ts`).
 */
const OZNAKA_LISTE = /^\(?([a-z]|\d\d?)\)\s+/i;

/**
 * Oznaka polja na telefonu. Kad šema ima samo jedno polje, slovo liste ("a) dekadna vrednost") ništa ne znači, pa se skida
 * (stare šeme i snimci rundi ga imaju); oznaka bez teksta posle slova ostaje kakva jeste. Više polja: oznake kakve jesu.
 */
export function oznakaNaTelefonu(p: Pick<PoljeZadatka, 'oznaka'>, brojPolja: number): string {
  return brojPolja === 1 ? p.oznaka.replace(OZNAKA_LISTE, '') : p.oznaka;
}

/**
 * Svoj zadatak na telefonu (banka spec 4.2, tačke 3 i 6): slika svoje varijante (zum prstima, "Uvećaj" preko celog ekrana),
 * pa polja po šemi i "Pošalji" (BROJ numerička tastatura, TEKST, JEDAN_TACAN dugmad, VISE_TACNIH prekidači; tekst opcija kroz
 * `app-tekst-formule`). Grupa bez polja: "Reši na papiru." bez slanja. Posle zatvaranja (`faza` ZATVORENO) umesto polja
 * ishod po polju, `Tačno: …` kad stignu `tacneVrednosti` i slika rešenja kad stigne `resenjeSvgId`: sve to server šalje
 * samo kad je prikazano, pa komponenta crta tačno ono što lično stanje nosi.
 *
 * Lenja (`@defer` u stranici studenta): telefon je učitava tek na Zadatak slajdu, pa ni stilovi nisu u globalnom CSS-u
 * (početni paket je na granici budžeta `e2e/lenji-editor.spec.ts`). Uvozi samo module dozvoljene javnom delu.
 * `zakljucan` (poslato, primljeno ili server više ne prima) sklanja polja i "Pošalji": umesto njih ostaje "Tvoj odgovor" (šta je
 * poslato, dok runda nije zatvorena). Posle prvog slanja instanca se zaključava i sama (dvostruki dodir šalje jednom), a polja se
 * vraćaju sa istim vrednostima kad roditelj skine pa vrati `zakljucan` (greška provere, rok potvrde).
 */
@Component({
  selector: 'app-zadatak-unos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TekstFormuleComponent],
  host: { class: 'uz-st-zd', '(document:keydown.escape)': 'zatvori()' },
  // zum prstima uz skrol jednim prstom (`pinch-zoom` sam bi preko slike ugasio skrol stranice; Chromium piše `manipulation`)
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; }
    .uz-st-zd-slika {
      overflow: auto; padding: 0.25rem; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--surface);
      touch-action: pan-x pan-y pinch-zoom;
    }
    .uz-st-zd-slika img { display: block; width: 100%; height: auto; }
    .uz-st-zd-uvecaj { align-self: flex-end; }
    .uz-st-zd-polja, .uz-st-zd-ishod { display: flex; flex-direction: column; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
    .uz-st-zd-polje { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; }
    .uz-st-zd-opcije { display: flex; flex-direction: column; gap: 0.5rem; }
    .uz-st-zd-opcija {
      display: flex; align-items: center; gap: 0.75rem; min-height: 3rem; padding: 0.5rem 0.75rem; border: 2px solid var(--line);
      border-radius: 0.5rem; background: var(--surface); color: var(--ink); font: inherit; font-size: 1.125rem; font-weight: 600;
      text-align: left; cursor: pointer; touch-action: manipulation;
    }
    .uz-st-zd-opcija[aria-pressed='true'] { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 1px var(--primary); }
    .uz-st-zd-opcija:disabled { opacity: 0.5; cursor: default; }
    .uz-st-zd-opcija:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .uz-st-zd-opcija app-tekst-formule { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .uz-st-zd-kvacica { flex: none; width: 1.5rem; font-size: 1.5rem; text-align: center; }
    .uz-st-zd-poslato { display: flex; flex-direction: column; gap: 0.375rem; }
    .uz-st-zd-ishod p { margin: 0; font-size: 1.125rem; overflow-wrap: anywhere; }
    .uz-st-zd-ishod strong { font-weight: 800; }
    .uz-st-zd-uvecano {
      position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column; background: var(--surface); color: var(--ink);
    }
    .uz-st-zd-uvecano-vrh { display: flex; justify-content: flex-end; padding: 0.5rem; border-bottom: 1px solid var(--line); }
    .uz-st-zd-uvecano-slika { flex: 1; min-height: 0; overflow: auto; touch-action: pan-x pan-y pinch-zoom; }
    .uz-st-zd-uvecano-slika img { display: block; width: auto; max-width: none; min-width: 100%; height: auto; }
  `,
  template: `
    @let z = zadatak();
    <div class="uz-st-zd-slika"><img data-zadatak-svg [src]="url(z.svgId)" alt="Zadatak"></div>
    <button type="button" class="uz-st-dugme uz-st-zd-uvecaj" aria-haspopup="dialog" (click)="otvori(z.svgId, 'Zadatak')">Uvećaj</button>
    @if (!z.polja.length) {
      <p class="uz-st-tekst">Reši na papiru.</p>
    } @else if (z.faza !== 'ZATVORENO' && onemoguceno()) {
      @if (poslatiRedovi(); as redovi) {
        <div class="uz-st-zd-poslato" data-poslato>
          <p class="uz-st-oznaka">Tvoj odgovor</p>
          <ul class="uz-st-zd-ishod">
            @for (r of redovi; track r.kljuc) {
              <li><p>{{ r.oznaka }}: @if (r.opcija) { <app-tekst-formule [tekst]="r.vrednost" /> } @else { <strong>{{ r.vrednost }}</strong> }</p></li>
            }
          </ul>
        </div>
      }
    } @else if (z.faza !== 'ZATVORENO') {
      <form class="uz-st-zd-polja" (submit)="$event.preventDefault(); posalji1()">
        @for (p of z.polja; track p.kljuc; let i = $index) {
          @if (opcija(p)) {
            <div class="uz-st-zd-polje" role="group" [attr.aria-labelledby]="'uz-st-zd-' + i" [attr.data-polje]="p.kljuc">
              <span class="uz-st-oznaka" [id]="'uz-st-zd-' + i">{{ oznaka(p) }}</span>
              <div class="uz-st-zd-opcije">
                @for (o of p.opcije ?? []; track o.id) {
                  @let izabrana = izabrane(p.kljuc).includes(o.id);
                  <button type="button" class="uz-st-zd-opcija" [disabled]="onemoguceno()" [attr.aria-pressed]="izabrana"
                          [attr.aria-label]="citac(o.tekst)" (click)="izaberi(p, o.id)">
                    @if (p.tip === 'VISE_TACNIH') { <span class="uz-st-zd-kvacica" aria-hidden="true">{{ izabrana ? '✓' : '' }}</span> }
                    <app-tekst-formule aria-hidden="true" [tekst]="o.tekst" />
                  </button>
                }
              </div>
            </div>
          } @else {
            <div class="uz-st-zd-polje">
              <label class="uz-st-oznaka" [for]="'uz-st-zd-' + i">{{ oznaka(p) }}</label>
              <div class="uz-st-polje-red">
                <input class="uz-st-polje" type="text" autocomplete="off" [id]="'uz-st-zd-' + i" [attr.data-polje]="p.kljuc"
                       [attr.inputmode]="p.tip === 'BROJ' ? 'decimal' : null" [attr.maxlength]="p.tip === 'TEKST' ? 200 : null"
                       [value]="tekst(p.kljuc)" [disabled]="onemoguceno()" (input)="upisi(p.kljuc, $event)"
                       [attr.aria-invalid]="greske()[p.kljuc] ? 'true' : null" [attr.aria-describedby]="'uz-st-zd-poruka-' + i" />
                @if (p.jedinica) { <span class="uz-st-jedinica">{{ p.jedinica }}</span> }
              </div>
              <p class="uz-st-poruka-polja" role="alert" [id]="'uz-st-zd-poruka-' + i">{{ greske()[p.kljuc] }}</p>
            </div>
          }
        }
        <button type="submit" class="uz-st-dugme uz-st-dugme--glavno" [disabled]="onemoguceno() || !sve()">Pošalji</button>
      </form>
    } @else {
      <ul class="uz-st-zd-ishod">
        @for (p of z.polja; track p.kljuc) {
          @let o = z.ishod?.[p.kljuc];
          @let t = tacno(p);
          @if (o !== undefined || t) {
            <li>
              @if (o !== undefined) {
                <p data-ishod>{{ oznaka(p) }}: <strong [class.uz-st-ok]="o" [class.uz-st-lose]="!o">{{ o ? 'tačno' : 'netačno' }}</strong></p>
              }
              @if (t) {
                <p data-tacno>Tačno: @if (opcija(p)) { <app-tekst-formule [tekst]="t" /> } @else { {{ t }} }</p>
              }
            </li>
          }
        }
      </ul>
    }
    @if (z.resenjeSvgId; as r) {
      <div class="uz-st-zd-slika"><img [src]="url(r)" alt="Rešenje"></div>
      <button type="button" class="uz-st-dugme uz-st-zd-uvecaj" aria-haspopup="dialog" (click)="otvori(r, 'Rešenje')">Uvećaj rešenje</button>
    }
    @if (uvecano(); as u) {
      <div class="uz-st-zd-uvecano" role="dialog" aria-modal="true" [attr.aria-label]="u.naziv">
        <div class="uz-st-zd-uvecano-vrh">
          <button #zatvoriDugme type="button" class="uz-st-dugme" (click)="zatvori()">Zatvori</button>
        </div>
        <div class="uz-st-zd-uvecano-slika"><img [src]="url(u.id)" [alt]="u.naziv"></div>
      </div>
    }
  `,
})
export class ZadatakUnosComponent {
  readonly zadatak = input.required<LicniZadatak>();
  /** Nacrt koji je roditelj sačuvao; važi samo za istu rundu. */
  readonly nacrt = input<NacrtZadatka | null>(null);
  readonly zakljucan = input(false);
  readonly posalji = output<Record<string, VrednostPolja>>();
  readonly nacrtPromena = output<NacrtZadatka>();

  protected readonly url = medijUrl;
  protected readonly opcija = jeOpcija;
  protected readonly citac = tekstZaCitac;
  private readonly rundaId = computed(() => this.zadatak().rundaId);

  /** Vrednosti polja za rundu (nacrt se čita van praćenja: osvežava se samo kad se promeni runda). */
  protected readonly vrednosti = linkedSignal<number, Record<string, VrednostPolja>>({
    source: this.rundaId,
    computation: r => {
      const n = untracked(this.nacrt);
      return n?.rundaId === r ? { ...n.polja } : {};
    },
  });
  protected readonly greske = linkedSignal<number, Record<string, string>>({ source: this.rundaId, computation: () => ({}) });
  /** Lokalna brava posle slanja; nova runda ili promena `zakljucan` je skida (roditelj tada zna šta važi). */
  private readonly poslato = linkedSignal({ source: () => `${this.rundaId()}:${this.zakljucan()}`, computation: () => false });
  protected readonly onemoguceno = computed(() => this.zakljucan() || this.poslato() || this.zadatak().faza !== 'OTVORENO');
  protected readonly sve = computed(() => this.zadatak().polja.every(p => popunjeno(p, this.vrednosti()[p.kljuc])));
  /**
   * Poslat (ili zaključan) odgovor umesto polja: `oznaka: vrednost` iz unetih vrednosti (opcije njihovim tekstom, redom opcija).
   * Posle ponovnog učitavanja stranice vrednosti nema (server ih ne vraća telefonu), pa ni spiska: ostaje "Odgovor primljen ✓".
   */
  protected readonly poslatiRedovi = computed(() => {
    const v = this.vrednosti();
    const redovi = this.zadatak().polja.flatMap(p => {
      const x = v[p.kljuc];
      const vrednost = Array.isArray(x)
        ? (p.opcije ?? []).filter(o => x.includes(o.id)).map(o => o.tekst).join(', ')
        : (x ?? '').trim() + (p.jedinica && x?.trim() ? ' ' + p.jedinica : '');
      return vrednost ? [{ kljuc: p.kljuc, oznaka: this.oznaka(p), vrednost, opcija: jeOpcija(p) }] : [];
    });
    return redovi.length ? redovi : null;
  });

  /** Slika preko celog ekrana (zadatak ili rešenje); fokus ide na "Zatvori", a po zatvaranju nazad na dugme. */
  protected readonly uvecano = signal<{ id: string; naziv: string } | null>(null);
  private readonly zatvoriDugme = viewChild<ElementRef<HTMLButtonElement>>('zatvoriDugme');
  private vratiFokus: HTMLElement | null = null;

  constructor() {
    effect(() => this.zatvoriDugme()?.nativeElement.focus());
  }

  protected oznaka(p: PoljeZadatka): string {
    return oznakaNaTelefonu(p, this.zadatak().polja.length);
  }

  protected tekst(kljuc: string): string {
    const v = this.vrednosti()[kljuc];
    return typeof v === 'string' ? v : '';
  }

  protected izabrane(kljuc: string): number[] {
    const v = this.vrednosti()[kljuc];
    return Array.isArray(v) ? v : [];
  }

  protected tacno(p: PoljeZadatka): string {
    return tacnoPolja(p, this.zadatak().tacneVrednosti?.[p.kljuc]);
  }

  protected upisi(kljuc: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.vrednosti.update(s => ({ ...s, [kljuc]: v }));
    this.greske.update(g => ({ ...g, [kljuc]: '' }));
    this.javiNacrt();
  }

  /** JEDAN_TACAN: dodir bira (drugi menja izbor); VISE_TACNIH: prekidač. Izabrane su uvek redom opcija. */
  protected izaberi(p: PoljeZadatka, id: number): void {
    if (this.onemoguceno()) return;
    const ima = this.izabrane(p.kljuc);
    const nove = p.tip === 'JEDAN_TACAN'
      ? [id]
      : (p.opcije ?? []).map(o => o.id).filter(x => (x === id ? !ima.includes(x) : ima.includes(x)));
    this.vrednosti.update(s => ({ ...s, [p.kljuc]: nove }));
    this.javiNacrt();
  }

  private javiNacrt(): void {
    this.nacrtPromena.emit({ rundaId: this.rundaId(), polja: this.vrednosti() });
  }

  /** Jedino mesto slanja: proveri brojeve (poruka uz polje), pa jednom po instanci dok roditelj ne otključa. */
  protected posalji1(): void {
    if (this.onemoguceno() || !this.sve()) return;
    const v = this.vrednosti();
    const polja = this.zadatak().polja;
    const greske: Record<string, string> = {};
    for (const p of polja) {
      const poruka = p.tip === 'BROJ' ? porukaZaBroj(v[p.kljuc] as string) : null;
      if (poruka) greske[p.kljuc] = poruka;
    }
    this.greske.set(greske);
    if (Object.keys(greske).length) return;
    const odgovor: Record<string, VrednostPolja> = {};
    for (const p of polja) {
      const x = v[p.kljuc];
      odgovor[p.kljuc] = typeof x === 'string' ? (p.tip === 'BROJ' ? normalizujBroj(x) : x.trim()) : x;
    }
    this.poslato.set(true);
    this.posalji.emit(odgovor);
  }

  protected otvori(id: string, naziv: string): void {
    this.vratiFokus = document.activeElement as HTMLElement | null;
    this.uvecano.set({ id, naziv });
  }

  protected zatvori(): void {
    if (!this.uvecano()) return;
    this.uvecano.set(null);
    this.vratiFokus?.focus();
    this.vratiFokus = null;
  }
}

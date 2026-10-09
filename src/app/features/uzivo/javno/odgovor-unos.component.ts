import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { JavnoPitanje, OdgovorCmd, TipPitanja } from '../data-access/uzivo.models';
import { OpcijaOblikComponent, oblikOpcije } from '../ui/opcija-oblik';

/** Isto pravilo kao `Normalizacija.broj` na serveru: razmaci su razdvajači hiljada, decimalni znak tačka ili zarez. */
const BROJ = /^[+-]?\d+([.,]\d+)?$/;
const MAX_TEKST = 200;

export const PORUKA_BROJ = 'Unesi broj.';
export const PORUKA_TEKST = 'Odgovor mora imati od 1 do 200 znakova.';

export function normalizujBroj(unos: string): string {
  return unos.replace(/[\s\u00A0\u202F]/g, '');
}

/** Poruka kad unos nije broj (ista kao serverska), inače null. */
export function porukaZaBroj(unos: string): string | null {
  return BROJ.test(normalizujBroj(unos)) ? null : PORUKA_BROJ;
}

export function porukaZaTekst(unos: string): string | null {
  const t = unos.trim();
  return t.length >= 1 && t.length <= MAX_TEKST ? null : PORUKA_TEKST;
}

export interface UnosOdgovora { izabrane: readonly number[]; broj: string; tekst: string; }

/** Započet (neposlat) odgovor za rundu: roditelj ga čuva, pa izbor i ukucan tekst prežive ponovno montiranje. */
export interface NacrtOdgovora { rundaId: number; izabrane: number[]; broj: string; tekst: string; }

/** Da li je "Pošalji" omogućen (poruka o neispravnom broju stiže tek na dodir, da student zna šta ne valja). */
export function mozeDaPosalje(tip: TipPitanja, u: UnosOdgovora): boolean {
  switch (tip) {
    case 'VISE_TACNIH': return u.izabrane.length > 0;
    case 'BROJ': return u.broj.trim().length > 0;
    case 'KRATAK_TEKST': return u.tekst.trim().length > 0;
    default: return true;
  }
}

/** Tekst opcije za prikaz: sa servera kad je dozvoljen; tačno/netačno uvek ima "Tačno" pa "Netačno" (server to čuva). */
export function tekstOpcije(p: JavnoPitanje, indeks: number): string | null {
  const t = p.opcije?.[indeks]?.tekst ?? null;
  if (t !== null) return t;
  if (p.tip === 'TACNO_NETACNO' && indeks < 2) return indeks === 0 ? 'Tačno' : 'Netačno';
  return null;
}

function oznakaOpcije(p: JavnoPitanje, indeks: number): string {
  const o = oblikOpcije(indeks);
  const t = tekstOpcije(p, indeks);
  return `${o.slovo}, ${o.naziv}` + (t ? `: ${t}` : '');
}

const SKALA = [1, 2, 3, 4, 5] as const;

/**
 * Unos odgovora po tipu pitanja (spec 6.5). Jedan tačan, anketa i tačno/netačno šalju na dodir; više tačnih, broj i
 * kratak tekst preko "Pošalji"; skala na dodir broja. `celoPitanje` (režim A) dodaje tekst opcija na dugmad; u režimu B
 * mreža obojenih oblika ide preko celog ekrana.
 *
 * Roditelj prikazuje komponentu samo dok je unos otvoren (ekran `unos`); posle slanja je skida, a posle otključavanja
 * (greška provere, rok potvrde) montira iznova. Zato:
 * - posle prvog slanja sva dugmad su zaključana odmah (lokalno, u istom okviru), pa dvostruki dodir ili dva brza dodira
 *   šalju jedan odgovor;
 * - izbor i ukucan tekst idu roditelju kao `nacrtPromena`, a vraćaju se kroz `nacrt` iste runde pri novom montiranju.
 */
@Component({
  selector: 'app-odgovor-unos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OpcijaOblikComponent],
  host: { class: 'uz-st-unos', '[class.uz-st-unos--celo]': 'celoPitanje()' },
  template: `
    @let p = pitanje();
    @switch (p.tip) {
      @case ('BROJ') {
        <form class="uz-st-polje-forma" (submit)="$event.preventDefault(); posaljiBroj()">
          <label class="uz-st-oznaka" for="uz-st-broj">Tvoj odgovor (broj)</label>
          <div class="uz-st-polje-red">
            <input id="uz-st-broj" class="uz-st-polje" type="text" inputmode="decimal" autocomplete="off"
                   [value]="broj()" (input)="broj.set(vrednost($event)); porukaBroja.set(null); javiNacrt()" [disabled]="onemoguceno()"
                   [attr.aria-invalid]="porukaBroja() ? 'true' : null" aria-describedby="uz-st-broj-poruka" />
            @if (p.jedinica) { <span class="uz-st-jedinica">{{ p.jedinica }}</span> }
          </div>
          <p id="uz-st-broj-poruka" class="uz-st-poruka-polja" role="alert">{{ porukaBroja() }}</p>
          <button type="submit" class="uz-st-dugme uz-st-dugme--glavno" [disabled]="onemoguceno() || !mozeSlati()">Pošalji</button>
        </form>
      }
      @case ('KRATAK_TEKST') {
        <form class="uz-st-polje-forma" (submit)="$event.preventDefault(); posaljiTekst()">
          <label class="uz-st-oznaka" for="uz-st-tekst">Tvoj odgovor</label>
          <input id="uz-st-tekst" class="uz-st-polje" type="text" maxlength="200" autocomplete="off" enterkeyhint="send"
                 [value]="tekst()" (input)="tekst.set(vrednost($event)); javiNacrt()" [disabled]="onemoguceno()"
                 aria-describedby="uz-st-tekst-brojac" />
          <p id="uz-st-tekst-brojac" class="uz-st-brojac">{{ tekst().length }}/200</p>
          <button type="submit" class="uz-st-dugme uz-st-dugme--glavno" [disabled]="onemoguceno() || !mozeSlati()">Pošalji</button>
        </form>
      }
      @case ('SKALA') {
        <div class="uz-st-skala" role="group" aria-label="Izaberi vrednost od 1 do 5">
          @for (v of skala; track v) {
            <button type="button" class="uz-st-dugme uz-st-skala-dugme" [disabled]="onemoguceno()"
                    [attr.aria-label]="oznakaSkale(v)" (click)="posalji1({ rundaId: p.rundaId!, skala: v })">{{ v }}</button>
          }
        </div>
        @if (p.skalaMinOznaka || p.skalaMaxOznaka) {
          <div class="uz-st-skala-krajevi" aria-hidden="true">
            <span>{{ p.skalaMinOznaka }}</span><span>{{ p.skalaMaxOznaka }}</span>
          </div>
        }
      }
      @default {
        <div class="uz-st-opcije" [class.uz-st-opcije--dve]="opcije().length <= 2" role="group"
             [attr.aria-label]="p.tip === 'VISE_TACNIH' ? 'Izaberi jedan ili više odgovora' : 'Izaberi odgovor'">
          @for (o of opcije(); track o.id; let i = $index) {
            <button type="button" class="uz-st-opcija" [style.--uz-boja]="boja(i)" [disabled]="onemoguceno()"
                    [class.uz-st-opcija--izabrana]="izabrane().includes(o.id)"
                    [attr.aria-pressed]="p.tip === 'VISE_TACNIH' ? izabrane().includes(o.id) : null"
                    [attr.aria-label]="oznaka(i)" (click)="dodir(o.id)">
              <app-opcija-oblik [indeks]="i" aria-hidden="true" />
              @if (tekst1(i); as t) { <span class="uz-st-opcija-tekst" aria-hidden="true">{{ t }}</span> }
              @if (p.tip === 'VISE_TACNIH') {
                <span class="uz-st-opcija-kvacica" aria-hidden="true">{{ izabrane().includes(o.id) ? '✓' : '' }}</span>
              }
            </button>
          }
        </div>
        @if (p.tip === 'VISE_TACNIH') {
          <button type="button" class="uz-st-dugme uz-st-dugme--glavno uz-st-posalji" [disabled]="onemoguceno() || !mozeSlati()"
                  (click)="posalji1({ rundaId: p.rundaId!, opcije: izabraneRedom() })">Pošalji</button>
        }
      }
    }
  `,
})
export class OdgovorUnosComponent {
  readonly pitanje = input.required<JavnoPitanje>();
  /** Režim A (celo pitanje): tekst opcija na dugmadi. */
  readonly celoPitanje = input(false);
  /** Nacrt koji je roditelj sačuvao; važi samo za istu rundu. */
  readonly nacrt = input<NacrtOdgovora | null>(null);
  readonly posalji = output<OdgovorCmd>();
  readonly nacrtPromena = output<NacrtOdgovora>();

  protected readonly skala = SKALA;
  private readonly rundaId = computed(() => this.pitanje().rundaId);
  /** Runda u kojoj je ova komponenta već poslala odgovor (lokalna brava protiv dvostrukog dodira). */
  private readonly poslataRunda = signal<number | null>(null);

  /** Nacrt za datu rundu (čita se van praćenja: osvežava se samo kad se promeni runda, ne na svaki `nacrt`). */
  private nacrtZa(r: number | null): NacrtOdgovora | null {
    const n = untracked(this.nacrt);
    return r !== null && n?.rundaId === r ? n : null;
  }

  protected readonly izabrane = linkedSignal<number | null, number[]>({
    source: this.rundaId, computation: r => [...(this.nacrtZa(r)?.izabrane ?? [])],
  });
  protected readonly broj = linkedSignal<number | null, string>({
    source: this.rundaId, computation: r => this.nacrtZa(r)?.broj ?? '',
  });
  protected readonly tekst = linkedSignal<number | null, string>({
    source: this.rundaId, computation: r => this.nacrtZa(r)?.tekst ?? '',
  });
  protected readonly porukaBroja = linkedSignal<number | null, string | null>({ source: this.rundaId, computation: () => null });

  protected readonly opcije = computed(() => this.pitanje().opcije ?? []);
  protected readonly onemoguceno = computed(() => this.rundaId() === null || this.poslataRunda() === this.rundaId());
  protected readonly mozeSlati = computed(() =>
    mozeDaPosalje(this.pitanje().tip, { izabrane: this.izabrane(), broj: this.broj(), tekst: this.tekst() }));
  /** Izabrane opcije redom kao na ekranu (ne redom dodira). */
  protected readonly izabraneRedom = computed(() => this.opcije().map(o => o.id).filter(id => this.izabrane().includes(id)));

  protected boja(i: number): string { return oblikOpcije(i).boja; }
  protected oznaka(i: number): string { return oznakaOpcije(this.pitanje(), i); }

  /** Tekst na dugmetu: u režimu A uvek kad postoji, u B samo za tačno/netačno (dva velika dugmeta). */
  protected tekst1(i: number): string | null {
    const p = this.pitanje();
    return this.celoPitanje() || p.tip === 'TACNO_NETACNO' ? tekstOpcije(p, i) : null;
  }

  protected oznakaSkale(v: number): string {
    const p = this.pitanje();
    const kraj = v === 1 ? p.skalaMinOznaka : v === 5 ? p.skalaMaxOznaka : null;
    return String(v) + (kraj ? `, ${kraj}` : '');
  }

  protected vrednost(e: Event): string { return (e.target as HTMLInputElement).value; }

  protected dodir(id: number): void {
    if (this.onemoguceno()) return;
    if (this.pitanje().tip === 'VISE_TACNIH') {
      this.izabrane.update(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
      this.javiNacrt();
      return;
    }
    this.posalji1({ rundaId: this.rundaId()!, opcije: [id] });
  }

  protected javiNacrt(): void {
    const r = this.rundaId();
    if (r !== null) this.nacrtPromena.emit({ rundaId: r, izabrane: this.izabrane(), broj: this.broj(), tekst: this.tekst() });
  }

  protected posaljiBroj(): void {
    const poruka = porukaZaBroj(this.broj());
    this.porukaBroja.set(poruka);
    if (!poruka) this.posalji1({ rundaId: this.rundaId()!, broj: normalizujBroj(this.broj()) });
  }

  protected posaljiTekst(): void {
    if (!porukaZaTekst(this.tekst())) this.posalji1({ rundaId: this.rundaId()!, tekst: this.tekst().trim() });
  }

  /** Jedino mesto slanja: najviše jednom po rundi u ovoj instanci (posle otključavanja roditelj montira novu). */
  protected posalji1(cmd: OdgovorCmd): void {
    if (this.onemoguceno() || !this.mozeSlati()) return;
    this.poslataRunda.set(cmd.rundaId);
    this.posalji.emit(cmd);
  }
}

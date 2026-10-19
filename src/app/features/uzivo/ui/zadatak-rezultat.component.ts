import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RezultatPolja, RezultatVarijante, ZadatakRezultat, medijUrl } from '../data-access/uzivo.models';
import { decimalni } from './format';
import { meriFormule } from './mera-formule';
import { MERA_FORMULE, TekstFormuleComponent } from './tekst-formule.component';

/** Kolone mreže kartica po broju varijanti: do 4 dve, do 9 tri, inače četiri. */
export function kolone(n: number): 2 | 3 | 4 {
  return n <= 4 ? 2 : n <= 9 ? 3 : 4;
}

/**
 * Tačan odgovor polja kao tekst za prikaz: BROJ vrednost sa jedinicom, TEKST prihvatljivi odgovori spojeni zarezom,
 * JEDAN_TACAN tekst izabrane opcije, VISE_TACNIH tekstovi tačnih opcija (redom opcija) spojeni zarezom. Tekst opcije sme da
 * ima `$formule$` (prikaz ga crta kroz `app-tekst-formule`). Bez `tacno` (još nije prikazano) prazan tekst.
 */
export function tacnoTekst(p: RezultatPolja): string {
  const t = p.tacno;
  if (!t) return '';
  switch (p.tip) {
    case 'BROJ':
      return t.broj === null ? '' : decimalni(t.broj) + (p.jedinica ? ' ' + p.jedinica : '');
    case 'TEKST':
      return (t.prihvatljivi ?? []).join(', ');
    case 'JEDAN_TACAN':
      return (p.opcije ?? []).find(o => o.id === t.tacna)?.tekst ?? '';
    case 'VISE_TACNIH': {
      const tacne = t.tacne ?? [];
      return (p.opcije ?? []).filter(o => tacne.includes(o.id)).map(o => o.tekst ?? '').filter(x => x !== '').join(', ');
    }
  }
}

/** Red rezultata polja: vrednost ili opcija sa brojem odgovora i udelom (trake) među onima koji su odgovorili. */
interface Red { kljuc: string; tekst: string; broj: number; udeo: number; tacno: boolean; formula: boolean; }

interface PoljeKartice {
  kljuc: string; oznaka: string; redovi: Red[] | null; tacno: string;
}

interface Kartica {
  id: number; naziv: string; svgId: string; resenjeSvgId: string | null; brojevi: string | null; polja: PoljeKartice[];
}

const udeoOd = (broj: number, odgovorilo: number) => (odgovorilo > 0 ? Math.min(100, Math.round((broj * 100) / odgovorilo)) : 0);

function poljeKartice(p: RezultatPolja, v: RezultatVarijante, prikazani: boolean): PoljeKartice {
  let redovi: Red[] | null = null;
  if (prikazani) {
    redovi = p.opcije
      ? p.opcije.map(o => ({
        kljuc: String(o.id), tekst: o.tekst ?? '', broj: o.broj, udeo: udeoOd(o.broj, v.odgovorilo), tacno: o.tacna === true, formula: true,
      }))
      : (p.vrednosti ?? []).map(t => ({
        kljuc: t.kljuc, tekst: t.tekst + (p.tip === 'BROJ' && p.jedinica ? ' ' + p.jedinica : ''), broj: t.broj,
        udeo: udeoOd(t.broj, v.odgovorilo), tacno: t.tacan === true, formula: false,
      }));
  }
  return { kljuc: p.kljuc, oznaka: p.oznaka, redovi, tacno: tacnoTekst(p) };
}

/**
 * Rezultat Zadatak runde po varijanti, u mreži kartica (2-4 kolone, `kolone`). Kartica: slika zadatka, uz `resenjeSvgId` i
 * slika rešenja ispod nje, a po polju šeme: uz `odgovoriPrikazani` trake vrednosti ili opcija i broj odgovora, uz `tacno` red
 * "tačno: …". Tri prekidača projektora su nezavisna, pa kartica crta samo ono što rezultat nosi (server javni rezultat
 * pravi po pravilima vidljivosti: bez prikazanih odgovora su brojevi 0 i `vrednosti` `null`, bez `TACAN` nema `tacnih` ni `tacno`,
 * bez `RESENJE` nema `resenjeSvgId`). Imena učesnika rezultat ne nosi. Slike su SVG iz `api/public/mediji` na beloj podlozi
 * (zadatak je crn na providnoj pozadini, pa na tamnoj temi ne bi bio čitljiv). Isti sastojak koristi pregled izvođenja.
 */
@Component({
  selector: 'app-zadatak-rezultat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [TekstFormuleComponent],
  host: { class: 'uz-zr' },
  // u komponenti (lenji chunkovi), ne u globalnom `uzivo-tokeni.css`: početni paket je na granici budžeta `e2e/lenji-editor.spec.ts`.
  // Osnova je mreža prirodne visine (pregled izvođenja); na projektoru (host dobija klasu `uz-zad-rezultat`) mreža puni ostatak
  // platna, redovi su jednake visine, a slike dele visinu kartice. Veličine na projektoru su u `cqw` (platno), pa nisu u osnovi.
  styles: `
    :host { display: block; }
    .uz-zr-mreza {
      display: grid; grid-template-columns: repeat(var(--uz-kolone, 2), minmax(0, 1fr)); gap: 0.8em; margin: 0; padding: 0;
      list-style: none;
    }
    .uz-zr-kartica {
      display: flex; flex-direction: column; gap: 0.4em; min-width: 0; min-height: 0; overflow: hidden; box-sizing: border-box;
      padding: 0.6em; border: 1px solid var(--line); border-radius: 0.6em; background: var(--surface); color: var(--ink);
      line-height: 1.25;
    }
    /* jedna varijanta zauzima ceo red, ne pola (kolone(1) je 2) */
    .uz-zr-kartica:only-child { grid-column: 1 / -1; }
    .uz-zr-slike { display: flex; flex-direction: column; gap: 0.4em; }
    .uz-zr-slika { display: block; width: 100%; max-height: 16em; object-fit: contain; border-radius: 0.4em; background: var(--surface); }
    .uz-zr-resenje { position: relative; display: flex; margin: 0; }
    .uz-zr-natpis {
      position: absolute; top: 0; left: 0; padding: 0 0.6em; border-radius: 0.3em; background: var(--ok); color: var(--ok-ink);
      font-size: 0.85em; font-weight: 700;
    }
    .uz-zr-brojevi { color: var(--muted); font-variant-numeric: tabular-nums; }
    .uz-zr-polje { min-height: 0; overflow: hidden; }
    .uz-zr-oznaka { color: var(--muted); font-weight: 600; overflow-wrap: anywhere; }
    .uz-zr-tacno { margin: 0.1em 0 0.25em; font-weight: 600; }
    .uz-zr-redovi { display: flex; flex-direction: column; gap: 0.25em; margin: 0; padding: 0; list-style: none; }
    .uz-zr-red {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "tekst broj" "traka traka";
      align-items: baseline; column-gap: 0.6em; row-gap: 0.1em; padding: 0 0.3em; border-radius: 0.3em;
    }
    .uz-zr-red-tekst { grid-area: tekst; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .uz-zr-red-broj { grid-area: broj; font-weight: 700; font-variant-numeric: tabular-nums; }
    .uz-zr-red > .uz-rez-traka { grid-area: traka; height: 0.45em; }
    .uz-zr-red--tacna { --uz-boja: var(--ok); background: var(--ok-soft); }
    .uz-zr-red--tacna .uz-zr-red-tekst { font-weight: 700; }
    .uz-zr-prazno { color: var(--muted); }

    :host(.uz-zad-rezultat) .uz-zr-mreza { position: absolute; inset: 0; grid-auto-rows: minmax(0, 1fr); gap: 1.2cqw; }
    :host(.uz-zad-rezultat) .uz-zr-kartica { gap: 0.5cqw; padding: 0.8cqw; border-radius: 1cqw; font-size: 1.7cqw; }
    :host(.uz-zad-rezultat) .uz-zr-mreza[data-kolone="3"] .uz-zr-kartica { font-size: 1.4cqw; }
    :host(.uz-zad-rezultat) .uz-zr-mreza[data-kolone="4"] .uz-zr-kartica { font-size: 1.15cqw; }
    /* slike (zadatak, rešenje ispod njega) dele visinu kartice; polja ispod ih ne mogu pojesti do kraja (min-height) */
    :host(.uz-zad-rezultat) .uz-zr-slike { flex: 1 1 0; min-height: 40%; gap: 0.5cqw; }
    :host(.uz-zad-rezultat) .uz-zr-slika { flex: 1 1 0; min-height: 0; max-height: none; border-radius: 0.5cqw; }
    :host(.uz-zad-rezultat) .uz-zr-resenje { flex: 1 1 0; min-height: 0; }
  `,
  template: `
    <ul class="uz-zr-mreza" [attr.data-kolone]="brojKolona()" [style.--uz-kolone]="brojKolona()">
      @for (k of kartice(); track k.id) {
        <li class="uz-zr-kartica">
          <div class="uz-zr-slike">
            <img class="uz-zr-slika rezim-dan" [src]="url(k.svgId)" [alt]="'Zadatak, varijanta ' + k.naziv">
            @if (k.resenjeSvgId; as r) {
              <figure class="uz-zr-resenje">
                <img class="uz-zr-slika rezim-dan" [src]="url(r)" [alt]="'Rešenje, varijanta ' + k.naziv">
                <figcaption class="uz-zr-natpis" aria-hidden="true">Rešenje</figcaption>
              </figure>
            }
          </div>
          @if (k.brojevi) { <p class="uz-zr-brojevi">{{ k.brojevi }}</p> }
          @for (p of k.polja; track p.kljuc) {
            @if (p.redovi || p.tacno) {
              <div class="uz-zr-polje">
                <p class="uz-zr-oznaka">{{ p.oznaka }}</p>
                @if (p.tacno) {
                  <p class="uz-zr-tacno"><span class="uz-tacno-znak"><span aria-hidden="true">✓ </span>tačno:</span>{{ ' ' }}<app-tekst-formule class="uz-zr-formula" [tekst]="p.tacno" /></p>
                }
                @if (p.redovi; as redovi) {
                  @if (redovi.length) {
                    <ul class="uz-zr-redovi">
                      @for (r of redovi; track r.kljuc) {
                        <li class="uz-zr-red" [class.uz-zr-red--tacna]="r.tacno">
                          <span class="uz-zr-red-tekst">
                            @if (r.tacno) { <span class="uz-tacno-znak" aria-hidden="true">✓</span><span class="uz-sr">tačno </span> }
                            @if (r.formula) { <app-tekst-formule class="uz-zr-formula" [tekst]="r.tekst" /> } @else { {{ r.tekst }} }
                          </span>
                          <span class="uz-zr-red-broj">{{ r.broj }}</span>
                          <span class="uz-rez-traka" aria-hidden="true"><span class="uz-rez-ispuna" [style.--uz-udeo]="r.udeo + '%'"></span></span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="uz-zr-prazno">Još nema odgovora.</p>
                  }
                }
              </div>
            }
          }
        </li>
      }
    </ul>
  `,
})
export class ZadatakRezultatComponent {
  readonly rezultat = input.required<ZadatakRezultat>();

  protected readonly url = medijUrl;
  protected readonly brojKolona = computed(() => kolone(this.rezultat().varijante.length));

  protected readonly kartice = computed<Kartica[]>(() => {
    const r = this.rezultat();
    return r.varijante.map((v, i) => {
      const papir = v.polja.length === 0;
      let brojevi: string | null = null;
      if (r.odgovoriPrikazani) {
        brojevi = papir ? `dodeljeno ${v.dodeljeno} · rad na papiru`
          : `dodeljeno ${v.dodeljeno} · odgovorilo ${v.odgovorilo}` + (v.tacnih !== null ? ` · tačno ${v.tacnih}` : '');
      }
      return {
        id: v.varijantaId, naziv: v.naziv ?? `V${i + 1}`, svgId: v.svgId, resenjeSvgId: v.resenjeSvgId, brojevi,
        polja: v.polja.map(p => poljeKartice(p, v, r.odgovoriPrikazani)),
      };
    });
  });
}

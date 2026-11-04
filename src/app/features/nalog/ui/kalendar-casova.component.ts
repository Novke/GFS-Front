import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { blokVremena, danIDatum, DANI_KRATKO, MESECI } from '../../../shared/util/termin';
import { kljucTermina, StudentskiTermin } from '../data-access/casovi.models';
import { DanMreze, meseciDatuma, mrezaMeseca } from './kalendar-casova';

/** Dan kalendara sa svojim terminima; `stanje` boji ćeliju, a crte ispod broja su po jedna za svaki termin. */
interface DanKalendara extends DanMreze {
  termini: StudentskiTermin[];
  stanje: 'cas' | 'otkazan' | 'najavljeno' | null;
  boja: string | null;
}

/**
 * Mesec sa časovima studenta: dani sa časom su dugmad u boji predmeta, otkazan dan je crven, a prugast je dan kad student ne
 * ide ni na jedan čas koji se održava. Prikazan je mesec izabranog dana; strelice vode samo kroz mesece sa terminima i biraju
 * prvi dan sa terminom u njima. Bez stanja: izbor drži `NaredniCasovi`.
 */
@Component({
  selector: 'app-kalendar-casova',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje">
      <p class="mesec" data-mesec>{{ naslovMeseca() }}</p>
      @if (meseci().length > 1) {
        <div class="strelice">
          <button type="button" class="strelica" aria-label="Prethodni mesec" [disabled]="!prethodni()"
                  (click)="idiNaMesec(prethodni())" data-prethodni-mesec>‹</button>
          <button type="button" class="strelica" aria-label="Sledeći mesec" [disabled]="!sledeci()"
                  (click)="idiNaMesec(sledeci())" data-sledeci-mesec>›</button>
        </div>
      }
    </div>
    <table class="mreza" [attr.aria-label]="'Kalendar časova, ' + naslovMeseca()">
      <thead>
        <tr>
          @for (d of daniNedelje; track d) {
            <th scope="col">{{ d }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (nedelja of nedelje(); track nedelja[0].iso) {
          <tr>
            @for (d of nedelja; track d.iso) {
              <td>
                @if (d.stanje) {
                  <button type="button" class="dan" [class.otkazan]="d.stanje === 'otkazan'"
                          [class.najavljeno]="d.stanje === 'najavljeno'" [class.danas]="d.iso === danas()"
                          [class.izabran]="d.iso === izabrani()" [style.--boja]="d.boja"
                          [attr.aria-label]="opisDana(d)" [attr.aria-pressed]="d.iso === izabrani()"
                          [attr.aria-current]="d.iso === danas() ? 'date' : null" [attr.data-dan]="d.iso"
                          (click)="izabran.emit(d.iso)">
                    <span class="broj">{{ d.broj }}</span>
                    <span class="crte" aria-hidden="true">
                      @for (t of d.termini; track kljuc(t)) {
                        <i [style.background]="bojaTermina(t)"></i>
                      }
                    </span>
                  </button>
                } @else {
                  <span class="dan prazan" [class.van]="!d.uMesecu || d.vikend" [class.danas]="d.iso === danas()"
                        [attr.aria-current]="d.iso === danas() ? 'date' : null">{{ d.broj }}</span>
                }
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
    <ul class="legenda" aria-label="Značenje boja">
      @for (p of legenda(); track p.naziv) {
        <li><i [style.background]="p.boja"></i>{{ p.naziv }}</li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; padding: 12px 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .zaglavlje { display: flex; align-items: center; justify-content: space-between; min-height: 40px; padding: 0 6px 6px; }
    .mesec { margin: 0; font-size: 16px; font-weight: 700; }
    .mesec::first-letter { text-transform: uppercase; }
    .strelice { display: flex; gap: 6px; }
    .strelica { width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface);
      color: var(--ink-2); font: inherit; font-size: 20px; line-height: 1; cursor: pointer; }
    .strelica:disabled { color: var(--line); cursor: default; }
    .mreza { width: 100%; border-collapse: separate; border-spacing: 2px; table-layout: fixed; }
    th { padding: 2px 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); }
    td { padding: 0; }
    .dan { position: relative; display: block; width: 100%; height: 48px; padding: 6px 0 0; border: 0; border-radius: var(--radius);
      background: color-mix(in srgb, var(--boja) 13%, var(--surface)); color: color-mix(in srgb, var(--boja) 70%, var(--ink));
      font: inherit; font-size: 15px; font-weight: 700; text-align: center; cursor: pointer; }
    .dan:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
    .dan.prazan { background: none; color: var(--ink); font-weight: 400; cursor: default; }
    .dan.prazan.van { color: var(--muted); }
    .dan.danas { box-shadow: inset 0 0 0 2px var(--accent); }
    .dan.otkazan { background: var(--danger-soft); color: var(--danger); }
    .dan.otkazan .broj { text-decoration: line-through; }
    .dan.najavljeno { background: repeating-linear-gradient(135deg, var(--warn-soft) 0 6px, var(--surface) 6px 10px); color: var(--warn); }
    .dan.izabran { outline: 2.5px solid var(--ink); outline-offset: -1px; }
    .crte { position: absolute; left: 7px; right: 7px; bottom: 7px; display: flex; gap: 2px; }
    .crte i { flex: 1; height: 5px; border-radius: 3px; }
    .legenda { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 10px 6px 0; padding: 0; list-style: none; font-size: 12px; color: var(--ink-2); }
    .legenda i { display: inline-block; width: 12px; height: 12px; margin-right: 5px; border-radius: 3px; vertical-align: -1px; }
  `,
})
export class KalendarCasova {
  /** Termini po redu (datum, početak). */
  readonly termini = input.required<StudentskiTermin[]>();
  readonly boje = input.required<Map<string, string>>();
  readonly izabrani = input.required<string>();
  readonly danas = input.required<string>();
  readonly izabran = output<string>();

  protected readonly daniNedelje = DANI_KRATKO.slice(1);

  private readonly mesec = computed(() => this.izabrani().slice(0, 7));
  protected readonly meseci = computed(() => meseciDatuma(this.termini().map(t => t.datum)));
  protected readonly prethodni = computed(() => this.meseci()[this.meseci().indexOf(this.mesec()) - 1] ?? null);
  protected readonly sledeci = computed(() => this.meseci()[this.meseci().indexOf(this.mesec()) + 1] ?? null);
  protected readonly naslovMeseca = computed(() => `${MESECI[Number(this.mesec().slice(5)) - 1]} ${this.mesec().slice(0, 4)}`);
  protected readonly nedelje = computed(() => mrezaMeseca(this.mesec()).map(n => n.map(d => this.danKalendara(d))));

  /** Predmeti, pa stanja koja se zaista pojavljuju u listi. */
  protected readonly legenda = computed(() => [
    ...[...this.boje()].map(([naziv, boja]) => ({ naziv, boja })),
    ...(this.termini().some(t => t.otkazan) ? [{ naziv: 'Otkazan', boja: 'var(--danger)' }] : []),
    ...(this.termini().some(t => t.najavljeno && !t.otkazan) ? [{ naziv: 'Ne dolaziš', boja: 'var(--warn)' }] : []),
  ]);

  protected kljuc(t: StudentskiTermin): string {
    return kljucTermina(t);
  }

  protected bojaTermina(t: StudentskiTermin): string | undefined {
    if (t.otkazan) {
      return 'var(--danger)';
    }
    return t.najavljeno ? 'var(--warn)' : this.boje().get(t.predmet);
  }

  /** Dan za čitač ekrana: `sreda 4. 11.: Geodezija 1 10:00–13:00, otkazan`. */
  protected opisDana(d: DanKalendara): string {
    const termini = d.termini.map(t => {
      const stanje = t.otkazan ? ', otkazan' : t.najavljeno ? ', ne dolaziš' : '';
      return `${t.predmet} ${blokVremena(t.pocetak, t.kraj)}${stanje}`;
    });
    return `${danIDatum(d.iso)}: ${termini.join('; ')}`;
  }

  protected idiNaMesec(mesec: string | null): void {
    const t = mesec ? this.termini().find(x => x.datum.startsWith(mesec)) : null;
    if (t) {
      this.izabran.emit(t.datum);
    }
  }

  private danKalendara(d: DanMreze): DanKalendara {
    const termini = this.termini().filter(t => t.datum === d.iso);
    const odrzavaSe = termini.filter(t => !t.otkazan);
    const stanje = !termini.length ? null : !odrzavaSe.length ? 'otkazan' : odrzavaSe.every(t => t.najavljeno) ? 'najavljeno' : 'cas';
    const prvi = odrzavaSe.find(t => !t.najavljeno);
    return { ...d, termini, stanje, boja: prvi ? this.boje().get(prvi.predmet) ?? null : null };
  }
}

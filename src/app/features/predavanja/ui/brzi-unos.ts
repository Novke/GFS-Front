import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { StudentListItem } from '../../../core/api/studenti.api';
import { formatIndeks, IndeksPipe } from '../../../shared/util/indeks.pipe';

const MAX_POGODAKA = 8;

/** Mala slova, bez razmaka, `đ` -> `dj`, bez kvačica (`č`, `ć`, `š`, `ž`). */
export function normalizujUnos(v: string | null | undefined): string {
  return (v ?? '')
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '');
}

const indeksi = new Intl.Collator('sr-Latn', { numeric: true, sensitivity: 'base' });

/**
 * Pogoci brzog unosa: prefiks indeksa (bez razmaka, i sa godinom: `gd14/2024`) ili prefiks prezimena, bez obzira na
 * mala slova i kvačice. Tačan indeks je prvi, pa pogoci po indeksu prirodnim redom (`GD1`, `GD12`), pa po prezimenu.
 */
export function pogociBrzogUnosa(studenti: readonly StudentListItem[], upit: string): StudentListItem[] {
  const q = normalizujUnos(upit);
  if (q === '') {
    return [];
  }
  const rang = (s: StudentListItem): number => {
    const indeks = normalizujUnos(s.indeks);
    if (indeks === q || normalizujUnos(formatIndeks(s.indeks, s.godina)) === q) {
      return 0;
    }
    if (indeks.startsWith(q) || normalizujUnos(formatIndeks(s.indeks, s.godina)).startsWith(q)) {
      return 1;
    }
    return normalizujUnos(s.prezime).startsWith(q) ? 2 : -1;
  };
  return studenti
    .map(s => ({ s, r: rang(s) }))
    .filter(x => x.r >= 0)
    .sort(
      (a, b) =>
        a.r - b.r ||
        (a.r === 2 ? indeksi.compare(a.s.prezime ?? '', b.s.prezime ?? '') : 0) ||
        indeksi.compare(a.s.indeks ?? '', b.s.indeks ?? '') ||
        a.s.id - b.s.id,
    )
    .map(x => x.s);
}

let sledeciId = 0;

/**
 * Brzi unos na live predavanju: kucaš indeks ("GD12") ili prezime, Enter bira jedini ili istaknuti pogodak
 * (`izabran` emituje id i polje se prazni), strelice menjaju istaknuti, Esc briše. ARIA combobox sa listbox-om.
 */
@Component({
  selector: 'app-brzi-unos',
  imports: [IndeksPipe, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="polje" [for]="idPolja">
      <mat-icon svgIcon="search" aria-hidden="true" />
      <span class="sr-only">Brzi unos: indeks ili prezime, Enter beleži prisustvo</span>
      <input
        [id]="idPolja"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Indeks ili prezime, Enter = prisutan"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="otvoreno()"
        [attr.aria-controls]="idListe"
        [attr.aria-activedescendant]="aktivniId()"
        [value]="upit()"
        (input)="kucanje($event)"
        (keydown)="taster($event)"
      />
    </label>
    @if (otvoreno()) {
      <ul class="lista" role="listbox" [id]="idListe" aria-label="Pronađeni studenti">
        @for (s of pogoci(); track s.id; let i = $index) {
          <li
            role="option"
            [id]="idListe + '-' + i"
            [attr.data-student]="s.id"
            [attr.aria-selected]="i === istaknut()"
            [class.istaknut]="i === istaknut()"
            (mousedown)="izaberi(s.id, $event)"
          >
            <span class="ime">{{ s.prezime }} {{ s.ime }}</span>
            <span class="indeks">{{ s.indeks | indeks: s.godina }}</span>
          </li>
        } @empty {
          <li class="prazno" role="option" aria-disabled="true" aria-selected="false">Nema studenta za „{{ upit() }}“.</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; flex: 1 1 280px; min-width: 0; max-width: 420px; }
    .polje { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 12px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--primary); background: var(--surface); color: var(--ink);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent); }
    .polje .mat-icon { color: var(--muted); flex: none; width: 20px; height: 20px; }
    input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit;
      font-size: 16px; font-weight: 600; }
    input::placeholder { color: var(--muted); font-weight: 400; }
    .lista { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px 0; list-style: none;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / .18)); }
    li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; cursor: pointer; }
    li.istaknut { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .ime { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .indeks { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 13px; white-space: nowrap; }
    .prazno { color: var(--muted); cursor: default; }
  `,
})
export class BrziUnos {
  readonly studenti = input.required<readonly StudentListItem[]>();
  readonly izabran = output<number>();

  protected readonly idPolja = `brzi-unos-${++sledeciId}`;
  protected readonly idListe = `${this.idPolja}-lista`;
  protected readonly upit = signal('');
  protected readonly istaknut = signal(0);

  protected readonly pogoci = computed(() => pogociBrzogUnosa(this.studenti(), this.upit()).slice(0, MAX_POGODAKA));
  protected readonly otvoreno = computed(() => normalizujUnos(this.upit()) !== '');
  protected readonly aktivniId = computed(() =>
    this.otvoreno() && this.pogoci().length > 0 ? `${this.idListe}-${Math.min(this.istaknut(), this.pogoci().length - 1)}` : null,
  );

  protected kucanje(e: Event): void {
    this.upit.set((e.target as HTMLInputElement).value);
    this.istaknut.set(0);
  }

  protected taster(e: KeyboardEvent): void {
    const n = this.pogoci().length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (n > 0) {
          e.preventDefault();
          this.istaknut.update(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
        }
        break;
      case 'Enter': {
        e.preventDefault();
        const s = this.pogoci()[Math.min(this.istaknut(), n - 1)];
        if (s) {
          this.izaberi(s.id);
        }
        break;
      }
      case 'Escape':
        if (this.upit() !== '') {
          e.preventDefault();
          e.stopPropagation(); // Esc ovde samo briše upit
          this.ocisti();
        }
        break;
    }
  }

  protected izaberi(id: number, e?: Event): void {
    e?.preventDefault(); // mousedown: fokus ostaje u polju za sledeći unos
    this.izabran.emit(id);
    this.ocisti();
  }

  private ocisti(): void {
    this.upit.set('');
    this.istaknut.set(0);
  }
}

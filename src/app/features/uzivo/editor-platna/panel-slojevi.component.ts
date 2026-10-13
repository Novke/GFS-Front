// Panel "Slojevi" editora platna (F4b): lista od vrha z-ose ka dnu, izbor, zaključavanje, skrivanje u editoru,
// preimenovanje i prevlačenje redosleda. Panel je van okvira platna, pa prečice platna ovde ne rade (odluka 24): put
// tastaturom je izbor ovde, pa Shift+Tab do okvira platna, pa strelice.
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { nazivSloja } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';

@Component({
  selector: 'app-panel-slojevi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDragHandle, CdkDropList, MatButtonModule, MatIconModule],
  template: `
    @if (redovi().length) {
      <ul class="uz-ep-slojevi" aria-label="Slojevi, od vrha ka dnu" cdkDropList (cdkDropListDropped)="spusteno($event)">
        @for (r of redovi(); track r.id) {
          <li class="uz-ep-sloj" cdkDrag cdkDragLockAxis="y" [attr.data-sloj-panel]="r.id"
              [class.uz-ep-sloj--izabran]="r.izabran" [class.uz-ep-sloj--skriven]="r.skriven">
            <mat-icon class="uz-ep-rucka" cdkDragHandle aria-hidden="true" svgIcon="drag_indicator" />
            @if (urednik() === r.id) {
              <input #polje class="uz-ep-naziv-polje" aria-label="Naziv sloja" maxlength="60" [value]="r.naziv"
                     (keydown.enter)="sacuvaj(r.id, polje.value)" (keydown.escape)="odustani(r.id)"
                     (blur)="sacuvaj(r.id, polje.value)">
            } @else {
              <button type="button" class="uz-ep-sloj-ime" [attr.aria-pressed]="r.izabran" (click)="izaberi(r.id, $event)">
                {{ r.naziv }}
              </button>
            }
            <!-- stalne labele uz aria-pressed (ARIA APG: stanje nosi aria-pressed, ne labela); tooltip kaže stanje -->
            <button mat-icon-button type="button" aria-label="Zaključaj" [attr.aria-pressed]="r.zakljucan"
                    [title]="r.zakljucan ? 'Zaključan (klik otključava)' : 'Zaključaj'"
                    (click)="store.zakljucaj(r.id, !r.zakljucan)">
              <mat-icon [svgIcon]="r.zakljucan ? 'lock' : 'lock_open'" />
            </button>
            <button mat-icon-button type="button" aria-label="Sakrij u editoru" [attr.aria-pressed]="r.skriven"
                    [title]="r.skriven ? 'Skriven u editoru (klik prikazuje)' : 'Sakrij u editoru'"
                    (click)="store.prebaciSkriven(r.id)">
              <mat-icon [svgIcon]="r.skriven ? 'visibility_off' : 'visibility'" />
            </button>
            <button mat-icon-button type="button" aria-label="Preimenuj" (click)="pocniPreimenovanje(r.id)">
              <mat-icon svgIcon="edit" />
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="uz-ep-napomena">Slajd još nema slojeva. Dodaj ih iz trake iznad platna.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .uz-ep-slojevi { list-style: none; margin: 0; padding: 4px 0; }
    .uz-ep-sloj {
      display: flex;
      align-items: center;
      gap: 2px;
      min-height: 40px;
      padding-inline: 4px;
      border-radius: var(--radius-sm);
      background: var(--surface);
    }
    .uz-ep-sloj--izabran { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .uz-ep-sloj--skriven .uz-ep-sloj-ime { color: var(--muted); }
    .uz-ep-rucka { flex: none; color: var(--muted); cursor: grab; }
    .uz-ep-sloj-ime, .uz-ep-naziv-polje {
      flex: 1;
      min-width: 0;
      min-height: 32px;
      font: inherit;
      color: inherit;
      text-align: start;
    }
    .uz-ep-sloj-ime {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding: 4px 6px;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      cursor: pointer;
    }
    .uz-ep-sloj-ime:focus-visible, .uz-ep-naziv-polje:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
    .uz-ep-naziv-polje {
      box-sizing: border-box;
      padding: 4px 6px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--ink);
    }
    .cdk-drag-preview { box-shadow: var(--shadow); }
    .cdk-drag-placeholder { opacity: 0.4; }
    .uz-ep-napomena { margin: 12px 4px; color: var(--ink-2); }
  `,
})
export class PanelSlojeviComponent {
  protected readonly store = inject(PlatnoEditorStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Id sloja čiji se naziv upravo menja (null = nijedan). */
  protected readonly urednik = signal<string | null>(null);

  /** Redovi od vrha z-ose ka dnu. */
  protected readonly redovi = computed(() => {
    const p = this.store.platno();
    const izbor = new Set(this.store.izbor());
    const skriveni = new Set(this.store.skriveni());
    return [...p.slojevi].reverse().map((s) => ({
      id: s.id, naziv: nazivSloja(p, s), izabran: izbor.has(s.id), zakljucan: s.zakljucan, skriven: skriveni.has(s.id),
    }));
  });

  protected izaberi(id: string, e: MouseEvent): void {
    if (e.shiftKey) this.store.prebaciIzbor(id);
    else this.store.izaberi([id]);
  }

  /** Indeksi u obrnutoj listi -> indeks u dokumentu (z-osa odozdo). */
  protected spusteno(e: CdkDragDrop<unknown>): void {
    const redovi = this.redovi();
    const r = redovi[e.previousIndex];
    if (!r || e.previousIndex === e.currentIndex) return;
    this.store.premestiSloj(r.id, redovi.length - 1 - e.currentIndex);
  }

  protected pocniPreimenovanje(id: string): void {
    this.urednik.set(id);
    afterNextRender(() => {
      const polje = this.host.querySelector<HTMLInputElement>('.uz-ep-naziv-polje');
      polje?.focus();
      polje?.select();
    }, { injector: this.injector });
  }

  /** Enter i izlazak iz polja čuvaju (prazno -> podrazumevani naziv); posle Enter-a fokus se vraća na "Preimenuj". */
  protected sacuvaj(id: string, naziv: string): void {
    if (this.urednik() !== id) return;
    const imaFokus = this.host.contains(document.activeElement);
    this.urednik.set(null);
    const sloj = this.store.platno().slojevi.find((s) => s.id === id);
    if (sloj && naziv.trim() !== nazivSloja(this.store.platno(), sloj)) this.store.preimenuj(id, naziv);
    if (imaFokus) this.vratiFokus(id);
  }

  protected odustani(id: string): void {
    if (this.urednik() !== id) return;
    this.urednik.set(null);
    this.vratiFokus(id);
  }

  private vratiFokus(id: string): void {
    afterNextRender(() => {
      const red = Array.from(this.host.querySelectorAll<HTMLElement>('[data-sloj-panel]')).find((r) => r.dataset['slojPanel'] === id);
      red?.querySelector<HTMLElement>('button[aria-label="Preimenuj"]')?.focus();
    }, { injector: this.injector });
  }
}

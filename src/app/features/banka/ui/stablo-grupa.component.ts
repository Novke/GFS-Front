import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DOCUMENT, effect, ElementRef, inject, Injector, input, output, signal,
  untracked,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

import { sRecju } from '../../../shared/util/mnozina';
import { GrupaCvor, nadjiCvor, putanjaDo } from '../data-access/banka.models';

/** Najveća dubina stabla (koren = 1), kao `GrupaZadatakaService.MAX_DUBINA`. */
export const MAX_DUBINA_STABLA = 6;

/** Vidljiva stavka u redosledu prikaza (za strelice): roditelj `null` je koren. */
interface Vidljiva {
  c: GrupaCvor;
  roditeljId: number | null;
}

/**
 * "1 aktivna, 3 nacrta, 2 Klodova nacrta, 1 greška, isključeno" (samo brojači veći od nule, pa isključenje teme) ili prazno.
 */
export function opisBrojaca(c: Pick<GrupaCvor, 'brojAktivnih' | 'brojNacrta' | 'brojGresaka' | 'brojClaudeNacrta' | 'iskljucena'>): string {
  return [
    c.brojAktivnih ? sRecju(c.brojAktivnih, 'aktivna', 'aktivne', 'aktivnih') : null,
    c.brojNacrta ? sRecju(c.brojNacrta, 'nacrt', 'nacrta', 'nacrta') : null,
    c.brojClaudeNacrta ? sRecju(c.brojClaudeNacrta, 'Klodov nacrt', 'Klodova nacrta', 'Klodovih nacrta') : null,
    c.brojGresaka ? sRecju(c.brojGresaka, 'greška', 'greške', 'grešaka') : null,
    c.iskljucena ? 'isključeno' : null,
  ].filter(Boolean).join(', ');
}

/** List sa varijantama ne prima podgrupe (server: 409), a ni čvor na najvećoj dubini (400). */
export function mozePodgrupu(c: GrupaCvor, dubina: number): boolean {
  return !(c.list && c.brojVarijanti > 0) && dubina < MAX_DUBINA_STABLA;
}

/**
 * Stablo grupa banke (WAI-ARIA tree): `<ul role="tree">`, stavke `treeitem` sa `aria-expanded` (samo čvor sa decom) i
 * `aria-selected`, deca u `role="group"`. Jedna stavka je u Tab redu (roving tabindex), uz nju i njeno dugme menija.
 * Tasteri na stavci: gore/dole (vidljive stavke), Home/End, levo (sklopi, pa roditelj), desno (rasklopi, pa prvo dete), Enter
 * i razmak (izaberi), F2 (preimenuj u stablu: Enter čuva, Esc odustaje, izlazak iz polja čuva). Meni stavke: Dodaj podgrupu,
 * Preimenuj, Premesti u…, Obriši. Bedževi (samo vizuelni, brojevi su i u imenu stavke): aktivne, nacrti, "Klod: N" (Klodovi
 * nacrti), greške; isključena grupa (sopstvena tema ili tema pretka, Klod je ne nudi) je prigušena (`bk-iskljucen`) sa oznakom
 * "Isključeno". Komponenta ništa ne menja sama: emituje nameru, stranica zove store.
 */
@Component({
  selector: 'app-stablo-grupa',
  imports: [MatIcon, MatIconButton, MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stablo-grupa.component.css',
  template: `
    <ul role="tree" class="bk-stablo" [attr.aria-label]="oznaka()">
      <ng-container *ngTemplateOutlet="nivo; context: { $implicit: cvorovi(), dubina: 1 }" />
    </ul>

    <ng-template #nivo let-lista let-dubina="dubina">
      @for (c of $any(lista); track c.id) {
        <li role="treeitem" class="bk-stavka" [attr.data-id]="c.id" [attr.aria-label]="ime(c)"
          [attr.aria-expanded]="c.deca.length ? !skupljen(c.id) : null" [attr.aria-selected]="c.id === izabrano()"
          [tabindex]="c.id === tabStop() ? 0 : -1" (focus)="fokusId.set(c.id)" (click)="klik($event, c)" (keydown)="tipka($event, c)">
          <div class="bk-red" [class.bk-izabran]="c.id === izabrano()" [class.bk-iskljucen]="c.iskljucena" [style.--bk-dubina]="dubina - 1">
            <span class="bk-strelica" aria-hidden="true">
              @if (c.deca.length) {
                <mat-icon [svgIcon]="skupljen(c.id) ? 'chevron_right' : 'expand_more'" />
              }
            </span>
            @if (urediId() === c.id) {
              <input class="bk-preimenuj" type="text" maxlength="120" autocomplete="off" [value]="c.naziv"
                [attr.aria-label]="'Nov naziv grupe ' + c.naziv" (keydown)="tipkaPolja($event, c)" (blur)="zavrsi(c, $any($event.target).value, true, false)" />
            } @else {
              <span class="bk-naziv">{{ c.naziv }}</span>
            }
            <span class="bk-bedzevi" aria-hidden="true">
              @if (c.brojAktivnih) {
                <span class="bk-bedz bk-bedz-aktivne" title="Aktivne"><mat-icon svgIcon="check_circle" />{{ c.brojAktivnih }}</span>
              }
              @if (c.brojNacrta) {
                <span class="bk-bedz bk-bedz-nacrti" title="Nacrti"><mat-icon svgIcon="edit" />{{ c.brojNacrta }}</span>
              }
              @if (c.brojClaudeNacrta) {
                <span class="bk-bedz bk-bedz-claude" title="Klodovi nacrti">Klod: {{ c.brojClaudeNacrta }}</span>
              }
              @if (c.brojGresaka) {
                <span class="bk-bedz bk-bedz-greske" title="Greške u LaTeX-u"><mat-icon svgIcon="error" />{{ c.brojGresaka }}</span>
              }
              @if (c.iskljucena) {
                <span class="bk-bedz bk-bedz-iskljuceno" title="Klod ne nudi ovu temu">Isključeno</span>
              }
            </span>
            <button matIconButton type="button" class="bk-meni-dugme" [matMenuTriggerFor]="meni" [matMenuTriggerData]="{ c: c, dubina: dubina }"
              [tabindex]="c.id === tabStop() ? 0 : -1" [attr.aria-label]="'Radnje za grupu ' + c.naziv" (menuClosed)="posleMenija()">
              <mat-icon svgIcon="more_vert" aria-hidden="true" />
            </button>
          </div>
          @if (c.deca.length && !skupljen(c.id)) {
            <ul role="group">
              <ng-container *ngTemplateOutlet="nivo; context: { $implicit: c.deca, dubina: dubina + 1 }" />
            </ul>
          }
        </li>
      }
    </ng-template>

    <mat-menu #meni="matMenu" xPosition="before">
      <ng-template matMenuContent let-c="c" let-dubina="dubina">
        <button mat-menu-item type="button" disabledInteractive [disabled]="zauzeto() || !mozePodgrupu(c, dubina)"
          (click)="podgrupa(c, dubina)">
          <mat-icon svgIcon="add" aria-hidden="true" />Dodaj podgrupu
        </button>
        <button mat-menu-item type="button" (click)="cekaPreimenovanje = c.id"><mat-icon svgIcon="edit" aria-hidden="true" />Preimenuj</button>
        <button mat-menu-item type="button" (click)="premesti.emit(c.id)"><mat-icon svgIcon="swap_horiz" aria-hidden="true" />Premesti u…</button>
        <button mat-menu-item type="button" disabledInteractive [disabled]="zauzeto() || c.deca.length > 0" (click)="brisi(c)">
          <mat-icon svgIcon="delete" aria-hidden="true" />Obriši
        </button>
      </ng-template>
    </mat-menu>
  `,
})
export class StabloGrupaComponent {
  readonly cvorovi = input.required<readonly GrupaCvor[]>();
  readonly izabrano = input<number | null>(null);
  /** Kreiranje ili brisanje je u toku: "Dodaj podgrupu" i "Obriši" su onemogućeni. */
  readonly zauzeto = input(false);
  readonly oznaka = input('Grupe zadataka');

  readonly izaberi = output<number>();
  readonly dodajPodgrupu = output<number | null>();
  readonly preimenuj = output<{ id: number; naziv: string }>();
  readonly premesti = output<number>();
  readonly obrisi = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  protected readonly mozePodgrupu = mozePodgrupu;
  /** Stavka koja je poslednja imala fokus (Tab se vraća na nju). */
  protected readonly fokusId = signal<number | null>(null);
  protected readonly urediId = signal<number | null>(null);
  private readonly skupljeni = signal<ReadonlySet<number>>(new Set());
  /** "Preimenuj" iz menija: polje se otvara tek kad se meni zatvori (meni vraća fokus na svoje dugme). */
  protected cekaPreimenovanje: number | null = null;
  /** "Obriši" iz menija: kad grupa nestane iz stabla, fokus (ostao na nestalom dugmetu menija) ide njenom roditelju. */
  private brisanje: { id: number; roditeljId: number | null } | null = null;

  /** Vidljive stavke redom prikaza (deca sklopljenih čvorova se preskaču). */
  private readonly vidljive = computed<Vidljiva[]>(() => {
    const skupljeni = this.skupljeni();
    const lista: Vidljiva[] = [];
    const obidji = (cvorovi: readonly GrupaCvor[], roditeljId: number | null) => {
      for (const c of cvorovi) {
        lista.push({ c, roditeljId });
        if (!skupljeni.has(c.id)) {
          obidji(c.deca, c.id);
        }
      }
    };
    obidji(this.cvorovi(), null);
    return lista;
  });

  /** Stavka u Tab redu: poslednja fokusirana, inače izabrana, inače prva (ako je vidljiva). */
  protected readonly tabStop = computed<number | null>(() => {
    const vidljive = this.vidljive();
    const ima = (id: number | null) => id !== null && vidljive.some(v => v.c.id === id);
    const fokus = this.fokusId();
    const izabrano = this.izabrano();
    return ima(fokus) ? fokus : ima(izabrano) ? izabrano : (vidljive[0]?.c.id ?? null);
  });

  constructor() {
    // izabrana grupa mora biti vidljiva: preci se rasklapaju (izbor iz URL-a, nova grupa, povratak iz editora)
    effect(() => {
      const preci = putanjaDo(this.cvorovi(), this.izabrano()).slice(0, -1).map(p => p.id);
      untracked(() => {
        if (preci.some(id => this.skupljeni().has(id))) {
          this.skupljeni.update(s => new Set([...s].filter(id => !preci.includes(id))));
        }
      });
    });

    // posle brisanja (novo stablo bez grupe) fokus na roditelja, ili na stavku u Tab redu za grupu u korenu; otkazano ili
    // neuspelo brisanje (grupa je i dalje tu) ne pomera ništa
    effect(() => {
      const cvorovi = this.cvorovi();
      untracked(() => {
        const b = this.brisanje;
        this.brisanje = null;
        if (b && !nadjiCvor(cvorovi, b.id)) {
          afterNextRender(() => {
            const id = b.roditeljId ?? this.tabStop();
            if (id !== null && this.fokusIzgubljen()) {
              this.fokusiraj(id);
            }
          }, { injector: this.injector });
        }
      });
    });
  }

  protected skupljen(id: number): boolean {
    return this.skupljeni().has(id);
  }

  protected ime(c: GrupaCvor): string {
    const opis = opisBrojaca(c);
    return opis ? `${c.naziv}, ${opis}` : c.naziv;
  }

  protected klik(e: MouseEvent, c: GrupaCvor): void {
    const meta = e.target as Element;
    // klik pripada najdubljoj stavci; dugme menija i polje za naziv imaju svoje rukovanje
    if (meta.closest('[role=treeitem]') !== e.currentTarget || meta.closest('button, input')) {
      return;
    }
    this.fokusiraj(c.id);
    if (meta.closest('.bk-strelica') && c.deca.length) {
      this.prebaci(c.id);
    } else {
      this.izaberi.emit(c.id);
    }
  }

  protected tipka(e: KeyboardEvent, c: GrupaCvor): void {
    if (e.target !== e.currentTarget) {
      return; // dugme menija, polje za naziv ili dublja stavka (događaj se penje kroz pretke)
    }
    const vidljive = this.vidljive();
    const i = vidljive.findIndex(v => v.c.id === c.id);
    const imaDecu = c.deca.length > 0;
    switch (e.key) {
      case 'ArrowDown':
        this.pomeri(vidljive[i + 1]);
        break;
      case 'ArrowUp':
        this.pomeri(vidljive[i - 1]);
        break;
      case 'Home':
        this.pomeri(vidljive[0]);
        break;
      case 'End':
        this.pomeri(vidljive.at(-1));
        break;
      case 'ArrowRight':
        if (imaDecu && this.skupljen(c.id)) {
          this.prebaci(c.id);
        } else if (imaDecu) {
          this.fokusiraj(c.deca[0].id);
        }
        break;
      case 'ArrowLeft':
        if (imaDecu && !this.skupljen(c.id)) {
          this.prebaci(c.id);
        } else if (vidljive[i]?.roditeljId !== null && vidljive[i]?.roditeljId !== undefined) {
          this.fokusiraj(vidljive[i].roditeljId!);
        }
        break;
      case 'Enter':
      case ' ':
        this.izaberi.emit(c.id);
        break;
      case 'F2':
        this.zapocni(c.id);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  protected tipkaPolja(e: KeyboardEvent, c: GrupaCvor): void {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // Esc ne sme da zatvori dijalog ili meni oko stabla
      this.zavrsi(c, (e.target as HTMLInputElement).value, e.key === 'Enter', true);
    }
  }

  /** Kraj preimenovanja (Enter, Esc ili izlazak iz polja); drugi poziv za isto polje (blur posle Enter-a) ne radi ništa. */
  protected zavrsi(c: GrupaCvor, vrednost: string, sacuvaj: boolean, vratiFokus: boolean): void {
    if (this.urediId() !== c.id) {
      return;
    }
    this.urediId.set(null);
    const naziv = vrednost.trim();
    if (sacuvaj && naziv !== '' && naziv !== c.naziv) {
      this.preimenuj.emit({ id: c.id, naziv });
    }
    if (vratiFokus) {
      this.fokusiraj(c.id);
    }
  }

  protected podgrupa(c: GrupaCvor, dubina: number): void {
    if (!this.zauzeto() && mozePodgrupu(c, dubina)) {
      this.dodajPodgrupu.emit(c.id);
    }
  }

  protected brisi(c: GrupaCvor): void {
    if (!this.zauzeto() && c.deca.length === 0) {
      this.brisanje = { id: c.id, roditeljId: putanjaDo(this.cvorovi(), c.id).at(-2)?.id ?? null };
      this.obrisi.emit(c.id);
    }
  }

  protected posleMenija(): void {
    const id = this.cekaPreimenovanje;
    this.cekaPreimenovanje = null;
    if (id !== null) {
      this.zapocni(id);
    }
  }

  private zapocni(id: number): void {
    this.fokusId.set(id);
    this.urediId.set(id);
    afterNextRender(() => {
      const polje = this.stavka(id)?.querySelector<HTMLInputElement>('input.bk-preimenuj');
      polje?.focus();
      polje?.select();
    }, { injector: this.injector });
  }

  private prebaci(id: number): void {
    this.skupljeni.update(s => {
      const novi = new Set(s);
      if (!novi.delete(id)) {
        novi.add(id);
      }
      return novi;
    });
  }

  private pomeri(v: Vidljiva | undefined): void {
    if (v) {
      this.fokusiraj(v.c.id);
    }
  }

  /** Fokus na stavku; dete tek rasklopljenog čvora (brzo "desno, desno") još nije nacrtano, pa dobija fokus posle crtanja. */
  private fokusiraj(id: number): void {
    this.fokusId.set(id);
    const stavka = this.stavka(id);
    if (stavka) {
      stavka.focus();
    } else {
      afterNextRender(() => this.stavka(id)?.focus(), { injector: this.injector });
    }
  }

  /** Fokus je nestao sa stranice (fokusiran element je uklonjen), pa ga niko neće vratiti; korisnikov novi fokus se ne dira. */
  private fokusIzgubljen(): boolean {
    const aktivni = this.document.activeElement;
    return !aktivni || aktivni === this.document.body;
  }

  private stavka(id: number): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`[role=treeitem][data-id="${id}"]`);
  }
}

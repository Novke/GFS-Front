// "Tabela" u traci (F14, odluka 23): dugme otvara CDK popover (ne `mat-menu`: meni se zatvara na klik i njegov typeahead
// guta cifre) sa poljima Redova i Kolona (1-30, podrazumevano 3) i dugmetom "Ubaci" (i Enter). Fokus: na otvaranju prvo
// polje (sadržaj izabran); Esc i klik van vraćaju ga na dugme; posle "Ubaci" ga traka prebacuje na okvir platna (i kad je ubacivanje
// odbijeno), pa zamka fokusa namerno nema `autoCapture` (njeno vraćanje fokusa na dugme bi to pregazilo).
import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, output, signal, viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { POLOZAJI } from './izbor-boje.component';
import { MAX_KOLONA, MAX_REDOVA } from './tabela';

export interface VelicinaTabele { redova: number; kolona: number; }

/** Ceo broj 1..max iz polja; inače null. */
function broj(tekst: string, max: number): number | null {
  const n = /^\d{1,2}$/.test(tekst.trim()) ? Number(tekst) : 0;
  return n >= 1 && n <= max ? n : null;
}

@Component({
  selector: 'app-ubaci-tabelu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, CdkConnectedOverlay, CdkOverlayOrigin, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <button #dugme mat-icon-button type="button" aria-label="Tabela" title="Tabela" cdkOverlayOrigin #izvor="cdkOverlayOrigin"
            aria-haspopup="dialog" [attr.aria-expanded]="otvoreno()" (click)="otvoreno() ? zatvori() : otvori()">
      <mat-icon svgIcon="table" />
    </button>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="izvor" [cdkConnectedOverlayOpen]="otvoreno()"
                 [cdkConnectedOverlayPositions]="polozaji" [cdkConnectedOverlayHasBackdrop]="true"
                 cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                 (backdropClick)="zatvori()" (detach)="otvoreno.set(false)" (overlayKeydown)="$event.key === 'Escape' && zatvori()">
      <div class="uz-ep-ubaci-tabelu" role="dialog" aria-label="Ubaci tabelu" cdkTrapFocus>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Redova</mat-label>
          <input #prvo matInput type="number" min="1" [max]="maxRedova" [value]="redova()" [attr.aria-invalid]="!redovaBroj()"
                 (input)="redova.set($any($event.target).value)" (keydown.enter)="potvrdi()">
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Kolona</mat-label>
          <input matInput type="number" min="1" [max]="maxKolona" [value]="kolona()" [attr.aria-invalid]="!kolonaBroj()"
                 (input)="kolona.set($any($event.target).value)" (keydown.enter)="potvrdi()">
        </mat-form-field>
        <button mat-flat-button type="button" [disabled]="!redovaBroj() || !kolonaBroj()" (click)="potvrdi()">Ubaci</button>
      </div>
    </ng-template>
  `,
  styles: `
    .uz-ep-ubaci-tabelu {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 220px; padding: 12px;
      border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink);
      box-shadow: var(--shadow);
    }
    .uz-ep-ubaci-tabelu button { grid-column: 1 / -1; }
  `,
})
export class UbaciTabeluComponent {
  readonly ubaci = output<VelicinaTabele>();

  private readonly injector = inject(Injector);
  private readonly dugme = viewChild.required('dugme', { read: ElementRef<HTMLButtonElement> });
  private readonly prvo = viewChild<ElementRef<HTMLInputElement>>('prvo');
  protected readonly polozaji = POLOZAJI;
  protected readonly maxRedova = MAX_REDOVA;
  protected readonly maxKolona = MAX_KOLONA;
  protected readonly otvoreno = signal(false);
  protected readonly redova = signal('3');
  protected readonly kolona = signal('3');
  protected readonly redovaBroj = computed(() => broj(this.redova(), MAX_REDOVA));
  protected readonly kolonaBroj = computed(() => broj(this.kolona(), MAX_KOLONA));

  protected otvori(): void {
    this.otvoreno.set(true);
    // sadržaj izabran: kucanje "5" zamenjuje podrazumevano "3" (ne daje "35")
    afterNextRender(() => {
      const polje = this.prvo()?.nativeElement;
      polje?.focus();
      polje?.select();
    }, { injector: this.injector });
  }

  /** Esc, klik van ili ponovni klik na dugme: bez ubacivanja, fokus na dugme. */
  protected zatvori(): void {
    if (!this.otvoreno()) return;
    this.otvoreno.set(false);
    this.dugme().nativeElement.focus();
  }

  protected potvrdi(): void {
    const redova = this.redovaBroj();
    const kolona = this.kolonaBroj();
    if (!redova || !kolona) return;
    this.otvoreno.set(false);
    this.ubaci.emit({ redova, kolona });
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { MedijInfo, medijUrl } from '../data-access/uzivo.models';

/** Isto kao backend (`spring.servlet.multipart.max-file-size=10MB`, `MedijService`). */
export const MAX_SLIKA_BAJTOVA = 10 * 1024 * 1024;
export const TIPOVI_SLIKA: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const PORUKA_VELICINA = 'Slika je veća od 10 MB.';
export const PORUKA_TIP = 'Dozvoljene su samo slike PNG, JPEG, GIF i WebP.';

/** Provera pre slanja (poruke iste kao na serveru); `null` = može da se šalje. */
export function proveriSliku(fajl: { size: number; type: string }): string | null {
  if (fajl.size > MAX_SLIKA_BAJTOVA) return PORUKA_VELICINA;
  if (!TIPOVI_SLIKA.includes(fajl.type)) return PORUKA_TIP;
  return null;
}

/** Slika slajda ili pitanja: upload (`POST /mediji`), pregled, zamena i uklanjanje; greška iz `reason`. */
@Component({
  selector: 'app-slika-polje',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="uz-ed-slika">
      @if (slikaId(); as id) {
        <img class="uz-ed-slika-pregled" [src]="url(id)" [alt]="oznaka()">
      }
      <div class="uz-ed-slika-akcije">
        <button mat-stroked-button type="button" [disabled]="salje()" (click)="fajl.click()">
          <mat-icon>image</mat-icon>{{ slikaId() ? 'Zameni sliku' : 'Dodaj sliku' }}
        </button>
        @if (slikaId()) {
          <button mat-button type="button" [disabled]="salje()" (click)="ukloni()">
            <mat-icon>hide_image</mat-icon>Ukloni sliku
          </button>
        }
        <span class="uz-ed-napomena">PNG, JPEG, GIF ili WebP, do 10 MB</span>
        <input #fajl type="file" hidden [accept]="tipovi" (change)="izabrano(fajl)">
      </div>
      @if (salje()) {
        <mat-progress-bar mode="indeterminate" aria-label="Slanje slike" />
      }
      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }
    </div>
  `,
})
export class SlikaPoljeComponent {
  readonly slikaId = input<string | null>(null);
  readonly oznaka = input('Slika');
  /** Nova slika posle uspešnog slanja, ili `null` kad se ukloni. */
  readonly promena = output<MedijInfo | null>();

  private readonly api = inject(PrezentacijeApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly url = medijUrl;
  protected readonly tipovi = TIPOVI_SLIKA.join(',');
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  protected izabrano(polje: HTMLInputElement): void {
    const fajl = polje.files?.[0];
    polje.value = '';
    if (!fajl) return;
    const greska = proveriSliku(fajl);
    this.greska.set(greska);
    if (greska) return;
    this.salje.set(true);
    this.api.upload(fajl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: m => {
        this.salje.set(false);
        this.promena.emit(m);
      },
      error: e => {
        this.salje.set(false);
        this.greska.set(razlogGreske(e, 'Slanje slike nije uspelo.'));
      },
    });
  }

  protected ukloni(): void {
    this.greska.set(null);
    this.promena.emit(null);
  }
}

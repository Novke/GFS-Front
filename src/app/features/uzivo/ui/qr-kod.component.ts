import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, signal, viewChild } from '@angular/core';
import { toCanvas } from 'qrcode';

/**
 * QR kod na canvas-u (paket `qrcode`, kao `onboarding-qr`). `velicina` je rezolucija crteža u px; prikazanu širinu
 * određuje roditelj (canvas se rasteže na širinu elementa, bez zamućenja ivica modula).
 */
@Component({
  selector: 'gfs-qr-kod',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-qr' },
  template: `
    <canvas #platno class="uz-qr-platno" role="img" [attr.aria-label]="'QR kod: ' + tekst()"></canvas>
    @if (greska()) { <p class="uz-qr-greska" role="alert">QR kod nije mogao da se nacrta.</p> }
  `,
})
export class QrKodComponent {
  readonly tekst = input.required<string>();
  readonly velicina = input<number>(512);

  private readonly platno = viewChild.required<ElementRef<HTMLCanvasElement>>('platno');
  protected readonly greska = signal(false);

  constructor() {
    afterRenderEffect(() => {
      const canvas = this.platno().nativeElement;
      const tekst = this.tekst();
      const velicina = this.velicina();
      if (!tekst) {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      toCanvas(canvas, tekst, { width: velicina, margin: 2, errorCorrectionLevel: 'M' })
        .then(() => this.greska.set(false), () => this.greska.set(true));
    });
  }
}

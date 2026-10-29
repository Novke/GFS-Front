import { ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { uredjajIz } from '../../../core/pwa/instalacija.pravila';
import { CitacQr, IzvorSlike, napraviCitac } from '../data-access/citac-qr';
import { PORUKA_NIJE_NAS_QR, tokenIzQr, uputstvoZaKameru } from '../data-access/skener.pravila';

/**
 * - `zatvoren`: dugme „Skeniraj QR sa table“;
 * - `pre-dozvole`: kratko objašnjenje pre zahteva za kameru (preskače se kad je dozvola već data);
 * - `kamera`: živa slika zadnje kamere i čitanje kadrova;
 * - `odbijeno`: kamera odbijena ili je nema: uputstvo, „Slikaj tablu“ i poslednja rezerva (kamera telefona).
 */
type Faza = 'zatvoren' | 'pre-dozvole' | 'pokretanje' | 'kamera' | 'odbijeno';

/** Razmak između dva čitanja kadra (jsqr na starom telefonu traje ~100 ms). */
const RAZMAK_MS = 300;

/**
 * Skener QR-a za čekiranje unutar aplikacije (spec „Aplikacija i obaveštenja“ 4.5): student ostaje u aplikaciji umesto da
 * otvara kameru telefona (na iPhone-u bi ga ona odvela u Safari). Prihvata samo `nalog/cas/<token>` sa istog origina
 * (`tokenIzQr`) i vodi na postojeću rutu čekiranja, bez novog API-ja. Ako kamere nema ili je odbijena: „Slikaj tablu“
 * (`capture="environment"`, sistemska kamera bez dozvole sajtu), pa tekst „Otvori kameru telefona…“ kao danas.
 * Čitač (`BarcodeDetector` ili lenji `jsqr`) se učitava tek na dodir. Kamera se gasi pri zatvaranju, pogotku i odlasku.
 */
@Component({
  selector: 'app-skener-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (faza()) {
      @case ('zatvoren') {
        <button type="button" class="dugme glavno" (click)="otvori()" data-skeniraj>Skeniraj QR sa table</button>
      }
      @case ('pre-dozvole') {
        <div class="okvir" data-pre-dozvole>
          <p class="tekst">Treba nam kamera samo za QR sa table. Slobodno dozvoli.</p>
          <div class="akcije">
            <button type="button" class="dugme glavno" (click)="pokreniKameru()" data-ukljuci-kameru>Uključi kameru</button>
            <button type="button" class="dugme" (click)="zatvori()">Otkaži</button>
          </div>
        </div>
      }
      @case ('odbijeno') {
        <div class="okvir" data-kamera-odbijena>
          @if (bezKamere()) {
            <p class="tekst">Ovaj browser ne može da koristi kameru ovde. Slikaj tablu, pa ćemo pročitati QR sa slike.</p>
          } @else {
            <p class="tekst"><strong>Bez brige: dozvoli kameru ovde.</strong> Služi samo za QR sa table.</p>
            <p class="pomoc">{{ uputstvo }}</p>
          }
          <div class="akcije">
            <button type="button" class="dugme glavno" (click)="fajl.click()" data-slikaj>Slikaj tablu</button>
            @if (!bezKamere()) {
              <button type="button" class="dugme" (click)="pokreniKameru()">Pokušaj ponovo</button>
            }
            <button type="button" class="dugme" (click)="zatvori()">Zatvori</button>
          </div>
        </div>
      }
      @default {
        <div class="okvir kamera" data-kamera>
          <video #video class="video" muted playsinline aria-label="Kamera: usmeri je na QR sa table"></video>
          <span class="nisan" aria-hidden="true"></span>
          <div class="akcije">
            <button type="button" class="dugme" (click)="zatvori()">Zatvori kameru</button>
          </div>
        </div>
      }
    }
    <input #fajl class="skriveno" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true"
           (change)="izSlike($event)" data-fajl />
    @if (poruka(); as p) {
      <p class="poruka" role="status" data-poruka-skenera>{{ p }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .okvir { padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
    .kamera { position: relative; padding: 8px; }
    .video { display: block; width: 100%; max-height: 60vh; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm);
      background: var(--ink); }
    .nisan { position: absolute; inset: 22% 22% auto; aspect-ratio: 1; border: 3px solid var(--accent, var(--primary));
      border-radius: 12px; pointer-events: none; }
    .tekst { margin: 0; }
    .pomoc { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .dugme { min-height: 48px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .dugme.glavno { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
    :host > .dugme.glavno { width: 100%; font-size: 16px; }
    .dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .poruka { margin: 8px 0 0; font-size: 14px; }
    .skriveno { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  `,
})
export class SkenerQr {
  private readonly router = inject(Router);
  private readonly dokument = inject(DOCUMENT);

  protected readonly faza = signal<Faza>('zatvoren');
  protected readonly poruka = signal<string | null>(null);
  protected readonly bezKamere = signal(false);
  protected readonly uputstvo = uputstvoZaKameru(uredjajIz(navigator.userAgent, navigator.maxTouchPoints ?? 0));

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  private citac: Promise<CitacQr> | null = null;
  private tok: MediaStream | null = null;
  private tajmer: ReturnType<typeof setTimeout> | null = null;
  private gotovo = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.gotovo = true;
      this.ugasi();
    });
  }

  protected async otvori(): Promise<void> {
    this.poruka.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.bezKamere.set(true);
      this.faza.set('odbijeno');
      return;
    }
    this.ucitajCitac();
    this.faza.set((await this.dozvolaVecData()) ? 'pokretanje' : 'pre-dozvole');
    if (this.faza() === 'pokretanje') {
      await this.pokreniKameru();
    }
  }

  protected async pokreniKameru(): Promise<void> {
    this.poruka.set(null);
    this.faza.set('pokretanje');
    try {
      this.tok = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      const ime = (e as { name?: string }).name;
      this.bezKamere.set(ime === 'NotFoundError' || ime === 'OverconstrainedError' || ime === 'NotReadableError');
      this.faza.set('odbijeno');
      return;
    }
    if (this.gotovo) {
      this.ugasi();
      return;
    }
    this.faza.set('kamera');
    // video element postoji tek posle sledećeg crtanja
    setTimeout(() => void this.pustiVideo(), 0);
  }

  protected zatvori(): void {
    this.ugasi();
    this.poruka.set(null);
    this.faza.set('zatvoren');
  }

  protected async izSlike(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) {
      return;
    }
    this.poruka.set('Čitam QR sa slike…');
    try {
      const slika = await this.ucitajSliku(f);
      const tekstovi = await (await this.ucitajCitac())(slika);
      if (!this.pogodak(tekstovi)) {
        this.poruka.set(tekstovi.length > 0
          ? PORUKA_NIJE_NAS_QR
          : 'Na slici nema QR-a. Slikaj ponovo izbliza, ili otvori kameru telefona i skeniraj QR sa table.');
      }
    } catch {
      this.poruka.set('Slika ne može da se pročita. Otvori kameru telefona i skeniraj QR sa table.');
    }
  }

  private ucitajCitac(): Promise<CitacQr> {
    this.citac ??= napraviCitac(this.dokument).catch(err => {
      this.citac = null;
      throw err;
    });
    return this.citac;
  }

  private async dozvolaVecData(): Promise<boolean> {
    try {
      const s = await navigator.permissions?.query({ name: 'camera' as PermissionName });
      return s?.state === 'granted';
    } catch {
      return false;
    }
  }

  private async pustiVideo(): Promise<void> {
    const v = this.video()?.nativeElement;
    if (!v || !this.tok) {
      return;
    }
    v.srcObject = this.tok;
    try {
      await v.play();
    } catch {
      // iOS ponekad odbije play bez dodira; kadar se svejedno crta jer je video utišan i playsinline
    }
    this.citajKadar(v);
  }

  private citajKadar(v: HTMLVideoElement): void {
    this.tajmer = setTimeout(async () => {
      if (this.gotovo || this.faza() !== 'kamera') {
        return;
      }
      try {
        // ništa ili tuđ QR: skeniranje se nastavlja (poruku postavlja pogodak)
        if (v.readyState >= 2) {
          this.pogodak(await (await this.ucitajCitac())(v));
        }
      } catch {
        this.poruka.set('Čitač QR-a nije dostupan. Otvori kameru telefona i skeniraj QR sa table.');
        this.zatvoriKameru();
        return;
      }
      if (this.faza() === 'kamera') {
        this.citajKadar(v);
      }
    }, RAZMAK_MS);
  }

  /** Naš QR vodi na čekiranje; tuđ ostavlja poruku. Vraća da li je pogođen naš. */
  private pogodak(tekstovi: string[]): boolean {
    for (const t of tekstovi) {
      const token = tokenIzQr(t, this.dokument.baseURI);
      if (token) {
        this.ugasi();
        this.faza.set('zatvoren');
        this.poruka.set(null);
        void this.router.navigateByUrl(`/nalog/cas/${encodeURIComponent(token)}`);
        return true;
      }
    }
    if (tekstovi.length > 0) {
      this.poruka.set(PORUKA_NIJE_NAS_QR);
    }
    return false;
  }

  private ucitajSliku(f: File): Promise<IzvorSlike> {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(f, { imageOrientation: 'from-image' });
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('slika'));
      };
      img.src = url;
    });
  }

  private zatvoriKameru(): void {
    this.ugasi();
    this.faza.set('zatvoren');
  }

  private ugasi(): void {
    if (this.tajmer !== null) {
      clearTimeout(this.tajmer);
      this.tajmer = null;
    }
    this.tok?.getTracks().forEach(t => t.stop());
    this.tok = null;
    const v = this.video()?.nativeElement;
    if (v) {
      v.srcObject = null;
    }
  }
}

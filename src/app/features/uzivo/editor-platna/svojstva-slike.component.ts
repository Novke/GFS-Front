// Svojstva slike (F6, odluka 29): "Zameni sliku" (otpremanje, kutija i ostalo ostaju) i isečak levo/gore/desno/dole u %
// (0-99; zbir levo + desno i gore + dole mora biti manji od 100, kao na serveru, inače poruka i bez izmene).
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NotificationStore } from '../../../core/state/notification.store';
import type { SlikaSloj } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import { izmeniSlojeve } from './komande';
import { OtpremanjeSlike, PRIHVACENE_SLIKE_PANELA } from './otpremanje-slike';
import { PlatnoEditorStore } from './platno-editor.store';

type Strana = 'levo' | 'gore' | 'desno' | 'dole';
export const PORUKA_ISECKA = 'Isečak slike nije ispravan.';

@Component({
  selector: 'app-svojstva-slike',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrojcanoPoljeComponent, MatButtonModule],
  template: `
    @let z = sloj().zakljucan;
    <h3 class="uz-ep-odeljak">Slika</h3>
    <div class="uz-ep-red">
      <button mat-stroked-button type="button" [disabled]="z || otpremanje.salje()" (click)="fajl.click()">Zameni sliku</button>
      <span role="status">{{ otpremanje.salje() ? 'Slika se otprema…' : '' }}</span>
      <input #fajl type="file" hidden [accept]="prihvacene" (change)="izabrano(fajl)">
    </div>
    <h3 class="uz-ep-odeljak">Isečak</h3>
    <div class="uz-ep-polja">
      @for (s of strane; track s.strana) {
        <app-brojcano-polje [oznaka]="s.naziv" jedinica="%" [vrednost]="isecak()[s.strana]" [min]="0" [max]="99"
                            [onemoguceno]="z" (promena)="postaviIsecak(s.strana, $event)" />
      }
    </div>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-red { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ink-2); }
    .uz-ep-polja { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
  `,
})
export class SvojstvaSlikeComponent {
  readonly sloj = input.required<SlikaSloj>();

  private readonly store = inject(PlatnoEditorStore);
  private readonly obavestenja = inject(NotificationStore);
  protected readonly otpremanje = inject(OtpremanjeSlike);

  protected readonly prihvacene = PRIHVACENE_SLIKE_PANELA;
  protected readonly strane: readonly { strana: Strana; naziv: string }[] = [
    { strana: 'levo', naziv: 'Levo' }, { strana: 'gore', naziv: 'Gore' },
    { strana: 'desno', naziv: 'Desno' }, { strana: 'dole', naziv: 'Dole' },
  ];
  /** Isečak u %. */
  protected readonly isecak = computed(() => {
    const c = this.sloj().isecak;
    return { levo: z(c.levo * 100), gore: z(c.gore * 100), desno: z(c.desno * 100), dole: z(c.dole * 100) };
  });

  private izmeni(id: string, f: (s: SlikaSloj) => SlikaSloj, kljuc?: string): void {
    if (this.store.zakljucanUIzboru()) return;
    this.store.primeni((p) => izmeniSlojeve(p, new Set([id]), (s) => (s.tip === 'SLIKA' ? f(s) : s)), kljuc);
  }

  protected izabrano(polje: HTMLInputElement): void {
    this.otpremanje.zameniSliku(polje, this.sloj().id);
  }

  protected postaviIsecak(strana: Strana, procenat: number): void {
    const s = this.sloj();
    const isecak = { ...s.isecak, [strana]: z(procenat / 100) };
    if (isecak.levo + isecak.desno >= 1 || isecak.gore + isecak.dole >= 1) {
      this.obavestenja.greska(PORUKA_ISECKA);
      return;
    }
    if (isecak[strana] === s.isecak[strana]) return;
    this.izmeni(s.id, (x) => ({ ...x, isecak: { ...x.isecak, [strana]: isecak[strana] } }), `polje-isecak-${strana}:${s.id}`);
  }
}

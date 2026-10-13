// Zajednička polja panela Svojstva (F6) za izabrane slojeve: položaj i veličina (linija ih nema: njen put tastaturom su
// krajevi u svojstvima oblika), providnost i senka. Za više izabranih samo X i Y obuhvata (pomeraju sve) i providnost.
// Svaka izmena je `primeni` sa ključem po polju i izboru (`polje-<ime>:<id-jevi>`): uzastopni upisi u isto polje u roku od
// 1 s su jedan korak istorije, a isto polje drugog sloja nije. Zaključan sloj: sva polja onemogućena, osim "Otključaj".
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { Senka, Sloj, Tema } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import {
  type Kutija, MAX_VELICINA, MAX_XY, MIN_VELICINA, MIN_XY, jeLinija, kutijaSloja, normalizujUgao, obuhvatSvih,
} from './geometrija';
import { IzborBojeComponent } from './izbor-boje.component';
import { izmeniSlojeve, pomeriSlojeve, postaviKutiju } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';

/** Senka posle uključivanja prekidača (spec 8). */
export const PODRAZUMEVANA_SENKA: Senka = { boja: '#000000', pomerajX: 3, pomerajY: 3, zamucenje: 4 };

type PoljeKutije = 'x' | 'y' | 'sirina' | 'visina' | 'rotacija';
type PoljeSenke = 'pomerajX' | 'pomerajY' | 'zamucenje';

@Component({
  selector: 'app-svojstva-sloja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrojcanoPoljeComponent, IzborBojeComponent, MatButtonModule, MatSlideToggleModule],
  template: `
    @let z = zakljucano();
    @if (z) {
      <div class="uz-ep-zakljucano">
        <span>Sloj je zaključan.</span>
        <button mat-stroked-button type="button" (click)="otkljucaj()">Otključaj</button>
      </div>
    }
    @if (polozaj(); as k) {
      <h3 class="uz-ep-odeljak">Položaj i veličina</h3>
      <div class="uz-ep-polja">
        <app-brojcano-polje oznaka="X" [vrednost]="k.x" [min]="minXY" [max]="maxXY" [onemoguceno]="z"
                            (promena)="postavi('x', $event)" />
        <app-brojcano-polje oznaka="Y" [vrednost]="k.y" [min]="minXY" [max]="maxXY" [onemoguceno]="z"
                            (promena)="postavi('y', $event)" />
        @if (jedan()) {
          <app-brojcano-polje oznaka="Širina" [vrednost]="k.sirina" [min]="minVelicina" [max]="maxVelicina"
                              [onemoguceno]="z" (promena)="postavi('sirina', $event)" />
          <app-brojcano-polje oznaka="Visina" [vrednost]="k.visina" [min]="minVelicina" [max]="maxVelicina"
                              [onemoguceno]="z" (promena)="postavi('visina', $event)" />
          <app-brojcano-polje oznaka="Rotacija" jedinica="°" [vrednost]="k.rotacija" [min]="-360" [max]="360"
                              [onemoguceno]="z" (promena)="postavi('rotacija', $event)" />
        }
      </div>
    }
    <h3 class="uz-ep-odeljak">Izgled</h3>
    <div class="uz-ep-polja">
      <app-brojcano-polje oznaka="Providnost" jedinica="%" [vrednost]="providnost()" [min]="0" [max]="100"
                          [onemoguceno]="z" (promena)="postaviProvidnost($event)" />
    </div>
    @if (jedan(); as s) {
      <mat-slide-toggle class="uz-ep-senka" [checked]="s.senka !== null" [disabled]="z"
                        (change)="prebaciSenku($event.checked)">Senka</mat-slide-toggle>
      @if (s.senka; as senka) {
        <app-izbor-boje oznaka="Boja senke" [tema]="tema()" [vrednost]="senka.boja" [onemoguceno]="z"
                        (izbor)="postaviSenku({ boja: $event ?? senka.boja })" />
        <div class="uz-ep-polja">
          <app-brojcano-polje oznaka="Pomeraj X" [vrednost]="senka.pomerajX" [min]="-100" [max]="100" [onemoguceno]="z"
                              (promena)="postaviBrojSenke('pomerajX', $event)" />
          <app-brojcano-polje oznaka="Pomeraj Y" [vrednost]="senka.pomerajY" [min]="-100" [max]="100" [onemoguceno]="z"
                              (promena)="postaviBrojSenke('pomerajY', $event)" />
          <app-brojcano-polje oznaka="Zamućenje" [vrednost]="senka.zamucenje" [min]="0" [max]="100" [onemoguceno]="z"
                              (promena)="postaviBrojSenke('zamucenje', $event)" />
        </div>
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-polja { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
    .uz-ep-zakljucano {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 10px; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--ink);
    }
    .uz-ep-senka { margin-top: 4px; }
  `,
})
export class SvojstvaSlojaComponent {
  /** Tema prezentacije (boje palete). */
  readonly tema = input.required<Tema>();

  private readonly store = inject(PlatnoEditorStore);

  protected readonly minXY = MIN_XY;
  protected readonly maxXY = MAX_XY;
  protected readonly minVelicina = MIN_VELICINA;
  protected readonly maxVelicina = MAX_VELICINA;

  protected readonly jedan = this.store.jedan;
  protected readonly zakljucano = computed(() => this.store.izabraniSlojevi().some((s) => s.zakljucan));
  /**
   * Polja položaja: jedan sloj = njegova kutija (rotacija u [0, 360)); više = obuhvat svih (samo X i Y); linija nema
   * ova polja (krajevi su u svojstvima oblika).
   */
  protected readonly polozaj = computed<Kutija | null>(() => {
    const s = this.jedan();
    if (s) {
      if (jeLinija(s)) return null;
      return { ...kutijaSloja(s), rotacija: normalizujUgao(s.rotacija) };
    }
    const o = obuhvatSvih(this.store.izabraniSlojevi().map(kutijaSloja));
    return o ? { x: z(o.x), y: z(o.y), sirina: z(o.sirina), visina: z(o.visina), rotacija: 0 } : null;
  });
  /** Providnost u %; null kad izabrani slojevi imaju različite. */
  protected readonly providnost = computed<number | null>(() => {
    const vrednosti = new Set(this.store.izabraniSlojevi().map((s) => s.providnost));
    return vrednosti.size === 1 ? z([...vrednosti][0] * 100) : null;
  });

  /** Ključ istorije po polju i izboru: isto polje istog izbora u roku od 1 s je jedan korak. */
  private kljuc(polje: string): string {
    return `polje-${polje}:${this.store.izbor().join(',')}`;
  }

  /** Izmena svih izabranih slojeva; zaključan izbor se ne menja (poruka "Sloj je zaključan."). */
  private izmeni(f: (s: Sloj) => Sloj, polje?: string): void {
    if (this.store.zakljucanUIzboru()) return;
    const ids = new Set(this.store.izbor());
    this.store.primeni((p) => izmeniSlojeve(p, ids, f), polje ? this.kljuc(polje) : undefined);
  }

  protected postavi(polje: PoljeKutije, v: number): void {
    if (this.store.zakljucanUIzboru()) return;
    const s = this.jedan();
    if (s) {
      this.store.primeni((p) => postaviKutiju(p, s.id, { ...kutijaSloja(s), [polje]: v }), this.kljuc(polje));
      return;
    }
    const o = this.polozaj();
    if (!o || (polje !== 'x' && polje !== 'y')) return;
    const dx = polje === 'x' ? v - o.x : 0;
    const dy = polje === 'y' ? v - o.y : 0;
    const ids = new Set(this.store.izbor());
    this.store.primeni((p) => pomeriSlojeve(p, ids, dx, dy), this.kljuc(polje));
  }

  protected postaviProvidnost(procenat: number): void {
    const v = z(procenat / 100);
    this.izmeni((s) => (s.providnost === v ? s : { ...s, providnost: v }), 'providnost');
  }

  protected prebaciSenku(da: boolean): void {
    this.izmeni((s) => (da === (s.senka !== null) ? s : { ...s, senka: da ? { ...PODRAZUMEVANA_SENKA } : null }));
  }

  protected postaviSenku(deo: Partial<Senka>, polje?: string): void {
    this.izmeni((s) => {
      if (!s.senka) return s;
      const senka = { ...s.senka, ...deo };
      return (Object.keys(deo) as (keyof Senka)[]).every((k) => senka[k] === s.senka![k]) ? s : { ...s, senka };
    }, polje ?? 'senka-boja');
  }

  protected postaviBrojSenke(polje: PoljeSenke, v: number): void {
    this.postaviSenku({ [polje]: v }, `senka-${polje}`);
  }

  protected otkljucaj(): void {
    const ids = new Set(this.store.izbor());
    this.store.primeni((p) => izmeniSlojeve(p, ids, (s) => (s.zakljucan ? { ...s, zakljucan: false } : s)));
  }
}

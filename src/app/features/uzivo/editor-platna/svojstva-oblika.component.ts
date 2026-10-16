// Svojstva oblika i okvira teksta (F6): "Vrsta" (zatvoreni oblici među zatvorenim, linijski među linijskim), krajevi linije
// (put tastaturom za krajeve: početak, kraj, dužina, ugao; svaka izmena kroz `linijaIzKrajeva`, rotacija 0), "Popuna"
// (samo zatvoreni oblici i tekst) i "Ivica" (boja, debljina 0,25-20, crtica). TEKST u 4a ima samo popunu i ivicu okvira;
// tekstualna svojstva dolaze u F13.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type { Crtica, Ivica, OblikSloj, Sloj, Tacka, Tema, TekstSloj, VrstaOblika } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import { MAX_XY, MIN_XY, jeLinija, krajIzUgla, krajeviLinije, linijaIzKrajeva, ugaoIDuzina } from './geometrija';
import { IzborBojeComponent } from './izbor-boje.component';
import { izmeniSlojeve } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';

const ZATVORENI: readonly { v: VrstaOblika; naziv: string }[] = [
  { v: 'PRAVOUGAONIK', naziv: 'Pravougaonik' }, { v: 'ZAOBLJENI_PRAVOUGAONIK', naziv: 'Zaobljeni pravougaonik' },
  { v: 'ELIPSA', naziv: 'Elipsa' }, { v: 'TROUGAO', naziv: 'Trougao' },
];
const LINIJSKI: readonly { v: VrstaOblika; naziv: string }[] = [
  { v: 'LINIJA', naziv: 'Linija' }, { v: 'STRELICA', naziv: 'Strelica' }, { v: 'DVOSTRUKA_STRELICA', naziv: 'Dvostruka strelica' },
];
const CRTICE: readonly { v: Crtica; naziv: string }[] = [
  { v: 'PUNA', naziv: 'Puna' }, { v: 'ISPREKIDANA', naziv: 'Isprekidana' }, { v: 'TACKASTA', naziv: 'Tačkasta' },
];
/** Ivica posle izbora boje kad je nije bilo. */
const NOVA_IVICA: Omit<Ivica, 'boja'> = { debljina: 1, crtica: 'PUNA' };

type KrajLinije = 'pocetakX' | 'pocetakY' | 'krajX' | 'krajY' | 'duzina' | 'ugao';

@Component({
  selector: 'app-svojstva-oblika',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrojcanoPoljeComponent, IzborBojeComponent, MatFormFieldModule, MatSelectModule],
  template: `
    @let s = sloj();
    @let z = zakljucano();
    @if (s.tip === 'OBLIK') {
      <h3 class="uz-ep-odeljak">Oblik</h3>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Vrsta</mat-label>
        <mat-select [value]="s.oblik" [disabled]="z" (selectionChange)="postaviVrstu($event.value)">
          @for (o of vrste(); track o.v) { <mat-option [value]="o.v">{{ o.naziv }}</mat-option> }
        </mat-select>
      </mat-form-field>
    }
    @if (krajevi(); as k) {
      <h3 class="uz-ep-odeljak">Krajevi linije</h3>
      <div class="uz-ep-polja">
        <app-brojcano-polje oznaka="Početak X" [vrednost]="k.a.x" [min]="minXY" [max]="maxXY" [onemoguceno]="z"
                            (promena)="postaviKraj('pocetakX', $event)" />
        <app-brojcano-polje oznaka="Početak Y" [vrednost]="k.a.y" [min]="minXY" [max]="maxXY" [onemoguceno]="z"
                            (promena)="postaviKraj('pocetakY', $event)" />
        <app-brojcano-polje oznaka="Kraj X" [vrednost]="k.b.x" [min]="minXY" [max]="maxXY" [onemoguceno]="z"
                            (promena)="postaviKraj('krajX', $event)" />
        <app-brojcano-polje oznaka="Kraj Y" [vrednost]="k.b.y" [min]="minXY" [max]="maxXY" [onemoguceno]="z"
                            (promena)="postaviKraj('krajY', $event)" />
        <app-brojcano-polje oznaka="Dužina" [vrednost]="k.duzina" [min]="1" [max]="maxDuzina" [onemoguceno]="z"
                            (promena)="postaviKraj('duzina', $event)" />
        <app-brojcano-polje oznaka="Ugao" jedinica="°" [vrednost]="k.ugao" [min]="-360" [max]="360" [onemoguceno]="z"
                            (promena)="postaviKraj('ugao', $event)" />
      </div>
    }
    @if (s.tip === 'TEKST') { <h3 class="uz-ep-odeljak">Okvir teksta</h3> }
    @if (!krajevi()) {
      <app-izbor-boje oznaka="Popuna" [tema]="tema()" [vrednost]="s.popuna" [dozvoliPrazno]="true" [onemoguceno]="z"
                      (izbor)="postaviPopunu($event)" />
    }
    <!-- linija bez ivice je nevidljiva, pa joj se "Bez" ne nudi -->
    <app-izbor-boje oznaka="Ivica" [tema]="tema()" [vrednost]="s.ivica?.boja ?? null" [dozvoliPrazno]="!krajevi()"
                    [onemoguceno]="z" (izbor)="postaviBojuIvice($event)" />
    <div class="uz-ep-polja">
      <app-brojcano-polje oznaka="Debljina" [vrednost]="s.ivica?.debljina ?? null" [min]="0.25" [max]="20"
                          [onemoguceno]="z || !s.ivica" (promena)="postaviIvicu({ debljina: $event }, 'debljina')" />
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Crtica</mat-label>
        <mat-select [value]="s.ivica?.crtica ?? 'PUNA'" [disabled]="z || !s.ivica"
                    (selectionChange)="postaviIvicu({ crtica: $event.value })">
          @for (c of crtice; track c.v) { <mat-option [value]="c.v">{{ c.naziv }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-polja { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
    mat-form-field { width: 100%; min-width: 0; }
  `,
})
export class SvojstvaOblikaComponent {
  readonly sloj = input.required<OblikSloj | TekstSloj>();
  readonly tema = input.required<Tema>();

  private readonly store = inject(PlatnoEditorStore);

  protected readonly minXY = MIN_XY;
  protected readonly maxXY = MAX_XY;
  /** Najduža duž u granicama položaja (dijagonala kvadrata [-960, 1920]). */
  protected readonly maxDuzina = 4073;
  protected readonly crtice = CRTICE;
  protected readonly zakljucano = computed(() => this.sloj().zakljucan);
  protected readonly vrste = computed(() => {
    const s = this.sloj();
    return jeLinija(s) ? LINIJSKI : ZATVORENI;
  });
  /** Krajevi linije na platnu, dužina i ugao; null za zatvoren oblik i tekst. */
  protected readonly krajevi = computed(() => {
    const s = this.sloj();
    if (!jeLinija(s)) return null;
    const [a, b] = krajeviLinije(s).map((t) => ({ x: z(t.x), y: z(t.y) }));
    return { a, b, ...ugaoIDuzina(a, b) };
  });

  private kljuc(polje: string): string {
    return `polje-${polje}:${this.sloj().id}`;
  }

  private izmeni(f: (s: Sloj) => Sloj, polje?: string): void {
    if (this.store.zakljucanUIzboru()) return;
    const id = this.sloj().id;
    this.store.primeni((p) => izmeniSlojeve(p, new Set([id]), f), polje ? this.kljuc(polje) : undefined);
  }

  protected postaviVrstu(v: VrstaOblika): void {
    this.izmeni((s) => (s.tip === 'OBLIK' && s.oblik !== v ? { ...s, oblik: v } : s));
  }

  protected postaviPopunu(boja: string | null): void {
    this.izmeni((s) => ((s.tip === 'OBLIK' || s.tip === 'TEKST') && s.popuna !== boja ? { ...s, popuna: boja } : s), 'popuna');
  }

  protected postaviBojuIvice(boja: string | null): void {
    this.izmeni((s) => {
      if (s.tip !== 'OBLIK' && s.tip !== 'TEKST') return s;
      if (boja === null) return s.ivica === null ? s : { ...s, ivica: null };
      if (s.ivica?.boja === boja) return s;
      return { ...s, ivica: { ...(s.ivica ?? NOVA_IVICA), boja } };
    }, 'ivica-boja');
  }

  protected postaviIvicu(deo: Partial<Omit<Ivica, 'boja'>>, polje?: string): void {
    this.izmeni((s) => {
      if ((s.tip !== 'OBLIK' && s.tip !== 'TEKST') || !s.ivica) return s;
      const ivica = { ...s.ivica, ...deo };
      return ivica.debljina === s.ivica.debljina && ivica.crtica === s.ivica.crtica ? s : { ...s, ivica };
    }, polje);
  }

  /** Izmena jednog kraja (ili dužine/ugla od početka) kroz `linijaIzKrajeva`: nova kutija oko krajeva, rotacija 0. */
  protected postaviKraj(polje: KrajLinije, v: number): void {
    const k = this.krajevi();
    if (!k) return;
    let a: Tacka = k.a;
    let b: Tacka = k.b;
    switch (polje) {
      case 'pocetakX': a = { ...a, x: v }; break;
      case 'pocetakY': a = { ...a, y: v }; break;
      case 'krajX': b = { ...b, x: v }; break;
      case 'krajY': b = { ...b, y: v }; break;
      case 'duzina': b = krajIzUgla(a, k.ugao, v); break;
      case 'ugao': b = krajIzUgla(a, v, k.duzina); break;
    }
    this.izmeni((s) => (jeLinija(s) ? linijaIzKrajeva(s, a, b) : s), polje);
  }
}

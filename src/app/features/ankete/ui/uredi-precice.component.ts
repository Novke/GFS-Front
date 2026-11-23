import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { BojaPrecice, PublikaAnkete, SablonAnkete, SablonAnketeCmd } from '../data-access/ankete.models';
import {
  BOJE_PRECICA, IKONICE, MAX_KRATAK_NAZIV, ROKOVI_SABLONA, TRAJANJA, bojaPrecice, jedanEmoji, nazivPrecice, oznakaRoka,
  oznakaTrajanja, pomeri,
} from '../data-access/ankete.pravila';

/**
 * Uređivanje prečica (maketa D): redosled (prevlačenje ili strelice, `PUT ankete/precice`), a za izabranu prečicu kratak
 * naziv, ikonica (ponuđene ili jedan emoji), boja, "Dodir pokreće odmah", ko glasa, zatvaranje ili podrazumevani rok i
 * uklanjanje sa prečica. Svaka izmena se odmah čuva (cela zamena šablona).
 */
@Component({
  selector: 'app-anketa-uredi-precice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag, CdkDragHandle, CdkDropList, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule,
  ],
  templateUrl: './uredi-precice.component.html',
  styleUrl: './uredi-precice.component.scss',
})
export class UrediPreciceComponent {
  protected readonly store = inject(AnketePanelStore);
  protected readonly ikonice = IKONICE;
  protected readonly boje = BOJE_PRECICA;
  protected readonly trajanja = TRAJANJA;
  protected readonly rokovi = ROKOVI_SABLONA;
  protected readonly maxNaziv = MAX_KRATAK_NAZIV;

  private readonly izabranId = signal<number | null>(null);
  protected readonly izabrana = computed(() => {
    const p = this.store.precice();
    return p.find(s => s.id === this.izabranId()) ?? null;
  });
  /** Greška slobodnog unosa ikonice (nije jedan emoji). */
  protected readonly greskaIkonice = signal<string | null>(null);

  protected boja(b: BojaPrecice | null): string {
    return bojaPrecice(b);
  }

  protected naziv(s: SablonAnkete): string {
    return nazivPrecice(s);
  }

  protected opis(s: SablonAnkete): string {
    const publika = s.publika === 'NA_CASU' ? `na času${s.trajanjeSekunde ? ', ' + oznakaTrajanja(s.trajanjeSekunde) : ''}` : `cela grupa, ${oznakaRoka(s.rokSati)}`;
    return `${s.pokreniOdmah ? 'pokreni odmah' : 'prvo provera'} · ${publika}`;
  }

  protected oznakaTrajanja(t: number | null): string {
    return oznakaTrajanja(t);
  }

  protected izaberi(s: SablonAnkete): void {
    this.izabranId.set(this.izabranId() === s.id ? null : s.id);
    this.greskaIkonice.set(null);
  }

  protected pomeriPrecicu(od: number, ka: number): void {
    const ids = this.store.precice().map(p => p.id);
    const novi = pomeri(ids, od, ka);
    if (novi.some((id, i) => id !== ids[i])) {
      this.store.poredjajPrecice(novi);
    }
  }

  protected spustena(e: CdkDragDrop<unknown>): void {
    this.pomeriPrecicu(e.previousIndex, e.currentIndex);
  }

  protected izmeni(s: SablonAnkete, izmene: Partial<SablonAnketeCmd>): void {
    this.store.izmeniPrecicu(s, izmene);
  }

  protected kratakNaziv(s: SablonAnkete, polje: HTMLInputElement): void {
    const t = polje.value.trim();
    if ((t || null) !== s.kratakNaziv) {
      this.izmeni(s, { kratakNaziv: t || null });
    }
  }

  protected slobodnaIkonica(s: SablonAnkete, polje: HTMLInputElement): void {
    if (!polje.value.trim()) {
      this.greskaIkonice.set(null);
      return;
    }
    const e = jedanEmoji(polje.value);
    if (e === null) {
      this.greskaIkonice.set('Upiši tačno jedan emoji.');
      return;
    }
    this.greskaIkonice.set(null);
    polje.value = '';
    this.izmeni(s, { ikonica: e });
  }

  protected publika(s: SablonAnkete, p: PublikaAnkete): void {
    if (p !== s.publika) {
      this.izmeni(s, { publika: p, trajanjeSekunde: null, rokSati: null });
    }
  }

  protected ukloni(s: SablonAnkete): void {
    this.izabranId.set(null);
    this.store.ukloniSaPrecica(s);
  }
}

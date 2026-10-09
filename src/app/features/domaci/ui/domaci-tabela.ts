import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe, formatDatum } from '../../../shared/util/datum.pipe';
import { DomaciListItem, naslovDomaceg } from '../data-access/domaci.models';

/** Kolone koje ruta može da zaključa (hub grupe zaključava `grupa`, hub predmeta `predmet`). */
export type ZakljucanaKolona = 'predmet' | 'grupa';

/** Polja po kojima se tabela sortira (zaglavlje); isto što backend prihvata. */
export type PoljeSorta = 'naslov' | 'datum';

/** Urađeno jednog domaćeg za prikaz: `28/38`; bez grupe nema sa čim da se poredi (`—`). */
export interface UradjenoPrikaz {
  /** 0-100, `null` kad nema grupe ili je grupa prazna. */
  procenat: number | null;
  /** `28/38` ili `—`. */
  tekst: string;
}

export function uradjenoPrikaz(d: Pick<DomaciListItem, 'grupa' | 'brojUradjenih' | 'brojStudenata'>): UradjenoPrikaz {
  if (!d.grupa) {
    return { procenat: null, tekst: '—' };
  }
  const ukupno = Math.max(0, d.brojStudenata ?? 0);
  const uradjeno = Math.max(0, d.brojUradjenih ?? 0);
  return {
    procenat: ukupno > 0 ? Math.min(100, Math.round((uradjeno / ukupno) * 100)) : null,
    tekst: `${uradjeno}/${ukupno}`,
  };
}

/**
 * Tabela domaćih (spec 5: naslov, datum, predmet, grupa, predavanje, urađeno x/y, pregledan); ispod 600 px redovi su
 * kartice. Koriste je lista domaćih i hubovi grupe i predmeta, sa `zakljucano` kolonama koje se ne prikazuju.
 * Klik ili Enter na naslov (ili klik na red) emituje `otvori(id)`. Nedostajući podaci (domaći bez grupe, predavanja,
 * naslova ili datuma) se prikazuju kao `—`.
 */
@Component({
  selector: 'app-domaci-tabela',
  imports: [DatumPipe, RouterLink, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './domaci-tabela.html',
  styleUrl: './domaci-tabela.scss',
})
export class DomaciTabela {
  readonly stavke = input.required<readonly DomaciListItem[]>();
  readonly zakljucano = input<readonly ZakljucanaKolona[]>([]);
  /** Aktivni sort `polje,(asc|desc)`; `null` = zaglavlja bez oznake. */
  readonly sort = input<string | null>(null);
  /** Pun datum (sa godinom) u kartici na telefonu: kad lista prikazuje više školskih godina, kratki datum je dvosmislen. */
  readonly punDatum = input(false);
  readonly otvori = output<number>();
  /** Novi sort (`polje,(asc|desc)`) posle klika na zaglavlje. */
  readonly sortChange = output<string>();

  protected readonly prikazPredmeta = computed(() => !this.zakljucano().includes('predmet'));
  protected readonly prikazGrupe = computed(() => !this.zakljucano().includes('grupa'));
  private readonly aktivan = computed(() => /^([a-z]+),(asc|desc)$/.exec(this.sort() ?? ''));

  protected ariaSort(polje: PoljeSorta): 'ascending' | 'descending' | 'none' {
    const a = this.aktivan();
    return a?.[1] === polje ? (a[2] === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected strelica(polje: PoljeSorta): string {
    const s = this.ariaSort(polje);
    return s === 'ascending' ? '↑' : s === 'descending' ? '↓' : '';
  }

  /** Isto polje menja smer; novo polje kreće od najnovijeg (datum) odnosno A-Z (naslov). */
  protected sortiraj(polje: PoljeSorta): void {
    const s = this.ariaSort(polje);
    const smer = s === 'none' ? (polje === 'naslov' ? 'asc' : 'desc') : s === 'ascending' ? 'desc' : 'asc';
    this.sortChange.emit(`${polje},${smer}`);
  }

  protected naslov(d: DomaciListItem): string {
    return naslovDomaceg(d);
  }

  protected bezNaslova(d: DomaciListItem): boolean {
    return !d.naslov?.trim();
  }

  protected uradjeno(d: DomaciListItem): UradjenoPrikaz {
    return uradjenoPrikaz(d);
  }

  protected nazivPredmeta(d: DomaciListItem): string {
    return d.predmet?.naziv || '—';
  }

  protected nazivGrupe(d: DomaciListItem): string {
    return d.grupa?.naziv || '—';
  }

  protected pregledan(d: DomaciListItem): boolean {
    return d.pregledan === true;
  }

  /** Red kartice na telefonu: `14. 10. · UPR · GD-2025 · 28/38 · Predavanje 7` (bez zaključanih kolona). */
  protected meta(d: DomaciListItem): string {
    const delovi = [formatDatum(d.datum, this.punDatum() ? 'pun' : 'kratko')];
    if (this.prikazPredmeta()) {
      delovi.push(this.nazivPredmeta(d));
    }
    if (this.prikazGrupe()) {
      delovi.push(this.nazivGrupe(d));
    }
    delovi.push(`urađeno ${this.uradjeno(d).tekst}`);
    if (d.predavanje) {
      delovi.push(`Predavanje ${d.predavanje.rb ?? '—'}`);
    }
    return delovi.join(' · ');
  }
}

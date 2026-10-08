import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe, formatDatum } from '../../../shared/util/datum.pipe';
import { PredavanjeListItem } from '../data-access/predavanja.models';

/** Kolone koje rutom može da zaključa (hub grupe zaključava `grupa`, hub predmeta `predmet`). */
export type ZakljucanaKolona = 'predmet' | 'grupa';

/** Polja po kojima se tabela sortira (zaglavlje); isto što backend prihvata. */
export type PoljeSorta = 'rb' | 'tema' | 'datum';

/** Prisutni jednog predavanja za prikaz: `28/38 +3`; bez grupe samo broj prisutnih (nema sa čim da se poredi). */
export interface PrisutniPrikaz {
  /** Prisutni iz grupe predavanja. */
  izGrupe: number;
  ukupno: number;
  stariji: number;
  /** 0-100, `null` kad nema ukupnog broja (predavanje bez grupe ili prazna grupa). */
  procenat: number | null;
  /** `28/38` (bez grupe samo broj prisutnih). */
  brojevi: string;
  /** `28/38 +3`. */
  tekst: string;
}

/**
 * `brojPrisutnih` na serveru uključuje starije studente (ponovce, premeštene, bez grupe), pa se uz grupu prikazuje
 * `brojPrisutnih - brojStarijihPrisutnih` od `brojStudenata`, a stariji posebno kao `+N`.
 */
export function prisutniPrikaz(p: Pick<PredavanjeListItem, 'grupa' | 'brojPrisutnih' | 'brojStarijihPrisutnih' | 'brojStudenata'>): PrisutniPrikaz {
  const stariji = Math.max(0, p.brojStarijihPrisutnih ?? 0);
  const prisutni = Math.max(0, p.brojPrisutnih ?? 0);
  if (!p.grupa) {
    return { izGrupe: prisutni, ukupno: 0, stariji: 0, procenat: null, brojevi: String(prisutni), tekst: String(prisutni) };
  }
  const izGrupe = Math.max(0, prisutni - stariji);
  const ukupno = Math.max(0, p.brojStudenata ?? 0);
  const procenat = ukupno > 0 ? Math.min(100, Math.round((izGrupe / ukupno) * 100)) : null;
  const brojevi = `${izGrupe}/${ukupno}`;
  return { izGrupe, ukupno, stariji, procenat, brojevi, tekst: stariji > 0 ? `${brojevi} +${stariji}` : brojevi };
}

/**
 * Tabela predavanja (spec 5: #, tema, datum, predmet, grupa, prisutni x/y sa trakom, status); ispod 600 px redovi su
 * kartice. Koriste je lista predavanja i hubovi grupe i predmeta, sa `zakljucano` kolonama koje se ne prikazuju.
 * Klik ili Enter na temu (ili klik na red) emituje `otvori(id)`. Sortiranje: `sort` je aktivni sort (`datum,desc`);
 * bez slušaoca na `sortChange` zaglavlja su obična, ali i dalje javljaju promenu.
 */
@Component({
  selector: 'app-predavanja-tabela',
  imports: [DatumPipe, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './predavanja-tabela.html',
  styleUrl: './predavanja-tabela.scss',
})
export class PredavanjaTabela {
  readonly stavke = input.required<readonly PredavanjeListItem[]>();
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

  /** Isto polje menja smer; novo polje kreće od najnovijeg/najvećeg (datum, rb) odnosno A-Z (tema). */
  protected sortiraj(polje: PoljeSorta): void {
    const s = this.ariaSort(polje);
    const smer = s === 'none' ? (polje === 'tema' ? 'asc' : 'desc') : s === 'ascending' ? 'desc' : 'asc';
    this.sortChange.emit(`${polje},${smer}`);
  }

  protected prisutni(p: PredavanjeListItem): PrisutniPrikaz {
    return prisutniPrikaz(p);
  }

  protected nazivPredmeta(p: PredavanjeListItem): string {
    return p.predmet?.naziv || '—';
  }

  protected nazivGrupe(p: PredavanjeListItem): string {
    return p.grupa?.naziv || '—';
  }

  protected uToku(p: PredavanjeListItem): boolean {
    return p.zavrseno !== true;
  }

  /** Red kartice na telefonu: `14. 10. · UPR · GD-2025 · 28/38 +3` (bez zaključanih kolona). */
  protected meta(p: PredavanjeListItem): string {
    const delovi = [formatDatum(p.datum, this.punDatum() ? 'pun' : 'kratko')];
    if (this.prikazPredmeta()) {
      delovi.push(this.nazivPredmeta(p));
    }
    if (this.prikazGrupe()) {
      delovi.push(this.nazivGrupe(p));
    }
    delovi.push(this.prisutni(p).tekst);
    return delovi.join(' · ');
  }
}

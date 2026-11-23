import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { opcijeVremena, provideSrpskiDatum } from '../../../shared/forms/datum-vreme';
import { opisRoka } from '../../../shared/util/vreme-ankete';
import { AnketePanelStore, DesniEkran } from '../data-access/ankete-panel.store';
import { PublikaAnkete, SablonAnketeCmd } from '../data-access/ankete.models';
import {
  MAX_ODGOVOR, MAX_ODGOVORA, MAX_PITANJE, MIN_ODGOVORA, Nacrt, ROKOVI_SABLONA, TRAJANJA, cekiranihTekst, cmdSablonaIzNacrta,
  nazivPrecice, oznakaTrajanja, podrazumevaniRok, pomeri, proveriNacrt, sledecaBoja, skrati, MAX_KRATAK_NAZIV,
} from '../data-access/ankete.pravila';

type Provera = Extract<DesniEkran, { ekran: 'provera' }>;

const nn = { nonNullable: true } as const;

function forma(e: Provera) {
  const rok = e.nacrt.rok ?? podrazumevaniRok(new Date(), e.sablon?.rokSati ?? null);
  return new FormGroup({
    pitanje: new FormControl(e.nacrt.pitanje, nn),
    opcije: new FormArray(e.nacrt.opcije.map(o => new FormControl(o, nn))),
    viseOdgovora: new FormControl(e.nacrt.viseOdgovora, nn),
    publika: new FormControl<PublikaAnkete>(e.nacrt.publika, nn),
    trajanje: new FormControl<number | null>(e.nacrt.trajanjeSekunde),
    rokDatum: new FormControl<Date | null>(rok),
    rokVreme: new FormControl<Date | null>(rok),
    rokSati: new FormControl<number | null>(e.sablon?.rokSati ?? null),
    sacuvaj: new FormControl(false, nn),
    precica: new FormControl(e.sablon ? e.sablon.precica : e.novo.precica, nn),
    folderId: new FormControl<number | null>(e.sablon ? e.sablon.folderId : e.novo.folderId),
  });
}

/** Datum iz kalendara + vreme iz izbora vremena; bilo šta neispravno: `null`. */
function spoji(d: Date | null, v: Date | null): Date | null {
  if (!(d instanceof Date) || !(v instanceof Date) || isNaN(d.getTime()) || isNaN(v.getTime())) {
    return null;
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), v.getHours(), v.getMinutes(), 0, 0);
}

/**
 * Provera pre pokretanja i izmena šablona (maketa B): pitanje, odgovori (dodaj, ukloni, prevuci ili strelice; 2-10), "Više
 * odgovora", "Ko glasa" (na času · N čekiranih / cela grupa · rok), "Zatvori sama posle" (na času) i rok (grupa), pa
 * "Pokreni" uz opciono čuvanje u šablon; u režimu `sablon` samo "Sačuvaj" (folder, prečica, podrazumevani rok).
 */
@Component({
  selector: 'app-anketa-provera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideSrpskiDatum()],
  imports: [
    CdkDrag, CdkDragHandle, CdkDropList, ReactiveFormsModule, TextFieldModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule,
    MatDatepickerModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatTimepickerModule,
  ],
  templateUrl: './provera-ekran.component.html',
  styleUrl: './provera-ekran.component.scss',
})
export class ProveraEkranComponent {
  readonly ekran = input.required<Provera>();

  protected readonly store = inject(AnketePanelStore);
  protected readonly f = computed(() => forma(this.ekran()));
  /** Greška provere posle pokušaja slanja (iste granice kao server). */
  protected readonly greska = signal<string | null>(null);

  protected readonly maxPitanje = MAX_PITANJE;
  protected readonly maxOdgovor = MAX_ODGOVOR;
  protected readonly minOdgovora = MIN_ODGOVORA;
  protected readonly maxOdgovora = MAX_ODGOVORA;
  protected readonly rokovi = ROKOVI_SABLONA;
  protected readonly vremena = opcijeVremena(7, 23, 30);
  protected readonly danas = new Date();

  protected readonly sablonRezim = computed(() => this.ekran().rezim === 'sablon');
  protected readonly naslov = computed(() => {
    const e = this.ekran();
    if (e.rezim === 'sablon') {
      return e.sablon ? 'Izmeni sačuvano pitanje' : 'Novo sačuvano pitanje';
    }
    return e.sablon || e.nacrt.sablonId !== null ? 'Pokreni anketu' : 'Nova anketa';
  });
  protected readonly podnaslov = computed(() => {
    const s = this.ekran().sablon;
    if (!s || this.sablonRezim()) {
      return '';
    }
    return s.precica ? `iz prečice „${nazivPrecice(s)}“` : 'iz sačuvanog pitanja';
  });
  /** U režimu šablona obe publike; za pokretanje ono što kontekst nudi. */
  protected readonly naCasu = computed(() => this.sablonRezim() || this.store.mogucnosti().naCasu);
  protected readonly grupa = computed(() => this.sablonRezim() || this.store.mogucnosti().grupa);
  protected readonly cekirani = computed(() => {
    const n = this.store.kontekst().brojCekiranih;
    return n === null ? 'čekirani na predavanju' : cekiranihTekst(n);
  });
  protected readonly trajanja = computed(() => {
    const t = this.ekran().nacrt.trajanjeSekunde;
    return TRAJANJA.includes(t) ? TRAJANJA : [...TRAJANJA, t].sort((a, b) => (a ?? 0) - (b ?? 0));
  });
  protected readonly folderi = this.store.folderi;

  protected oznakaTrajanja(s: number | null): string {
    return oznakaTrajanja(s);
  }

  protected opisRokaGrupe(): string {
    const v = this.f().getRawValue();
    if (this.sablonRezim()) {
      return this.rokovi.find(r => r.sati === v.rokSati)?.naziv ?? '';
    }
    const rok = spoji(v.rokDatum, v.rokVreme);
    return rok ? `do ${opisRoka(rok.getTime(), Date.now())}` : 'izaberi rok';
  }

  protected dodajOdgovor(): void {
    const o = this.f().controls.opcije;
    if (o.length < MAX_ODGOVORA) {
      o.push(new FormControl('', nn));
    }
  }

  protected ukloniOdgovor(i: number): void {
    const o = this.f().controls.opcije;
    if (o.length > MIN_ODGOVORA) {
      o.removeAt(i);
    }
  }

  protected pomeriOdgovor(od: number, ka: number): void {
    const o = this.f().controls.opcije;
    const redom = pomeri(o.controls, od, ka);
    if (redom.every((c, i) => c === o.controls[i])) {
      return;
    }
    o.clear({ emitEvent: false });
    redom.forEach(c => o.push(c, { emitEvent: false }));
    o.updateValueAndValidity();
  }

  protected spusten(e: CdkDragDrop<unknown>): void {
    this.pomeriOdgovor(e.previousIndex, e.currentIndex);
  }

  private nacrt(): Nacrt {
    const v = this.f().getRawValue();
    const naCasu = v.publika === 'NA_CASU';
    return {
      sablonId: this.ekran().nacrt.sablonId, pitanje: v.pitanje, opcije: v.opcije, viseOdgovora: v.viseOdgovora, publika: v.publika,
      trajanjeSekunde: naCasu ? v.trajanje : null, rok: naCasu ? null : spoji(v.rokDatum, v.rokVreme),
    };
  }

  protected posalji(): void {
    const sada = new Date();
    const n = this.nacrt();
    const v = this.f().getRawValue();
    const e = this.ekran();
    if (e.rezim === 'sablon') {
      // šablon nema rok (samo `rokSati`), pa se rok ne proverava
      const g = proveriNacrt({ ...n, publika: 'NA_CASU' }, sada);
      this.greska.set(g);
      if (g === null) {
        this.store.sacuvajSablon(this.cmdSablona(n, v.folderId, v.precica, v.rokSati, sada), e.sablon?.id ?? null);
      }
      return;
    }
    const g = this.store.mogucnosti().poruka ?? proveriNacrt(n, sada);
    this.greska.set(g);
    if (g === null) {
      this.store.pokreni(n, v.sacuvaj ? { sacuvaj: true, folderId: v.folderId, precica: v.precica } : null);
    }
  }

  private cmdSablona(n: Nacrt, folderId: number | null, precica: boolean, rokSati: number | null, sada: Date): SablonAnketeCmd {
    const e = this.ekran();
    const boja = sledecaBoja(this.store.precice());
    const cmd = cmdSablonaIzNacrta(n, e.sablon, { folderId, precica, boja }, sada);
    return {
      ...cmd, folderId, precica, rokSati: n.publika === 'GRUPA' ? rokSati : null,
      boja: precica ? (cmd.boja ?? boja) : cmd.boja,
      kratakNaziv: precica ? (cmd.kratakNaziv ?? skrati(n.pitanje, MAX_KRATAK_NAZIV)) : cmd.kratakNaziv,
    };
  }
}

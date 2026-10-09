import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';

/** Izvor izmena koje server još nema (sesija čuvanja jednog ekrana). */
export interface IzvorNesacuvanog {
  /** Izmene na čekanju (debounce), u redu ili u izvršenju, i redovi čije čuvanje nije uspelo. */
  nesacuvano(): number;
}

/**
 * Zaštita od zatvaranja ili osvežavanja kartice dok čuvanje traje (root). Sesije čuvanja (`RegistarCuvanja`) se ovde
 * prijavljuju; `beforeunload` traži od pregledača njegov "Napustiti sajt?" samo dok neka prijavljena sesija ima
 * nesačuvanih izmena. Slušalac postoji samo dok ima prijavljenih izvora (bez njega pregledač može da koristi bfcache).
 *
 * Instancira se tek kad nastavnički ekran napravi store koji čuva (preko `RegistarCuvanja`), nikad na javnoj ruti
 * `upis/:token` (pravilo `gfs/javna-ruta-uvozi`: `core/state` nije na spisku dozvoljenog).
 */
@Injectable({ providedIn: 'root' })
export class NesacuvaneIzmene {
  private readonly izvori = new Set<IzvorNesacuvanog>();
  private readonly prozor = inject(DOCUMENT).defaultView;
  private slusa = false;

  private readonly pitaj = (e: BeforeUnloadEvent): void => {
    if (this.broj() > 0) {
      e.preventDefault();
      // stariji Chrome/Safari prikazuju dijalog samo uz `returnValue` (tekst se ionako ne prikazuje)
      e.returnValue = '';
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.postaviSlusaoca(false));
  }

  prijavi(izvor: IzvorNesacuvanog): void {
    this.izvori.add(izvor);
    this.postaviSlusaoca(true);
  }

  odjavi(izvor: IzvorNesacuvanog): void {
    this.izvori.delete(izvor);
    if (this.izvori.size === 0) {
      this.postaviSlusaoca(false);
    }
  }

  /** Ukupno nesačuvanih izmena svih prijavljenih izvora. */
  broj(): number {
    let n = 0;
    for (const i of this.izvori) {
      n += i.nesacuvano();
    }
    return n;
  }

  private postaviSlusaoca(ukljuci: boolean): void {
    if (!this.prozor || ukljuci === this.slusa) {
      return;
    }
    this.slusa = ukljuci;
    if (ukljuci) {
      this.prozor.addEventListener('beforeunload', this.pitaj);
    } else {
      this.prozor.removeEventListener('beforeunload', this.pitaj);
    }
  }
}

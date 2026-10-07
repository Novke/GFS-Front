import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { Observable, Subject } from 'rxjs';

export type PorukaTip = 'uspeh' | 'greska' | 'info';

export interface PorukaAkcija {
  label: string;
  run: () => void;
}

export interface Poruka {
  tip: PorukaTip;
  tekst: string;
  akcija?: PorukaAkcija;
}

/**
 * Obaveštenja za korisnika. Store samo emituje poruke; prikazuje ih `SnackbarHost` (jedan u `AppComponent`),
 * koji ih stavlja u red i prikazuje jednu po jednu. Poruke su događaji, ne stanje: store ih ne spaja i ne odbacuje.
 */
export const NotificationStore = signalStore(
  { providedIn: 'root' },
  withProps(() => {
    const poruke = new Subject<Poruka>();
    return { _poruke: poruke, poruke$: poruke.asObservable() as Observable<Poruka> };
  }),
  withMethods(store => ({
    uspeh(tekst: string, akcija?: PorukaAkcija): void {
      store._poruke.next({ tip: 'uspeh', tekst, akcija });
    },
    greska(tekst: string): void {
      store._poruke.next({ tip: 'greska', tekst, akcija: undefined });
    },
    info(tekst: string): void {
      store._poruke.next({ tip: 'info', tekst, akcija: undefined });
    },
  })),
);

export type NotificationStore = InstanceType<typeof NotificationStore>;

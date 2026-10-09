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
  /**
   * Poruke iste grupe se zamenjuju: nova sklanja prethodnu iz reda, a otvorenu zatvara (npr. live beleženje,
   * gde "Poništi" ima smisla samo za poslednju izmenu). Greška zamenjuje samo ranije greške iste grupe (npr. više redova
   * tabele koji se ne čuvaju: jedna poruka sa poslednjim brojem); uspeh i info nikad ne zamenjuju grešku.
   */
  grupa?: string;
}

export interface OpcijePoruke {
  grupa?: string;
}

const saGrupom = (p: Poruka, opcije?: OpcijePoruke): Poruka => (opcije?.grupa ? { ...p, grupa: opcije.grupa } : p);

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
    uspeh(tekst: string, akcija?: PorukaAkcija, opcije?: OpcijePoruke): void {
      store._poruke.next(saGrupom({ tip: 'uspeh', tekst, akcija }, opcije));
    },
    greska(tekst: string, opcije?: OpcijePoruke): void {
      store._poruke.next(saGrupom({ tip: 'greska', tekst, akcija: undefined }, opcije));
    },
    info(tekst: string, opcije?: OpcijePoruke): void {
      store._poruke.next(saGrupom({ tip: 'info', tekst, akcija: undefined }, opcije));
    },
  })),
);

export type NotificationStore = InstanceType<typeof NotificationStore>;

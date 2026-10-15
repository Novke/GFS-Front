// Prelaz na slajd (faza 5, odluke 11-12): nazivi za formu editora; F17 dodaje kadrove animacije (`kadroviPrelaza`).
import type { SmerPrelaza, TipPrelaza } from '../data-access/uzivo.models';

/** Srpski nazivi efekata, redom kao u izborniku forme. */
export const NAZIVI_PRELAZA: Record<TipPrelaza, string> = { FADE: 'Postepeno', GURANJE: 'Guranje', BRISANJE: 'Brisanje' };

/** Smer = strana sa koje dolazi novi slajd (isto značenje kao `smer` ULET-a). */
export const NAZIVI_SMERA_PRELAZA: Record<SmerPrelaza, string> = { DESNO: 'Zdesna', LEVO: 'Sleva', DOLE: 'Odozdo', GORE: 'Odozgo' };

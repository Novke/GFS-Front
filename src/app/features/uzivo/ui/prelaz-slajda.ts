// Prelaz na slajd (faza 5, odluke 11-12): nazivi za formu editora i kadrovi animacije omotača (`kadroviPrelaza`).
import type { Prelaz, SmerPrelaza, TipPrelaza } from '../data-access/uzivo.models';

/** Srpski nazivi efekata, redom kao u izborniku forme. */
export const NAZIVI_PRELAZA: Record<TipPrelaza, string> = { FADE: 'Postepeno', GURANJE: 'Guranje', BRISANJE: 'Brisanje' };

/** Smer = strana sa koje dolazi novi slajd (isto značenje kao `smer` ULET-a). */
export const NAZIVI_SMERA_PRELAZA: Record<SmerPrelaza, string> = { DESNO: 'Zdesna', LEVO: 'Sleva', DOLE: 'Odozdo', GORE: 'Odozgo' };

/** Kadrovi WAAPI animacije omotača ulaznog slajda i odlaznog (`null`: odlazni miruje ispod ulaznog). */
export interface KadroviPrelaza { ulazni: Keyframe[]; odlazni: Keyframe[] | null; }

const SA_STRANE: Record<SmerPrelaza, string> = { DESNO: 'translate(100%, 0)', LEVO: 'translate(-100%, 0)', DOLE: 'translate(0, 100%)', GORE: 'translate(0, -100%)' };
const KA_STRANI: Record<SmerPrelaza, string> = { DESNO: 'translate(-100%, 0)', LEVO: 'translate(100%, 0)', DOLE: 'translate(0, -100%)', GORE: 'translate(0, 100%)' };
const OTKRIVA_OD: Record<SmerPrelaza, string> = { DESNO: 'inset(0 0 0 100%)', LEVO: 'inset(0 100% 0 0)', DOLE: 'inset(100% 0 0 0)', GORE: 'inset(0 0 100% 0)' };

/**
 * Kadrovi omotača ulaznog i odlaznog slajda (odluka 11): GURANJE pomera oba (ulazni dolazi sa strane `smer`, odlazni ide na
 * suprotnu); FADE i BRISANJE menjaju samo ulazni, koji ide preko odlaznog. Samo `transform`, `opacity` i `clip-path` celog
 * omotača: raspored unutra se ne menja (merenje formula i tabova, potezi crteža i animacije slojeva rade kao bez prelaza).
 */
export function kadroviPrelaza(p: Prelaz): KadroviPrelaza {
  const smer = p.smer ?? 'DESNO';
  switch (p.efekat) {
    case 'GURANJE':
      return { ulazni: [{ transform: SA_STRANE[smer] }, { transform: 'translate(0, 0)' }], odlazni: [{ transform: 'translate(0, 0)' }, { transform: KA_STRANI[smer] }] };
    case 'BRISANJE':
      return { ulazni: [{ clipPath: OTKRIVA_OD[smer] }, { clipPath: 'inset(0 0 0 0)' }], odlazni: null };
    default:
      return { ulazni: [{ opacity: 0 }, { opacity: 1 }], odlazni: null };
  }
}

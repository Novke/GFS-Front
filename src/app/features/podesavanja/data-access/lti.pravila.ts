import type { LtiRegistracijaCmd, LtiRegistracijaInfo } from './lti.models';

/*
 * Čista pravila forme registracije (bez Angular servisa): izvedene adrese Moodle-a i prelaz forma <-> DTO.
 */

/** Putanje koje server dodaje na issuer kad su adrese prazne (`LtiRegistracijaServis`, kao Moodle 4.x). */
export const AUTH_PUTANJA = '/mod/lti/auth.php';
export const CERTS_PUTANJA = '/mod/lti/certs.php';

/** Vrednost forme: sve tekst, adrese mogu biti prazne. */
export type RegistracijaForma = LtiRegistracijaCmd;

/** Issuer bez razmaka i završnih kosih crta + putanja (kao `LtiUrl.izvedi` na serveru); prazan issuer = `null`. */
export function izvedeniUrl(izdavac: string, putanja: string): string | null {
  const osnova = izdavac.trim().replace(/\/+$/u, '');
  return osnova === '' ? null : osnova + putanja;
}

/** Početna vrednost forme: adresa jednaka izvedenoj je prazna, pa prati izmenu issuer-a; ručno upisana ostaje. */
export function uFormu(r: LtiRegistracijaInfo | null): RegistracijaForma {
  if (r === null) {
    return { naziv: '', izdavac: '', clientId: '', deploymentId: '', authUrl: '', jwksUrl: '', aktivna: true };
  }
  const izvedeno = (url: string, putanja: string) => (url === izvedeniUrl(r.izdavac, putanja) ? '' : url);
  return {
    naziv: r.naziv,
    izdavac: r.izdavac,
    clientId: r.clientId,
    deploymentId: r.deploymentId,
    authUrl: izvedeno(r.authUrl ?? '', AUTH_PUTANJA),
    jwksUrl: izvedeno(r.jwksUrl ?? '', CERTS_PUTANJA),
    aktivna: r.aktivna,
  };
}

/** Telo zahteva: tekst bez razmaka na krajevima; prazne adrese ostaju prazne (server ih izvodi). */
export function uCmd(v: RegistracijaForma): LtiRegistracijaCmd {
  return {
    naziv: v.naziv.trim(),
    izdavac: v.izdavac.trim(),
    clientId: v.clientId.trim(),
    deploymentId: v.deploymentId.trim(),
    authUrl: v.authUrl.trim(),
    jwksUrl: v.jwksUrl.trim(),
    aktivna: v.aktivna,
  };
}

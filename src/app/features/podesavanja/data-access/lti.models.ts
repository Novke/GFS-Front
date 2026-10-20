/*
 * DTO-i registracija alata na Moodle-u (`api/lti/registracije`, backend `LtiRegistracijaRest`, samo uz sesiju nastavnika).
 * Imena polja su kao na serveru. Ništa od ovoga nije tajna (spec prijave 8.1). Bez uvoza.
 */

/** `LtiRegistracijaInfo`: jedna registracija (jedan Moodle predmet: issuer + Client ID + Deployment ID). */
export interface LtiRegistracijaInfo {
  id: number;
  naziv: string;
  /** Issuer platforme (u Moodle-u "Platform ID"), npr. `https://moodle.example.test`. */
  izdavac: string;
  clientId: string;
  deploymentId: string;
  /** Server je uvek popunjava (prazno pri čuvanju = izvedeno iz issuer-a). */
  authUrl: string;
  jwksUrl: string;
  aktivna: boolean;
  kreirano: string;
}

/** `LtiRegistracijaCmd` (`POST` i `PUT {id}`): prazni `authUrl`/`jwksUrl` server izvodi iz issuer-a. */
export interface LtiRegistracijaCmd {
  naziv: string;
  izdavac: string;
  clientId: string;
  deploymentId: string;
  authUrl: string;
  jwksUrl: string;
  aktivna: boolean;
}

/** `GET api/lti/registracije/vrednosti`: adrese koje nastavnik upisuje u Moodle formu alata. */
export interface LtiVrednostiZaMoodle {
  toolUrl: string;
  initiateLoginUrl: string;
  redirectionUri: string;
  publicKeysetUrl: string;
}

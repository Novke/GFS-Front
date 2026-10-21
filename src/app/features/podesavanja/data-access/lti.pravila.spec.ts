import { describe, expect, it } from 'vitest';

import type { LtiRegistracijaInfo } from './lti.models';
import { AUTH_PUTANJA, CERTS_PUTANJA, izvedeniUrl, uCmd, uFormu } from './lti.pravila';

const INFO: LtiRegistracijaInfo = {
  id: 1,
  naziv: 'Uvod u primenu računara',
  izdavac: 'https://moodle.example.test',
  clientId: 'klijent-1',
  deploymentId: '5',
  authUrl: 'https://moodle.example.test/mod/lti/auth.php',
  jwksUrl: 'https://moodle.example.test/mod/lti/certs.php',
  aktivna: true,
  kreirano: '2026-10-19T10:00:00',
};

describe('lti.pravila', () => {
  it('izvedeniUrl: issuer bez završnih kosih crta + putanja Moodle-a (kao server)', () => {
    expect(izvedeniUrl('https://moodle.example.test', AUTH_PUTANJA)).toBe('https://moodle.example.test/mod/lti/auth.php');
    expect(izvedeniUrl(' https://moodle.example.test// ', CERTS_PUTANJA)).toBe('https://moodle.example.test/mod/lti/certs.php');
    expect(izvedeniUrl('', AUTH_PUTANJA)).toBeNull();
    expect(izvedeniUrl('   ', AUTH_PUTANJA)).toBeNull();
  });

  it('uFormu: adrese jednake izvedenim su prazne (prate issuer), ručno upisane ostaju', () => {
    expect(uFormu(INFO)).toEqual({
      naziv: INFO.naziv, izdavac: INFO.izdavac, clientId: 'klijent-1', deploymentId: '5', authUrl: '', jwksUrl: '', aktivna: true,
    });
    const rucno = { ...INFO, authUrl: 'https://sso.example.test/auth', aktivna: false };
    expect(uFormu(rucno)).toMatchObject({ authUrl: 'https://sso.example.test/auth', jwksUrl: '', aktivna: false });
    expect(uFormu(null)).toEqual({ naziv: '', izdavac: '', clientId: '', deploymentId: '', authUrl: '', jwksUrl: '', aktivna: true });
  });

  it('uCmd: polja bez razmaka na krajevima, prazne adrese ostaju prazne (server ih izvodi)', () => {
    expect(uCmd({
      naziv: ' Predmet ', izdavac: ' https://moodle.example.test ', clientId: ' k ', deploymentId: ' 5 ', authUrl: '  ', jwksUrl: '',
      aktivna: false,
    })).toEqual({
      naziv: 'Predmet', izdavac: 'https://moodle.example.test', clientId: 'k', deploymentId: '5', authUrl: '', jwksUrl: '',
      aktivna: false,
    });
  });
});

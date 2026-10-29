import { afterEach, describe, expect, it } from 'vitest';

import { postaviManifest } from './manifest';

describe('postaviManifest', () => {
  afterEach(() => document.getElementById('gfs-manifest')?.remove());

  it('pravi link jednom i menja href po vrsti', () => {
    postaviManifest(document, 'student');
    const link = document.getElementById('gfs-manifest') as HTMLLinkElement;
    expect(link.rel).toBe('manifest');
    expect(link.getAttribute('href')).toBe('assets/pwa/manifest-student.webmanifest');
    postaviManifest(document, 'nastavnik');
    expect(document.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(link.getAttribute('href')).toBe('assets/pwa/manifest-nastavnik.webmanifest');
  });
});

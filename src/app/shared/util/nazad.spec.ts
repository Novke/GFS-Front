import { describe, expect, it } from 'vitest';

import { bezbednoNazad, nazadIzUrla } from './nazad';

describe('bezbednoNazad', () => {
  it.each([
    'uzivo/ABC123',
    'predavanja',
    'studenti/5',
    'predavanja?grupa=1&predmet=2',
    'studenti?q=Ana%20B',
    'banka/varijante/nova?grupa=3',
  ])('pušta relativnu putanju unutar aplikacije: %s', v => {
    expect(bezbednoNazad(v)).toBe(v);
  });

  it.each([
    '//evil.com',
    'https://x',
    '/\\evil',
    '\\\\evil.com',
    'javascript:alert(1)',
    '../x',
    'a/../b',
    'a/..',
    'a//b',
    '/predavanja',
    '',
    ' predavanja',
    'predavanja#x',
    'uzivo/ABC 123',
    'a\\b',
    'data:text/html,x',
  ])('odbija %s', v => {
    expect(bezbednoNazad(v)).toBeNull();
  });

  it('null i undefined daju null', () => {
    expect(bezbednoNazad(null)).toBeNull();
    expect(bezbednoNazad(undefined)).toBeNull();
  });
});

describe('nazadIzUrla', () => {
  it('skida vodeću kosu crtu', () => {
    expect(nazadIzUrla('/studenti')).toBe('studenti');
    expect(nazadIzUrla('/predavanja?grupa=1&predmet=2')).toBe('predavanja?grupa=1&predmet=2');
  });

  it('početna strana daje null (nema kuda nazad osim na početnu)', () => {
    expect(nazadIzUrla('/')).toBeNull();
    expect(nazadIzUrla('')).toBeNull();
  });

  it('znakove van dozvoljenog skupa kodira, pa sort sa zarezom prolazi bezbednoNazad', () => {
    const n = nazadIzUrla('/testovi?sort=datum,desc');
    expect(n).toBe('testovi?sort=datum%2Cdesc');
    expect(bezbednoNazad(n)).toBe(n);
  });

  it('dvotačku kodira (nikad šema), fragment odbacuje', () => {
    expect(nazadIzUrla('/a:b#frag')).toBe('a%3Ab');
  });

  it('putanja koju ni posle kodiranja ne bi prihvatio bezbednoNazad daje null', () => {
    expect(nazadIzUrla('/a/../b')).toBeNull();
    expect(nazadIzUrla('//evil.com')).toBeNull();
  });
});

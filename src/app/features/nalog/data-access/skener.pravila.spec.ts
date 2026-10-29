import { describe, expect, it } from 'vitest';

import { tokenIzQr } from './skener.pravila';

const BASE = 'https://gfs.trif.rs/';

describe('tokenIzQr', () => {
  it.each([
    ['https://gfs.trif.rs/nalog/cas/17.AbCdEfGhIjKlMnOpQrStUv', '17.AbCdEfGhIjKlMnOpQrStUv'],
    ['  https://gfs.trif.rs/nalog/cas/17.abc_-x?utm=1#x  ', '17.abc_-x'],
    ['https://gfs.trif.rs/nalog/cas/17.a%2Db', '17.a-b'],
  ])('naš QR: %s', (tekst, token) => {
    expect(tokenIzQr(tekst, BASE)).toBe(token);
  });

  it.each([
    'https://gfs.dev.trif.rs/nalog/cas/17.abc',
    'http://gfs.trif.rs/nalog/cas/17.abc',
    'https://evil.example/nalog/cas/17.abc',
    'https://gfs.trif.rs/nalog/cas',
    'https://gfs.trif.rs/nalog/cas/',
    'https://gfs.trif.rs/nalog/cas/17.abc/x',
    'https://gfs.trif.rs/upis/abcdef',
    'https://gfs.trif.rs/uzivo/AB12',
    'https://gfs.trif.rs/nalog/cas/17.a%2Fb',
    'https://gfs.trif.rs/nalog/cas/%E0%A4%A',
    'nalog/cas/17.abc',
    'tekst sa table',
    '',
  ])('nije naš: %s', tekst => {
    expect(tokenIzQr(tekst, BASE)).toBeNull();
  });

  it('poštuje base href', () => {
    expect(tokenIzQr('https://x.rs/gfs/nalog/cas/5.ab', 'https://x.rs/gfs/')).toBe('5.ab');
    expect(tokenIzQr('https://x.rs/nalog/cas/5.ab', 'https://x.rs/gfs/')).toBeNull();
  });
});

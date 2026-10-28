import { jeGreskaUcitavanja } from './greska-ucitavanja';

describe('jeGreskaUcitavanja', () => {
  it.each([
    ['Chromium', new TypeError('Failed to fetch dynamically imported module: https://gfs.trif.rs/chunk-Bc1bQlpj.js')],
    ['Firefox', new TypeError('error loading dynamically imported module: https://gfs.trif.rs/chunk-Bc1bQlpj.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['umotana u cause', new Error('Navigacija nije uspela', { cause: new TypeError('Importing a module script failed.') })],
    ['umotana u error (ErrorEvent, NavigationError)', { error: new TypeError('Failed to fetch dynamically imported module: x') }],
    ['umotana u reason (odbijanje)', { reason: new TypeError('error loading dynamically imported module: x') }],
    ['tekst', 'Failed to fetch dynamically imported module: x'],
  ])('%s: da', (_, e) => expect(jeGreskaUcitavanja(e)).toBe(true));

  it.each([
    ['obična greška', new Error('Cannot read properties of undefined')],
    ['HTTP greška', { status: 404, message: 'Http failure response for api/x: 404 Not Found' }],
    ['null', null],
    ['undefined', undefined],
    ['broj', 42],
  ])('%s: ne', (_, e) => expect(jeGreskaUcitavanja(e)).toBe(false));

  it('kružni omotač ne vrti u krug', () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(jeGreskaUcitavanja(a)).toBe(false);
  });
});

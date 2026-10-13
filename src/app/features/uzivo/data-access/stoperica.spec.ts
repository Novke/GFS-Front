import { ServerskiSat } from './sat';
import {
  formatSata, formatTrajanja, kljucStoperice, novaStoperica, nastavi, nuluj, pauziraj, proteklo, sacuvajStopericu,
  ucitajStopericu,
} from './stoperica';

describe('stoperica', () => {
  const P = 1_000_000;
  it('meri od početka; pauza zamrzava; nastavak oduzima pauzu', () => {
    let s = novaStoperica(P);
    expect(proteklo(s, P + 65_000)).toBe(65_000);
    s = pauziraj(s, P + 65_000);
    expect(proteklo(s, P + 300_000)).toBe(65_000);
    expect(pauziraj(s, P + 400_000)).toBe(s);
    s = nastavi(s, P + 300_000);
    expect(proteklo(s, P + 310_000)).toBe(75_000);
    expect(nastavi(s, P + 320_000)).toBe(s);
  });
  it('nulovanje kreće od sada; nulovana u pauzi ostaje u pauzi na 0', () => {
    expect(proteklo(nuluj(novaStoperica(P), P + 50_000), P + 53_000)).toBe(3_000);
    const u = nuluj(pauziraj(novaStoperica(P), P + 10_000), P + 20_000);
    expect(u.pauzaOd).not.toBeNull();
    expect(proteklo(u, P + 90_000)).toBe(0);
  });
  it('sat pregledača ispred ili iza servera ne utiče (sve u serverskom vremenu)', () => {
    const sat = new ServerskiSat();
    sat.azuriraj(P + 60_000, P + 60_000 - 5 * 60_000);
    expect(proteklo(novaStoperica(P), sat.sada(P + 60_000 - 5 * 60_000))).toBe(60_000);
  });
  it('pre početka (sat još neusklađen) nikad negativno', () => expect(proteklo(novaStoperica(P), P - 5_000)).toBe(0));
  it.each([[0, '0:00'], [59_999, '0:59'], [61_000, '1:01'], [605_000, '10:05'], [3_723_000, '1:02:03'], [-5, '0:00'], [Number.NaN, '0:00']])(
    'formatTrajanja(%d) = %s', (ms, t) => expect(formatTrajanja(ms)).toBe(t));
  it('formatSata u zadatoj zoni, 24 h', () => {
    expect(formatSata(Date.UTC(2026, 9, 11, 7, 5), 'Europe/Belgrade')).toBe('09:05');
    expect(formatSata(Date.UTC(2026, 9, 11, 21, 30), 'Europe/Belgrade')).toBe('23:30');
  });
  it('sessionStorage tamo-nazad; neispravan ili tuđi zapis -> sveža štoperica', () => {
    const st = new Map<string, string>();
    const storage = { getItem: (k: string) => st.get(k) ?? null, setItem: (k: string, v: string) => void st.set(k, v) } as Storage;
    const s = pauziraj(nuluj(novaStoperica(P), P + 9_000), P + 12_000);
    sacuvajStopericu(storage, 7, s);
    expect(ucitajStopericu(storage, 7, P)).toEqual(s);
    expect(ucitajStopericu(storage, 8, P)).toEqual(novaStoperica(P));
    st.set(kljucStoperice(7), '{"od":"x"}');
    expect(ucitajStopericu(storage, 7, P)).toEqual(novaStoperica(P));
    st.set(kljucStoperice(7), 'nije json');
    expect(ucitajStopericu(storage, 7, P)).toEqual(novaStoperica(P));
    expect(ucitajStopericu(null, 7, P)).toEqual(novaStoperica(P));
  });
  it('setItem koji baca (pun storage) se tiho preskače', () => {
    const storage = { setItem: () => { throw new Error('pun'); } } as unknown as Storage;
    expect(() => sacuvajStopericu(storage, 7, novaStoperica(P))).not.toThrow();
  });
});

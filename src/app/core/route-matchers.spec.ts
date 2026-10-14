import { Route, UrlSegment, UrlSegmentGroup } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { neprazanParametar, putanjaSaId } from './route-matchers';

const seg = (putanja: string) => putanja.split('/').filter(Boolean).map(p => new UrlSegment(p, {}));
const grupa = new UrlSegmentGroup([], {});

describe('putanjaSaId', () => {
  const list: Route = {};
  const saDecom: Route = { children: [] };

  it('prihvata pozitivan ceo broj i vraća ga kao parametar', () => {
    const r = putanjaSaId('grupe/:id/onboarding/:sid')(seg('grupe/3/onboarding/7'), grupa, list);
    expect(r?.posParams?.['id'].path).toBe('3');
    expect(r?.posParams?.['sid'].path).toBe('7');
  });

  it.each(['abc', '0', '-1', '01', '1.5', '1e3', '9999999999999999'])('odbija id "%s"', id => {
    expect(putanjaSaId('predavanja/:id')(seg(`predavanja/${id}`), grupa, list)).toBeNull();
  });

  it('ruta bez dece mora potrošiti celu putanju; sa decom ostatak ide deci', () => {
    expect(putanjaSaId(':id')(seg('5/visak'), grupa, list)).toBeNull();
    expect(putanjaSaId(':id')(seg('5/pregled'), grupa, saDecom)?.consumed.map(s => s.path)).toEqual(['5']);
  });

  it('statički delovi moraju da se poklope', () => {
    expect(putanjaSaId(':id/statistika')(seg('5/pregled'), grupa, list)).toBeNull();
  });
});

describe('neprazanParametar', () => {
  it('jedan neprazan segment', () => {
    expect(neprazanParametar('token')(seg('abc'), grupa, {})?.posParams?.['token'].path).toBe('abc');
    expect(neprazanParametar('token')([new UrlSegment('', {})], grupa, {})).toBeNull();
    expect(neprazanParametar('token')(seg('a/b'), grupa, {})).toBeNull();
  });
});

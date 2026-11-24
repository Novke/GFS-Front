import { ElementCrteza } from './crtanje.models';
import { MAX_KORAKA, dodaj, novaIstorija, obrisiSve, ponisti, vrati } from './istorija';

const e = (x: number): ElementCrteza => ({ tip: 'LINIJA', boja: '#121A2A', debljina: 3, tacke: [x, 0, x + 10, 10] });

describe('istorija strane', () => {
  it('poništi i vrati redom koraka; nov korak briše "vrati"', () => {
    let i = dodaj(dodaj(novaIstorija(), [e(1)]), [e(2)]);
    expect(i.elementi).toEqual([e(1), e(2)]);
    i = ponisti(i);
    expect(i.elementi).toEqual([e(1)]);
    i = vrati(i);
    expect(i.elementi).toEqual([e(1), e(2)]);
    i = dodaj(ponisti(i), [e(3)]);
    expect(i.elementi).toEqual([e(1), e(3)]);
    expect(vrati(i)).toBe(i);
  });

  it('"obriši sve" je jedan korak: poništi vraća sve elemente', () => {
    let i = dodaj(dodaj(novaIstorija([e(0)]), [e(1)]), [e(2)]);
    i = obrisiSve(i);
    expect(i.elementi).toEqual([]);
    i = ponisti(i);
    expect(i.elementi).toEqual([e(0), e(1), e(2)]);
    expect(obrisiSve(novaIstorija())).toEqual(novaIstorija());
  });

  it('ceo raniji crtež je jedan korak', () => {
    const i = dodaj(novaIstorija([e(0)]), [e(1), e(2), e(3)]);
    expect(ponisti(i).elementi).toEqual([e(0)]);
  });

  it('najviše 100 koraka unazad', () => {
    let i = novaIstorija();
    for (let k = 0; k < MAX_KORAKA + 20; k++) i = dodaj(i, [e(k)]);
    expect(i.pre.length).toBe(MAX_KORAKA);
    for (let k = 0; k < MAX_KORAKA + 5; k++) i = ponisti(i);
    expect(i.elementi.length).toBe(20);
    expect(ponisti(i)).toBe(i);
  });

  it('prazna strana: poništi i vrati ne rade ništa', () => {
    const i = novaIstorija();
    expect(ponisti(i)).toBe(i);
    expect(vrati(i)).toBe(i);
  });
});

import { pretvoriBeleske } from './beleske';
import { NS_DEKL } from './pptx-fabrika.testing';
import { parsirajXml } from './xml';

/** `p:notes` sa telom beleški (`telo` = pasusi) i jednim oblikom slike slajda. */
function beleske(telo: string, tip = 'body'): Document {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${NS_DEKL}><p:cSld><p:spTree>`
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slika"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="B"/><p:cNvSpPr/><p:nvPr><p:ph type="${tip}" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>`
    + `<p:txBody><a:bodyPr/><a:lstStyle/>${telo}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
  return parsirajXml(new TextEncoder().encode(xml), 'ppt/notesSlides/notesSlide1.xml');
}
const p = (tekst: string, pPr = '') => `<a:p>${pPr}<a:r><a:rPr lang="sr-Latn-RS"/><a:t>${tekst}</a:t></a:r></a:p>`;
const num = (sema: string, lvl = 0, startAt?: number) =>
  `<a:pPr lvl="${lvl}"><a:buAutoNum type="${sema}"${startAt ? ` startAt="${startAt}"` : ''}/></a:pPr>`;

describe('pretvoriBeleske', () => {
  it('nema dokumenta ili tela beleški -> null', () => {
    expect(pretvoriBeleske(null)).toEqual({ tekst: null, skraceno: false });
    expect(pretvoriBeleske(beleske(p('slajd'), 'sldNum'))).toEqual({ tekst: null, skraceno: false });
  });

  it('dva pasusa se spajaju sa \\n', () => {
    expect(pretvoriBeleske(beleske(p('prvi') + p('drugi')))).toEqual({ tekst: 'prvi\ndrugi', skraceno: false });
  });

  it('a:br je novi red u pasusu, a:fld daje svoj tekst', () => {
    const telo = '<a:p><a:r><a:t>a</a:t></a:r><a:br/><a:r><a:t>b</a:t></a:r><a:fld id="{1}" type="slidenum"><a:t>7</a:t></a:fld></a:p>';
    expect(pretvoriBeleske(beleske(telo)).tekst).toBe('a\nb7');
  });

  it('numerisana lista arabicPeriod: 1. a, 2. b, 3. c', () => {
    const pPr = num('arabicPeriod');
    expect(pretvoriBeleske(beleske(p('a', pPr) + p('b', pPr) + p('c', pPr))).tekst).toBe('1. a\n2. b\n3. c');
  });

  it('šeme: zagrada, običan broj, slova, rimski, startAt; prazan pasus ne troši broj', () => {
    expect(pretvoriBeleske(beleske(p('a', num('arabicParenR')) + p('b', num('arabicParenR')))).tekst).toBe('1) a\n2) b');
    expect(pretvoriBeleske(beleske(p('a', num('arabicPlain')))).tekst).toBe('1 a');
    expect(pretvoriBeleske(beleske(p('a', num('alphaLcParenR')) + p('b', num('alphaLcParenR')))).tekst).toBe('a) a\nb) b');
    expect(pretvoriBeleske(beleske(p('a', num('alphaUcPeriod')))).tekst).toBe('A. a');
    expect(pretvoriBeleske(beleske(p('a', num('romanUcPeriod')) + p('b', num('romanUcPeriod')))).tekst).toBe('I. a\nII. b');
    expect(pretvoriBeleske(beleske(p('a', num('romanLcPeriod')))).tekst).toBe('i. a');
    expect(pretvoriBeleske(beleske(p('a', num('arabicPeriod', 0, 5)) + p('b', num('arabicPeriod', 0, 5)))).tekst).toBe('5. a\n6. b');
    expect(pretvoriBeleske(beleske(p('a', num('arabicPeriod')) + '<a:p/>' + p('b', num('arabicPeriod')))).tekst).toBe('1. a\n\n2. b');
  });

  it('buChar daje "• ", buNone nema oznaku', () => {
    expect(pretvoriBeleske(beleske(p('a', '<a:pPr><a:buChar char="–"/></a:pPr>') + p('b', '<a:pPr><a:buNone/></a:pPr>'))).tekst).toBe('• a\nb');
  });

  it('prazni pasusi na kraju se brišu; sve prazno -> null', () => {
    expect(pretvoriBeleske(beleske(p('a') + '<a:p/><a:p><a:endParaRPr lang="en-US"/></a:p>')).tekst).toBe('a');
    expect(pretvoriBeleske(beleske('<a:p/><a:p/>'))).toEqual({ tekst: null, skraceno: false });
  });

  it('tačno 20 000 znakova prolazi, 20 001 se skraćuje na 20 000', () => {
    expect(pretvoriBeleske(beleske(p('x'.repeat(20_000))))).toEqual({ tekst: 'x'.repeat(20_000), skraceno: false });
    const r = pretvoriBeleske(beleske(p('x'.repeat(20_001))));
    expect(r.tekst).toBe('x'.repeat(20_000));
    expect(r.skraceno).toBe(true);
  });

  it('emoji na granici se ne cepa (code point-i, ne UTF-16 jedinice)', () => {
    const r = pretvoriBeleske(beleske(p('x'.repeat(19_999) + '😀😀')));
    expect(r.skraceno).toBe(true);
    expect(r.tekst).toBe('x'.repeat(19_999) + '😀');
    expect(Array.from(r.tekst ?? '')).toHaveLength(20_000);
  });
});

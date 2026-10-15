import { NS_DEKL } from './pptx-fabrika.testing';
import { elementPrelaza, prelazSlajda } from './prelaz';

/** Koren `p:sld` sa datim XML-om posle `p:clrMapOvr` (gde PowerPoint piše `p:transition` ili `mc:AlternateContent`). */
function slajd(xml: string): Element {
  const doc = new DOMParser().parseFromString(
    `<p:sld ${NS_DEKL}><p:cSld><p:spTree/></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${xml}</p:sld>`,
    'application/xml');
  return doc.documentElement;
}
const prelaz = (xml: string) => prelazSlajda(slajd(xml));
/** `mc:AlternateContent` kako ga piše PowerPoint 2010+: p14 u `mc:Choice`, stari zapis u `mc:Fallback`. */
const alternativa = (requires: string) => slajd('<mc:AlternateContent>'
  + `<mc:Choice Requires="${requires}"><p:transition spd="slow" p14:dur="2000"><p:push dir="d"/></p:transition></mc:Choice>`
  + '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>');

describe('prelazSlajda (p:transition -> Prelaz)', () => {
  it('slajd bez prelaza -> null, bez upozorenja', () => {
    expect(prelaz('')).toEqual({ prelaz: null, upozorenja: [] });
    expect(elementPrelaza(slajd(''))).toBeNull();
  });

  it('p:fade -> FADE bez smera, podrazumevana brzina fast = 500 ms', () => {
    expect(prelaz('<p:transition><p:fade/></p:transition>'))
      .toEqual({ prelaz: { efekat: 'FADE', smer: null, trajanjeMs: 500 }, upozorenja: [] });
  });

  it('spd="med" + p:push dir="u" -> GURANJE odozdo (smer kretanja je nagore), 750 ms', () => {
    expect(prelaz('<p:transition spd="med"><p:push dir="u"/></p:transition>'))
      .toEqual({ prelaz: { efekat: 'GURANJE', smer: 'DOLE', trajanjeMs: 750 }, upozorenja: [] });
  });

  it('p:wipe bez dir -> BRISANJE DESNO (podrazumevano dir="l"), 500 ms', () => {
    expect(prelaz('<p:transition><p:wipe/></p:transition>'))
      .toEqual({ prelaz: { efekat: 'BRISANJE', smer: 'DESNO', trajanjeMs: 500 }, upozorenja: [] });
  });

  it('smer: push dir="r" -> LEVO, wipe dir="d" -> GORE, spd="slow" -> 1000 ms', () => {
    expect(prelaz('<p:transition><p:push dir="r"/></p:transition>').prelaz).toEqual({ efekat: 'GURANJE', smer: 'LEVO', trajanjeMs: 500 });
    expect(prelaz('<p:transition spd="slow"><p:wipe dir="d"/></p:transition>').prelaz)
      .toEqual({ efekat: 'BRISANJE', smer: 'GORE', trajanjeMs: 1000 });
  });

  it('p:cut i prazan p:transition -> bez prelaza i bez upozorenja', () => {
    expect(prelaz('<p:transition><p:cut/></p:transition>')).toEqual({ prelaz: null, upozorenja: [] });
    expect(prelaz('<p:transition spd="slow"/>')).toEqual({ prelaz: null, upozorenja: [] });
  });

  it('nepoznat efekat (p14:vortex) -> FADE uz upozorenje sa imenom efekta', () => {
    const r = prelaz('<p:transition spd="med"><p14:vortex dir="r"/></p:transition>');
    expect(r.prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 750 });
    expect(r.upozorenja).toEqual([expect.stringContaining('vortex')]);
  });

  it('mc:Choice Requires="p14" se bira: p14:dur 2000 i p:push dir="d" -> GURANJE GORE 2000', () => {
    expect(prelazSlajda(alternativa('p14'))).toEqual({ prelaz: { efekat: 'GURANJE', smer: 'GORE', trajanjeMs: 2000 }, upozorenja: [] });
  });

  it('mc:Choice sa nepoznatim zahtevom (p15) -> mc:Fallback: FADE 1000 (spd="slow")', () => {
    const koren = slajd('<mc:AlternateContent xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main">'
      + '<mc:Choice Requires="p15"><p:transition spd="slow" p14:dur="1250"><p15:prstTrans prst="curtains"/></p:transition></mc:Choice>'
      + '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>');
    expect(prelazSlajda(koren)).toEqual({ prelaz: { efekat: 'FADE', smer: null, trajanjeMs: 1000 }, upozorenja: [] });
    expect(prelazSlajda(alternativa('p14 p15')).prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 1000 });
    expect(prelazSlajda(alternativa('')).prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 1000 });
  });

  it('p14:dur se ograničava na 100-5000 ms; neispravan p14:dur -> brzina iz spd', () => {
    const sa = (dur: string) => prelaz(`<p:transition spd="med" p14:dur="${dur}"><p:fade/></p:transition>`).prelaz?.trajanjeMs;
    expect(sa('9000')).toBe(5000);
    expect(sa('20')).toBe(100);
    expect(sa('1234.6')).toBe(1235);
    expect(sa('')).toBe(750);
    expect(sa('brzo')).toBe(750);
  });

  it('nepoznata vrednost spd -> 500 ms', () => {
    expect(prelaz('<p:transition spd="munja"><p:fade/></p:transition>').prelaz?.trajanjeMs).toBe(500);
  });

  it('advTm ili advClick="0" -> upozorenje o automatskom prelaženju, prelaz ostaje', () => {
    const r = prelaz('<p:transition advTm="3000"><p:fade/></p:transition>');
    expect(r.prelaz).toEqual({ efekat: 'FADE', smer: null, trajanjeMs: 500 });
    expect(r.upozorenja).toEqual([expect.stringContaining('Automatsko prelaženje')]);
    expect(prelaz('<p:transition advClick="0"><p:fade/></p:transition>').upozorenja).toEqual([expect.stringContaining('Automatsko')]);
    expect(prelaz('<p:transition advClick="1"><p:fade/></p:transition>').upozorenja).toEqual([]);
  });

  it('p:sndAc -> upozorenje o zvuku; zvuk i extLst nisu efekat', () => {
    const r = prelaz('<p:transition><p:sndAc><p:stSnd><p:snd r:embed="rId9" name="x.wav"/></p:stSnd></p:sndAc><p:wipe dir="u"/>'
      + '<p:extLst/></p:transition>');
    expect(r.prelaz).toEqual({ efekat: 'BRISANJE', smer: 'DOLE', trajanjeMs: 500 });
    expect(r.upozorenja).toEqual([expect.stringContaining('Zvuk prelaza')]);
    expect(prelaz('<p:transition><p:sndAc><p:endSnd/></p:sndAc></p:transition>'))
      .toEqual({ prelaz: null, upozorenja: [expect.stringContaining('Zvuk')] });
  });

  it('upozorenje za nepoznat efekat ne nosi neograničeno dugo ime iz fajla', () => {
    const ime = 'x'.repeat(500);
    const r = prelaz(`<p:transition><p14:${ime}/></p:transition>`);
    expect(r.prelaz?.efekat).toBe('FADE');
    expect(r.upozorenja[0].length).toBeLessThan(100);
  });
});

// Ugrađeni Office stilovi tabela (ECMA-376 presetTableStyles) za fajlove čiji `tableStyles.xml` nema definiciju stila
// koji tabela koristi (odluka 16). Hex boje ovde su podaci, ne boje UI-ja. Bez Angular-a.
import { NS } from './xml';

const A = `xmlns:a="${NS.a}"`;
const LN_TX1 = '<a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:ln>';
const BEZ_STILA_TEKST = '<a:tcTxStyle><a:fontRef idx="minor"><a:scrgbClr r="0" g="0" b="0"/></a:fontRef><a:schemeClr val="tx1"/></a:tcTxStyle>';

/** `styleId` -> XML `<a:tblStyle>` (sa deklaracijom imenskog prostora `a`). */
export const UGRADJENI_STILOVI: Readonly<Record<string, string>> = Object.freeze({
  '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': `<a:tblStyle ${A} styleId="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}" styleName="Medium Style 2 - Accent 1">`
    + '<a:wholeTbl><a:tcTxStyle><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="dk1"/></a:tcTxStyle><a:tcStyle><a:tcBdr>'
    + '<a:left><a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:left>'
    + '<a:right><a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:right>'
    + '<a:top><a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:top>'
    + '<a:bottom><a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:bottom>'
    + '<a:insideH><a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:insideH>'
    + '<a:insideV><a:ln w="12700" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:insideV>'
    + '</a:tcBdr><a:fill><a:solidFill><a:schemeClr val="accent1"><a:tint val="20000"/></a:schemeClr></a:solidFill></a:fill></a:tcStyle></a:wholeTbl>'
    + '<a:band1H><a:tcStyle><a:tcBdr/><a:fill><a:solidFill><a:schemeClr val="accent1"><a:tint val="40000"/></a:schemeClr></a:solidFill></a:fill></a:tcStyle></a:band1H>'
    + '<a:band2H><a:tcStyle><a:tcBdr/></a:tcStyle></a:band2H>'
    + '<a:band1V><a:tcStyle><a:tcBdr/><a:fill><a:solidFill><a:schemeClr val="accent1"><a:tint val="40000"/></a:schemeClr></a:solidFill></a:fill></a:tcStyle></a:band1V>'
    + '<a:band2V><a:tcStyle><a:tcBdr/></a:tcStyle></a:band2V>'
    + '<a:lastCol><a:tcTxStyle b="on"><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr/><a:fill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fill></a:tcStyle></a:lastCol>'
    + '<a:firstCol><a:tcTxStyle b="on"><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr/><a:fill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fill></a:tcStyle></a:firstCol>'
    + '<a:lastRow><a:tcTxStyle b="on"><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr><a:top><a:ln w="38100" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:top></a:tcBdr><a:fill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fill></a:tcStyle></a:lastRow>'
    + '<a:firstRow><a:tcTxStyle b="on"><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="lt1"/></a:tcTxStyle><a:tcStyle><a:tcBdr><a:bottom><a:ln w="38100" cmpd="sng"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:ln></a:bottom></a:tcBdr><a:fill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fill></a:tcStyle></a:firstRow>'
    + '</a:tblStyle>',
  '{2D5ABB26-0587-4C30-8999-92F81FD0307C}': `<a:tblStyle ${A} styleId="{2D5ABB26-0587-4C30-8999-92F81FD0307C}" styleName="No Style, No Grid">`
    + `<a:wholeTbl>${BEZ_STILA_TEKST}<a:tcStyle><a:tcBdr/><a:fill><a:noFill/></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle>`,
  '{5940675A-B579-460E-94D1-54222C63F5DA}': `<a:tblStyle ${A} styleId="{5940675A-B579-460E-94D1-54222C63F5DA}" styleName="No Style, Table Grid">`
    + `<a:wholeTbl>${BEZ_STILA_TEKST}<a:tcStyle><a:tcBdr>`
    + `<a:left>${LN_TX1}</a:left><a:right>${LN_TX1}</a:right><a:top>${LN_TX1}</a:top><a:bottom>${LN_TX1}</a:bottom>`
    + `<a:insideH>${LN_TX1}</a:insideH><a:insideV>${LN_TX1}</a:insideV>`
    + '</a:tcBdr><a:fill><a:noFill/></a:fill></a:tcStyle></a:wholeTbl></a:tblStyle>',
});

/** Parsirani ugrađeni stilovi (ključ = `styleId` velikim slovima); parsira se jednom, na prvi zahtev. */
let parsirani: Map<string, Element> | null = null;

/** `a:tblStyle` ugrađenog stila sa datim `styleId` (bez obzira na velika i mala slova), ili `null`. */
export function ugradjeniStil(styleId: string): Element | null {
  if (!parsirani) {
    parsirani = new Map();
    for (const [id, xml] of Object.entries(UGRADJENI_STILOVI)) {
      const koren = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
      if (koren.namespaceURI === NS.a && koren.localName === 'tblStyle') parsirani.set(id.toUpperCase(), koren);
    }
  }
  return parsirani.get(styleId.trim().toUpperCase()) ?? null;
}

// Fabrika sintetičkih PPTX-ova za specove i e2e (samo fflate, bez Angular-a). Svi fixture-i su izmišljeni.
import { strToU8, zipSync } from 'fflate';

export const NS_DEKL = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
  + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" '
  + 'xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" '
  + 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const GLAVNI_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
export const PNG_1X1 = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

export interface VezaFabrike { id: string; tip: string; cilj: string; spoljna?: boolean; }
export interface SlajdFabrike {
  spTree: string; timing?: string; beleske?: string; veze?: VezaFabrike[];
  skriven?: boolean; bg?: string; showMasterSp?: boolean; bezLayouta?: boolean;
  prelaz?: string;     // sirov XML posle p:clrMapOvr (`<p:transition>…` ili `<mc:AlternateContent>…`)
  clrMapOvr?: string;   // ceo <p:clrMapOvr>…</p:clrMapOvr>; podrazumevano masterClrMapping
}
export interface OpcijeFabrike {
  slajdovi: SlajdFabrike[]; velicina?: { cx: number; cy: number };
  delovi?: Record<string, string | Uint8Array>; bezDelova?: string[]; glavniTip?: string;
  masterDodatak?: string; layoutDodatak?: string; tableStyles?: string; layoutShowMasterSp?: boolean;
}

const veze = (lista: VezaFabrike[]) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + lista.map(v => `<Relationship Id="${v.id}" Type="${R}/${v.tip}" Target="${v.cilj}"${v.spoljna ? ' TargetMode="External"' : ''}/>`).join('')
  + '</Relationships>';
const NV_GRUPE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const FILL_TX1 = '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>';

const TEMA = `${XML}<a:theme ${NS_DEKL} name="Office"><a:themeElements><a:clrScheme name="Office">`
  + '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
  + '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
  + '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>'
  + '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>'
  + '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
  + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
  + '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
  + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
  + '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
  + '<a:lnStyleLst><a:ln w="6350"/><a:ln w="12700"/><a:ln w="19050"/></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
  + '</a:fmtScheme></a:themeElements></a:theme>';

const ph = (id: number, ime: string, phXml: string, xfrm: string, bodyPr = '<a:bodyPr/>') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${ime}"/><p:cNvSpPr/><p:nvPr>${phXml}</p:nvPr></p:nvSpPr><p:spPr>${xfrm}</p:spPr>`
  + `<p:txBody>${bodyPr}<a:lstStyle/><a:p><a:r><a:rPr lang="sr-Latn-RS"/><a:t>Podsetnik</a:t></a:r></a:p></p:txBody></p:sp>`;
const xfrm = (x: number, y: number, cx: number, cy: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;

const MASTER = (dodatak: string) => `${XML}<p:sldMaster ${NS_DEKL}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${NV_GRUPE}`
  + ph(2, 'Naslov', '<p:ph type="title"/>', xfrm(838200, 365125, 10515600, 1325563), '<a:bodyPr anchor="ctr"/>')
  + ph(3, 'Telo', '<p:ph type="body" idx="1"/>', xfrm(838200, 1825625, 10515600, 4351338))
  + ph(4, 'Broj', '<p:ph type="sldNum" sz="quarter" idx="12"/>', xfrm(8610600, 6356350, 2743200, 365125))
  + `${dodatak}</p:spTree></p:cSld>`
  + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
  + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles>'
  + `<p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:buNone/><a:defRPr sz="4400">${FILL_TX1}<a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>`
  + `<p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/><a:defRPr sz="2800">${FILL_TX1}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>`
  + `<a:lvl2pPr marL="685800" indent="-228600" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="500"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/><a:defRPr sz="2400">${FILL_TX1}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl2pPr></p:bodyStyle>`
  + `<p:otherStyle><a:lvl1pPr defTabSz="914400"><a:defRPr sz="1800">${FILL_TX1}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT = (dodatak: string, showMasterSp: boolean) => `${XML}<p:sldLayout ${NS_DEKL} type="obj"${showMasterSp ? '' : ' showMasterSp="0"'}><p:cSld name="Naslov i sadržaj"><p:spTree>${NV_GRUPE}`
  + ph(2, 'Naslov 1', '<p:ph type="title"/>', '')
  + ph(3, 'Sadržaj 2', '<p:ph idx="1"/>', xfrm(838200, 1905000, 10515600, 4000000))
  + `${dodatak}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const PREZENTACIJA = (n: number, cx: number, cy: number) => `${XML}<p:presentation ${NS_DEKL}>`
  + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst><p:sldIdLst>'
  + Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')
  + `</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>`
  + `<a:lvl1pPr marL="0" algn="l" defTabSz="457200"><a:defRPr sz="1800">${FILL_TX1}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>`
  + `<a:lvl2pPr marL="457200" algn="l" defTabSz="457200"><a:defRPr sz="1800">${FILL_TX1}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl2pPr>`
  + '</p:defaultTextStyle></p:presentation>';

const BELESKE = (telo: string) => `${XML}<p:notes ${NS_DEKL}><p:cSld><p:spTree>${NV_GRUPE}`
  + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slika slajda"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
  + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Beleške"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${telo}</p:txBody></p:sp>`
  + '</p:spTree></p:cSld></p:notes>';

export function napraviPptx(o: OpcijeFabrike): Uint8Array {
  const { cx, cy } = o.velicina ?? { cx: 12192000, cy: 6858000 };
  const delovi: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
      + `<Override PartName="/ppt/presentation.xml" ContentType="${o.glavniTip ?? GLAVNI_PPTX}"/></Types>`,
    '_rels/.rels': veze([{ id: 'rId1', tip: 'officeDocument', cilj: 'ppt/presentation.xml' }]),
    'ppt/presentation.xml': PREZENTACIJA(o.slajdovi.length, cx, cy),
    'ppt/_rels/presentation.xml.rels': veze([
      { id: 'rIdM', tip: 'slideMaster', cilj: 'slideMasters/slideMaster1.xml' },
      { id: 'rIdT', tip: 'theme', cilj: 'theme/theme1.xml' },
      ...(o.tableStyles ? [{ id: 'rIdTS', tip: 'tableStyles', cilj: 'tableStyles.xml' }] : []),
      ...o.slajdovi.map((_, i) => ({ id: `rIdS${i + 1}`, tip: 'slide', cilj: `slides/slide${i + 1}.xml` })),
    ]),
    'ppt/theme/theme1.xml': TEMA,
    'ppt/slideMasters/slideMaster1.xml': MASTER(o.masterDodatak ?? ''),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': veze([
      { id: 'rId1', tip: 'slideLayout', cilj: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', tip: 'theme', cilj: '../theme/theme1.xml' },
    ]),
    'ppt/slideLayouts/slideLayout1.xml': LAYOUT(o.layoutDodatak ?? '', o.layoutShowMasterSp ?? true),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': veze([{ id: 'rId1', tip: 'slideMaster', cilj: '../slideMasters/slideMaster1.xml' }]),
  };
  if (o.tableStyles) {
    delovi['ppt/tableStyles.xml'] = `${XML}<a:tblStyleLst ${NS_DEKL} def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}">${o.tableStyles}</a:tblStyleLst>`;
  }
  o.slajdovi.forEach((s, i) => {
    const n = i + 1;
    const atributi = `${s.skriven ? ' show="0"' : ''}${s.showMasterSp === false ? ' showMasterSp="0"' : ''}`;
    delovi[`ppt/slides/slide${n}.xml`] = `${XML}<p:sld ${NS_DEKL}${atributi}><p:cSld>${s.bg ?? ''}<p:spTree>${NV_GRUPE}${s.spTree}</p:spTree></p:cSld>`
      + `${s.clrMapOvr ?? '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'}${s.prelaz ?? ''}${s.timing ?? ''}</p:sld>`;
    const v: VezaFabrike[] = [...(s.bezLayouta ? [] : [{ id: 'rIdL', tip: 'slideLayout', cilj: '../slideLayouts/slideLayout1.xml' }]), ...(s.veze ?? [])];
    if (s.beleske !== undefined) {
      v.push({ id: 'rIdN', tip: 'notesSlide', cilj: `../notesSlides/notesSlide${n}.xml` });
      delovi[`ppt/notesSlides/notesSlide${n}.xml`] = BELESKE(s.beleske);
    }
    delovi[`ppt/slides/_rels/slide${n}.xml.rels`] = veze(v);
  });
  Object.assign(delovi, o.delovi ?? {});
  for (const d of o.bezDelova ?? []) delete delovi[d];
  return zipSync(Object.fromEntries(Object.entries(delovi).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
}

/** Oblici za `spTree` (EMU). */
export const oblik = {
  tekst: (id: number, x: number, y: number, cx: number, cy: number, pasusi: string,
          spPr = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>', bodyPr = '<a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr>') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, cx, cy)}${spPr}</p:spPr>`
    + `<p:txBody>${bodyPr}<a:lstStyle/>${pasusi}</p:txBody></p:sp>`,
  placeholder: (id: number, phXml: string, pasusi: string, xfrmXml = '') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Placeholder ${id}"/><p:cNvSpPr/><p:nvPr>${phXml}</p:nvPr></p:nvSpPr><p:spPr>${xfrmXml}</p:spPr>`
    + `<p:txBody><a:bodyPr/><a:lstStyle/>${pasusi}</p:txBody></p:sp>`,
  slika: (id: number, rId: string, x: number, y: number, cx: number, cy: number, blipDodatak = '') =>
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Slika ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/>${blipDodatak}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr>${xfrm(x, y, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
  geometrija: (id: number, prst: string, x: number, y: number, cx: number, cy: number, spPrDodatak = '', txBody = '') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Oblik ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, cx, cy)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${spPrDodatak}</p:spPr>${txBody}</p:sp>`,
  konektor: (id: number, x: number, y: number, cx: number, cy: number, lnXml: string, atributiXfrm = '') =>
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Konektor ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${atributiXfrm}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>${lnXml}</p:spPr></p:cxnSp>`,
  grupa: (id: number, off: [number, number], ext: [number, number], chOff: [number, number], chExt: [number, number], deca: string) =>
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Grupa ${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${off[0]}" y="${off[1]}"/><a:ext cx="${ext[0]}" cy="${ext[1]}"/>`
    + `<a:chOff x="${chOff[0]}" y="${chOff[1]}"/><a:chExt cx="${chExt[0]}" cy="${chExt[1]}"/></a:xfrm></p:grpSpPr>${deca}</p:grpSp>`,
  /** Tabela (`p:graphicFrame`): `kolone` = `gridCol@w`, `redovi` iz `tabela.red`; okvir je zbir kolona i redova. */
  tabela: (id: number, x: number, y: number, kolone: number[], redovi: { h: number; xml: string }[], tblPr = '<a:tblPr/>') =>
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabela ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
    + `<p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${kolone.reduce((a, b) => a + b, 0)}" cy="${redovi.reduce((a, r) => a + r.h, 0)}"/></p:xfrm>`
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">'
    + `<a:tbl>${tblPr}<a:tblGrid>${kolone.map(w => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${redovi.map(r => r.xml).join('')}</a:tbl>`
    + '</a:graphicData></a:graphic></p:graphicFrame>',
};

/** Delovi tabele za `oblik.tabela`: red visine `h` (EMU) i ćelija (`atributi` npr. `gridSpan="2"`, `hMerge="1"`). */
export const tabela = {
  red: (h: number, celije: string[]) => ({ h, xml: `<a:tr h="${h}">${celije.join('')}</a:tr>` }),
  celija: (tekst: string, atributi = '', tcPr = '<a:tcPr/>') =>
    `<a:tc${atributi ? ` ${atributi}` : ''}><a:txBody><a:bodyPr/><a:lstStyle/>`
    + (tekst === '' ? '<a:p><a:endParaRPr lang="sr-Latn-RS"/></a:p>' : `<a:p><a:r><a:rPr lang="sr-Latn-RS"/><a:t>${tekst}</a:t></a:r></a:p>`)
    + `</a:txBody>${tcPr}</a:tc>`,
};
export const pasus = (tekst: string, pPr = '', rPr = '<a:rPr lang="sr-Latn-RS"/>') => `<a:p>${pPr}<a:r>${rPr}<a:t>${tekst}</a:t></a:r></a:p>`;

export interface EfekatFabrike {
  spid: number; klasa: 'entr' | 'exit' | 'emph' | 'path'; preset: number; podtip?: number;
  okidac: 'clickEffect' | 'withEffect' | 'afterEffect'; trajanje?: number; kasnjenje?: number; filter?: string; pasus?: number;
}
/** `p:timing` sa jednim nizom (`mainSeq`, ili `interactiveSeq`); grupa klika počinje na svakom `clickEffect`. */
export function timing(efekti: EfekatFabrike[], interaktivni = false): string {
  let id = 3;
  const grupe: EfekatFabrike[][] = [];
  for (const e of efekti) {
    if (e.okidac === 'clickEffect' || grupe.length === 0) grupe.push([e]); else grupe[grupe.length - 1].push(e);
  }
  const meta = (e: EfekatFabrike) => `<p:tgtEl><p:spTgt spid="${e.spid}">${e.pasus != null ? `<p:txEl><p:pRg st="${e.pasus}" end="${e.pasus}"/></p:txEl>` : ''}</p:spTgt></p:tgtEl>`;
  const efekat = (e: EfekatFabrike) => {
    const set = `<p:set><p:cBhvr><p:cTn id="${id++}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${meta(e)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${e.klasa === 'exit' ? 'hidden' : 'visible'}"/></p:to></p:set>`;
    const glavno = e.klasa === 'path'
      ? `<p:animMotion origin="layout" path="M 0 0 L 0.1 0.1 E"><p:cBhvr><p:cTn id="${id++}" dur="${e.trajanje ?? 2000}"/>${meta(e)}<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:animMotion>`
      : e.filter
        ? `<p:animEffect transition="${e.klasa === 'exit' ? 'out' : 'in'}" filter="${e.filter}"><p:cBhvr><p:cTn id="${id++}" dur="${e.trajanje ?? 500}"/>${meta(e)}</p:cBhvr></p:animEffect>`
        : e.preset === 1 ? ''
          : `<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${id++}" dur="${e.trajanje ?? 500}"/>${meta(e)}<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:anim>`;
    return `<p:par><p:cTn id="${id++}" presetID="${e.preset}" presetClass="${e.klasa}" presetSubtype="${e.podtip ?? 0}" fill="hold" nodeType="${e.okidac}">`
      + `<p:stCondLst><p:cond delay="${e.kasnjenje ?? 0}"/></p:stCondLst><p:childTnLst>${e.klasa === 'path' ? '' : set}${glavno}</p:childTnLst></p:cTn></p:par>`;
  };
  const telo = grupe.map(g => `<p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>`
    + `<p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${g.map(efekat).join('')}</p:childTnLst></p:cTn></p:par>`
    + '</p:childTnLst></p:cTn></p:par>').join('');
  return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
    + `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="${interaktivni ? 'interactiveSeq' : 'mainSeq'}"><p:childTnLst>${telo}</p:childTnLst></p:cTn>`
    + '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
    + '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
    + '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
}

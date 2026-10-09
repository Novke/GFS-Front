import { Marked } from 'marked';

/**
 * Sopstvena instanca `marked`-a (globalna ostaje netaknuta). HTML iz izvora se izbacuje u celosti (blokovi i tagovi u
 * redu), a ono što prođe još jednom čisti Angularov sanitizer kroz `[innerHTML]` (spec 2.15).
 */
const parser = new Marked({ gfm: true, breaks: true });
parser.use({ renderer: { html: () => '' } });

/** Markdown -> HTML za `[innerHTML]`; prazan izvor daje prazan string. */
export function renderMarkdown(src: string | null | undefined): string {
  if (!src) {
    return '';
  }
  return parser.parse(src, { async: false });
}

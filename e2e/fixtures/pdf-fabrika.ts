// Sintetički PDF za e2e uvoza PDF-a, bez biblioteke (izmišljen sadržaj: obojen pravougaonik i natpis "Strana N" po
// strani). Pravi materijali (predavanja, PDF-ovi iz PowerPointa) nikad ne ulaze u repo.

/** Strana zadate veličine u pt (1/72 inča). */
export interface StranaPdf { sirina: number; visina: number }

/** PDF 1.4 od datih objekata (redom `1 0 obj`, `2 0 obj`, ...), sa tačnom xref tabelom; `trailer` se dodaje u rečnik. */
function sastavi(objekti: string[], trailer = ''): Buffer {
  let pdf = '%PDF-1.4\n';
  const pomaci: number[] = [];
  objekti.forEach((o, i) => {
    pomaci.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objekti.length + 1}\n0000000000 65535 f \n${pomaci.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekti.length + 1} /Root 1 0 R ${trailer}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Katalog (1), strane (2), pa za svaku stranu objekat strane i njen sadržaj, i na kraju jedan font (Helvetica, jedan od
 * 14 standardnih: nije ugrađen, pa ga pdf.js traži iz `assets/pdfjs/standard_fonts/`, što e2e proverava kao zahtev istog
 * porekla).
 */
function objektiStrana(strane: readonly StranaPdf[]): string[] {
  const font = 3 + 2 * strane.length;
  const kids = strane.map((_, i) => `${3 + 2 * i} 0 R`).join(' ');
  const objekti = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${strane.length} >>`];
  strane.forEach((s, i) => {
    const boja = `${((0.2 + 0.15 * i) % 1).toFixed(2)} 0.4 0.8 rg 20 20 ${s.sirina - 40} ${s.visina - 40} re f`;
    const sadrzaj = `${boja} 1 1 1 rg BT /F1 36 Tf 60 60 Td (Strana ${i + 1}) Tj ET`;
    objekti.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${s.sirina} ${s.visina}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + 2 * i} 0 R >>`);
    objekti.push(`<< /Length ${sadrzaj.length} >>\nstream\n${sadrzaj}\nendstream`);
  });
  objekti.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  return objekti;
}

/** Strane zadatih veličina (pt), svaka drugačije boje i natpisa (slike strana se ne poklapaju, pa nema deduplikacije). */
export function napraviPdf(strane: readonly StranaPdf[]): Buffer {
  return sastavi(objektiStrana(strane));
}

/**
 * PDF sa standardnim šifrovanjem (R2) čiji `/U` ne odgovara praznoj lozinci: pdf.js traži lozinku, a bez `onPassword`
 * odbija sa `PasswordException`. Pravo šifrovanje sadržaja nije potrebno (do crtanja se ne stiže).
 */
export function zakljucanPdf(): Buffer {
  const objekti = objektiStrana([{ sirina: 960, visina: 540 }]);
  const n = objekti.length + 1;
  objekti.push(`<< /Filter /Standard /V 1 /R 2 /O <${'4f'.repeat(32)}> /U <${'55'.repeat(32)}> /P -4 >>`);
  return sastavi(objekti, `/Encrypt ${n} 0 R /ID [<${'00'.repeat(16)}> <${'00'.repeat(16)}>] `);
}

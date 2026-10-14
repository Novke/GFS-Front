import { GRANICA_ODBIJENE_MS } from './formula-vreme.testing';
import { markdownSaFormulama, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('stavka liste "- a" postaje <li>', () => {
    expect(renderMarkdown('- a')).toContain('<li>a</li>');
  });

  it('<script> iz izvora ne prolazi, ostatak teksta ostaje', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nTekst posle');
    expect(html).not.toContain('<script');
    expect(html).toContain('Tekst posle');
  });

  it('HTML u redu se izbacuje, tekst oko njega ostaje', () => {
    const html = renderMarkdown('levo <img src=x onerror=alert(1)> desno <b>jako</b>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<b>');
    expect(html).toContain('levo');
    expect(html).toContain('desno');
  });

  it('običan Markdown: naslov, podebljano, numerisana lista', () => {
    const html = renderMarkdown('# Naslov\n\n**jako**\n\n1. prvo\n2. drugo');
    expect(html).toContain('<h1>Naslov</h1>');
    expect(html).toContain('<strong>jako</strong>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>drugo</li>');
  });

  it('znaci < i & u tekstu se escape-uju', () => {
    expect(renderMarkdown('a < b & c')).toContain('a &lt; b &amp; c');
  });

  it('prazan, null i undefined daju prazan string', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });
});

describe('markdownSaFormulama', () => {
  it('formula u Markdown-u, podvlake u formuli nisu kurziv', () => {
    const r = markdownSaFormulama('**Koliko** je $a_1$ i $b_1$?');
    expect(r.formula).toBe(true);
    expect(r.html).toContain('<strong>Koliko</strong>');
    expect(r.html.match(/<span class="uz-formula">/g)?.length).toBe(2);
    expect(r.html).toContain('$a_1$');
    expect(r.html).not.toContain('<em>');
  });

  it('kod u redu i blok koda ostaju doslovni', () => {
    const r = markdownSaFormulama('`$x$` i $y$');
    expect(r.html).toContain('<code>$x$</code>');
    expect(r.html.match(/uz-formula/g)?.length).toBe(1);
    const blok = markdownSaFormulama('```\n$x$\n```');
    expect(blok.html).toContain('$x$');
    expect(blok.formula).toBe(false);
  });

  it('\\$ je dolar, ne formula; sirov HTML se izbacuje', () => {
    expect(markdownSaFormulama('\\$5 i \\$6')).toEqual({ html: expect.stringContaining('$5 i $6'), formula: false });
    expect(markdownSaFormulama('<img src=x onerror=y> $x$').html).not.toContain('<img');
    expect(markdownSaFormulama(null)).toEqual({ html: '', formula: false });
    expect(markdownSaFormulama('')).toEqual({ html: '', formula: false });
  });

  it('dolar u običnom tekstu ostaje tekst (Review Focus 1)', () => {
    for (const ulaz of ['Cena je 5$ i 10$', '$ 5', '$5 i $6', '$$', '$x', '$x\ny$', '$x$1']) {
      expect(markdownSaFormulama(ulaz).formula, ulaz).toBe(false);
    }
  });

  it('sirov <span class="uz-formula"> iz izvora ne pravi lažno mesto formule', () => {
    const r = markdownSaFormulama('<span class="uz-formula">$x$</span> tekst');
    expect(r.html.match(/<span class="uz-formula">/g)?.length).toBe(1);
    expect(markdownSaFormulama('<span class="uz-formula">x</span>').formula).toBe(false);
  });

  it('formula u naglašavanju i posle izbegnute kose crte (\\\\ je kosa crta, pa $ otvara formulu)', () => {
    expect(markdownSaFormulama('*$a_1$*').html).toContain('<em><span class="uz-formula">$a_1$</span></em>');
    expect(markdownSaFormulama('\\\\$x$').html).toContain('\\<span class="uz-formula">$x$</span>');
  });

  it('izvor formule je escape-ovan u mestu', () => {
    expect(markdownSaFormulama('$a<b$').html).toContain('<span class="uz-formula">$a&lt;b$</span>');
  });

  it('renderMarkdown (INFO) ne tumači $', () => {
    expect(renderMarkdown('$x$')).toContain('$x$');
    expect(renderMarkdown('$x$')).not.toContain('uz-formula');
  });

  it('$ posle cifre ne otvara formulu ni u Markdown-u (iznosi); 2$x$ namerno nije formula', () => {
    for (const ulaz of ['Košta 5$, a sa popustom 4$.', '10$-20$', '2$x$']) {
      expect(markdownSaFormulama(ulaz).formula, ulaz).toBe(false);
    }
    expect(markdownSaFormulama('Košta 5$, a sa popustom 4$.').html).toContain('Košta 5$, a sa popustom 4$.');
    for (const ulaz of ['$x$', 'a $x^2$ b', '($x$)', '2 $x$']) {
      expect(markdownSaFormulama(ulaz).formula, ulaz).toBe(true);
    }
  });

  it('alt slike sa formulom je LaTeX izvor, ne tekst markupa', () => {
    const html = markdownSaFormulama('![graf $x^2$ i &lt; "c"](http://a/b.png)').html;
    expect(html).toContain('alt="graf x^2 i &lt; &quot;c&quot;"');
    expect(html).not.toContain('uz-formula');
    expect(markdownSaFormulama('![obična](http://a/b.png)').html).toContain('alt="obična"');
  });

  it('linearnost: najgori slučaj do 2000 znakova u Markdown-u', () => {
    for (const ulaz of ['$a'.repeat(1000), '$a$1'.repeat(500), ('$a ' + '\\$').repeat(400), '![' + '$a'.repeat(995) + '](u)']) {
      expect(ulaz.length).toBeLessThanOrEqual(2000);
      const pocetak = performance.now();
      markdownSaFormulama(ulaz);
      expect(performance.now() - pocetak, ulaz.slice(0, 12)).toBeLessThan(GRANICA_ODBIJENE_MS);
    }
  });
});

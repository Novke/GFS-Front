import { GRANICA_MARKDOWN_MS, GRANICA_PROLAZI_MS } from './formula-vreme.testing';
import { MAX_TEKST_SA_FORMULAMA, markdownSaFormulama, renderMarkdown } from './markdown';

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

  it('naglašavanje i precrtavanje ne seku formulu: formula ima prednost (kao pandoc; hooks.emStrongMask)', () => {
    const f = (l: string) => `<span class="uz-formula">${l}</span>`;
    expect(markdownSaFormulama('*x $a*b$ y*').html).toContain(`<em>x ${f('$a*b$')} y</em>`);
    expect(markdownSaFormulama('**neka je $a**b$**').html).toContain(`<strong>neka je ${f('$a**b$')}</strong>`);
    expect(markdownSaFormulama('~~$a~~b$~~').html).toContain(`<del>${f('$a~~b$')}</del>`);
    expect(markdownSaFormulama('_x $z^* + y_1$ w_').html).toContain(`<em>x ${f('$z^* + y_1$')} w</em>`);
    // izbegnut dolar i kod u redu se ne maskiraju kao formula: naglašavanje radi kao bez formula
    expect(markdownSaFormulama('*a \\$ b* c$').html).toContain('<em>a $ b</em> c$');
    expect(markdownSaFormulama('*a `$b*` c*').html).toContain('<em>a <code>$b*</code> c</em>');
    // iznos (cifra pre $) nije formula, pa ni maska: `*5$ i 6$*` ostaje kurziv
    expect(markdownSaFormulama('*5$ i 6$*').html).toContain('<em>5$ i 6$</em>');
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

  it(`granica: tekst duži od ${MAX_TEKST_SA_FORMULAMA} znakova je običan Markdown (bez formula i bez maske)`, () => {
    expect(MAX_TEKST_SA_FORMULAMA).toBe(4000); // 2x granica servera za tekst pitanja (2000)
    const pun = 'Koliko je $x_1$? ' + 'a'.repeat(MAX_TEKST_SA_FORMULAMA - 17);
    expect(pun.length).toBe(MAX_TEKST_SA_FORMULAMA);
    expect(markdownSaFormulama(pun).formula).toBe(true);
    const preko = markdownSaFormulama(pun + 'b');
    expect(preko.formula).toBe(false);
    expect(preko.html).not.toContain('uz-formula');
    expect(preko.html).toBe(renderMarkdown(pun + 'b'));
  });

  it('20 000 znakova (obrazac koji je sa maskom bacao stack overflow od ~15 500): bez izuzetka i brzo', () => {
    const n = 20_000;
    const ulazi = [
      '*'.repeat(n / 4) + '$a*b$'.repeat(n / 10) + '*'.repeat(n / 4),
      '*$a*b$ '.repeat(Math.floor(n / 7)), '_$x_$ '.repeat(n / 6), '$a'.repeat(n / 2),
    ];
    for (const ulaz of ulazi) {
      const pocetak = performance.now();
      expect(() => markdownSaFormulama(ulaz), ulaz.slice(0, 12)).not.toThrow();
      // labava granica (`formula-vreme.testing`, CI je 2-3x sporiji); običan Markdown na 20 000 znakova je reda 10 ms
      expect(performance.now() - pocetak, ulaz.slice(0, 12)).toBeLessThan(GRANICA_PROLAZI_MS);
      expect(markdownSaFormulama(ulaz).formula).toBe(false);
    }
  });

  it('linearnost: najgori slučaj do 2000 znakova u Markdown-u', () => {
    // i najgori izmereni obrasci za Markdown (recenzija F1): izbegnuta kosa crta pre $ i \\ ispred svake formule
    const ulazi = [
      '$a'.repeat(1000), '$a$1'.repeat(500), ('$a ' + '\\$').repeat(400), '![' + '$a'.repeat(995) + '](u)',
      '$a\\'.repeat(666), '$' + '\\a'.repeat(999), '\\\\$a'.repeat(500),
      // maska formula za naglašavanje (emStrongMask): mnogo `*` i `$`
      '*$a*b$ '.repeat(285), '*$a'.repeat(666), '~~$a~~'.repeat(333),
    ];
    for (const ulaz of ulazi) {
      expect(ulaz.length).toBeLessThanOrEqual(2000);
      const pocetak = performance.now();
      markdownSaFormulama(ulaz);
      expect(performance.now() - pocetak, ulaz.slice(0, 12)).toBeLessThan(GRANICA_MARKDOWN_MS);
    }
  });
});

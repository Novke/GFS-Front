import { renderMarkdown } from './markdown';

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

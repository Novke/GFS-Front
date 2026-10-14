import { imenaZaPrikaz } from './prijava-ekran.component';

describe('imenaZaPrikaz', () => {
  it('najnovija prijava je prva', () => {
    expect(imenaZaPrikaz(['Ana', 'Bojan', 'Ceca'], 3)).toEqual({ imena: ['Ceca', 'Bojan', 'Ana'], jos: 0 });
  });

  it('najviše 60 imena, ostatak kao +N', () => {
    const imena = Array.from({ length: 65 }, (_, i) => 'Ime ' + (i + 1));
    const prikaz = imenaZaPrikaz(imena, 65);
    expect(prikaz.imena.length).toBe(60);
    expect(prikaz.imena[0]).toBe('Ime 65');
    expect(prikaz.jos).toBe(5);
  });

  it('+N računa i učesnike bez imena u spisku', () => {
    expect(imenaZaPrikaz(['Ana'], 4)).toEqual({ imena: ['Ana'], jos: 3 });
  });

  it('prazno', () => {
    expect(imenaZaPrikaz([], 0)).toEqual({ imena: [], jos: 0 });
  });
});

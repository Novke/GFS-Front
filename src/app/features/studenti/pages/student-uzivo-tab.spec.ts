import { describe, expect, it } from 'vitest';

import { linkCasa } from './student-uzivo-tab';

describe('linkCasa', () => {
  it('predavanje ima prednost; izvođenje bez predavanja vodi na pregled', () => {
    expect(linkCasa({ predavanjeId: 4, izvodjenjeId: null })).toEqual(['/predavanja', '4']);
    expect(linkCasa({ predavanjeId: null, izvodjenjeId: 7 })).toEqual(['/izvodjenja', '7', 'pregled']);
    expect(linkCasa({ predavanjeId: null, izvodjenjeId: null })).toBeNull();
  });
});

import { ValidationErrors } from '@angular/forms';

/**
 * Poruka na srpskom za prvu grešku validacije polja (prioritet: required, pa ostalo po redosledu ispod).
 * `labela` je ime polja sa velikim početnim slovom ("Prezime"). `null` kad nema greške.
 */
export function porukaValidacije(errors: ValidationErrors | null, labela: string): string | null {
  if (!errors) {
    return null;
  }
  if (errors['required']) {
    return `${labela} je obavezno.`;
  }
  if (errors['email']) {
    return 'Email nije ispravan.';
  }
  if (errors['min']) {
    return `Najmanje ${errors['min'].min}.`;
  }
  if (errors['max']) {
    return `Najviše ${errors['max'].max}.`;
  }
  if (errors['minlength']) {
    return `Najmanje ${errors['minlength'].requiredLength} znakova.`;
  }
  if (errors['maxlength']) {
    return `Najviše ${errors['maxlength'].requiredLength} znakova.`;
  }
  if (errors['pattern']) {
    return 'Neispravan format.';
  }
  return Object.keys(errors).length > 0 ? 'Neispravna vrednost.' : null;
}

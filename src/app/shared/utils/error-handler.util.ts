import { HttpErrorResponse } from '@angular/common/http';

export class ErrorHandlerUtil {
  static handleHttpError(error: HttpErrorResponse): void {
    if (error.status >= 400 && error.status < 500) {
      const reason = error.error?.reason || 'Sistemska greska';
      alert(`Greska: ${reason}`);
    } else {
      console.error('Neuspesno kreiranje testa', error);
    }
  }
}
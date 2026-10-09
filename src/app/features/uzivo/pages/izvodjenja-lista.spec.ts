import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationStore } from '../../../core/state/notification.store';
import { IzvodjenjeInfo } from '../data-access/uzivo.models';
import { IzvodjenjaListaPage } from './izvodjenja-lista.page';

function izv(id: number, izmene: Partial<IzvodjenjeInfo> = {}): IzvodjenjeInfo {
  return {
    id, prezentacija: { id: 3, naziv: 'Statika', predmetId: 7 }, kod: '123456', status: 'ZAVRSENO', cuvanje: true,
    grupa: { id: 2, naziv: 'GD-2025' }, predavanje: null, pocetak: '2026-10-07T10:00:00', kraj: '2026-10-07T11:00:00',
    brojUcesnika: 12, brojPitanja: 5, ...izmene,
  };
}

describe('IzvodjenjaListaPage', () => {
  let http: HttpTestingController;
  let potvrda: ReturnType<typeof vi.spyOn>;
  let uspeh: ReturnType<typeof vi.spyOn>;
  let greska: ReturnType<typeof vi.spyOn>;

  function otvori(lista: IzvodjenjeInfo[]) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '3']]) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    potvrda = vi.spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(true) } as unknown as MatDialogRef<unknown>);
    uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');
    greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    const fixture = TestBed.createComponent(IzvodjenjaListaPage);
    http.expectOne('api/izvodjenja?prezentacijaId=3').flush(lista);
    http.expectOne('api/prezentacije/3').flush({ id: 3, naziv: 'Statika' });
    fixture.detectChanges();
    return fixture;
  }

  const redovi = (el: HTMLElement) => Array.from(el.querySelectorAll('tbody tr')) as HTMLElement[];
  const tekst = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ');

  const brojevi = (red: HTMLElement) => Array.from(red.querySelectorAll('td.uz-ed-broj')).map(td => (td.textContent ?? '').trim());

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('aktivno ima Nastavi, sačuvano završeno Pregled i Obriši, nesačuvano samo Obriši', () => {
    const el = otvori([
      izv(3, { status: 'AKTIVNO', kraj: null }), izv(2), izv(1, { cuvanje: false, brojUcesnika: 0, brojPitanja: 0 }),
    ]).nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Statika');
    const [aktivno, sacuvano, nesacuvano] = redovi(el);
    expect(tekst(aktivno)).toContain('U toku');
    expect(tekst(aktivno)).toContain('kod 123 456');
    expect(tekst(aktivno)).toContain('Nastavi');
    expect(tekst(aktivno)).not.toContain('Obriši');
    expect(tekst(aktivno)).not.toContain('Pregled');
    expect(tekst(sacuvano)).toContain('Sačuvano');
    expect(tekst(sacuvano)).toContain('Pregled');
    expect(tekst(sacuvano)).toContain('Obriši');
    expect(brojevi(sacuvano)).toEqual(['12', '5']);
    expect(tekst(nesacuvano)).toContain('Ne čuva se');
    expect(tekst(nesacuvano)).not.toContain('Pregled');
    expect(tekst(nesacuvano)).toContain('Obriši');
    expect(brojevi(nesacuvano)).toEqual(['–', '–']);
  });

  it('Obriši uz potvrdu briše red', () => {
    const fixture = otvori([izv(2), izv(1)]);
    const el = fixture.nativeElement as HTMLElement;
    (redovi(el)[0].querySelector('button') as HTMLButtonElement).click();
    expect(potvrda).toHaveBeenCalled();
    http.expectOne({ method: 'DELETE', url: 'api/izvodjenja/2' }).flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(redovi(el).length).toBe(1);
    expect(uspeh).toHaveBeenCalledWith('Izvođenje je obrisano.');
  });

  it('otkazana potvrda ne šalje DELETE', () => {
    const fixture = otvori([izv(2)]);
    potvrda.mockReturnValue({ afterClosed: () => of(false) } as unknown as MatDialogRef<unknown>);
    const el = fixture.nativeElement as HTMLElement;
    (redovi(el)[0].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(potvrda).toHaveBeenCalledTimes(1);
    const konfig = potvrda.mock.calls[0][1] as { role: string; data: { naslov: string; tekst: string[]; potvrdi: string; destruktivno: boolean } };
    expect(konfig.role).toBe('alertdialog');
    const podaci = konfig.data;
    expect(podaci.destruktivno).toBe(true);
    expect(podaci.potvrdi).toBe('Obriši');
    expect(podaci.naslov).toBe('Obrisati izvođenje?');
    expect(podaci.tekst[0]).toContain('trajno obrisano');
    expect(redovi(el).length).toBe(1);
    expect(uspeh).not.toHaveBeenCalled();
    expect(greska).not.toHaveBeenCalled();
    http.expectNone('api/izvodjenja/2');
  });

  it('tabela ima skriven naslov', () => {
    const el = otvori([izv(1)]).nativeElement as HTMLElement;
    expect(el.querySelector('table caption')?.textContent).toBe('Izvođenja prezentacije');
  });

  it('greška pri brisanju ostavlja red i javlja razlog', () => {
    const fixture = otvori([izv(2)]);
    const el = fixture.nativeElement as HTMLElement;
    (redovi(el)[0].querySelector('button') as HTMLButtonElement).click();
    http.expectOne('api/izvodjenja/2').flush({ reason: 'Izvođenje je u toku.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(redovi(el).length).toBe(1);
    expect(greska).toHaveBeenCalledWith('Izvođenje je u toku.');
  });

  it('prazna lista', () => {
    const el = otvori([]).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ova prezentacija još nije izvođena.');
    expect(el.querySelector('table')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import type { CvorIzbora } from '../../../core/api/banka-izbor.api';
import { IzborGrupeOtvarac } from './izbor-grupe-otvarac';
import { IzborGrupeDialog } from './izbor-grupe.dialog';

describe('IzborGrupeOtvarac', () => {
  const LIST: CvorIzbora = { id: 2, naziv: '2 → 10', list: true, brojAktivnih: 1, iskljucena: false, deca: [] };
  let otvarac: IzborGrupeOtvarac;
  let zatvaranje: Subject<CvorIzbora | undefined>;
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // chunk dijaloga je već učitan (prvi dinamički uvoz u jsdom-u traje van testa)
    await import('./izbor-grupe.dialog');
    TestBed.configureTestingModule({});
    otvarac = TestBed.inject(IzborGrupeOtvarac);
    zatvaranje = new Subject();
    open = vi.spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => zatvaranje } as unknown as MatDialogRef<unknown>);
  });

  afterEach(() => vi.restoreAllMocks());

  it('otvara lenji dijalog sa podacima i emituje izabran čvor', async () => {
    const rez = vi.fn();
    otvarac.izaberi({ predmetId: 1, grupaId: null }).subscribe(rez);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith(IzborGrupeDialog, expect.objectContaining({ data: { predmetId: 1, grupaId: null } }));
    zatvaranje.next(LIST);
    zatvaranje.complete();
    expect(rez).toHaveBeenCalledWith(LIST);
  });

  it('jedan izbor u isto vreme: drugi poziv dok se chunk učitava ili je dijalog otvoren odmah emituje undefined; posle zatvaranja radi', async () => {
    const prvi = vi.fn();
    const drugi = vi.fn();
    otvarac.izaberi({ predmetId: 1, grupaId: null }).subscribe(prvi);
    otvarac.izaberi({ predmetId: 1, grupaId: null }).subscribe(drugi);
    expect(drugi).toHaveBeenCalledWith(undefined);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    zatvaranje.next(undefined);
    zatvaranje.complete();
    expect(prvi).toHaveBeenCalledWith(undefined);

    zatvaranje = new Subject();
    const treci = vi.fn();
    otvarac.izaberi({ predmetId: 1, grupaId: 2 }).subscribe(treci);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  });

  it('otvoren drugi dijalog (npr. potvrda): izbor se ne otvara', () => {
    const dialog = TestBed.inject(MatDialog);
    vi.spyOn(dialog, 'openDialogs', 'get').mockReturnValue([{} as MatDialogRef<unknown>]);
    const rez = vi.fn();
    otvarac.izaberi({ predmetId: 1, grupaId: null }).subscribe(rez);
    expect(rez).toHaveBeenCalledWith(undefined);
    expect(open).not.toHaveBeenCalled();
  });
});

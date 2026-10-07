import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../ui/confirm-dialog';
import { NemaNesacuvanih, unsavedChangesGuard } from './unsaved-changes.guard';

const pozovi = (c: NemaNesacuvanih) =>
  TestBed.runInInjectionContext(() =>
    unsavedChangesGuard(c, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot)) as boolean | Observable<boolean>;

describe('unsavedChangesGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('bez izmena dozvoljava odlazak bez pitanja', () => {
    const otvori = vi.spyOn(ConfirmDialog, 'otvori');
    expect(pozovi({ imaNesacuvanihIzmena: () => false })).toBe(true);
    expect(otvori).not.toHaveBeenCalled();
  });

  it.each([true, false])('sa izmenama pita korisnika i vraća njegov izbor (%s)', async izbor => {
    const otvori = vi.spyOn(ConfirmDialog, 'otvori').mockReturnValue(of(izbor));
    const rez = pozovi({ imaNesacuvanihIzmena: () => true }) as Observable<boolean>;
    await expect(new Promise(r => rez.subscribe(r))).resolves.toBe(izbor);
    expect(otvori).toHaveBeenCalledOnce();
    expect(otvori.mock.calls[0][1].destruktivno).toBe(true);
  });
});

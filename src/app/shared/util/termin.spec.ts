import { blokVremena, danIDatum, danUNedelji, dodajDane, hhmm, isoDatum, lokalniDatum, relativniDan } from './termin';

describe('termin', () => {
  it('dan u nedelji po ISO (ponedeljak 1, nedelja 7)', () => {
    expect(danUNedelji('2026-11-02')).toBe(1);
    expect(danUNedelji('2026-11-04')).toBe(3);
    expect(danUNedelji('2026-11-08')).toBe(7);
    expect(danUNedelji('2026-02-30')).toBe(0);
    expect(danUNedelji('nije')).toBe(0);
  });

  it('datum se čita lokalno, bez UTC pomaka', () => {
    const d = lokalniDatum('2026-11-04')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 4, 0]);
    expect(isoDatum(d)).toBe('2026-11-04');
    expect(lokalniDatum(null)).toBeNull();
  });

  it('dodaje dane preko granice meseca i letnjeg računanja vremena', () => {
    expect(dodajDane('2026-10-24', 7)).toBe('2026-10-31');
    expect(dodajDane('2026-10-31', 1)).toBe('2026-11-01');
    expect(dodajDane('2026-12-31', 1)).toBe('2027-01-01');
    expect(dodajDane('2026-11-04', -28)).toBe('2026-10-07');
    expect(dodajDane('x', 1)).toBe('x');
  });

  it('vreme i blok', () => {
    expect(hhmm('10:00:00')).toBe('10:00');
    expect(hhmm('08:15')).toBe('08:15');
    expect(hhmm(null)).toBe('');
    expect(blokVremena('10:00:00', '13:30:00')).toBe('10:00–13:30');
  });

  it('dan i datum, relativni dan', () => {
    expect(danIDatum('2026-11-04')).toBe('sreda 4. 11.');
    expect(danIDatum('2026-11-08')).toBe('nedelja 8. 11.');
    expect(danIDatum('')).toBe('—');
    expect(relativniDan('2026-11-04', '2026-11-04')).toBe('danas');
    expect(relativniDan('2026-11-05', '2026-11-04')).toBe('sutra');
    expect(relativniDan('2026-11-06', '2026-11-04')).toBe('');
    expect(relativniDan('2027-01-01', '2026-12-31')).toBe('sutra');
  });
});

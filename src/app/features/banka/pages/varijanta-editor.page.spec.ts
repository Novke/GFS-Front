import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import { unsavedChangesGuard } from '../../../shared/forms/unsaved-changes.guard';
import { BANKA_RUTE } from '../banka.routes';
import { BankaApi } from '../data-access/banka.api';
import { GrupaDetails, OdgovorPolja, Polje, VarijantaCmd, VarijantaDetails } from '../data-access/banka.models';
import { novoPolje } from '../data-access/polja';
import { KASNJENJE_PREGLEDA } from '../data-access/render-proba';
import { VELICINA_PREGLEDA_KLJUC, VelicinaPregledaPostavka } from '../data-access/velicina-pregleda';
import { povratakNaPregled, VarijantaEditorPage } from './varijanta-editor.page';

@Component({ template: 'druga' })
class Druga {}

const POLJE_A: Polje = { ...novoPolje('BROJ', []), kljuc: 'a', oznaka: 'Vrednost u dekadnom sistemu' };
const prazno: OdgovorPolja = { broj: null, prihvatljivi: null, tacna: null, tacne: null };

function grupa(izmena: Partial<GrupaDetails> = {}): GrupaDetails {
  return {
    id: 2, predmetId: 7, roditeljId: 1, namena: 'PREDAVANJE', naziv: '2 → 10', opis: null, rb: 1, tezina: 2, uputstvo: null,
    polja: [POLJE_A], putanja: [{ id: 1, naziv: 'Konverzije brojeva' }, { id: 2, naziv: '2 → 10' }], list: true,
    brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 2, brojGresaka: 1, izmenjeno: '2026-10-17T10:00:00', izvor: 'RUCNO', serija: null,
    iskljucena: false, iskljucenjeId: null, ...izmena,
  };
}

function varijanta(izmena: Partial<VarijantaDetails> = {}): VarijantaDetails {
  return {
    id: 13, grupaId: 2, putanja: grupa().putanja, rb: 3, naziv: '100111 u dekadni', tekst: 'Pretvori\n$100111_2$\n\\foo u dekadni.',
    resenje: null, odgovori: { a: { ...prazno, broj: 39 } }, polja: [POLJE_A], prilozi: [], status: 'NACRT', izvor: 'RUCNO',
    renderStatus: 'GRESKA', svgId: null, resenjeSvgId: null, renderGreska: { linija: 3, poruka: 'Undefined control sequence \\foo' },
    renderDeo: 'tekst', kreirano: '2026-10-17T10:00:00', izmenjeno: '2026-10-17T10:00:00', ikadOdobrena: false, zamenjuje: null, serija: null,
    nivo: 2, ...izmena,
  };
}

/** Sadržaj komande u odgovoru servera (prilozi i izvor se ne prenose). */
const izCmd = (c: VarijantaCmd): Partial<VarijantaDetails> => ({ naziv: c.naziv, tekst: c.tekst, resenje: c.resenje, odgovori: c.odgovori });

const OK: Partial<VarijantaDetails> = { renderStatus: 'OK', renderGreska: null, renderDeo: null, svgId: 'svg-1' };

describe('VarijantaEditorPage', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const api = {
    grupa: vi.fn(),
    varijanta: vi.fn(),
    kreirajVarijantu: vi.fn(),
    izmeniVarijantu: vi.fn(),
    promeniNivo: vi.fn(),
    odobri: vi.fn(),
    arhiviraj: vi.fn(),
    vratiUNacrt: vi.fn(),
    dupliraj: vi.fn(),
    obrisiVarijantu: vi.fn(),
    render: vi.fn(),
    renderProba: vi.fn(),
    svg: vi.fn(),
    prilog: vi.fn(),
  };
  const el = () => harness.routeNativeElement as HTMLElement;
  const stranica = () => harness.routeDebugElement!.componentInstance as VarijantaEditorPage;

  async function stabilno(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await harness.fixture.whenStable();
      await new Promise(r => setTimeout(r));
    }
  }
  /** Otvara editor; sačuvana varijanta sa uspelim renderom se otvara u prikazu Pregled, pa se (osim sa `uPregledu`) prelazi na LaTeX. */
  async function otvori(url: string, uPregledu = false): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    await stabilno();
    if (!uPregledu) {
      await urediLatex();
    }
    return el();
  }
  async function urediLatex(): Promise<void> {
    const dugmeLatex = el().querySelector<HTMLButtonElement>('[data-rezim="latex"][aria-pressed="false"]');
    if (dugmeLatex) {
      dugmeLatex.click();
      await stabilno();
    }
  }
  /** Polje editora dela; `mat-tab-group` iscrtava karticu tek kad je prvi put izabrana (`preserveContent` je posle čuva). */
  const editor = (deo: 'tekst' | 'resenje') => el().querySelector<HTMLTextAreaElement>(`app-latex-editor[data-deo="${deo}"] textarea`)!;
  const dugme = (s: string) => el().querySelector<HTMLButtonElement>(`[${s}]`)!;
  const onemoguceno = (b: HTMLButtonElement) => b.disabled || b.getAttribute('aria-disabled') === 'true';
  async function unesi(e: HTMLInputElement | HTMLTextAreaElement, vrednost: string): Promise<void> {
    e.value = vrednost;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    await stabilno();
  }
  async function klik(e: HTMLElement): Promise<void> {
    e.click();
    await stabilno();
  }
  const brojOdgovora = () => el().querySelector<HTMLInputElement>('app-odgovori-forma input[data-broj]')!;
  const istaknute = (deo: 'tekst' | 'resenje') =>
    [...el().querySelectorAll(`app-latex-editor[data-deo="${deo}"] .bk-le-istaknuta`)].map(b => b.textContent!.trim());
  const kartica = (naziv: string) => [...el().querySelectorAll<HTMLElement>('[role="tab"]')].find(t => t.textContent!.includes(naziv))!;
  const aktivniTab = () => el().querySelector('[role="tab"][aria-selected="true"]')!.textContent!.trim();

  beforeEach(async () => {
    localStorage.removeItem(VELICINA_PREGLEDA_KLJUC);
    for (const f of Object.values(api)) {
      f.mockReset();
    }
    api.grupa.mockImplementation(() => of(grupa()));
    api.varijanta.mockImplementation(() => of(varijanta()));
    api.renderProba.mockReturnValue(NEVER);
    api.svg.mockImplementation((id: string) => of(`<svg xmlns="http://www.w3.org/2000/svg"><path id="${id}" d="M0 0"/></svg>`));
    api.kreirajVarijantu.mockImplementation((_g: number, cmd: VarijantaCmd) => of(varijanta({ ...OK, id: 15, ...izCmd(cmd) })));
    api.izmeniVarijantu.mockImplementation((id: number, cmd: VarijantaCmd) => of(varijanta({ ...OK, id, ...izCmd(cmd) })));
    api.odobri.mockImplementation((id: number) => of(varijanta({ ...OK, id, status: 'AKTIVNA' })));
    TestBed.configureTestingModule({
      providers: [
        // `/banka` i `/banka/pregled` (odredišta posle čuvanja) su ovde prazne stranice: prave bi učitavale stablo i nacrte
        provideRouter([
          {
            path: 'banka',
            children: [
              { path: '', pathMatch: 'full', component: Druga }, { path: 'pregled', component: Druga },
              ...BANKA_RUTE.filter(r => r.path !== '' && r.path !== 'pregled'),
            ],
          },
          { path: '**', component: Druga },
        ], withComponentInputBinding()),
        { provide: BankaApi, useValue: api },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  it('nova: grupa iz ?grupa, zaglavlje sa putanjom, prazan editor; čuvanje čeka tekst i odgovor', async () => {
    const e = await otvori('/banka/varijante/nova?grupa=2');
    expect(api.grupa).toHaveBeenCalledWith(2, { tiho: true });
    expect(e.querySelector('h1')!.textContent).toBe('Nova varijanta');
    expect([...e.querySelectorAll<HTMLAnchorElement>('[data-putanja] a')].map(a => a.getAttribute('href'))).toEqual([
      '/banka?predmet=7&namena=PREDAVANJE&grupa=1', '/banka?predmet=7&namena=PREDAVANJE&grupa=2',
    ]);
    expect(editor('tekst').value).toBe('');
    expect(onemoguceno(dugme('data-sacuvaj'))).toBe(true);
    expect(e.querySelector('[data-nedostaje]')!.textContent).toContain('tekst zadatka');
    expect(e.querySelector('[data-nedostaje]')!.textContent).toContain('odgovor za polje „Vrednost u dekadnom sistemu“');
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
  });

  it('nova: "Sačuvaj kao nacrt" šalje VarijantaCmd sa odgovorima i prilozima (izvor RUCNO), pa vodi na /banka sa grupom', async () => {
    api.prilog.mockReturnValue(of({ id: 'm9', naziv: 'Graf.png', mime: 'image/png', velicina: 100 }));
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'Pretvori $101101_2$ u dekadni.');
    await unesi(brojOdgovora(), '45');
    const input = el().querySelector<HTMLInputElement>('app-prilozi input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'Graf.png', { type: 'image/png' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await stabilno();
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
    const uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');

    await klik(dugme('data-sacuvaj'));

    expect(api.kreirajVarijantu).toHaveBeenCalledExactlyOnceWith(2, {
      naziv: null, tekst: 'Pretvori $101101_2$ u dekadni.', resenje: null, odgovori: { a: { ...prazno, broj: 45 } },
      prilozi: [{ ime: 'graf', medijId: 'm9' }], izvor: 'RUCNO', nivo: 2,
    }, { tiho: true });
    expect(api.odobri).not.toHaveBeenCalled();
    expect(uspeh).toHaveBeenCalledWith('Varijanta je sačuvana kao nacrt.');
    expect(router.url).toBe('/banka?predmet=7&namena=PREDAVANJE&grupa=2');
  });

  const nivoDugme = (n: number) => el().querySelector<HTMLButtonElement>(`[data-nivo-varijante] [role=radio][data-nivo="${n}"]`)!;
  const izabranNivo = () => [1, 2, 3].find(n => nivoDugme(n).getAttribute('aria-checked') === 'true');

  it('nova: nivo je podrazumevano 2, izbor ide u komandi kreiranja, a izbor nije nesačuvana izmena', async () => {
    await otvori('/banka/varijante/nova?grupa=2');
    expect(izabranNivo()).toBe(2);
    await klik(nivoDugme(3));
    expect(izabranNivo()).toBe(3);
    expect(api.promeniNivo).not.toHaveBeenCalled();
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
    await unesi(editor('tekst'), 'Zadatak');
    await unesi(brojOdgovora(), '1');
    await klik(dugme('data-sacuvaj'));
    expect(api.kreirajVarijantu.mock.calls[0][1]).toMatchObject({ izvor: 'RUCNO', nivo: 3 });
  });

  it('izmena: nivo se menja odmah kroz PATCH (ne kroz PUT), bez nesačuvanih izmena, a "Sačuvaj" ne šalje nivo', async () => {
    api.varijanta.mockImplementation(() => of(varijanta({ ...OK, nivo: 1 })));
    api.promeniNivo.mockImplementation((id: number, nivo: number) => of(varijanta({ ...OK, id, nivo })));
    await otvori('/banka/varijante/13');
    expect(izabranNivo()).toBe(1);

    await klik(nivoDugme(3));
    expect(izabranNivo()).toBe(3);
    expect(api.promeniNivo).toHaveBeenCalledExactlyOnceWith(13, 3, { tiho: true });
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
    expect(api.izmeniVarijantu).not.toHaveBeenCalled();

    await unesi(editor('tekst'), 'Nov tekst');
    await klik(dugme('data-sacuvaj'));
    expect(api.izmeniVarijantu).toHaveBeenCalledOnce();
    expect(api.izmeniVarijantu.mock.calls[0][1]).not.toHaveProperty('nivo');
  });

  it('izmena: greška PATCH-a vraća prethodni nivo i javlja razlog', async () => {
    api.varijanta.mockImplementation(() => of(varijanta({ ...OK, nivo: 1 })));
    api.promeniNivo.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Nivo mora biti od 1 do 3.' } })));
    await otvori('/banka/varijante/13');
    const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    await klik(nivoDugme(2));
    expect(izabranNivo()).toBe(1);
    expect(greska).toHaveBeenCalledWith('Nivo mora biti od 1 do 3.');
  });

  it('posle uspelog čuvanja nove varijante Nazad ne otvara opet praznu formu (replaceUrl)', async () => {
    const lokacija = TestBed.inject(Location);
    router.setUpLocationChangeListener();
    await harness.navigateByUrl('/pre');
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'Zadatak');
    await unesi(brojOdgovora(), '1');
    await klik(dugme('data-sacuvaj'));
    expect(router.url).toBe('/banka?predmet=7&namena=PREDAVANJE&grupa=2');
    lokacija.back();
    await stabilno();
    expect(router.url).toBe('/pre');
  });

  it('dok se čuva: forma je onemogućena, traka napretka i napomena o trajanju rendera', async () => {
    api.kreirajVarijantu.mockReturnValue(NEVER);
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'x');
    await unesi(brojOdgovora(), '1');
    // živa oblast postoji i pre čuvanja (prazna), pa čitač ekrana najavi kad dobije tekst
    const status = el().querySelector('[role="status"][data-status]')!;
    expect(status.textContent!.trim()).toBe('');
    await klik(dugme('data-sacuvaj'));
    expect(el().querySelector('mat-progress-bar')).not.toBeNull();
    expect(el().querySelector('[role="status"][data-status]')).toBe(status);
    expect(status.textContent).toContain('Čuva se i renderuje… Renderovanje može potrajati do minut.');
    expect(editor('tekst').disabled).toBe(true);
    expect(brojOdgovora().disabled).toBe(true);
    expect(onemoguceno(dugme('data-sacuvaj'))).toBe(true);
    // drugi klik ne pravi drugi zahtev
    await klik(dugme('data-sacuvaj'));
    expect(api.kreirajVarijantu).toHaveBeenCalledTimes(1);
  });

  it('grupa bez težine: poruka sa vezom na grupu i bez čuvanja', async () => {
    api.grupa.mockReturnValue(of(grupa({ tezina: null })));
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'x');
    await unesi(brojOdgovora(), '1');
    const poruka = el().querySelector('[data-bez-tezine]')!;
    expect(poruka.textContent).toContain('nema težinu');
    expect(poruka.querySelector('a')!.getAttribute('href')).toBe('/banka/grupe/2');
    expect(onemoguceno(dugme('data-sacuvaj'))).toBe(true);
    expect(onemoguceno(dugme('data-sacuvaj-odobri'))).toBe(true);
    await klik(dugme('data-sacuvaj'));
    expect(api.kreirajVarijantu).not.toHaveBeenCalled();
  });

  it('izmena: sačuvana greška rendera ističe liniju u editoru teksta, kartica Tekst', async () => {
    const e = await otvori('/banka/varijante/13');
    expect(api.varijanta).toHaveBeenCalledWith(13, { tiho: true });
    expect(api.grupa).toHaveBeenCalledWith(2, { tiho: true });
    expect(e.querySelector('h1')!.textContent).toBe('100111 u dekadni');
    expect(editor('tekst').value).toBe('Pretvori\n$100111_2$\n\\foo u dekadni.');
    expect(brojOdgovora().value).toBe('39');
    expect(aktivniTab()).toContain('Tekst');
    expect(istaknute('tekst')).toEqual(['3']);
    expect(e.querySelector('#bk-ve-greska-tekst')!.textContent).toContain('Greška u liniji 3: Undefined control sequence \\foo');
    expect(editor('tekst').getAttribute('aria-describedby')).toContain('bk-ve-greska-tekst');
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);

    // izmena teksta: sačuvana greška više ne važi za taj sadržaj
    await unesi(editor('tekst'), 'Pretvori u dekadni.');
    expect(istaknute('tekst')).toEqual([]);
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
  });

  it('izmena: greška u rešenju bira karticu Rešenje i ističe liniju u njenom editoru', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ tekst: 'Zadatak', resenje: 'a\n\\foo', renderGreska: { linija: 2, poruka: 'X' }, renderDeo: 'resenje' })));
    await otvori('/banka/varijante/13');
    expect(aktivniTab()).toContain('Rešenje');
    // kartica sa greškom to kaže i rečju (ne samo ikonom)
    expect(kartica('Rešenje').textContent).toContain('greška');
    expect(kartica('Tekst').textContent).not.toContain('greška');
    expect(editor('resenje').value).toBe('a\n\\foo');
    expect(istaknute('resenje')).toEqual(['2']);
    expect(istaknute('tekst')).toEqual([]);
  });

  it('"Sačuvaj i odobri": PUT pa odobri, pa /banka; bez izmena samo odobri', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak' })));
    await otvori('/banka/varijante/13');
    await unesi(editor('tekst'), 'Zadatak 2');
    await klik(dugme('data-sacuvaj-odobri'));
    expect(api.izmeniVarijantu).toHaveBeenCalledExactlyOnceWith(13, {
      naziv: '100111 u dekadni', tekst: 'Zadatak 2', resenje: null, odgovori: { a: { ...prazno, broj: 39 } }, prilozi: [],
    }, { tiho: true });
    expect(api.odobri).toHaveBeenCalledExactlyOnceWith(13, { tiho: true });
    expect(router.url).toBe('/banka?predmet=7&namena=PREDAVANJE&grupa=2');

    api.izmeniVarijantu.mockClear();
    api.odobri.mockClear();
    await otvori('/banka/varijante/13');
    await klik(dugme('data-sacuvaj-odobri'));
    expect(api.izmeniVarijantu).not.toHaveBeenCalled();
    expect(api.odobri).toHaveBeenCalledTimes(1);
  });

  it('"Sačuvaj i odobri" kad render padne: ne odobrava, ostaje, poruka i istaknuta linija u pravoj kartici', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak', resenje: 'r' })));
    api.izmeniVarijantu.mockImplementation((id: number, cmd: VarijantaCmd) =>
      of(varijanta({ id, ...izCmd(cmd), renderGreska: { linija: 2, poruka: 'Undefined control sequence \\foo' }, renderDeo: 'resenje' })));
    await otvori('/banka/varijante/13');
    await klik(kartica('Rešenje'));
    await unesi(editor('resenje'), 'r\n\\foo');
    await klik(kartica('Tekst'));

    await klik(dugme('data-sacuvaj-odobri'));

    expect(api.odobri).not.toHaveBeenCalled();
    expect(router.url).toBe('/banka/varijante/13');
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('sačuvana kao nacrt');
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('linija 2');
    expect(aktivniTab()).toContain('Rešenje');
    expect(istaknute('resenje')).toEqual(['2']);
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
  });

  /** Nova varijanta 15 sa greškom u liniji 3 teksta, kako je server čuva (i vraća pri učitavanju njenog editora). */
  function novaSaGreskom(): void {
    let sacuvana: VarijantaDetails | null = null;
    api.kreirajVarijantu.mockImplementation((_g: number, cmd: VarijantaCmd) => of(sacuvana = varijanta({ ...izCmd(cmd), id: 15, naziv: null })));
    api.varijanta.mockImplementation((id: number) => of(id === 15 && sacuvana ? sacuvana : varijanta()));
  }

  for (const [dugmeCuvanja, deo] of [['data-sacuvaj-odobri', 'ali nije odobrena: render nije uspeo'], ['data-sacuvaj', 'ali render nije uspeo']] as const) {
    it(`nova varijanta sa neuspelim renderom (${dugmeCuvanja}): postaje izmena (bez novog unosa u istoriji), traka i istaknuta linija`, async () => {
      novaSaGreskom();
      const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
      await otvori('/banka/varijante/nova?grupa=2');
      await unesi(editor('tekst'), 'a\nb\n\\foo');
      await unesi(brojOdgovora(), '1');
      await klik(dugme(dugmeCuvanja));
      await stabilno();
      expect(api.odobri).not.toHaveBeenCalled();
      expect(router.url).toBe('/banka/varijante/15');
      const traka = el().querySelector('app-form-error-banner [role="alert"]')!;
      expect(traka.textContent).toContain(`Varijanta je sačuvana kao nacrt, ${deo} (tekst, linija 3: Undefined control sequence \\foo)`);
      expect(document.activeElement).toBe(traka);
      expect(aktivniTab()).toContain('Tekst');
      expect(istaknute('tekst')).toEqual(['3']);
      expect(editor('tekst').value).toBe('a\nb\n\\foo');
      expect(greska).not.toHaveBeenCalled();
      expect(stranica().imaNesacuvanihIzmena()).toBe(false);
    });
  }

  it('predata poruka je jednokratna: Nazad na varijantu i ponovno otvaranje nemaju traku; u istoriji pregledača nema poruke', async () => {
    novaSaGreskom();
    const lokacija = TestBed.inject(Location);
    // u TestBed-u nema bootstrapa: ruter sluša Nazad/Napred tek posle ovoga
    router.setUpLocationChangeListener();
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'a\nb\n\\foo');
    await unesi(brojOdgovora(), '1');
    await klik(dugme('data-sacuvaj'));
    await stabilno();
    expect(router.url).toBe('/banka/varijante/15');
    expect(el().querySelector('app-form-error-banner [role="alert"]')!.textContent).toContain('render nije uspeo');
    expect(JSON.stringify(lokacija.getState() ?? null)).not.toContain('render nije uspeo');

    // Nazad (popstate) posle odlaska sa stranice
    await harness.navigateByUrl('/banka');
    lokacija.back();
    await stabilno();
    expect(router.url).toBe('/banka/varijante/15');
    expect(el().querySelector('app-form-error-banner [role="alert"]')).toBeNull();
    // sačuvana greška rendera se i dalje vidi u editoru, samo bez trake
    expect(istaknute('tekst')).toEqual(['3']);

    // ponovno otvaranje iste varijante
    await harness.navigateByUrl('/banka');
    await otvori('/banka/varijante/15');
    expect(el().querySelector('app-form-error-banner [role="alert"]')).toBeNull();
  });

  it('nova putanja (druga varijanta) dok se prilog otprema: čuvanje se ne zaglavi', async () => {
    api.prilog.mockReturnValue(new Subject());
    api.varijanta.mockImplementation((id: number) => of(varijanta({ ...OK, id, tekst: 'Zadatak' })));
    await otvori('/banka/varijante/13');
    const input = el().querySelector<HTMLInputElement>('app-prilozi input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'Graf.png', { type: 'image/png' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await stabilno();
    expect(onemoguceno(dugme('data-sacuvaj'))).toBe(true);

    await otvori('/banka/varijante/14');
    await unesi(editor('tekst'), 'Zadatak 14');
    expect(el().querySelector('[data-nedostaje]')).toBeNull();
    expect(onemoguceno(dugme('data-sacuvaj'))).toBe(false);
  });

  it('"Sačuvaj kao nacrt" izmene sa neuspelim renderom: ostaje na varijanti, kartica dela sa greškom', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak', resenje: 'r' })));
    api.izmeniVarijantu.mockImplementation((id: number, cmd: VarijantaCmd) =>
      of(varijanta({ id, ...izCmd(cmd), renderGreska: { linija: 1, poruka: 'X' }, renderDeo: 'resenje' })));
    await otvori('/banka/varijante/13');
    await unesi(editor('tekst'), 'Zadatak 2');
    await klik(dugme('data-sacuvaj'));
    expect(router.url).toBe('/banka/varijante/13');
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('Varijanta je sačuvana kao nacrt, ali render nije uspeo (rešenje, linija 1: X).');
    expect(aktivniTab()).toContain('Rešenje');
    expect(istaknute('resenje')).toEqual(['1']);
  });

  it('"Sačuvaj" aktivne varijante sa neuspelim renderom: ostaje, traka kaže da je vraćena u nacrt', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'AKTIVNA', tekst: 'Zadatak' })));
    api.izmeniVarijantu.mockImplementation((id: number, cmd: VarijantaCmd) => of(varijanta({ id, ...izCmd(cmd), status: 'NACRT' })));
    await otvori('/banka/varijante/13');
    await unesi(editor('tekst'), 'Zadatak\nb\n\\foo');
    await klik(dugme('data-sacuvaj'));
    expect(router.url).toBe('/banka/varijante/13');
    expect(el().querySelector('app-form-error-banner')!.textContent)
      .toContain('Izmene su sačuvane. Render nije uspeo, varijanta je vraćena u nacrt (tekst, linija 3: Undefined control sequence \\foo).');
    expect(istaknute('tekst')).toEqual(['3']);
    // sad je nacrt: dugmad nacrta
    expect(dugme('data-sacuvaj').textContent!.trim()).toBe('Sačuvaj kao nacrt');
    expect(el().querySelector('[data-sacuvaj-odobri]')).not.toBeNull();
  });

  it('korisnik ode dok se čuva: obaveštenje kaže pravi ishod (render nije uspeo), bez navigacije', async () => {
    const odgovor = new Subject<VarijantaDetails>();
    api.kreirajVarijantu.mockReturnValue(odgovor);
    const obavestenja = TestBed.inject(NotificationStore);
    const greska = vi.spyOn(obavestenja, 'greska');
    const uspeh = vi.spyOn(obavestenja, 'uspeh');
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'a\nb\n\\foo');
    await unesi(brojOdgovora(), '1');
    await klik(dugme('data-sacuvaj'));
    harness.fixture.destroy();
    odgovor.next(varijanta({ id: 15, tekst: 'a\nb\n\\foo' }));
    odgovor.complete();
    expect(uspeh).not.toHaveBeenCalled();
    expect(greska).toHaveBeenCalledExactlyOnceWith('Varijanta je sačuvana kao nacrt, ali render nije uspeo (tekst, linija 3: Undefined control sequence \\foo).');
    expect(router.url).toBe('/banka/varijante/nova?grupa=2');
  });

  it('dok se prilog otprema, čuvanje i "Odbaci izmene" čekaju; posle otpremanja prilog ide u komandu', async () => {
    const otprema = new Subject<{ id: string; naziv: string; mime: string; velicina: number }>();
    api.prilog.mockReturnValue(otprema);
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), 'x');
    await unesi(brojOdgovora(), '1');
    const input = el().querySelector<HTMLInputElement>('app-prilozi input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'Graf.png', { type: 'image/png' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await stabilno();
    expect(onemoguceno(dugme('data-sacuvaj'))).toBe(true);
    expect(onemoguceno(dugme('data-sacuvaj-odobri'))).toBe(true);
    expect(onemoguceno(dugme('data-odbaci'))).toBe(true);
    expect(el().querySelector('[data-nedostaje]')!.textContent).toContain('kraj otpremanja priloga');
    await klik(dugme('data-sacuvaj'));
    expect(api.kreirajVarijantu).not.toHaveBeenCalled();

    otprema.next({ id: 'm9', naziv: 'Graf.png', mime: 'image/png', velicina: 1 });
    otprema.complete();
    await stabilno();
    await klik(dugme('data-sacuvaj'));
    expect(api.kreirajVarijantu.mock.calls[0][1].prilozi).toEqual([{ ime: 'graf', medijId: 'm9' }]);
  });

  it('"Odbaci izmene" vraća formu na učitanu varijantu (tekst, rešenje, naziv, odgovor, prilozi) i briše oznaku izmena', async () => {
    api.varijanta.mockReturnValue(of(varijanta({
      ...OK, tekst: 'Zadatak', resenje: 'Rešenje', prilozi: [{ ime: 'graf', medij: { id: 'm1', naziv: 'graf.png', mime: 'image/png', velicina: 10 } }],
    })));
    await otvori('/banka/varijante/13');
    expect(onemoguceno(dugme('data-odbaci'))).toBe(true);
    await unesi(editor('tekst'), 'Drugi zadatak');
    await unesi(el().querySelector<HTMLInputElement>('input[data-naziv]')!, 'Novi naziv');
    await unesi(brojOdgovora(), '40');
    await klik(el().querySelector<HTMLButtonElement>('app-prilozi button[data-ukloni]')!);
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
    expect(onemoguceno(dugme('data-renderuj'))).toBe(true);

    await klik(dugme('data-odbaci'));
    expect(editor('tekst').value).toBe('Zadatak');
    expect(el().querySelector<HTMLInputElement>('input[data-naziv]')!.value).toBe('100111 u dekadni');
    expect(brojOdgovora().value).toBe('39');
    expect([...el().querySelectorAll<HTMLInputElement>('app-prilozi input[data-ime]')].map(i => i.value)).toEqual(['graf']);
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
    expect(onemoguceno(dugme('data-odbaci'))).toBe(true);
    expect(onemoguceno(dugme('data-renderuj'))).toBe(false);
    await klik(kartica('Rešenje'));
    expect(editor('resenje').value).toBe('Rešenje');
  });

  it('greška servera ide u traku; 503 kaže da render servis ne radi i da ništa nije sačuvano, 504 da se proveri banka', async () => {
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), '\\input{x}');
    await unesi(brojOdgovora(), '1');
    api.kreirajVarijantu.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Komanda \\input nije dozvoljena.' } })));
    await klik(dugme('data-sacuvaj'));
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('Komanda \\input nije dozvoljena.');
    expect(editor('tekst').disabled).toBe(false);

    api.kreirajVarijantu.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { reason: 'Render servis nije dostupan.' } })));
    await klik(dugme('data-sacuvaj'));
    expect(el().querySelector('app-form-error-banner')!.textContent!.trim())
      .toBe('Render servis nije dostupan. Varijanta nije sačuvana, pokušaj ponovo za koji minut.');
    expect(router.url).toBe('/banka/varijante/nova?grupa=2');

    api.kreirajVarijantu.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504 })));
    await klik(dugme('data-sacuvaj'));
    expect(el().querySelector('app-form-error-banner')!.textContent!.trim())
      .toBe('Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.');
  });

  it('"Renderuj ponovo" (samo izmena, bez nesačuvanih izmena) zove render i prikazuje novi ishod', async () => {
    api.render.mockReturnValue(of(varijanta({ ...OK })));
    await otvori('/banka/varijante/13');
    expect(istaknute('tekst')).toEqual(['3']);
    await klik(dugme('data-renderuj'));
    expect(api.render).toHaveBeenCalledWith(13, { tiho: true });
    expect(istaknute('tekst')).toEqual([]);

    await unesi(editor('tekst'), 'drugo');
    expect(onemoguceno(dugme('data-renderuj'))).toBe(true);
  });

  it('"Ubaci u tekst" umeće \\includegraphics na kursor editora aktivne kartice', async () => {
    api.varijanta.mockReturnValue(of(varijanta({
      ...OK, tekst: 'Prvi red\nDrugi red', prilozi: [{ ime: 'graf', medij: { id: 'm1', naziv: 'graf.png', mime: 'image/png', velicina: 10 } }],
    })));
    await otvori('/banka/varijante/13');
    editor('tekst').setSelectionRange(9, 9);
    await klik(el().querySelector<HTMLButtonElement>('app-prilozi button[data-ubaci]')!);
    expect(editor('tekst').value).toBe('Prvi red\n\\includegraphics[width=\\linewidth]{graf}Drugi red');
    expect(document.activeElement).toBe(editor('tekst'));
  });

  it('"Ubaci u tekst" na kartici Rešenje umeće u editor rešenja', async () => {
    api.varijanta.mockReturnValue(of(varijanta({
      ...OK, tekst: 'Zadatak', resenje: 'Vidi sliku: ', prilozi: [{ ime: 'graf', medij: { id: 'm1', naziv: 'graf.png', mime: 'image/png', velicina: 10 } }],
    })));
    await otvori('/banka/varijante/13');
    await klik(kartica('Rešenje'));
    editor('resenje').setSelectionRange(12, 12);
    await klik(el().querySelector<HTMLButtonElement>('app-prilozi button[data-ubaci]')!);
    expect(editor('resenje').value).toBe('Vidi sliku: \\includegraphics[width=\\linewidth]{graf}');
    expect(editor('tekst').value).toBe('Zadatak');
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
  });

  it('živi pregled: Ctrl+Enter traži render-probu za predmet grupe, bez priloga sa neispravnim imenom; SVG stiže u pregled', async () => {
    api.renderProba.mockReturnValue(of({ ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>', resenjeSvg: null, greska: null, deo: null }));
    api.varijanta.mockReturnValue(of(varijanta({
      ...OK, tekst: 'Zadatak', prilozi: [
        { ime: 'graf', medij: { id: 'm1', naziv: 'graf.png', mime: 'image/png', velicina: 10 } },
        { ime: 'tabela', medij: { id: 'm2', naziv: 'tabela.png', mime: 'image/png', velicina: 10 } },
      ],
    })));
    await otvori('/banka/varijante/13');
    await unesi(el().querySelectorAll<HTMLInputElement>('app-prilozi input[data-ime]')[1], 'Loše ime');
    editor('tekst').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await stabilno();
    expect(api.renderProba).toHaveBeenLastCalledWith({ predmetId: 7, tekst: 'Zadatak', resenje: null, prilozi: [{ ime: 'graf', medijId: 'm1' }] }, { tiho: true });
    expect(el().querySelector('app-svg-pregled .bk-sp-okvir svg path')).not.toBeNull();
  });

  it('otvorena varijanta: pregled iz sačuvanih SVG-ova, bez render-probe dok se sadržaj ne izmeni', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak', resenje: 'R', resenjeSvgId: 'svg-2' })));
    await otvori('/banka/varijante/13', true);
    expect(api.svg.mock.calls).toEqual([['svg-1', { tiho: true }], ['svg-2', { tiho: true }]]);
    const [zadatak, resenje] = [...el().querySelectorAll('app-svg-pregled')];
    expect(zadatak.querySelector('.bk-sp-okvir svg path')!.id).toMatch(/svg-1$/);
    expect(resenje.querySelector('.bk-sp-okvir svg path')!.id).toMatch(/svg-2$/);
    expect(zadatak.textContent).not.toContain('Renderuje se');
    await new Promise(r => setTimeout(r, KASNJENJE_PREGLEDA + 100));
    expect(api.renderProba).not.toHaveBeenCalled();

    // prva izmena: render-proba posle mira u kucanju
    await urediLatex();
    await unesi(editor('tekst'), 'Zadatak 2');
    await vi.waitUntil(() => api.renderProba.mock.calls.length > 0, { timeout: 2000 });
    expect(api.renderProba).toHaveBeenCalledExactlyOnceWith({ predmetId: 7, tekst: 'Zadatak 2', resenje: 'R', prilozi: [] }, { tiho: true });
  });

  it('otvorena varijanta sa greškom u tekstu: sačuvana greška, bez render-probe i bez učitavanja SVG-a', async () => {
    await otvori('/banka/varijante/13');
    await new Promise(r => setTimeout(r, KASNJENJE_PREGLEDA + 100));
    expect(api.renderProba).not.toHaveBeenCalled();
    expect(api.svg).not.toHaveBeenCalled();
    expect(el().querySelector('#bk-ve-greska-tekst')!.textContent).toContain('Greška u liniji 3');
  });

  it('otvorena varijanta sa greškom samo u rešenju: render-proba, da bi se zadatak video dok se rešenje ispravlja', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ tekst: 'Zadatak', resenje: 'a\n\\foo', renderGreska: { linija: 2, poruka: 'X' }, renderDeo: 'resenje' })));
    api.renderProba.mockReturnValue(of({
      ok: false, svg: '<svg xmlns="http://www.w3.org/2000/svg"><path id="zadatak" d="M0 0"/></svg>', resenjeSvg: null,
      greska: { linija: 2, poruka: 'X' }, deo: 'resenje',
    }));
    await otvori('/banka/varijante/13');
    await vi.waitUntil(() => api.renderProba.mock.calls.length > 0, { timeout: 2000 });
    await stabilno();
    expect(api.svg).not.toHaveBeenCalled();
    // prikaz LaTeX otvara karticu dela sa greškom, pa pregled pored nje pokazuje grešku rešenja; kartica Tekst ima SVG zadatka
    expect(aktivniTab()).toContain('Rešenje');
    expect(el().querySelector('#bk-ve-greska-resenje')!.textContent).toContain('Greška u liniji 2: X');
    await klik(kartica('Tekst'));
    expect(el().querySelector('app-svg-pregled .bk-sp-okvir svg path')!.id).toMatch(/zadatak$/);
  });

  it('prazan tekst: nema render-probe, pregled čeka tekst', async () => {
    api.renderProba.mockReturnValue(of({ ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', resenjeSvg: null, greska: null, deo: null }));
    await otvori('/banka/varijante/nova?grupa=2');
    await unesi(editor('tekst'), '   ');
    editor('tekst').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await stabilno();
    expect(api.renderProba).not.toHaveBeenCalled();
    expect(el().querySelector('app-svg-pregled')!.textContent).toContain('Pregled se pojavljuje kad počneš da kucaš');
  });

  it('aktivna varijanta: "Sačuvaj" (bez "kao nacrt") i bez "Sačuvaj i odobri"', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'AKTIVNA', tekst: 'Zadatak' })));
    await otvori('/banka/varijante/13');
    expect(dugme('data-sacuvaj').textContent!.trim()).toBe('Sačuvaj');
    expect(el().querySelector('[data-sacuvaj-odobri]')).toBeNull();
    expect(el().querySelector('[data-putanja]')!.parentElement!.textContent).toContain('Aktivna');
  });

  /**
   * `beforeunload` kao iz pregledača: `returnValue` je obično svojstvo (na običnom `Event`-u je zastareli boolean), pa se vidi
   * šta mu je stranica upisala; `preventDefault` je špijuniran.
   */
  function beforeunload(): { pita: boolean; preventDefault: boolean; returnValue: unknown } {
    const e = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(e, 'returnValue', { value: undefined, writable: true });
    const preventDefault = vi.spyOn(e, 'preventDefault');
    window.dispatchEvent(e);
    return { pita: e.defaultPrevented, preventDefault: preventDefault.mock.calls.length > 0, returnValue: (e as BeforeUnloadEvent).returnValue };
  }

  it('zatvaranje kartice ili osvežavanje (beforeunload) traži potvrdu samo dok ima izmena', async () => {
    await otvori('/banka/varijante/nova?grupa=2');
    expect(beforeunload()).toEqual({ pita: false, preventDefault: false, returnValue: undefined });
    await unesi(editor('tekst'), 'x');
    expect(beforeunload()).toEqual({ pita: true, preventDefault: true, returnValue: '' });
  });

  it('beforeunload pita i bez izmena dok se čuva ("Sačuvaj i odobri" sačuvane varijante, odobravanje u toku)', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak' })));
    api.odobri.mockReturnValue(NEVER);
    await otvori('/banka/varijante/13');
    expect(beforeunload().pita).toBe(false);
    await klik(dugme('data-sacuvaj-odobri'));
    expect(api.izmeniVarijantu).not.toHaveBeenCalled();
    expect(api.odobri).toHaveBeenCalledTimes(1);
    // forma je ista kao sačuvana (bez izmena), ali čuvanje traje
    expect(beforeunload()).toEqual({ pita: true, preventDefault: true, returnValue: '' });
  });

  it('obe rute editora pitaju pre napuštanja sa nesačuvanim izmenama', () => {
    const rute = BANKA_RUTE.filter(r => r.title === 'Nova varijanta' || r.title === 'Varijanta');
    expect(rute.map(r => r.canDeactivate)).toEqual([[unsavedChangesGuard], [unsavedChangesGuard]]);
  });

  it('Klodova varijanta: oznaka "Claude" uz status u zaglavlju; ručna i nova je nemaju', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, izvor: 'CLAUDE', serija: 'uvoz-kol1-2024' })));
    let e = await otvori('/banka/varijante/13');
    const oznaka = e.querySelector('app-page-header [data-izvor]')!;
    expect(oznaka.textContent!.trim()).toBe('Claude');
    expect(oznaka.getAttribute('title')).toBe('Varijantu je napravio Claude');

    api.varijanta.mockReturnValue(of(varijanta(OK)));
    e = await otvori('/banka/varijante/12');
    expect(e.querySelector('[data-izvor]')).toBeNull();
    e = await otvori('/banka/varijante/nova?grupa=2');
    expect(e.querySelector('[data-izvor]')).toBeNull();
  });

  it('povratakNaPregled: samo putanja pregleda nacrta (sa upitom), ništa drugo', () => {
    expect(povratakNaPregled('/banka/pregled')).toBe('/banka/pregled');
    expect(povratakNaPregled('/banka/pregled?predmet=1&serija=x&od=13')).toBe('/banka/pregled?predmet=1&serija=x&od=13');
    for (const los of [undefined, '', 'https://x', '//x/banka/pregled', '/banka', '/banka/pregledi', '/banka/pregled/../grupe/2', 'banka/pregled',
      '/banka/pregled\\x', ' /banka/pregled']) {
      expect(povratakNaPregled(los)).toBeNull();
    }
  });

  it('?povratak na pregled nacrta: posle uspelog čuvanja nazad na pregled; povratak van pregleda vodi u banku kao do sada', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak' })));
    await otvori('/banka/varijante/13?povratak=/banka/pregled?serija=x');
    await unesi(editor('tekst'), 'Zadatak 2');
    await klik(dugme('data-sacuvaj'));
    expect(api.izmeniVarijantu).toHaveBeenCalledOnce();
    expect(router.url).toBe('/banka/pregled?serija=x');

    await router.navigate(['/banka/varijante', 13], { queryParams: { povratak: '/banka/pregled?predmet=7&serija=x&od=13' } });
    await stabilno();
    await klik(dugme('data-sacuvaj-odobri'));
    expect(api.odobri).toHaveBeenCalledOnce();
    expect(router.url).toBe('/banka/pregled?predmet=7&serija=x&od=13');

    await otvori('/banka/varijante/13?povratak=https://x');
    await unesi(editor('tekst'), 'Zadatak 3');
    await klik(dugme('data-sacuvaj'));
    expect(router.url).toBe('/banka?predmet=7&namena=PREDAVANJE&grupa=2');
  });

  it('?povratak ne menja ishod neuspelog rendera: korisnik ostaje na varijanti', async () => {
    api.varijanta.mockReturnValue(of(varijanta({ ...OK, tekst: 'Zadatak' })));
    api.izmeniVarijantu.mockImplementation((id: number, cmd: VarijantaCmd) => of(varijanta({ id, ...izCmd(cmd) })));
    await otvori('/banka/varijante/13?povratak=/banka/pregled?serija=x');
    await unesi(editor('tekst'), 'Zadatak \\foo');
    await klik(dugme('data-sacuvaj'));
    expect(router.url).toBe('/banka/varijante/13?povratak=%2Fbanka%2Fpregled%3Fserija%3Dx');
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('render nije uspeo');
  });

  describe('prikaz: Pregled | Uredi LaTeX', () => {
    const rezimi = () => [...el().querySelectorAll<HTMLButtonElement>('[data-rezim]')].map(b => `${b.dataset['rezim']}:${b.getAttribute('aria-pressed')}`);
    const tasta = (key: string, meta: EventTarget = document.body) => meta.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    beforeEach(() => {
      api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'AKTIVNA', tekst: 'Zadatak', resenje: 'R', resenjeSvgId: 'svg-2' })));
    });

    it('sačuvana varijanta sa uspelim renderom: Pregled sa zadatkom i rešenjem, bez editora, a LaTeX na zahtev', async () => {
      await otvori('/banka/varijante/13', true);
      expect(rezimi()).toEqual(['pregled:true', 'latex:false']);
      expect(el().querySelector('app-latex-editor')).toBeNull();
      expect([...el().querySelectorAll('app-svg-pregled h3')].map(h => h.textContent!.trim())).toEqual(['Zadatak', 'Rešenje']);
      expect(el().querySelector('app-odgovori-forma')).not.toBeNull();
      expect(el().querySelector('app-prilozi')).not.toBeNull();

      await klik(el().querySelector<HTMLButtonElement>('[data-rezim="latex"]')!);
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
      expect(editor('tekst')).not.toBeNull();
      // jedan pregled, kartice koja se uređuje
      expect([...el().querySelectorAll('app-svg-pregled h3')].map(h => h.textContent!.trim())).toEqual(['Zadatak']);
      expect(document.activeElement).toBe(editor('tekst'));
      await klik(kartica('Rešenje'));
      expect([...el().querySelectorAll('app-svg-pregled h3')].map(h => h.textContent!.trim())).toEqual(['Rešenje']);

      await klik(el().querySelector<HTMLButtonElement>('[data-rezim="pregled"]')!);
      expect(el().querySelector('app-latex-editor')).toBeNull();
    });

    it('nova varijanta i varijanta sa greškom rendera se otvaraju u prikazu LaTeX', async () => {
      await otvori('/banka/varijante/nova?grupa=2', true);
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
      api.varijanta.mockReturnValue(of(varijanta()));
      await otvori('/banka/varijante/13', true);
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
    });

    it('"Uredi" iz pregleda nacrta (?povratak) otvara editor odmah', async () => {
      await otvori('/banka/varijante/13?povratak=/banka/pregled?serija=x', true);
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
    });

    it('?povratak koji nije pregled nacrta ne menja podrazumevani prikaz (Pregled)', async () => {
      await otvori('/banka/varijante/13?povratak=https://x', true);
      expect(rezimi()).toEqual(['pregled:true', 'latex:false']);
    });

    it('veličina pregleda: 84 mm, 126 mm, cela kolona; izbor se pamti u ovom pregledaču', async () => {
      await otvori('/banka/varijante/13', true);
      const okviri = () => [...el().querySelectorAll<HTMLElement>('.bk-sp-okvir')].map(o => o.style.width);
      expect(okviri()).toEqual(['126mm', '126mm']);
      await klik(el().querySelector<HTMLButtonElement>('[data-velicina="telefon"]')!);
      expect(okviri()).toEqual(['84mm', '84mm']);
      expect(el().querySelector('[data-velicina="telefon"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem(VELICINA_PREGLEDA_KLJUC)).toBe('telefon');
      await klik(el().querySelector<HTMLButtonElement>('[data-velicina="cela"]')!);
      expect(okviri()).toEqual(['', '']);
      expect(TestBed.inject(VelicinaPregledaPostavka).velicina()).toBe('cela');
      expect(el().querySelector('mat-slide-toggle')).toBeNull();

      // u prikazu LaTeX je pregled uvek preko cele kartice
      await klik(el().querySelector<HTMLButtonElement>('[data-rezim="latex"]')!);
      await klik(el().querySelector<HTMLButtonElement>('[data-rezim="pregled"]')!);
      expect(okviri()).toEqual(['', '']);
    });

    it('prečice: E otvara editor, Esc vraća na pregled; ništa dok kucaš u polju ili je otvoren meni', async () => {
      await otvori('/banka/varijante/13', true);
      tasta('e');
      await stabilno();
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
      expect(document.activeElement).toBe(editor('tekst'));

      // u editoru Esc služi za izlazak iz polja
      tasta('Escape', editor('tekst'));
      await stabilno();
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
      tasta('Escape');
      await stabilno();
      expect(rezimi()).toEqual(['pregled:true', 'latex:false']);

      // `E` u polju za unos (naziv) se ne hvata
      await klik(el().querySelector<HTMLButtonElement>('[data-uredi-naziv]')!);
      tasta('e', el().querySelector('input[data-naziv]')!);
      await stabilno();
      expect(rezimi()).toEqual(['pregled:true', 'latex:false']);

      // otvoren meni: prečica čeka
      await klik(dugme('data-meni'));
      tasta('e');
      await stabilno();
      expect(rezimi()).toEqual(['pregled:true', 'latex:false']);
    });

    it('"Naziv" u prikazu Pregled otvara polje naziva (isto polje kao u prikazu LaTeX, nikad dva odjednom)', async () => {
      await otvori('/banka/varijante/13', true);
      expect(el().querySelector('input[data-naziv]')).toBeNull();
      await klik(el().querySelector<HTMLButtonElement>('[data-uredi-naziv]')!);
      expect(el().querySelectorAll('input[data-naziv]')).toHaveLength(1);
      await unesi(el().querySelector<HTMLInputElement>('input[data-naziv]')!, 'Novi naziv');
      expect(onemoguceno(dugme('data-sacuvaj'))).toBe(false);
      await klik(el().querySelector<HTMLButtonElement>('[data-rezim="latex"]')!);
      expect(el().querySelectorAll('input[data-naziv]')).toHaveLength(1);
      expect(el().querySelector<HTMLInputElement>('input[data-naziv]')!.value).toBe('Novi naziv');
    });

    it('"Ubaci u tekst" iz prikaza Pregled otvara editor i umeće \\includegraphics', async () => {
      await otvori('/banka/varijante/13', true);
      stranica()['ubaci']('slika.png');
      await stabilno();
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
      expect(editor('tekst').value).toContain('\\includegraphics[width=\\linewidth]{slika.png}');
    });

    it('neuspeo render posle čuvanja iz prikaza Pregled otvara editor kartice sa greškom', async () => {
      api.izmeniVarijantu.mockImplementation((id: number, cmd: VarijantaCmd) => of(varijanta({ id, ...izCmd(cmd), status: 'NACRT' })));
      await otvori('/banka/varijante/13', true);
      await klik(el().querySelector<HTMLButtonElement>('[data-uredi-naziv]')!);
      await unesi(el().querySelector<HTMLInputElement>('input[data-naziv]')!, 'Drugi naziv');
      await klik(dugme('data-sacuvaj'));
      expect(rezimi()).toEqual(['pregled:false', 'latex:true']);
      expect(aktivniTab()).toContain('Tekst');
    });
  });

  describe('meni ⋮: Arhiviraj, Vrati u nacrt, Dupliraj, Obriši', () => {
    const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
    const stavke = () => [...overlay().querySelectorAll<HTMLElement>('[role=menuitem]')].map(b => b.textContent!.trim());
    const stavka = (ime: string) => [...overlay().querySelectorAll<HTMLElement>('[role=menuitem]')].find(b => b.textContent!.trim() === ime)!;

    it('aktivna: Arhiviraj menja status i osvežava oznaku; meni onda nudi Vrati u nacrt', async () => {
      api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'AKTIVNA', tekst: 'Zadatak' })));
      api.arhiviraj.mockImplementation((id: number) => of(varijanta({ ...OK, id, status: 'ARHIVIRANA', tekst: 'Zadatak' })));
      api.vratiUNacrt.mockImplementation((id: number) => of(varijanta({ ...OK, id, status: 'NACRT', tekst: 'Zadatak' })));
      const e = await otvori('/banka/varijante/13', true);
      expect(e.querySelector('app-status-chip')!.textContent).toContain('Aktivna');
      await klik(dugme('data-meni'));
      expect(stavke()).toEqual(['Dupliraj', 'Arhiviraj', 'Obriši']);
      await klik(stavka('Arhiviraj'));
      expect(api.arhiviraj).toHaveBeenCalledExactlyOnceWith(13, { tiho: true });
      expect(e.querySelector('app-status-chip')!.textContent).toContain('Arhivirana');
      expect(router.url).toBe('/banka/varijante/13');

      await klik(dugme('data-meni'));
      expect(stavke()).toEqual(['Dupliraj', 'Vrati u nacrt', 'Obriši']);
      await klik(stavka('Vrati u nacrt'));
      expect(api.vratiUNacrt).toHaveBeenCalledExactlyOnceWith(13, { tiho: true });
      expect(e.querySelector('app-status-chip')!.textContent).toContain('Nacrt');
    });

    it('nacrt nema ni Arhiviraj ni Vrati u nacrt; greška servera ide u traku, status ostaje', async () => {
      api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'AKTIVNA', tekst: 'Zadatak' })));
      api.arhiviraj.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { reason: 'Ne može sada.' } })));
      const e = await otvori('/banka/varijante/13', true);
      await klik(dugme('data-meni'));
      await klik(stavka('Arhiviraj'));
      expect(e.querySelector('app-form-error-banner')!.textContent).toContain('Ne može sada.');
      expect(e.querySelector('app-status-chip')!.textContent).toContain('Aktivna');

      api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'NACRT', tekst: 'Zadatak' })));
      await otvori('/banka/varijante/14', true);
      await klik(dugme('data-meni'));
      expect(stavke()).toEqual(['Dupliraj', 'Obriši']);
    });

    it('Arhiviraj radi i sa nesačuvanim izmenama (forma ostaje), a Dupliraj čeka da se sačuvaju', async () => {
      api.varijanta.mockReturnValue(of(varijanta({ ...OK, status: 'AKTIVNA', tekst: 'Zadatak' })));
      api.arhiviraj.mockImplementation((id: number) => of(varijanta({ ...OK, id, status: 'ARHIVIRANA', tekst: 'Zadatak' })));
      await otvori('/banka/varijante/13');
      await unesi(editor('tekst'), 'Izmenjen tekst');
      await klik(dugme('data-meni'));
      expect(onemoguceno(stavka('Dupliraj') as HTMLButtonElement)).toBe(true);
      await klik(stavka('Arhiviraj'));
      expect(api.arhiviraj).toHaveBeenCalledOnce();
      expect(editor('tekst').value).toBe('Izmenjen tekst');
      expect(onemoguceno(dugme('data-odbaci'))).toBe(false);
    });

    it('Dupliraj otvara kopiju (nacrt) na njenom editoru', async () => {
      api.varijanta.mockImplementation((id: number) => of(varijanta({ ...OK, id, status: id === 13 ? 'AKTIVNA' : 'NACRT', tekst: 'Zadatak' })));
      api.dupliraj.mockImplementation(() => of(varijanta({ ...OK, id: 21, status: 'NACRT', tekst: 'Zadatak' })));
      const e = await otvori('/banka/varijante/13', true);
      await klik(dugme('data-meni'));
      await klik(stavka('Dupliraj'));
      expect(api.dupliraj).toHaveBeenCalledExactlyOnceWith(13, { tiho: true });
      expect(router.url).toBe('/banka/varijante/21');
      expect(e.querySelector('app-status-chip')!.textContent).toContain('Nacrt');
    });

    it('Obriši traži potvrdu, briše i vraća u banku na grupu, bez pitanja za nesačuvane izmene', async () => {
      api.obrisiVarijantu.mockReturnValue(of(undefined));
      await otvori('/banka/varijante/13');
      await unesi(editor('tekst'), 'Izmenjen tekst');
      await klik(dugme('data-meni'));
      await klik(stavka('Obriši'));
      expect(overlay().textContent).toContain('Obrisati varijantu „100111 u dekadni“?');
      expect(api.obrisiVarijantu).not.toHaveBeenCalled();
      await klik([...overlay().querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.includes('Obriši varijantu'))!);
      expect(api.obrisiVarijantu).toHaveBeenCalledExactlyOnceWith(13, { tiho: true });
      expect(router.url).toBe('/banka?predmet=7&namena=PREDAVANJE&grupa=2');
    });

    it('Obriši: odustajanje u dijalogu ne zove server; odbijeno brisanje (korišćena na času) ostavlja varijantu i javlja razlog', async () => {
      api.obrisiVarijantu.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { reason: 'Korišćeno na času; arhiviraj.' } })));
      const e = await otvori('/banka/varijante/13');
      await klik(dugme('data-meni'));
      await klik(stavka('Obriši'));
      await klik([...overlay().querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.includes('Odustani'))!);
      expect(api.obrisiVarijantu).not.toHaveBeenCalled();

      await klik(dugme('data-meni'));
      await klik(stavka('Obriši'));
      await klik([...overlay().querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.includes('Obriši varijantu'))!);
      expect(e.querySelector('app-form-error-banner')!.textContent).toContain('Korišćeno na času; arhiviraj.');
      expect(router.url).toBe('/banka/varijante/13');
    });

    it('nova varijanta nema meni radnji', async () => {
      const e = await otvori('/banka/varijante/nova?grupa=2');
      expect(e.querySelector('[data-meni]')).toBeNull();
    });
  });

  it('nepostojeća varijanta i nova bez ?grupa: prazno stanje sa vezom na banku', async () => {
    api.varijanta.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { reason: 'Varijanta nije pronađena.' } })));
    let e = await otvori('/banka/varijante/99');
    expect(e.textContent).toContain('Varijanta nije pronađena');
    expect(e.querySelector('a[href="/banka"]')).not.toBeNull();

    e = await otvori('/banka/varijante/nova');
    expect(api.grupa).not.toHaveBeenCalled();
    expect(e.textContent).toContain('Izaberi grupu');
  });
});

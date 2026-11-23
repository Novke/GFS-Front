import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs';
import { UzivoPutanje } from '../uzivo-putanje';
import { ALATI } from '../crtanje/crtanje.models';
import { CrtanjeApi } from '../crtanje/crtanje.api';
import { Crtac } from '../crtanje/crtac';
import { IkonaCrtanjaComponent } from '../crtanje/ikona-crtanja.component';
import { kanalIzvodjenja } from '../crtanje/kanal-crtanja';
import { PovrsinaCrtanjaComponent } from '../crtanje/povrsina-crtanja.component';
import { RanijePanelComponent } from '../crtanje/ranije-panel.component';
import { RanijiCrtezi } from '../crtanje/ranije';
import { RanijiCrteziPodesavanje } from '../crtanje/ranije-podesavanje';
import { RasporedCrtanjaComponent } from '../crtanje/raspored-crtanja.component';
import { pratiPovratak } from '../data-access/povratak';
import { odgovorili, oznakaDalje, oznakaOtvoriZatvori, oznakaPolozaja } from '../data-access/izvodjenje-pravila';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { TipKomande } from '../data-access/uzivo.models';
import { TasterAkcija } from '../tastatura';
import { kodSaRazmakom } from '../ui/format';
import { preducitajFormule, preducitajSlike, slikeSlajda } from '../ui/preducitavanje';
import { izborEkrana } from '../ui/izbor-ekrana.dialog';
import { PROZOR_KONZOLE, PROZOR_PUBLIKE, otvoriIliFokusiraj, otvoriPublikuNaMonitoru } from '../ui/monitor';
import { RezultatPrikazComponent } from '../ui/rezultat-prikaz.component';
import { TajmerComponent } from '../ui/tajmer.component';
import { BeleskePanelComponent } from './beleske-panel.component';
import { KrajIzvodjenjaComponent } from './kraj-izvodjenja.component';
import { KomandaZahtev, KonzolaKontroleComponent } from './konzola-kontrole.component';
import { FajloviKarticaComponent } from '../ui/fajlovi-izvodjenja.component';
import { otvoriPomoc } from './pomoc-precice.dialog';
import { DvaputR, TastaturaIzvodjenja, prebaciCeoEkran, pustiFokusPosleKlika } from './precice';
import { PublikaScenaComponent } from './publika-scena.component';
import { TelefonDialog, TelefonLinkovi } from './telefon.dialog';
import { RangKonzolaComponent } from './rang-konzola.component';
import { SledecePanelComponent } from './sledece-panel.component';
import { TekstoviPanelComponent } from './tekstovi-panel.component';
import type { Moderacija } from './ucesnici-panel.component';
import { VremeIzvodjenjaComponent } from './vreme-izvodjenja.component';
import { ZadatakPanelComponent } from './zadatak-panel.component';
import { NotificationStore } from '../../../core/state/notification.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { RezimProjektora } from '../../../core/layout/rezim-projektora';

const PORUKA_BLOKIRAN = 'Prozor nije otvoren: dozvoli iskačuće prozore za ovu stranicu i pokušaj ponovo.';

/**
 * Konzola za predavača (spec 6.4): zaglavlje (naziv, kod, povezani/ukupno, veza, publika, monitor, telefon, Završi),
 * levo trenutni (tačno ono što je na projektoru) i sledeći slajd, u sredini kontrole i tajmer, desno rezultati uživo
 * (privatno, uvek; na Zadatak slajdu panel zadatka: broj različitih pre otvaranja, izvučene varijante posle), tekstovi
 * sa "sakrij", beleške i učesnici. Ispod 600 px: tabovi i lepljiva donja traka. Iste prečice kao publika (`R` dvaput u
 * roku 2 s ponavlja pitanje, dugme "Ponovi" traži potvrdu), `Shift+R` je rešenje zadatka, `P` otvara publiku.
 * Crtanje (spec crtanja 5.1): `D` ili olovka u zaglavlju menja telo konzole u režim crtanja (`RasporedCrtanjaComponent`:
 * alati, boje, velika scena sa površinom, „Ranije ovde”); zaglavlje ostaje. Izlaz: `D`, `Esc` ili X na mestu olovke. Na
 * prijavi i kraju (snimak bez `crtez`) se ne crta; na crnom ekranu crtanje prvo gasi crni ekran. `W` (beli ekran) je bela
 * tabla. Čip „Ranije si na ovom slajdu crtao” pod projektorom ulazi u crtanje (Podešavanja → Uživo ga isključuju). Posle završetka: završni ekran
 * ({@link KrajIzvodjenjaComponent}: predlog sledeće prezentacije, povratak na predavanje).
 */
@Component({
  selector: 'app-konzola',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [IzvodjenjeStore],
  imports: [
    FajloviKarticaComponent,
    NgTemplateOutlet, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatTabsModule, MatTooltipModule, KonzolaKontroleComponent,
    IkonaCrtanjaComponent, PovrsinaCrtanjaComponent, RanijePanelComponent, RasporedCrtanjaComponent,
    PublikaScenaComponent, RezultatPrikazComponent, SledecePanelComponent, TajmerComponent, TekstoviPanelComponent,
    RangKonzolaComponent, BeleskePanelComponent, VremeIzvodjenjaComponent, ZadatakPanelComponent, KrajIzvodjenjaComponent,
  ],
  host: {
    class: 'uz-kon', lang: 'sr-Latn', '[class.uz-kon--usko]': 'usko()', '[class.uz-kon--crtanje]': 'crtanje()',
    '(document:keydown)': 'tastatura($event)', '(document:keyup)': 'tast.pusten($event)',
  },
  // čip bodovanog runa (u komponenti, ne u globalnom CSS-u: početni paket je na granici budžeta)
  styles: `
    .uz-boduje {
      border-color: transparent; background: var(--primary-soft); color: var(--primary-soft-ink); font-size: 12px; font-weight: 600;
    }
    /* crtanje: telo do dna prozora (široko), dugmad u zaglavlju, čip ranijih crteža, znak "nije sačuvano" */
    :host(.uz-kon--crtanje:not(.uz-kon--usko)) { display: flex; flex-direction: column; height: 100dvh; min-height: 0; }
    :host(.uz-kon--crtanje:not(.uz-kon--usko)) .crt-raspored { flex: 1; }
    .uz-kon-tabla { display: flex; gap: 6px; }
    .uz-kon-crt { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);
      display: grid; place-items: center; padding: 0; cursor: pointer; position: relative; }
    .uz-kon-crt app-ikona-crtanja { width: 24px; height: 24px; }
    .uz-kon-crt[aria-pressed='true'] { background: var(--primary-soft); border-color: var(--primary); color: var(--primary-soft-ink); }
    .uz-kon-crt--glavno { background: var(--primary); border-color: var(--primary); color: var(--primary-ink); }
    .uz-kon-crt--glavno[aria-pressed='true'] { background: var(--primary-soft-ink); border-color: var(--primary-soft-ink); color: #fff; }
    .uz-kon-crt[aria-disabled='true'], .uz-kon-crt:disabled { opacity: 0.4; cursor: default; }
    .uz-kon-crt:focus-visible, .uz-kon-ranije-cip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .uz-kon-crt-taster { position: absolute; right: 2px; bottom: 1px; font: 600 9px var(--font-mono, monospace); opacity: 0.8; }
    .uz-kon-ranije-cip { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; font: inherit; font-size: 13px; cursor: pointer;
      background: var(--warn-soft); color: var(--warn); border-radius: 999px; padding: 6px 12px; border: 0; }
    .uz-kon-ranije-cip app-ikona-crtanja { width: 16px; height: 16px; }
    .uz-kon-nesacuvano { font-size: 12px; font-weight: 600; color: var(--danger); padding: 0 6px; }
    .uz-kon-crt-scena { position: absolute; inset: 0; }
    .uz-kon-crt-napomena { position: absolute; z-index: 6; left: 50%; bottom: 12px; transform: translateX(-50%); margin: 0; padding: 6px 12px;
      border-radius: 8px; background: var(--snack-bg); color: var(--snack-ink); font-size: 14px; pointer-events: none; }
  `,
  template: `
    @if (store.stanje(); as s) {
      @if (s.izvodjenje.status === 'ZAVRSENO') {
        <app-kraj-izvodjenja [izvodjenje]="s.izvodjenje" />
      } @else {
      <header class="uz-kon-zaglavlje">
        <div class="uz-kon-naslovi">
          <h1 class="uz-kon-naziv">{{ s.izvodjenje.prezentacija.naziv }}</h1>
          <p class="uz-kon-meta">
            <span>kod <strong>{{ kod() }}</strong></span>
            <span>{{ polozaj() }}</span>
            <span>učesnici {{ s.brojPovezanih }}/{{ s.ucesnici.length }}</span>
            @if ((s.brojCekiranih ?? null) !== null) { <span class="uz-kon-cekirano">čekirano {{ s.brojCekiranih }}</span> }
            @if (s.izvodjenje.boduje) { <span class="uz-cip uz-boduje">Boduje se</span> }
            <span class="uz-kon-veza" [class.uz-kon-veza--ok]="store.veza() === 'povezan'" role="status">{{ vezaTekst() }}</span>
          </p>
        </div>
        <app-vreme-izvodjenja class="uz-kon-vreme" [izvodjenjeId]="s.izvodjenje.id" [pocetakMs]="s.pocetakMs" [sat]="store.sat()"
                              [kompaktno]="usko()" />
        <div class="uz-kon-tabla" role="group" aria-label="Tabla">
          <button type="button" class="uz-kon-crt" [attr.aria-pressed]="s.ekran === 'BEO'" aria-label="Bela pozadina" aria-keyshortcuts="W"
                  [matTooltip]="s.ekran === 'BEO' ? 'Nazad na slajd (W)' : 'Bela pozadina (W)'" [disabled]="!ima('EKRAN_BEO')"
                  (click)="pustiFokus($event); komanda({ tip: 'EKRAN_BEO' })">
            <app-ikona-crtanja [ime]="s.ekran === 'BEO' ? 'slajd' : 'bela'" /><span class="uz-kon-crt-taster" aria-hidden="true">W</span>
          </button>
          <button type="button" class="uz-kon-crt uz-kon-crt--glavno" [attr.aria-pressed]="crtanje()" aria-label="Crtaj" aria-keyshortcuts="D"
                  [attr.aria-disabled]="!crtanje() && !mozeCrtati() ? 'true' : null" [matTooltip]="crtajOblacic()"
                  (click)="pustiFokus($event); prebaciCrtanje()">
            <app-ikona-crtanja [ime]="crtanje() ? 'zatvori' : 'OLOVKA'" /><span class="uz-kon-crt-taster" aria-hidden="true">D</span>
          </button>
        </div>
        @if (usko()) {
          <button mat-icon-button type="button" [matMenuTriggerFor]="meni" aria-label="Još radnji"><mat-icon svgIcon="more_vert" /></button>
          <mat-menu #meni="matMenu">
            <button mat-menu-item type="button" (click)="telefon()"><mat-icon svgIcon="mobile" />Telefon</button>
            <button mat-menu-item type="button" (click)="otvoriPublikuProzor()"><mat-icon svgIcon="open_in_new" />Otvori publiku</button>
            <button mat-menu-item type="button" (click)="zavrsi()"><mat-icon svgIcon="stop_circle" />Završi</button>
          </mat-menu>
        } @else {
          <div class="uz-kon-akcije">
            <button mat-stroked-button type="button" (click)="otvoriPublikuProzor()"><mat-icon svgIcon="open_in_new" />Otvori publiku</button>
            <button mat-stroked-button type="button" (click)="naMonitor()"><mat-icon svgIcon="tv" />Otvori na monitoru</button>
            <button mat-stroked-button type="button" (click)="telefon()"><mat-icon svgIcon="mobile" />Telefon</button>
            <button mat-icon-button type="button" (click)="pomoc()" aria-label="Prečice"><mat-icon svgIcon="keyboard" /></button>
            <button mat-flat-button class="uz-opasno" type="button" (click)="zavrsi()"><mat-icon svgIcon="stop_circle" />Završi</button>
          </div>
        }
      </header>

      <ng-template #trenutniTpl>
        <section class="uz-kon-kartica uz-kon-trenutni" aria-label="Na projektoru">
          <h2 class="uz-kon-naslov">Na projektoru · {{ polozaj() }}</h2>
          <app-publika-scena [stanje]="s" [joinLink]="store.joinLink()" [qrLink]="store.qrLink()" [sat]="store.sat()" [umanjeno]="true"
                             [crtez]="crtac()?.prikaz() ?? null" [alatiCrtanja]="crtac()?.alatiZaPubliku() ?? null" />
          @if (ranijeNaSlajdu().length && mozeCrtati()) {
            <button type="button" class="uz-kon-ranije-cip" (click)="ukljuciCrtanje()">
              <app-ikona-crtanja ime="sat" /> Ranije si na ovom slajdu crtao
            </button>
          }
        </section>
      </ng-template>

      <ng-template #tajmerTpl>
        @if (s.faza === 'OTVORENO' && s.runda && (s.runda.rokMs !== null || s.runda.preostaloMs !== null)) {
          <div class="uz-kon-tajmer">
            <app-tajmer [rokMs]="s.runda.rokMs" [preostaloMs]="s.runda.preostaloMs" [sat]="store.sat()" [ukupnoMs]="store.ukupnoMs()" />
          </div>
        }
      </ng-template>

      <ng-template #rezultatiTpl>
        @if (s.trenutniSlajd?.tip === 'ZADATAK' && s.zadatak) {
          <section class="uz-kon-kartica" aria-label="Zadatak">
            <h2 class="uz-kon-naslov">
              Zadatak
              @if (s.rezultatiPrikazani) { <span class="uz-cip">rezultati na projektoru</span> }
            </h2>
            @if (s.runda) {
              @let o = odgovoriliSu();
              <p class="uz-kon-odgovorili" [class.uz-kon-odgovorili--svi]="o?.svi">
                Odgovorili <strong>{{ o?.broj }}/{{ o?.od }}</strong>
              </p>
            }
            <app-zadatak-panel [stanje]="s" (komanda)="komanda($event)" />
          </section>
        } @else {
          <section class="uz-kon-kartica" aria-label="Rezultati uživo">
            <h2 class="uz-kon-naslov">
              Rezultati uživo
              @if (s.rezultatiPrikazani) { <span class="uz-cip">na projektoru</span> }
            </h2>
            @if (s.runda && s.trenutniSlajd?.pitanje; as p) {
              @let o = odgovoriliSu();
              <p class="uz-kon-odgovorili" [class.uz-kon-odgovorili--svi]="o?.svi">
                Odgovorili <strong>{{ o?.broj }}/{{ o?.od }}</strong>
              </p>
              @if (s.rezultat; as r) {
                <app-rezultat-prikaz class="rezim-dan uz-dan uz-kon-rezultat" [rezultat]="r" [kompaktno]="true" [pitanje]="p" />
                @if (r.tip === 'KRATAK_TEKST') {
                  <h3 class="uz-kon-podnaslov">Tekstovi</h3>
                  <app-tekstovi-panel [tekstovi]="r.tekstovi ?? []" (sakrij)="store.sakrij(s.runda.id, $event.kljuc, $event.sakriven)" />
                }
              }
            } @else {
              <p class="uz-prazno">Rezultati se vide kad se pitanje otvori.</p>
            }
          </section>
        }
      </ng-template>

      <ng-template #fajloviTpl>
        @if (s.fajlovi; as fajlovi) {
          <section class="uz-kon-kartica" aria-label="Fajlovi za studente">
            <h2 class="uz-kon-naslov">Fajlovi za studente</h2>
            <app-fajlovi-kartica [fajlovi]="fajlovi" [naTabli]="s.fajloviNaTabli ?? true" />
          </section>
        }
      </ng-template>

      <ng-template #beleskeTpl>
        <section class="uz-kon-kartica" aria-label="Beleške predavača">
          <h2 class="uz-kon-naslov">Beleške</h2>
          <app-beleske-panel [tekst]="s.trenutniSlajd?.beleske ?? null" [kljucSlajda]="s.trenutniSlajd?.id ?? null" />
        </section>
      </ng-template>

      <ng-template #ucesniciTpl>
        <section class="uz-kon-kartica" aria-label="Učesnici i rang">
          <app-rang-konzola [stanje]="s" (preimenuj)="store.preimenuj($event.id, $event.ime)" (moderacija)="moderisi($event)"
                            (rangBroj)="store.komanda('RANG_BROJ', $event)" />
        </section>
      </ng-template>

      <ng-template #kontroleTpl>
        <app-konzola-kontrole [stanje]="s" [dozvoljene]="store.dozvoljene()" (komanda)="komanda($event)" />
      </ng-template>

      <ng-template #trakaTpl>
        <nav class="uz-kon-traka" aria-label="Brze komande">
          <button type="button" [disabled]="!ima('PRETHODNI')" (click)="pustiFokus($event); komanda({ tip: 'PRETHODNI' })">◀ Nazad</button>
          <button type="button" [disabled]="!ima('OTVORI_ZATVORI')" (click)="pustiFokus($event); komanda({ tip: 'OTVORI_ZATVORI' })">{{ otvoriZatvori() }}</button>
          <button type="button" [disabled]="!ima('REZULTATI')" [attr.aria-pressed]="s.rezultatiPrikazani"
                  (click)="pustiFokus($event); komanda({ tip: 'REZULTATI' })">Rezultati</button>
          <button type="button" class="uz-kon-traka-glavno" [disabled]="!ima('SLEDECI')" (click)="pustiFokus($event); komanda({ tip: 'SLEDECI' })">
            {{ dalje() }} ▶
          </button>
        </nav>
      </ng-template>

      @if (crtanje() && crtac(); as c) {
        <app-raspored-crtanja [crtac]="c" [usko]="usko()">
          @if (c.nesacuvano()) { <span crt-traka class="uz-kon-nesacuvano" role="status">Nije sačuvano</span> }
          @if (c.puno()) { <span crt-traka class="uz-kon-nesacuvano" role="status">Strana je puna</span> }
          <div crt-scena class="uz-kon-crt-scena">
            <app-publika-scena [stanje]="s" [joinLink]="store.joinLink()" [qrLink]="store.qrLink()" [sat]="store.sat()" [umanjeno]="true"
                               [crtez]="c.prikaz()" />
            <app-povrsina-crtanja [aktivna]="!!s.crtez && c.spremno()" [alat]="c.alat()" [boja]="c.boja()" [debljina]="c.debljina()"
                                  (pocetak)="pocetakPoteza()" (uToku)="c.uTokuJe($event)" (gotov)="c.dodaj($event)" />
            @if (!s.crtez) {
              <p class="uz-kon-crt-napomena" role="status">{{ s.prikaz === 'SLAJD' ? 'Ovde se ne crta.' : 'Na prijavi i kraju se ne crta.' }}</p>
            } @else if (!c.spremno()) {
              <p class="uz-kon-crt-napomena" role="status">Učitavanje crteža…</p>
            }
          </div>
          @if (ranijeOvde().length) {
            <app-ranije-panel crt-ranije [crtezi]="ranijeOvde()" [slajd]="slajdIspodCrteza()" [tema]="s.tema" (izabran)="c.dodajRanije($event.elementi)" />
          }
        </app-raspored-crtanja>
        @if (usko()) {
          <ng-container [ngTemplateOutlet]="trakaTpl" />
        }
      } @else if (usko()) {
        <mat-tab-group class="uz-kon-tabovi" mat-stretch-tabs animationDuration="0ms">
          <mat-tab label="Kontrole">
            <ng-container [ngTemplateOutlet]="trenutniTpl" />
            <ng-container [ngTemplateOutlet]="fajloviTpl" />
            <ng-container [ngTemplateOutlet]="tajmerTpl" />
            <ng-container [ngTemplateOutlet]="kontroleTpl" />
          </mat-tab>
          <mat-tab label="Rezultati"><ng-container [ngTemplateOutlet]="rezultatiTpl" /></mat-tab>
          <mat-tab label="Beleške"><ng-container [ngTemplateOutlet]="beleskeTpl" /></mat-tab>
          <mat-tab label="Učesnici i rang"><ng-container [ngTemplateOutlet]="ucesniciTpl" /></mat-tab>
        </mat-tab-group>
        <ng-container [ngTemplateOutlet]="trakaTpl" />
      } @else {
        <div class="uz-kon-telo">
          <div class="uz-kon-kolona">
            <ng-container [ngTemplateOutlet]="trenutniTpl" />
            <ng-container [ngTemplateOutlet]="fajloviTpl" />
            <app-sledece-panel [stanje]="s" />
          </div>
          <div class="uz-kon-kolona uz-kon-kolona--srednja">
            <ng-container [ngTemplateOutlet]="tajmerTpl" />
            <ng-container [ngTemplateOutlet]="kontroleTpl" />
          </div>
          <div class="uz-kon-kolona">
            <ng-container [ngTemplateOutlet]="rezultatiTpl" />
            <ng-container [ngTemplateOutlet]="beleskeTpl" />
            <ng-container [ngTemplateOutlet]="ucesniciTpl" />
          </div>
        </div>
      }
      }
    } @else if (store.greska(); as g) {
      <div class="uz-kon-poruka" role="alert">
        <p>{{ g }}</p>
        <a mat-flat-button [routerLink]="'/' + rute.prezentacije">Prezentacije</a>
      </div>
    } @else {
      <div class="uz-kon-poruka" role="status"><p>Učitavanje…</p></div>
    }
    @if (tast.gotoUnos() !== null) {
      <p class="uz-kon-goto" role="status">Idi na: <strong>{{ tast.gotoUnos() || '_' }}</strong></p>
    } @else if (ponoviTaster.ceka()) {
      <p class="uz-kon-goto" role="status">Pritisni R ponovo da ponoviš pitanje</p>
    }
  `,
})
export class KonzolaPage {
  protected readonly store = inject(IzvodjenjeStore);
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  protected readonly rute = UzivoPutanje;
  protected readonly tast = new TastaturaIzvodjenja();
  /** `R` sa tastature: dvaput u roku 2 s (kao publika), bez dijaloga potvrde (dopune plana crtanja). */
  protected readonly ponoviTaster = new DvaputR();
  private readonly crtanjeApi = inject(CrtanjeApi);
  private readonly ranijePodesavanje = inject(RanijiCrteziPodesavanje);
  /** Crtanje ovog izvođenja (pravi se kad se zna id; kanal ka publici i upis na server). */
  protected readonly crtac = signal<Crtac | null>(null);
  private readonly ranije = signal<RanijiCrtezi | null>(null);
  private readonly povrsina = viewChild(PovrsinaCrtanjaComponent);
  protected readonly crtanje = computed(() => this.crtac()?.ukljuceno() ?? false);
  /** Ima strane za crtanje: slajd, crn ekran ili beli ekran sa slajdom (ne prijava i kraj). */
  protected readonly mozeCrtati = computed(() => {
    const s = this.store.stanje();
    return !!s?.crtez && s.izvodjenje.status !== 'ZAVRSENO';
  });
  protected readonly crtajOblacic = computed(() => this.crtanje() ? 'Završi crtanje (D)'
    : this.mozeCrtati() ? 'Crtaj (D)' : 'Na prijavi i kraju se ne crta');
  /** Raniji crteži trenutnog slajda (obe pozadine): čip pod projektorom. */
  protected readonly ranijeNaSlajdu = computed(() => (this.ranije()?.naSlajdu() ?? []).filter(r => r.elementi.length > 0));
  /** Raniji crteži za pozadinu trenutne strane: panel „Ranije ovde” u crtanju. */
  protected readonly ranijeOvde = computed(() => {
    const k = this.crtac()?.kljuc();
    return k ? this.ranije()?.za(k.pozadina) ?? [] : [];
  });
  /** Slajd ispod ranijih crteža (bela pozadina: bez slajda). */
  protected readonly slajdIspodCrteza = computed(() => {
    const k = this.crtac()?.kljuc();
    const sl = this.store.stanje()?.trenutniSlajd ?? null;
    return k?.pozadina === 'SLAJD' && sl?.id === k.slajdId ? sl : null;
  });
  protected readonly pustiFokus = pustiFokusPosleKlika;

  protected readonly usko = toSignal(
    inject(BreakpointObserver).observe('(max-width: 599.98px)').pipe(map(r => r.matches)), { initialValue: false });
  protected readonly kod = computed(() => kodSaRazmakom(this.store.stanje()?.izvodjenje.kod ?? ''));
  protected readonly polozaj = computed(() => {
    const s = this.store.stanje();
    return s ? oznakaPolozaja(s) : '';
  });
  protected readonly dalje = computed(() => {
    const s = this.store.stanje();
    return s ? oznakaDalje(s) : '';
  });
  protected readonly otvoriZatvori = computed(() => {
    const s = this.store.stanje();
    return s ? oznakaOtvoriZatvori(s) : '';
  });
  protected readonly vezaTekst = computed(() => ({
    povezan: 'Povezano', povezivanje: 'Povezivanje…', prekinut: 'Veza prekinuta, povezujem…',
  })[this.store.veza()]);
  protected readonly odgovoriliSu = computed(() => {
    const s = this.store.stanje();
    return s ? odgovorili(s) : null;
  });

  /** Završni ekran: tastatura konzole tada ne šalje komande (server bi ih odbio sa 410). */
  protected readonly zavrseno = computed(() => this.store.stanje()?.izvodjenje.status === 'ZAVRSENO');

  constructor() {
    window.name = PROZOR_KONZOLE;
    inject(ActivatedRoute).paramMap.pipe(
      map(p => Number(p.get('id'))), filter(id => id > 0), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(id => {
      this.store.init(id);
      this.pripremiCrtanje(id);
    });
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.tast.unisti();
      this.ponoviTaster.unisti();
      this.crtac()?.unisti();
    });
    // Trenutna strana crteža iz snimka; posle kraja nema strane (i nema crtanja).
    effect(() => {
      const c = this.crtac();
      const s = this.store.stanje();
      if (!c || !s) return;
      const t = s.izvodjenje.status === 'ZAVRSENO' ? null : s.crtez ?? null;
      untracked(() => {
        c.postavi(t ? { slajdId: t.slajdId, pozadina: t.pozadina } : null, t?.verzija ?? 0);
        if (s.izvodjenje.status === 'ZAVRSENO') c.ukljuci(false);
      });
    });
    // Raniji crteži slajda (bela pozadina: slajd bele strane), jednom po slajdu i samo uz uključen prekidač.
    effect(() => {
      const r = this.ranije();
      const slajdId = this.store.stanje()?.crtez?.slajdId ?? null;
      const ukljuceno = this.ranijePodesavanje.ukljuceno();
      if (r) untracked(() => r.postavi(slajdId, ukljuceno));
    });
    // Laptop koji je spavao: stanje odmah, a posle dužeg skrivanja i nova STOMP veza.
    destroyRef.onDestroy(pratiPovratak(document, window, (ms) => this.store.posleVracanja(ms)));

    // Slike sledećeg slajda unapred (i u "Sledeće" i na umanjenom projektoru prelaz ne čeka mrežu).
    effect(() => preducitajSlike(slikeSlajda(this.store.stanje()?.sledeciSlajd ?? null)));
    // Formule bez slike (MathLive, CSS, KaTeX fontovi) trenutnog i sledećeg slajda (odluka 32).
    effect(() => {
      const s = this.store.stanje();
      if (s) untracked(() => preducitajFormule(s.trenutniSlajd, s.sledeciSlajd));
    });

    // Završeno (ovom konzolom, drugim prozorom ili automatski posle 12 h): završni ekran u istoj kartici (predlog sledeće,
    // sve prezentacije, povratak), u režimu aplikacije (dan/noć), a ne više skok na pregled.
    const rezim = inject(RezimProjektora);
    effect(() => rezim.pratiRezim.set(this.zavrseno()));
    destroyRef.onDestroy(() => rezim.pratiRezim.set(false));
  }

  protected ima(tip: TipKomande): boolean {
    return this.store.dozvoljene().has(tip);
  }

  /** Meni moderacije učesnika: sakrij odgovor, utišaj, izbaci (svaki zahtev ide kroz red komandi store-a). */
  protected moderisi(m: Moderacija): void {
    switch (m.vrsta) {
      case 'izbaci': this.store.izbaci(m.id, m.predavanje); break;
      case 'utisaj': this.store.utisaj(m.id, m.utisan); break;
      case 'sakrij': this.store.sakrijUcesnika(m.rundaId, m.id, m.sakriven); break;
    }
  }

  protected komanda(z: KomandaZahtev): void {
    if (z.tip === 'PONOVI' && this.ima('PONOVI')) {
      this.ponovi();
      return;
    }
    this.store.komanda(z.tip, z.vrednost);
  }

  protected tastatura(e: KeyboardEvent): void {
    if (this.zavrseno()) return;
    const a = this.tast.akcija(e, this.store.stanje()?.brojSlajdova ?? 0, this.dialog.openDialogs.length > 0, this.crtanje());
    if (a) this.izvrsi(a);
  }

  private izvrsi(a: TasterAkcija): void {
    if ('lokalno' in a) {
      const c = this.crtac();
      switch (a.lokalno) {
        case 'CEO_EKRAN': prebaciCeoEkran(); break;
        case 'KONZOLA': this.otvoriPublikuProzor(); break;
        case 'POMOC': this.pomoc(); break;
        case 'CRTANJE': this.prebaciCrtanje(); break;
        case 'ALAT': {
          const alat = ALATI[a.vrednost ?? -1];
          if (alat) c?.izaberiAlat(alat.tip);
          break;
        }
        case 'PONISTI': c?.ponisti(); break;
        case 'VRATI': c?.vrati(); break;
        case 'ESC':
          // Esc prvo otkazuje potez u toku, pa tek onda završava crtanje
          if (!this.povrsina()?.otkazi()) this.ukljuciCrtanje(false);
          break;
      }
      return;
    }
    // U konzoli i nedozvoljena komanda ide serveru: njegov razlog ("Prvo zatvori pitanje.") vidi samo nastavnik.
    if (a.komanda === 'PONOVI' && this.ima('PONOVI')) {
      if (this.ponoviTaster.pritisni()) this.store.komanda('PONOVI');
      return;
    }
    this.ponoviTaster.prekini();
    this.store.komanda(a.komanda, a.vrednost);
  }

  private ponovi(): void {
    const zadatak = this.store.stanje()?.trenutniSlajd?.tip === 'ZADATAK';
    ConfirmDialog.otvori(this.dialog, {
      naslov: zadatak ? 'Ponoviti zadatak?' : 'Ponoviti pitanje?',
      tekst: zadatak
        ? 'Otvara se nova runda sa novim izvlačenjem varijanti; dosadašnji odgovori ostaju u prethodnoj rundi.'
        : 'Otvara se nova runda; dosadašnji odgovori ostaju u prethodnoj rundi.',
      potvrdi: 'Ponovi',
    }).subscribe(da => {
      if (da) this.store.komanda('PONOVI');
    });
  }

  protected pomoc(): void {
    otvoriPomoc(this.dialog, 'konzola');
  }

  protected prebaciCrtanje(): void {
    this.ukljuciCrtanje(!this.crtanje());
  }

  /** Ulaz u crtanje (ne na prijavi i kraju) gasi crni ekran; izlaz otkazuje potez u toku. */
  protected ukljuciCrtanje(da = true): void {
    const c = this.crtac();
    if (!c) return;
    if (!da) {
      this.povrsina()?.otkazi();
      c.ukljuci(false);
      return;
    }
    if (!this.mozeCrtati()) return;
    this.ugasiCrnEkran();
    c.ukljuci(true);
  }

  /** Prvi pritisak na površinu: na crnom ekranu (`B` usred crtanja) se crta tek kad se vidi. */
  protected pocetakPoteza(): void {
    this.ugasiCrnEkran();
  }

  private ugasiCrnEkran(): void {
    if (this.store.stanje()?.ekran === 'CRN') this.store.komanda('EKRAN_CRN');
  }

  private pripremiCrtanje(id: number): void {
    this.crtac()?.unisti();
    const api = this.crtanjeApi;
    this.crtac.set(new Crtac({
      ucitaj: k => api.strana(id, k),
      upisi: (k, elementi) => api.upisiStranu(id, k, elementi),
    }, kanalIzvodjenja(id)));
    this.ranije.set(new RanijiCrtezi(slajdId => api.ranije(id, slajdId)));
  }

  protected otvoriPublikuProzor(): void {
    const link = this.store.publikaLink();
    if (link && !otvoriIliFokusiraj(link, PROZOR_PUBLIKE, 'popup')) {
      this.obavestenja.greska(PORUKA_BLOKIRAN);
    }
  }

  protected async naMonitor(): Promise<void> {
    const link = this.store.publikaLink();
    if (!link) return;
    const izbor = izborEkrana(this.dialog);
    const w = await otvoriPublikuNaMonitoru(link, izbor.izbor);
    if (!w && !izbor.otkazano()) {
      this.obavestenja.greska(PORUKA_BLOKIRAN);
    }
  }

  protected telefon(): void {
    this.dialog.open(TelefonDialog, { data: { daljinski: this.store.daljinskiLink(), konzola: this.store.konzolaLink() } satisfies TelefonLinkovi, width: '420px', maxWidth: '95vw' });
  }

  protected zavrsi(): void {
    const s = this.store.stanje();
    if (!s) return;
    const poruke = ['Studenti vide kraj.'];
    if (!s.izvodjenje.cuvanje) poruke.push('Odgovori se brišu.');
    ConfirmDialog.otvori(this.dialog, { naslov: 'Završiti izvođenje?', tekst: poruke, potvrdi: 'Završi', destruktivno: true }).subscribe(da => {
      if (da) this.store.komanda('ZAVRSI');
    });
  }
}

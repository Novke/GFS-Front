import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, filter, firstValueFrom, map } from 'rxjs';
import { AppRoutes } from '../../../app.routes';
import { oznakaDalje, oznakaOtvoriZatvori, oznakaPolozaja } from '../data-access/izvodjenje-pravila';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { TipKomande } from '../data-access/uzivo.models';
import { TasterAkcija } from '../tastatura';
import { kodSaRazmakom } from '../ui/format';
import { EkranOpis, PROZOR_KONZOLE, PROZOR_PUBLIKE, otvoriIliFokusiraj, otvoriPublikuNaMonitoru } from '../ui/monitor';
import { potvrdi } from '../ui/potvrda.dialog';
import { QrKodComponent } from '../ui/qr-kod.component';
import { RezultatPrikazComponent } from '../ui/rezultat-prikaz.component';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { TajmerComponent } from '../ui/tajmer.component';
import { KomandaZahtev, KonzolaKontroleComponent } from './konzola-kontrole.component';
import { otvoriPomoc } from './pomoc-precice.dialog';
import { TastaturaIzvodjenja, prebaciCeoEkran, pustiFokusPosleKlika } from './precice';
import { PublikaScenaComponent } from './publika-scena.component';
import { TekstoviPanelComponent } from './tekstovi-panel.component';
import { UcesniciPanelComponent } from './ucesnici-panel.component';

const PORUKA_BLOKIRAN = 'Prozor nije otvoren: dozvoli iskačuće prozore za ovu stranicu i pokušaj ponovo.';

/** QR do konzole: telefon postaje daljinski (spec 1.7). */
@Component({
  selector: 'gfs-telefon-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, QrKodComponent],
  template: `
    <h2 mat-dialog-title>Konzola na telefonu</h2>
    <mat-dialog-content class="uz-kon-telefon">
      <p>Skeniraj QR kod telefonom: konzola se otvara na telefonu i radi kao daljinski (Dalje, Otvori/Zatvori, Rezultati).</p>
      <gfs-qr-kod class="uz-kon-telefon-qr" [tekst]="link" [velicina]="480" />
      <p class="uz-kon-telefon-link">{{ link }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" mat-dialog-close cdkFocusInitial>Zatvori</button>
    </mat-dialog-actions>
  `,
})
export class TelefonDialog {
  protected readonly link = inject<string>(MAT_DIALOG_DATA);
}

/** Izbor ekrana za prikaz publike (Window Management API, više ekrana). */
@Component({
  selector: 'gfs-izbor-ekrana-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Na kom ekranu?</h2>
    <mat-dialog-content>
      <div class="uz-kon-ekrani">
        @for (e of ekrani; track $index) {
          <button mat-stroked-button type="button" [mat-dialog-close]="e">
            <mat-icon>{{ e.primarni ? 'laptop' : 'tv' }}</mat-icon>{{ e.oznaka }}
          </button>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="null" cdkFocusInitial>Otkaži</button>
    </mat-dialog-actions>
  `,
})
export class IzborEkranaDialog {
  protected readonly ekrani = inject<EkranOpis[]>(MAT_DIALOG_DATA);
}

/**
 * Konzola za predavača (spec 6.4): zaglavlje (naziv, kod, povezani/ukupno, veza, publika, monitor, telefon, Završi),
 * levo trenutni (tačno ono što je na projektoru) i sledeći slajd, u sredini kontrole i tajmer, desno rezultati uživo
 * (privatno, uvek), tekstovi sa "sakrij", beleške i učesnici. Ispod 600 px: tabovi i lepljiva donja traka. Iste
 * prečice kao publika; `R` traži potvrdu, `P` otvara publiku. Posle završetka: pregled (uz čuvanje) ili editor.
 */
@Component({
  selector: 'gfs-konzola',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [IzvodjenjeStore],
  imports: [
    NgTemplateOutlet, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatTabsModule, KonzolaKontroleComponent,
    PublikaScenaComponent, RezultatPrikazComponent, SlajdPrikazComponent, TajmerComponent, TekstoviPanelComponent,
    UcesniciPanelComponent,
  ],
  host: { class: 'uz-kon', lang: 'sr-Latn', '[class.uz-kon--usko]': 'usko()', '(document:keydown)': 'tastatura($event)', '(document:keyup)': 'tast.pusten($event)' },
  template: `
    @if (store.stanje(); as s) {
      <header class="uz-kon-zaglavlje">
        <div class="uz-kon-naslovi">
          <h1 class="uz-kon-naziv">{{ s.izvodjenje.prezentacija.naziv }}</h1>
          <p class="uz-kon-meta">
            <span>kod <strong>{{ kod() }}</strong></span>
            <span>{{ polozaj() }}</span>
            <span>učesnici {{ s.brojPovezanih }}/{{ s.ucesnici.length }}</span>
            <span class="uz-kon-veza" [class.uz-kon-veza--ok]="store.veza() === 'povezan'" role="status">{{ vezaTekst() }}</span>
          </p>
        </div>
        @if (usko()) {
          <button mat-icon-button type="button" [matMenuTriggerFor]="meni" aria-label="Još radnji"><mat-icon>more_vert</mat-icon></button>
          <mat-menu #meni="matMenu">
            <button mat-menu-item type="button" (click)="telefon()"><mat-icon>smartphone</mat-icon>Telefon</button>
            <button mat-menu-item type="button" (click)="otvoriPublikuProzor()"><mat-icon>open_in_new</mat-icon>Otvori publiku</button>
            <button mat-menu-item type="button" (click)="zavrsi()"><mat-icon>stop_circle</mat-icon>Završi</button>
          </mat-menu>
        } @else {
          <div class="uz-kon-akcije">
            <button mat-stroked-button type="button" (click)="otvoriPublikuProzor()"><mat-icon>open_in_new</mat-icon>Otvori publiku</button>
            <button mat-stroked-button type="button" (click)="naMonitor()"><mat-icon>tv</mat-icon>Otvori na monitoru</button>
            <button mat-stroked-button type="button" (click)="telefon()"><mat-icon>smartphone</mat-icon>Telefon</button>
            <button mat-icon-button type="button" (click)="pomoc()" aria-label="Prečice"><mat-icon>keyboard</mat-icon></button>
            <button mat-flat-button color="warn" type="button" (click)="zavrsi()"><mat-icon>stop_circle</mat-icon>Završi</button>
          </div>
        }
      </header>

      <ng-template #trenutniTpl>
        <section class="uz-kon-kartica uz-kon-trenutni" aria-label="Na projektoru">
          <h2 class="uz-kon-naslov">Na projektoru · {{ polozaj() }}</h2>
          <gfs-publika-scena [stanje]="s" [joinLink]="store.joinLink()" [sat]="store.sat()" [umanjeno]="true" />
        </section>
      </ng-template>

      <ng-template #tajmerTpl>
        @if (s.faza === 'OTVORENO' && s.runda && (s.runda.rokMs !== null || s.runda.preostaloMs !== null)) {
          <div class="uz-kon-tajmer">
            <gfs-tajmer [rokMs]="s.runda.rokMs" [preostaloMs]="s.runda.preostaloMs" [sat]="store.sat()" [ukupnoMs]="store.ukupnoMs()" />
          </div>
        }
      </ng-template>

      <ng-template #rezultatiTpl>
        <section class="uz-kon-kartica" aria-label="Rezultati uživo">
          <h2 class="uz-kon-naslov">
            Rezultati uživo
            @if (s.rezultatiPrikazani) { <span class="uz-cip">na projektoru</span> }
          </h2>
          @if (s.runda && s.trenutniSlajd?.pitanje; as p) {
            <p class="uz-kon-odgovorili" [class.uz-kon-odgovorili--svi]="sviOdgovorili()">
              Odgovorili <strong>{{ s.brojOdgovora }}/{{ s.brojPovezanih }}</strong>
            </p>
            @if (s.rezultat; as r) {
              <gfs-rezultat-prikaz class="uz-dan uz-kon-rezultat" [rezultat]="r" [kompaktno]="true"
                                   [tekstPrikaz]="p.tekstPrikaz" [jedinica]="p.jedinica" />
              @if (r.tip === 'KRATAK_TEKST') {
                <h3 class="uz-kon-podnaslov">Tekstovi</h3>
                <gfs-tekstovi-panel [tekstovi]="r.tekstovi ?? []" (sakrij)="store.sakrij(s.runda.id, $event.kljuc, $event.sakriven)" />
              }
            }
          } @else {
            <p class="uz-prazno">Rezultati se vide kad se pitanje otvori.</p>
          }
        </section>
      </ng-template>

      <ng-template #beleskeTpl>
        <section class="uz-kon-kartica" aria-label="Beleške">
          <h2 class="uz-kon-naslov">Beleške</h2>
          @if (s.trenutniSlajd?.beleske; as b) { <p class="uz-kon-beleske">{{ b }}</p> }
          @else { <p class="uz-prazno">Nema beležaka za ovaj slajd.</p> }
        </section>
      </ng-template>

      <ng-template #ucesniciTpl>
        <section class="uz-kon-kartica" aria-label="Učesnici">
          <h2 class="uz-kon-naslov">Učesnici</h2>
          <gfs-ucesnici-panel [ucesnici]="s.ucesnici" [takmicenje]="s.takmicenje"
                              (preimenuj)="store.preimenuj($event.id, $event.ime)" (izbaci)="store.izbaci($event)" />
        </section>
      </ng-template>

      <ng-template #kontroleTpl>
        <gfs-konzola-kontrole [stanje]="s" [dozvoljene]="store.dozvoljene()" (komanda)="komanda($event)" />
      </ng-template>

      @if (usko()) {
        <mat-tab-group class="uz-kon-tabovi" mat-stretch-tabs animationDuration="0ms">
          <mat-tab label="Kontrole">
            <ng-container [ngTemplateOutlet]="trenutniTpl" />
            <ng-container [ngTemplateOutlet]="tajmerTpl" />
            <ng-container [ngTemplateOutlet]="kontroleTpl" />
          </mat-tab>
          <mat-tab label="Rezultati"><ng-container [ngTemplateOutlet]="rezultatiTpl" /></mat-tab>
          <mat-tab label="Beleške"><ng-container [ngTemplateOutlet]="beleskeTpl" /></mat-tab>
          <mat-tab label="Učesnici"><ng-container [ngTemplateOutlet]="ucesniciTpl" /></mat-tab>
        </mat-tab-group>
        <nav class="uz-kon-traka" aria-label="Brze komande">
          <button type="button" [disabled]="!ima('PRETHODNI')" (click)="pustiFokus($event); komanda({ tip: 'PRETHODNI' })">◀ Nazad</button>
          <button type="button" [disabled]="!ima('OTVORI_ZATVORI')" (click)="pustiFokus($event); komanda({ tip: 'OTVORI_ZATVORI' })">{{ otvoriZatvori() }}</button>
          <button type="button" [disabled]="!ima('REZULTATI')" [attr.aria-pressed]="s.rezultatiPrikazani"
                  (click)="pustiFokus($event); komanda({ tip: 'REZULTATI' })">Rezultati</button>
          <button type="button" class="uz-kon-traka-glavno" [disabled]="!ima('SLEDECI')" (click)="pustiFokus($event); komanda({ tip: 'SLEDECI' })">
            {{ dalje() }} ▶
          </button>
        </nav>
      } @else {
        <div class="uz-kon-telo">
          <div class="uz-kon-kolona">
            <ng-container [ngTemplateOutlet]="trenutniTpl" />
            <section class="uz-kon-kartica uz-kon-sledeci" aria-label="Sledeće">
              <h2 class="uz-kon-naslov">Sledeće</h2>
              @if (s.sledeciSlajd; as sl) {
                <div class="uz-dan"><gfs-slajd-prikaz [slajd]="sl" [postepeno]="false" /></div>
              } @else {
                <p class="uz-prazno">{{ s.prikaz === 'KRAJ' ? 'Ovo je kraj. Završi izvođenje dugmetom „Završi“.' : 'Kraj prezentacije.' }}</p>
              }
            </section>
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
    } @else if (store.greska(); as g) {
      <div class="uz-kon-poruka" role="alert">
        <p>{{ g }}</p>
        <a mat-flat-button color="primary" [routerLink]="'/' + rute.prezentacije">Prezentacije</a>
      </div>
    } @else {
      <div class="uz-kon-poruka" role="status"><p>Učitavanje…</p></div>
    }
    @if (tast.gotoUnos() !== null) {
      <p class="uz-kon-goto" role="status">Idi na: <strong>{{ tast.gotoUnos() || '_' }}</strong></p>
    }
  `,
})
export class KonzolaPage {
  protected readonly store = inject(IzvodjenjeStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  protected readonly rute = AppRoutes;
  protected readonly tast = new TastaturaIzvodjenja();
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
  protected readonly sviOdgovorili = computed(() => {
    const s = this.store.stanje();
    return !!s && s.brojPovezanih > 0 && s.brojOdgovora >= s.brojPovezanih;
  });

  private otisao = false;

  constructor() {
    window.name = PROZOR_KONZOLE;
    inject(ActivatedRoute).paramMap.pipe(
      map(p => Number(p.get('id'))), filter(id => id > 0), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(id => this.store.init(id));
    inject(DestroyRef).onDestroy(() => this.tast.unisti());

    // Završeno (ovom konzolom, drugim prozorom ili automatski posle 12 h): pregled ako se čuva, inače editor.
    effect(() => {
      const s = this.store.stanje();
      if (!s || s.izvodjenje.status !== 'ZAVRSENO' || this.otisao) return;
      this.otisao = true;
      untracked(() => {
        this.snack.open('Izvođenje je završeno.', undefined, { duration: 4000 });
        const cilj = s.izvodjenje.cuvanje
          ? AppRoutes.izvodjenjePregled(s.izvodjenje.id)
          : AppRoutes.prezentacija(s.izvodjenje.prezentacija.id);
        void this.router.navigate(['/' + cilj]);
      });
    });
  }

  protected ima(tip: TipKomande): boolean {
    return this.store.dozvoljene().has(tip);
  }

  protected komanda(z: KomandaZahtev): void {
    if (z.tip === 'PONOVI' && this.ima('PONOVI')) {
      this.ponovi();
      return;
    }
    this.store.komanda(z.tip, z.vrednost);
  }

  protected tastatura(e: KeyboardEvent): void {
    const a = this.tast.akcija(e, this.store.stanje()?.brojSlajdova ?? 0, this.dialog.openDialogs.length > 0);
    if (a) this.izvrsi(a);
  }

  private izvrsi(a: TasterAkcija): void {
    if ('lokalno' in a) {
      switch (a.lokalno) {
        case 'CEO_EKRAN': prebaciCeoEkran(); break;
        case 'KONZOLA': this.otvoriPublikuProzor(); break;
        case 'POMOC': this.pomoc(); break;
      }
      return;
    }
    // U konzoli i nedozvoljena komanda ide serveru: njegov razlog ("Prvo zatvori pitanje.") vidi samo nastavnik.
    this.komanda({ tip: a.komanda, vrednost: a.vrednost });
  }

  private ponovi(): void {
    potvrdi(this.dialog, {
      naslov: 'Ponoviti pitanje?',
      poruke: ['Otvara se nova runda; dosadašnji odgovori ostaju u prethodnoj rundi.'],
      potvrdi: 'Ponovi',
    }).subscribe(da => {
      if (da) this.store.komanda('PONOVI');
    });
  }

  protected pomoc(): void {
    otvoriPomoc(this.dialog, 'konzola');
  }

  protected otvoriPublikuProzor(): void {
    const link = this.store.publikaLink();
    if (link && !otvoriIliFokusiraj(link, PROZOR_PUBLIKE, 'popup')) {
      this.snack.open(PORUKA_BLOKIRAN, 'U redu', { duration: 6000 });
    }
  }

  protected async naMonitor(): Promise<void> {
    const link = this.store.publikaLink();
    if (!link) return;
    let otkazano = false;
    const izbor = async (ekrani: EkranOpis[]) => {
      const e = await firstValueFrom(
        this.dialog.open<IzborEkranaDialog, EkranOpis[], EkranOpis | null>(IzborEkranaDialog, { data: ekrani, width: '420px', maxWidth: '95vw' })
          .afterClosed());
      otkazano = !e;
      return e ?? null;
    };
    const w = await otvoriPublikuNaMonitoru(link, izbor);
    if (!w && !otkazano) {
      this.snack.open(PORUKA_BLOKIRAN, 'U redu', { duration: 6000 });
    }
  }

  protected telefon(): void {
    this.dialog.open(TelefonDialog, { data: this.store.konzolaLink(), width: '420px', maxWidth: '95vw' });
  }

  protected zavrsi(): void {
    const s = this.store.stanje();
    if (!s) return;
    const poruke = ['Studenti vide kraj.'];
    if (!s.izvodjenje.cuvanje) poruke.push('Odgovori se brišu.');
    potvrdi(this.dialog, { naslov: 'Završiti izvođenje?', poruke, potvrdi: 'Završi', opasno: true }).subscribe(da => {
      if (da) this.store.komanda('ZAVRSI');
    });
  }
}

import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { AppRoutes } from '../../../app.routes';
import { EditorStore, NijeSacuvano } from '../data-access/editor.store';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { TIPOVI_PITANJA, opisTipa, oznakaSlajda } from '../data-access/slajd-pravila';
import { IzvodjenjeInfo, PokreniCmd, SlajdDetails, UpdatePrezentacijaCmd } from '../data-access/uzivo.models';
import { kodSaRazmakom } from '../ui/format';
import { potvrdi } from '../ui/potvrda.dialog';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { otvoriPokreni, pokretanjeBezDijaloga } from './pokreni.dialog';
import { SlajdFormaComponent } from './slajd-forma.component';

const STATUS: Record<string, string> = { miruje: '', cuva: 'Čuva se…', sacuvano: 'Sačuvano' };

/**
 * Editor prezentacije (spec 6.3): levo lista slajdova (CDK drag-drop, meni po slajdu, "+ Info", "+ Pitanje"), u sredini
 * forma izabranog slajda, desno živi pregled istom komponentom kao projektor (uvek dnevne boje, `uz-dan`). Ispod
 * 1200 px pregled ide ispod forme. Zaglavlje: naziv i opis (izmena na mestu), indikator čuvanja, Izvođenja, Dupliraj,
 * Obriši, Pokreni; traka za izvođenje u toku; podešavanja u panelu. Ctrl+S čuva odmah.
 */
@Component({
  selector: 'gfs-prezentacija-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EditorStore],
  imports: [
    CdkDrag, CdkDragHandle, CdkDropList, RouterLink, MatButtonModule, MatExpansionModule, MatIconModule, MatMenuModule,
    MatProgressBarModule, MatRadioModule, MatSlideToggleModule, SlajdFormaComponent, SlajdPrikazComponent,
  ],
  host: {
    '(document:keydown)': 'tastatura($event)',
    '(window:beforeunload)': 'preIzlaska($event)',
  },
  template: `
    @if (store.prezentacija(); as p) {
      <div class="uz-ed">
        <header class="uz-ed-zaglavlje">
          <a mat-icon-button [routerLink]="'/' + rute.prezentacije" [queryParams]="{ predmet: p.predmet.id }"
             aria-label="Nazad na prezentacije"><mat-icon>arrow_back</mat-icon></a>
          <div class="uz-ed-naslovi">
            <input class="uz-ed-naziv" aria-label="Naziv prezentacije" maxlength="200" [value]="p.naziv"
                   (change)="sacuvajNaziv($any($event.target))" (keydown.enter)="$any($event.target).blur()">
            <input class="uz-ed-opis" aria-label="Opis prezentacije" maxlength="1000" placeholder="Dodaj opis…"
                   [value]="p.opis ?? ''" (change)="sacuvajOpis($any($event.target))" (keydown.enter)="$any($event.target).blur()">
            <span class="uz-ed-predmet">{{ p.predmet.naziv }}</span>
          </div>
          <span class="uz-ed-status" role="status" [class.uz-ed-status--greska]="store.cuvanje() === 'greska'">
            @if (store.cuvanje() === 'greska') { <mat-icon aria-hidden="true">error_outline</mat-icon> }
            {{ statusTekst() }}
          </span>
          <div class="uz-ed-akcije">
            <a mat-button [routerLink]="'/' + rute.prezentacijaIzvodjenja(p.id)"><mat-icon>history</mat-icon>Izvođenja</a>
            <button mat-button type="button" [disabled]="radi()" (click)="duplirajPrezentaciju()">
              <mat-icon>content_copy</mat-icon>Dupliraj prezentaciju
            </button>
            <button mat-button type="button" [disabled]="radi()" (click)="obrisiPrezentaciju()">
              <mat-icon>delete</mat-icon>Obriši
            </button>
            <button mat-flat-button color="primary" type="button" [disabled]="radi()" (click)="pokreni()">
              <mat-icon>play_arrow</mat-icon>Pokreni
            </button>
          </div>
        </header>

        @if (aktivno(); as a) {
          <div class="uz-ed-traka" role="status">
            <mat-icon aria-hidden="true">sensors</mat-icon>
            <span>Izvođenje u toku · kod <strong>{{ kod(a.kod) }}</strong></span>
            <a mat-flat-button [routerLink]="'/' + rute.izvodjenjeKonzola(a.id)">Nastavi</a>
          </div>
        }

        <mat-expansion-panel class="uz-ed-podesavanja">
          <mat-expansion-panel-header>
            <mat-panel-title>Podešavanja</mat-panel-title>
            <mat-panel-description>{{ opisPodesavanja() }}</mat-panel-description>
          </mat-expansion-panel-header>
          <div class="uz-ed-podesavanja-telo">
            <mat-slide-toggle [checked]="p.takmicenje" (change)="podesi({ takmicenje: $event.checked })">
              Takmičenje: poeni za brzinu i rang-lista
            </mat-slide-toggle>
            <div class="uz-ed-grupa">
              <span class="uz-ed-oznaka-grupe" id="uz-ed-telefon">Telefon studenta</span>
              <mat-radio-group aria-labelledby="uz-ed-telefon" [value]="p.telefonPrikaz"
                               (change)="podesi({ telefonPrikaz: $event.value })">
                <mat-radio-button value="DUGMAD">Samo dugmad (pitanje je na projektoru)</mat-radio-button>
                <mat-radio-button value="PITANJE">Celo pitanje</mat-radio-button>
              </mat-radio-group>
            </div>
            <mat-slide-toggle [checked]="p.detaljiDozvoljeni" [disabled]="p.telefonPrikaz === 'PITANJE'"
                              (change)="podesi({ detaljiDozvoljeni: $event.checked })">
              Dozvoli „Detalje“: student u režimu dugmadi može da otvori tekst pitanja
            </mat-slide-toggle>
            <p class="uz-ed-napomena">Režim telefona i „Detalji“ menjaju se i uživo (tasteri M i D).</p>
          </div>
        </mat-expansion-panel>

        <div class="uz-ed-telo">
          <nav class="uz-ed-lista" aria-label="Slajdovi">
            <ol class="uz-ed-slajdovi" cdkDropList (cdkDropListDropped)="spusteno($event)">
              @for (s of store.slajdovi(); track store.kljuc(s.id); let i = $index) {
                <li class="uz-ed-stavka" cdkDrag cdkDragLockAxis="y"
                    [class.uz-ed-stavka--izabrana]="s.id === store.izabraniId()">
                  <mat-icon class="uz-ed-rucka" cdkDragHandle aria-hidden="true">drag_indicator</mat-icon>
                  <button class="uz-ed-stavka-dugme" type="button" (click)="store.izaberi(s.id)"
                          [attr.aria-current]="s.id === store.izabraniId() ? 'true' : null">
                    <span class="uz-ed-rb">{{ s.rb }}</span>
                    <mat-icon class="uz-ed-ikona" [attr.aria-label]="nazivTipa(s)">{{ ikona(s) }}</mat-icon>
                    <span class="uz-ed-oznaka">{{ oznaka(s) }}</span>
                    @if (store.neispravni().has(s.id) || s.id < 0) {
                      <mat-icon class="uz-ed-upozorenje" aria-label="Nije sačuvan" title="Nije sačuvan">error_outline</mat-icon>
                    }
                  </button>
                  <button mat-icon-button type="button" [matMenuTriggerFor]="meniSlajda" [matMenuTriggerData]="{ s, i }"
                          [attr.aria-label]="'Radnje za slajd ' + s.rb"><mat-icon>more_vert</mat-icon></button>
                </li>
              }
            </ol>
            @if (!store.slajdovi().length) {
              <p class="uz-ed-napomena">Prezentacija još nema slajdova. Dodaj info slajd ili pitanje.</p>
            }
            <div class="uz-ed-dodaj">
              <button mat-stroked-button type="button" (click)="store.dodaj('INFO')"><mat-icon>add</mat-icon>Info</button>
              <button mat-stroked-button type="button" [matMenuTriggerFor]="meniPitanja"><mat-icon>add</mat-icon>Pitanje</button>
            </div>
          </nav>

          <mat-menu #meniPitanja="matMenu">
            @for (t of tipovi; track t.tip) {
              <button mat-menu-item type="button" (click)="store.dodaj('PITANJE', t.tip)">
                <mat-icon>{{ t.ikona }}</mat-icon>{{ t.naziv }}
              </button>
            }
          </mat-menu>
          <mat-menu #meniSlajda="matMenu">
            <ng-template matMenuContent let-s="s" let-i="i">
              <button mat-menu-item type="button" (click)="store.dupliraj(s.id)"><mat-icon>content_copy</mat-icon>Dupliraj</button>
              <button mat-menu-item type="button" [disabled]="i === 0" (click)="store.pomeri(i, i - 1)">
                <mat-icon>arrow_upward</mat-icon>Pomeri gore
              </button>
              <button mat-menu-item type="button" [disabled]="i === store.slajdovi().length - 1" (click)="store.pomeri(i, i + 1)">
                <mat-icon>arrow_downward</mat-icon>Pomeri dole
              </button>
              <button mat-menu-item type="button" (click)="obrisiSlajd(s)"><mat-icon>delete</mat-icon>Obriši</button>
            </ng-template>
          </mat-menu>

          <section class="uz-ed-sredina" aria-label="Izabrani slajd">
            @for (s of izabraniNiz(); track store.kljuc(s.id)) {
              <gfs-slajd-forma [slajd]="s" (izmena)="store.izmeniSlajd(s.id, $event)" />
            } @empty {
              <p class="uz-ed-napomena">Izaberi slajd levo ili dodaj nov.</p>
            }
          </section>

          <aside class="uz-ed-pregled" aria-label="Pregled slajda">
            @if (store.izabrani(); as s) {
              <div class="uz-dan uz-ed-platno">
                <gfs-slajd-prikaz [slajd]="s" />
              </div>
              <p class="uz-ed-napomena">Ovako slajd izgleda na projektoru.</p>
            }
          </aside>
        </div>
      </div>
    } @else if (store.greska(); as g) {
      <main class="uz-ed-strana">
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
        <a mat-button [routerLink]="'/' + rute.prezentacije"><mat-icon>arrow_back</mat-icon>Nazad na prezentacije</a>
      </main>
    } @else {
      <mat-progress-bar mode="indeterminate" aria-label="Učitavanje prezentacije" />
    }
  `,
})
export class PrezentacijaEditorPage {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(PrezentacijeApi);
  private readonly izvodjenja = inject(IzvodjenjaApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly rute = AppRoutes;
  protected readonly tipovi = TIPOVI_PITANJA;
  protected readonly kod = kodSaRazmakom;
  protected readonly oznaka = (s: SlajdDetails) => oznakaSlajda(s, 48);
  protected readonly aktivno = signal<IzvodjenjeInfo | null>(null);
  /** Traje radnja nad celom prezentacijom (pokretanje, dupliranje, brisanje). */
  protected readonly radi = signal(false);
  protected readonly izabraniNiz = computed(() => {
    const s = this.store.izabrani();
    return s ? [s] : [];
  });
  protected readonly statusTekst = computed(() =>
    this.store.cuvanje() === 'greska' ? this.store.greska() ?? 'Greška pri čuvanju.' : STATUS[this.store.cuvanje()]);
  protected readonly opisPodesavanja = computed(() => {
    const p = this.store.prezentacija();
    if (!p) return '';
    const telefon = p.telefonPrikaz === 'PITANJE' ? 'telefon: celo pitanje'
      : `telefon: samo dugmad${p.detaljiDozvoljeni ? ', Detalji dozvoljeni' : ''}`;
    return `${p.takmicenje ? 'Takmičenje' : 'Bez takmičenja'} · ${telefon}`;
  });

  private readonly aktivnoZa = computed(() => {
    const p = this.store.prezentacija();
    return p?.aktivnoIzvodjenjeId ? p.id : null;
  });

  constructor() {
    this.route.paramMap.pipe(map(p => Number(p.get('id'))), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(id => {
        this.aktivno.set(null);
        if (id > 0) this.store.ucitaj(id);
      });
    effect(onCleanup => {
      const id = this.aktivnoZa();
      if (id === null) return;
      const pretplata = untracked(() => this.izvodjenja.lista(id, 'AKTIVNO'))
        .subscribe({ next: l => this.aktivno.set(l[0] ?? null), error: () => this.aktivno.set(null) });
      onCleanup(() => pretplata.unsubscribe());
    });
  }

  /** Za `canDeactivate`: neispravni ili nesačuvani nacrti bi se izgubili (ispravne izmene store pošalje sam). */
  mozeDaNapusti(): boolean {
    const nesacuvani = this.store.slajdovi().filter(s => s.id < 0 || this.store.neispravni().has(s.id));
    return !nesacuvani.length
      || confirm(`Nesačuvanih slajdova: ${nesacuvani.length} (nisu potpuni, vidi upozorenja u listi). Napusti editor i odbaci ih?`);
  }

  protected tastatura(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.store.sacuvajOdmah();
    }
  }

  protected preIzlaska(e: BeforeUnloadEvent): void {
    if (this.store.imaNesacuvano()) {
      this.store.sacuvajOdmah();
      e.preventDefault();
    }
  }

  protected ikona(s: SlajdDetails): string {
    return s.tip === 'PITANJE' && s.pitanje ? opisTipa(s.pitanje.tip).ikona : 'article';
  }

  protected nazivTipa(s: SlajdDetails): string {
    return s.tip === 'PITANJE' && s.pitanje ? `Pitanje: ${opisTipa(s.pitanje.tip).naziv}` : 'Info slajd';
  }

  protected spusteno(e: CdkDragDrop<unknown>): void {
    this.store.pomeri(e.previousIndex, e.currentIndex);
  }

  protected sacuvajNaziv(polje: HTMLInputElement): void {
    const p = this.store.prezentacija();
    if (!p) return;
    if (!polje.value.trim()) {
      polje.value = p.naziv;
      return;
    }
    this.podesi({ naziv: polje.value.trim() });
  }

  protected sacuvajOpis(polje: HTMLInputElement): void {
    this.podesi({ opis: polje.value.trim() || null });
  }

  protected podesi(izmena: Partial<UpdatePrezentacijaCmd>): void {
    const p = this.store.prezentacija();
    if (!p) return;
    this.store.izmeniPodesavanja({
      naziv: p.naziv, opis: p.opis, takmicenje: p.takmicenje, telefonPrikaz: p.telefonPrikaz,
      detaljiDozvoljeni: p.detaljiDozvoljeni, ...izmena,
    });
  }

  protected obrisiSlajd(s: SlajdDetails): void {
    potvrdi(this.dialog, {
      naslov: `Obrisati slajd ${s.rb}?`, poruke: [`„${oznakaSlajda(s)}“ biće obrisan.`], potvrdi: 'Obriši', opasno: true,
    }).subscribe(da => da && this.store.obrisi(s.id));
  }

  protected pokreni(): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    this.radi.set(true);
    this.store.sacuvajSve().subscribe({
      next: () => {
        // tek posle čuvanja: nacrt koji je upravo postao pitanje se računa
        const bezDijaloga = pokretanjeBezDijaloga(this.route.snapshot.queryParamMap.get('predavanje'), this.store.brojPitanja());
        if (bezDijaloga) {
          this.pokreniSa(p.id, bezDijaloga);
          return;
        }
        otvoriPokreni(this.dialog, { prezentacijaId: p.id, naziv: p.naziv }).subscribe(i => {
          this.radi.set(false);
          if (i) this.uKonzolu(i);
        });
      },
      error: e => this.neuspeh(e, 'Izmene nisu sačuvane.', 'Pokretanje je zaustavljeno'),
    });
  }

  protected duplirajPrezentaciju(): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    this.radi.set(true);
    this.store.sacuvajSve().subscribe({
      next: () => this.api.dupliraj(p.id).subscribe({
        next: kopija => {
          this.radi.set(false);
          this.snack.open(`Napravljena je kopija „${kopija.naziv}“.`, 'U redu', { duration: 5000 });
          this.router.navigate(['/' + AppRoutes.prezentacija(kopija.id)]);
        },
        error: e => this.neuspeh(e, 'Dupliranje nije uspelo.'),
      }),
      error: e => this.neuspeh(e, 'Izmene nisu sačuvane.', 'Dupliranje je zaustavljeno'),
    });
  }

  protected obrisiPrezentaciju(): void {
    const p = this.store.prezentacija();
    if (!p || this.radi()) return;
    const poruke = [`Prezentacija „${p.naziv}“ i svi njeni slajdovi biće trajno obrisani.`];
    if (p.brojIzvodjenja > 0) {
      poruke.push(`Brišu se i sačuvana izvođenja sa rezultatima: ${p.brojIzvodjenja}.`);
    }
    potvrdi(this.dialog, { naslov: 'Obrisati prezentaciju?', poruke, potvrdi: 'Obriši', opasno: true }).subscribe(da => {
      if (!da) return;
      this.radi.set(true);
      this.api.obrisi(p.id).subscribe({
        next: () => {
          this.radi.set(false);
          this.snack.open('Prezentacija je obrisana.', undefined, { duration: 4000 });
          this.router.navigate(['/' + AppRoutes.prezentacije], { queryParams: { predmet: p.predmet.id } });
        },
        error: e => this.neuspeh(e, 'Brisanje nije uspelo.'),
      });
    });
  }

  private pokreniSa(prezentacijaId: number, cmd: PokreniCmd): void {
    this.izvodjenja.pokreni(prezentacijaId, cmd).subscribe({
      next: i => {
        this.radi.set(false);
        this.uKonzolu(i);
      },
      error: e => this.neuspeh(e, 'Pokretanje nije uspelo.'),
    });
  }

  private uKonzolu(i: IzvodjenjeInfo): void {
    this.router.navigate(['izvodjenja', i.id, 'konzola']);
  }

  /** `uvod` ide ispred poruke kad radnja nije ni počela jer izmene nisu sačuvane. */
  private neuspeh(e: unknown, poruka: string, uvod?: string): void {
    this.radi.set(false);
    const razlog = e instanceof NijeSacuvano ? e.message : razlogGreske(e, poruka);
    this.snack.open(uvod ? `${uvod}: ${razlog}` : razlog, 'U redu', { duration: 8000 });
  }
}

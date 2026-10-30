import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, linkedSignal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { zaboraviIzlazak, zapamtiIzlazak } from '../izlaz-iz-izvodjenja';
import { UzivoPutanje } from '../uzivo-putanje';
import { LicnoStanje, medijUrl } from '../data-access/uzivo.models';
import { grupisiCifre } from '../ui/format';
import { OpcijaOblikComponent } from '../ui/opcija-oblik';
import { RangListaComponent } from '../ui/rang-lista.component';
import { TajmerComponent } from '../ui/tajmer.component';
import { TekstFormuleComponent } from '../ui/tekst-formule.component';
import { OdgovorUnosComponent, tekstOpcije } from './odgovor-unos.component';
import { StudentStore, naslovIshoda } from './student.store';
import { ZadatakEkranComponent } from './zadatak-ekran.component';

/** Posle kraja izvođenja (ili izbacivanja) telefon sa `?sa=cas` se ovoliko zadrži, pa se vrati na `/nalog/cas`. */
export const POVRATAK_NA_CAS_MS = 3_000;

/**
 * Sopstvena tačnost u zaglavlju: `Tačno 3 od 5`, `null` dok nema nijednog pitanja koje se računa (stari backend je ne šalje).
 * Server je računa po pravilu ranga tačnosti, a trenutna runda ulazi tek posle "Tačno" (nikad ranije).
 */
export function tacnostUcesnika(l: LicnoStanje | null | undefined): string | null {
  const d = l?.dugovanih;
  return typeof d === 'number' && d > 0 ? `Tačno ${Math.max(0, l?.tacnih ?? 0)} od ${d}` : null;
}

/**
 * Javna studentska stranica `uzivo/:kod` (spec 6.5): ime, pa tok uživo preko STOMP-a. Sme da zove samo
 * `api/public/uzivo/*`, `api/public/mediji/*` i `api/public/ws` (sve kroz {@link StudentStore} i `medijUrl`).
 * U javnom layoutu (`PublicLayout`, bez ljuske); uvek svetle boje, mobile-first. Tekst pitanja i opcija (i tačne opcije)
 * ide kroz `app-tekst-formule` (formule `$...$`): lenji `mathlive/ssr` chunk i `assets/mathlive/` traže se samo kad tekst
 * ima formulu. Prihvatljivi odgovori, jedinica i oznake skale ostaju običan tekst (plan faze 5, odluka 2).
 * Zadatak slajd: "Zadatak stiže…", pa `app-zadatak-ekran` (stanje runde i svoja varijanta u `app-zadatak-unos`) u
 * lenjom bloku (`@defer`): telefon vuče njegov chunk tek na Zadatak slajdu, kao `mathlive/ssr` tek uz formulu, pa ovde
 * ostaje samo ulaz u blok (budžet statičkog zatvorenja, `e2e/lenji-formule.spec.ts`).
 * Sa `?sa=cas` (student je došao sa `/nalog/cas`): posle kraja ili izbacivanja se za {@link POVRATAK_NA_CAS_MS} vraća na
 * čas (`replaceUrl`, završeno izvođenje ne ostaje u istoriji), gde čeka sledeću prezentaciju. Bodovano izvođenje bez
 * čekiranja (faza `cekiranje`) pokazuje samo poruku servera.
 * **Izađi** (zaglavlje) vodi na tab Čas (došao sa časa), Početnu naloga (prijavljen student) ili unos koda (gost). Kad
 * student napusti izvođenje koje traje (Izađi, Nazad, drugi link), kod se pamti (`izlaz-iz-izvodjenja`), pa ga tab Čas ne
 * otvara sam ponovo (petlja Nazad -> Čas -> izvođenje); otvaranje `uzivo/<kod>` to briše. Zaglavlje nosi i sopstvenu
 * tačnost ({@link tacnostUcesnika}), koja se menja tek posle "Tačno".
 */
@Component({
  selector: 'app-uzivo-student',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StudentStore],
  imports: [
    RouterLink, OdgovorUnosComponent, OpcijaOblikComponent, RangListaComponent, TajmerComponent, TekstFormuleComponent,
    ZadatakEkranComponent,
  ],
  host: { class: 'uz-st rezim-dan uz-dan', lang: 'sr-Latn', '(document:keydown.escape)': 'detaljiOtvoreni.set(false)' },
  template: `
    @let s = store;
    @switch (s.faza()) {
      @case ('kod') {
        <div class="uz-st-sredina" role="status"><p class="uz-st-tekst">Učitavanje…</p></div>
      }
      @case ('greska') {
        <div class="uz-st-sredina">
          <h1 class="uz-st-naslov">Uživo</h1>
          <p class="uz-st-tekst" role="alert">{{ s.greska() }}</p>
          <div class="uz-st-akcije">
            <button type="button" class="uz-st-dugme uz-st-dugme--glavno" (click)="s.otvori(s.kod() ?? '')">Pokušaj ponovo</button>
            <a class="uz-st-dugme" [routerLink]="['/', rute.uzivo]">Unesi drugi kod</a>
          </div>
        </div>
      }
      @case ('ime') {
        <div class="uz-st-sredina">
          <h1 class="uz-st-naslov">{{ s.info()?.naziv ?? 'Uživo' }}</h1>
          <form class="uz-st-forma" (submit)="$event.preventDefault(); s.prijavi(ime.value)">
            <label class="uz-st-oznaka" for="uz-st-ime">Tvoje ime</label>
            <input #ime id="uz-st-ime" class="uz-st-polje" type="text" maxlength="40" autocomplete="nickname"
                   enterkeyhint="go" [readOnly]="s.salje()" [attr.aria-invalid]="s.greska() ? 'true' : null"
                   aria-describedby="uz-st-ime-poruka" />
            <p id="uz-st-ime-poruka" class="uz-st-poruka-polja" role="alert">{{ s.greska() }}</p>
            <button type="submit" class="uz-st-dugme uz-st-dugme--glavno" [disabled]="s.salje()">
              {{ s.salje() ? 'Ulazim…' : 'Uđi' }}
            </button>
          </form>
        </div>
      }
      @case ('izbacen') {
        <div class="uz-st-sredina">
          @if (s.info()?.prijavljenStudent) {
            <p class="uz-st-tekst" role="alert">Nastavnik te je uklonio iz ovog izvođenja.</p>
          } @else {
            <p class="uz-st-tekst" role="alert">Nastavnik te je uklonio. Možeš ponovo da uđeš sa drugim imenom.</p>
            <button type="button" class="uz-st-dugme uz-st-dugme--glavno" (click)="s.ponovoUdji()">Uđi ponovo</button>
          }
          @if (saCasa) { <p class="uz-st-tekst" role="status" data-na-cas>Vraćam te na čas…</p> }
        </div>
      }
      @case ('cekiranje') {
        <div class="uz-st-sredina">
          <h1 class="uz-st-naslov">{{ s.info()?.naziv ?? 'Uživo' }}</h1>
          <p class="uz-st-tekst" role="alert" data-cekiranje>{{ s.greska() }}</p>
          <a class="uz-st-dugme" routerLink="/nalog">Moj nalog</a>
        </div>
      }
      @default {
        @let j = s.javno();
        @let l = s.licno();
        @let p = s.pitanje();
        @if (s.faza() === 'uzivo' && s.veza() !== 'povezan') {
          <p class="uz-st-veza" role="status">
            {{ s.veza() === 'prekinut' ? 'Veza prekinuta, povezujem…' : 'Povezivanje…' }}
          </p>
        }
        <header class="uz-st-zaglavlje">
          <div class="uz-st-ko">
            <span class="uz-st-ime">{{ l?.ime ?? s.ucesnik()?.ime }}</span>
            @if (ucinak(); as u) {
              <span class="uz-st-poeni" data-tacnost>{{ u }}</span>
            }
          </div>
          <div class="uz-st-vrh-dugmad">
            @if (detaljiMoguci()) {
              <button type="button" class="uz-st-dugme uz-st-detalji-dugme" aria-haspopup="dialog"
                      (click)="detaljiOtvoreni.set(true)">Detalji</button>
            }
            <button type="button" class="uz-st-dugme uz-st-izadji" (click)="izadji()" data-izadji>Izađi</button>
          </div>
        </header>
        @if (s.greska(); as g) {
          <p class="uz-st-greska" role="alert">{{ g }}</p>
        }
        <div class="uz-st-telo" [class.uz-st-telo--unos]="s.ekran() === 'unos'">
          @if (rangVidljiv() && j?.rangLista; as rang) {
            <section class="uz-st-rang" aria-labelledby="uz-st-rang-naslov">
              <h2 id="uz-st-rang-naslov" class="uz-st-podnaslov">Rang-lista</h2>
              @if (l?.mesto) {
                <p class="uz-st-mesto">Tvoje mesto: {{ l!.mesto }} · {{ poeni(l!.poeni) }}</p>
              }
              <app-rang-lista [stavke]="rang" [istakni]="l?.mesto ?? null" />
            </section>
          } @else if (s.ekran().startsWith('zadatak')) {
            <!-- ekrani svoje varijante (zadatak, zadatakPrimljen, zadatakIshod): jedna instanca kroz sva tri -->
            @defer (on immediate) {
              <app-zadatak-ekran />
            } @placeholder {
              <p class="uz-st-tekst" role="status">Učitavanje zadatka…</p>
            } @error {
              <p class="uz-st-tekst" role="alert">Zadatak nije učitan. Osveži stranicu i pokušaj ponovo.</p>
            }
          } @else {
            @switch (s.ekran()) {
              @case ('povezivanje') { <p class="uz-st-veliko" role="status">Povezivanje…</p> }
              @case ('cekamo') {
                <div class="uz-st-poruka" role="status">
                  <p class="uz-st-veliko">Čekamo početak</p>
                  <p class="uz-st-tekst">Ti si: <strong>{{ l?.ime ?? s.ucesnik()?.ime }}</strong></p>
                </div>
              }
              @case ('tabla') {
                <div class="uz-st-poruka" role="status">
                  <p class="uz-st-veliko">Gledaj u tablu</p>
                  @if (tacnost(); as t) { <p class="uz-st-tekst" data-skor>Do sada: <strong>{{ t }}</strong></p> }
                </div>
              }
              @case ('stize') { <p class="uz-st-veliko" role="status">{{ j?.slajdTip === 'ZADATAK' ? 'Zadatak' : 'Pitanje' }} stiže…</p> }
              @case ('unos') {
                @if (p) {
                  <div class="uz-st-pitanje">
                    <div class="uz-st-pitanje-vrh">
                      @if (celoPitanje() && p.tekst) {
                        <app-tekst-formule class="uz-st-md" [tekst]="p.tekst" [markdown]="true" />
                      }
                      <app-tajmer class="uz-st-tajmer" [rokMs]="p.rokMs" [preostaloMs]="p.preostaloMs" [sat]="s.sat()"
                                  [ukupnoMs]="s.ukupnoMs()" />
                    </div>
                    @if (celoPitanje() && p.slikaId) {
                      <img class="uz-st-slika" [src]="slika(p.slikaId)" alt="Slika uz pitanje" />
                    }
                    <!-- montira se samo dok je unos otvoren; nacrt čuva izbor i tekst kroz zaključavanje i otključavanje -->
                    <app-odgovor-unos [pitanje]="p" [celoPitanje]="celoPitanje()" [nacrt]="s.nacrt()"
                                      (nacrtPromena)="s.sacuvajNacrt($event)" (posalji)="s.odgovori($event)" />
                  </div>
                }
              }
              @case ('primljen') {
                <div class="uz-st-poruka" role="status">
                  <p class="uz-st-veliko uz-st-ok">Odgovor primljen ✓</p>
                  @if (p?.faza === 'OTVORENO') {
                    <app-tajmer class="uz-st-tajmer" [rokMs]="p!.rokMs" [preostaloMs]="p!.preostaloMs" [sat]="s.sat()"
                                [ukupnoMs]="s.ukupnoMs()" />
                  }
                </div>
              }
              @case ('isteklo') { <p class="uz-st-veliko" role="status">Vreme je isteklo</p> }
              @case ('tacan') {
                <div class="uz-st-poruka" role="status">
                  @if (s.ishod(); as i) {
                    <p class="uz-st-veliko" [class.uz-st-ok]="i.tacno === true" [class.uz-st-lose]="i.tacno === false">
                      {{ ishod(i, !!j?.takmicenje) }}
                    </p>
                  }
                  @if (s.tacan(); as t) {
                    <p class="uz-st-tekst">Tačan odgovor:</p>
                    @for (o of t.opcije; track o.indeks) {
                      <p class="uz-st-tacna">
                        <app-opcija-oblik [indeks]="o.indeks" [velicina]="40" />
                        @if (o.tekst) { <app-tekst-formule [tekst]="o.tekst" /> }
                      </p>
                    }
                    @if (t.tekst) { <p class="uz-st-tacna"><strong>{{ t.tekst }}</strong></p> }
                  }
                  @if (j?.takmicenje && l?.mesto) {
                    <p class="uz-st-mesto">Tvoje mesto: {{ l!.mesto }} · {{ poeni(l!.poeni) }}</p>
                  }
                </div>
              }
              @case ('kraj') {
                <div class="uz-st-poruka">
                  <h1 class="uz-st-naslov">Kraj</h1>
                  @if (j?.takmicenje && l?.mesto) {
                    <p class="uz-st-mesto uz-st-mesto--konacno">Tvoje konačno mesto: {{ l!.mesto }} · {{ poeni(l!.poeni) }}</p>
                  }
                  @if (j?.rangLista?.length) {
                    <app-rang-lista class="uz-st-rang" [stavke]="j!.rangLista!" [istakni]="l?.mesto ?? null" />
                  }
                  <p class="uz-st-veliko">Hvala!</p>
                  @if (saCasa && s.faza() === 'kraj') { <p class="uz-st-tekst" role="status" data-na-cas>Vraćam te na čas…</p> }
                </div>
              }
            }
          }
        </div>
        @if (detaljiOtvoreni() && detaljiMoguci() && p) {
          <div class="uz-st-detalji" role="dialog" aria-modal="true" aria-labelledby="uz-st-detalji-naslov">
            <div class="uz-st-detalji-vrh">
              <h2 id="uz-st-detalji-naslov" class="uz-st-podnaslov">Pitanje</h2>
              <button #zatvoriDetalje type="button" class="uz-st-dugme" (click)="detaljiOtvoreni.set(false)">Zatvori</button>
            </div>
            @if (p.tekst) { <app-tekst-formule class="uz-st-md" [tekst]="p.tekst" [markdown]="true" /> }
            @if (p.slikaId) { <img class="uz-st-slika" [src]="slika(p.slikaId)" alt="Slika uz pitanje" /> }
            @if (p.opcije?.length) {
              <ul class="uz-st-detalji-opcije">
                @for (o of p.opcije; track o.id; let i = $index) {
                  <li><app-opcija-oblik [indeks]="i" [velicina]="32" /><app-tekst-formule [tekst]="tekstOpcije(p, i)" /></li>
                }
              </ul>
            }
            @if (p.jedinica) { <p class="uz-st-tekst">Jedinica: {{ p.jedinica }}</p> }
            @if (p.skalaMinOznaka || p.skalaMaxOznaka) {
              <p class="uz-st-tekst">1 = {{ p.skalaMinOznaka }} · 5 = {{ p.skalaMaxOznaka }}</p>
            }
          </div>
        }
      }
    }
  `,
})
export class UzivoStudentPage {
  protected readonly store = inject(StudentStore);
  protected readonly rute = UzivoPutanje;
  protected readonly poeni = grupisiCifre;
  protected readonly ishod = naslovIshoda;
  protected readonly tekstOpcije = tekstOpcije;
  protected readonly slika = medijUrl;

  /** Režim A: tekst pitanja i opcija na telefonu. */
  protected readonly celoPitanje = computed(() => this.store.javno()?.telefonPrikaz === 'PITANJE');
  /** "Detalji" u ćošku: samo režim B sa dozvoljenim detaljima i kad tekst zaista stiže. */
  protected readonly detaljiMoguci = computed(() => {
    const j = this.store.javno();
    const p = this.store.pitanje();
    return !!j && !!p && j.telefonPrikaz === 'DUGMAD' && j.detaljiDozvoljeni && p.faza !== 'CEKA'
      && (!!p.tekst || !!p.slikaId || !!p.opcije?.some(o => o.tekst));
  });
  /** Panel Detalji se zatvara sam kad stigne nova runda. */
  protected readonly detaljiOtvoreni = linkedSignal<number | null, boolean>({
    source: () => this.store.pitanje()?.rundaId ?? null, computation: () => false,
  });
  /** Rang-lista zamenjuje sadržaj, osim dok student odgovara i na kraju (tamo je deo ekrana). */
  protected readonly rangVidljiv = computed(() => {
    const e = this.store.ekran();
    return !!this.store.javno()?.rangLista && e !== 'unos' && e !== 'zadatak' && e !== 'kraj';
  });

  private readonly zatvoriDetalje = viewChild<ElementRef<HTMLButtonElement>>('zatvoriDetalje');
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** `?sa=cas`: student je došao sa `/nalog/cas` (čekiranje), pa se tamo vraća posle kraja izvođenja. */
  protected readonly saCasa = this.ruta.snapshot?.queryParamMap?.get('sa') === 'cas';
  protected readonly tacnost = computed(() => tacnostUcesnika(this.store.licno()));
  /** Red ispod imena: poeni (samo takmičenje) i tačnost, npr. `120 poena · Tačno 3 od 5`. */
  protected readonly ucinak = computed(() => {
    const l = this.store.licno();
    const poeni = this.store.javno()?.takmicenje && l ? `${grupisiCifre(l.poeni)} poena` : null;
    return [poeni, this.tacnost()].filter(Boolean).join(' · ');
  });

  constructor() {
    effect(onCleanup => {
      const f = this.store.faza();
      if (!this.saCasa || (f !== 'kraj' && f !== 'izbacen')) return;
      const t = setTimeout(() => void this.router.navigateByUrl('nalog/cas', { replaceUrl: true }), POVRATAK_NA_CAS_MS);
      onCleanup(() => clearTimeout(t));
    });
    this.ruta.paramMap.pipe(
      map(p => p.get('kod') ?? ''), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(kod => {
      zaboraviIzlazak();
      this.store.otvori(kod);
    });
    // Napušteno izvođenje koje još traje: tab Čas ga posle ne otvara sam (Nazad sa ove strane bi inače bio petlja).
    inject(DestroyRef).onDestroy(() => {
      const kod = this.store.kod();
      const f = this.store.faza();
      if (kod && f !== 'kraj' && f !== 'izbacen') {
        zapamtiIzlazak(kod);
      }
    });
    // Fokus na "Zatvori" kad se panel otvori (tastatura i čitač ekrana).
    effect(() => this.zatvoriDetalje()?.nativeElement.focus());
  }

  /** Sa časa nazad na tab Čas (menja ovaj unos istorije), prijavljen student na Početnu, gost na unos koda. */
  protected izadji(): void {
    if (this.saCasa) {
      void this.router.navigateByUrl('nalog/cas', { replaceUrl: true });
    } else if (this.store.info()?.prijavljenStudent) {
      void this.router.navigateByUrl('nalog/pocetna');
    } else {
      void this.router.navigateByUrl(UzivoPutanje.uzivo);
    }
  }
}

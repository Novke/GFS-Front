import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, linkedSignal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { AppRoutes } from '../../../app.routes';
import { medijUrl } from '../data-access/uzivo.models';
import { grupisiCifre } from '../ui/format';
import { renderMarkdown } from '../ui/markdown';
import { OpcijaOblikComponent } from '../ui/opcija-oblik';
import { RangListaComponent } from '../ui/rang-lista.component';
import { TajmerComponent } from '../ui/tajmer.component';
import { OdgovorUnosComponent, tekstOpcije } from './odgovor-unos.component';
import { StudentStore } from './student.store';

/** Naslov ličnog ishoda posle `C`: "Tačno! +850", "Netačno", "Nisi odgovorio". */
export function naslovIshoda(
  ishod: { odgovorio: boolean; tacno: boolean | null; poeni: number | null }, takmicenje: boolean,
): string {
  if (!ishod.odgovorio) return 'Nisi odgovorio';
  if (ishod.tacno === null) return 'Odgovor primljen';
  if (!ishod.tacno) return 'Netačno';
  return 'Tačno!' + (takmicenje && ishod.poeni ? ` +${grupisiCifre(ishod.poeni)}` : '');
}

/**
 * Javna studentska stranica `uzivo/:kod` (spec 6.5): ime, pa tok uživo preko STOMP-a. Sme da zove samo
 * `api/public/uzivo/*`, `api/public/mediji/*` i `api/public/ws` (sve kroz {@link StudentStore} i `medijUrl`).
 * Bez toolbara (bez-toolbara.ts); uvek svetle boje, mobile-first.
 */
@Component({
  selector: 'gfs-uzivo-student',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StudentStore],
  imports: [RouterLink, OdgovorUnosComponent, OpcijaOblikComponent, RangListaComponent, TajmerComponent],
  host: { class: 'uz-st uz-dan', lang: 'sr-Latn', '(document:keydown.escape)': 'detaljiOtvoreni.set(false)' },
  template: `
    @let s = store;
    @switch (s.faza()) {
      @case ('kod') {
        <main class="uz-st-sredina" role="status"><p class="uz-st-tekst">Učitavanje…</p></main>
      }
      @case ('greska') {
        <main class="uz-st-sredina">
          <h1 class="uz-st-naslov">Uživo</h1>
          <p class="uz-st-tekst" role="alert">{{ s.greska() }}</p>
          <div class="uz-st-akcije">
            <button type="button" class="uz-st-dugme uz-st-dugme--glavno" (click)="s.otvori(s.kod() ?? '')">Pokušaj ponovo</button>
            <a class="uz-st-dugme" [routerLink]="['/', rute.uzivo]">Unesi drugi kod</a>
          </div>
        </main>
      }
      @case ('ime') {
        <main class="uz-st-sredina">
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
        </main>
      }
      @case ('izbacen') {
        <main class="uz-st-sredina">
          <p class="uz-st-tekst" role="alert">Nastavnik te je uklonio. Možeš ponovo da uđeš sa drugim imenom.</p>
          <button type="button" class="uz-st-dugme uz-st-dugme--glavno" (click)="s.ponovoUdji()">Uđi ponovo</button>
        </main>
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
            @if (j?.takmicenje && l) {
              <span class="uz-st-poeni">{{ poeni(l.poeni) }} poena</span>
            }
          </div>
          @if (detaljiMoguci()) {
            <button type="button" class="uz-st-dugme uz-st-detalji-dugme" aria-haspopup="dialog"
                    (click)="detaljiOtvoreni.set(true)">Detalji</button>
          }
        </header>
        @if (s.greska(); as g) {
          <p class="uz-st-greska" role="alert">{{ g }}</p>
        }
        <main class="uz-st-telo" [class.uz-st-telo--unos]="s.ekran() === 'unos'">
          @if (rangVidljiv() && j?.rangLista; as rang) {
            <section class="uz-st-rang" aria-labelledby="uz-st-rang-naslov">
              <h2 id="uz-st-rang-naslov" class="uz-st-podnaslov">Rang-lista</h2>
              @if (l?.mesto) {
                <p class="uz-st-mesto">Tvoje mesto: {{ l!.mesto }} · {{ poeni(l!.poeni) }}</p>
              }
              <gfs-rang-lista [stavke]="rang" [istakni]="l?.mesto ?? null" />
            </section>
          } @else {
            @switch (s.ekran()) {
              @case ('povezivanje') { <p class="uz-st-veliko" role="status">Povezivanje…</p> }
              @case ('cekamo') {
                <div class="uz-st-poruka" role="status">
                  <p class="uz-st-veliko">Čekamo početak</p>
                  <p class="uz-st-tekst">Ti si: <strong>{{ l?.ime ?? s.ucesnik()?.ime }}</strong></p>
                </div>
              }
              @case ('tabla') { <p class="uz-st-veliko" role="status">Gledaj u tablu</p> }
              @case ('stize') { <p class="uz-st-veliko" role="status">Pitanje stiže…</p> }
              @case ('unos') {
                @if (p) {
                  <div class="uz-st-pitanje">
                    <div class="uz-st-pitanje-vrh">
                      @if (celoPitanje() && p.tekst) {
                        <div class="uz-st-md" [innerHTML]="md(p.tekst)"></div>
                      }
                      <gfs-tajmer class="uz-st-tajmer" [rokMs]="p.rokMs" [preostaloMs]="p.preostaloMs" [sat]="s.sat()"
                                  [ukupnoMs]="s.ukupnoMs()" />
                    </div>
                    @if (celoPitanje() && p.slikaId) {
                      <img class="uz-st-slika" [src]="slika(p.slikaId)" alt="Slika uz pitanje" />
                    }
                    <gfs-odgovor-unos [pitanje]="p" [celoPitanje]="celoPitanje()" [zakljucano]="s.unosZakljucan()"
                                      (posalji)="s.odgovori($event)" />
                  </div>
                }
              }
              @case ('primljen') {
                <div class="uz-st-poruka" role="status">
                  <p class="uz-st-veliko uz-st-ok">Odgovor primljen ✓</p>
                  @if (p?.faza === 'OTVORENO') {
                    <gfs-tajmer class="uz-st-tajmer" [rokMs]="p!.rokMs" [preostaloMs]="p!.preostaloMs" [sat]="s.sat()"
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
                        <gfs-opcija-oblik [indeks]="o.indeks" [velicina]="40" />
                        @if (o.tekst) { <span>{{ o.tekst }}</span> }
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
                    <gfs-rang-lista class="uz-st-rang" [stavke]="j!.rangLista!" [istakni]="l?.mesto ?? null" />
                  }
                  <p class="uz-st-veliko">Hvala!</p>
                </div>
              }
            }
          }
        </main>
        @if (detaljiOtvoreni() && detaljiMoguci() && p) {
          <div class="uz-st-detalji" role="dialog" aria-modal="true" aria-labelledby="uz-st-detalji-naslov">
            <div class="uz-st-detalji-vrh">
              <h2 id="uz-st-detalji-naslov" class="uz-st-podnaslov">Pitanje</h2>
              <button #zatvoriDetalje type="button" class="uz-st-dugme" (click)="detaljiOtvoreni.set(false)">Zatvori</button>
            </div>
            @if (p.tekst) { <div class="uz-st-md" [innerHTML]="md(p.tekst)"></div> }
            @if (p.slikaId) { <img class="uz-st-slika" [src]="slika(p.slikaId)" alt="Slika uz pitanje" /> }
            @if (p.opcije?.length) {
              <ul class="uz-st-detalji-opcije">
                @for (o of p.opcije; track o.id; let i = $index) {
                  <li><gfs-opcija-oblik [indeks]="i" [velicina]="32" /><span>{{ tekstOpcije(p, i) }}</span></li>
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
  protected readonly rute = AppRoutes;
  protected readonly poeni = grupisiCifre;
  protected readonly ishod = naslovIshoda;
  protected readonly tekstOpcije = tekstOpcije;
  protected readonly md = renderMarkdown;
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
    return !!this.store.javno()?.rangLista && e !== 'unos' && e !== 'kraj';
  });

  private readonly zatvoriDetalje = viewChild<ElementRef<HTMLButtonElement>>('zatvoriDetalje');

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(
      map(p => p.get('kod') ?? ''), distinctUntilChanged(), takeUntilDestroyed(),
    ).subscribe(kod => this.store.otvori(kod));
    // Fokus na "Zatvori" kad se panel otvori (tastatura i čitač ekrana).
    effect(() => this.zatvoriDetalje()?.nativeElement.focus());
  }
}

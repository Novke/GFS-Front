// Koren editora platna (F4b): traka, okvir platna (prikaz + sloj izbora) i paneli. Lenj: stranica editora ga crta samo u
// `@defer` bloku PLATNO slajda, jedna instanca po slajdu (`@for ... track kljuc`), pa istorija pripada slajdu i nestaje
// pri promeni slajda, a ne nestaje kad nacrt dobije pravi id (odluka 8). Svaku zabeleženu izmenu sam predaje
// `EditorStore.izmeniPlatno` (izlaz store-a), a otvorenu sesiju (gest F5, tekst F12) registruje za pražnjenje pre čuvanja.
// Tekst se uređuje u sloju za uređivanje (`.uz-pl-platno.uz-ep-uredjivanje`) UNUTAR okvira platna, iznad prikaza i
// overlay-a: isti stil kao prikaz (`stilSloja`, uređivač sa `stilOkvira`), a Ctrl+S okvira važi i dok se kuca. Ćelija
// tabele (F14) se uređuje istim uređivačem preko pravougaonika ćelije u sloju (iste rotacije), sa pozadinom
// `popuna ?? pozadina slajda` (pokriva tekst prikaza) i sidrom ćelije; tabela ostaje u prikazu.
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, OnInit, afterNextRender, computed, inject, input,
  viewChild,
} from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { NotificationStore } from '../../../core/state/notification.store';
import { EditorStore } from '../data-access/editor.store';
import { TIPOVI_SLIKA } from '../data-access/provera-slike';
import type { TabelaSloj, Tema, TekstSloj } from '../data-access/platno.models';
import type { SlajdDetails } from '../data-access/uzivo.models';
import { METRIKA } from '../ui/platno-metrika';
import { PlatnoPrikazComponent, stilSloja } from '../ui/platno-prikaz.component';
import { jedinice } from '../ui/platno-tekst';
import { FokusPlatna } from './fokus-platna';
import { nazivSloja } from './komande';
import { OtpremanjeSlike } from './otpremanje-slike';
import { OZNAKA_EDITORA_PLATNA } from './oznake';
import { PanelSlojeviComponent } from './panel-slojevi.component';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore, type TabPanela } from './platno-editor.store';
import { PlatnoOverlayComponent } from './platno-overlay.component';
import { jePonistavanje, komandaTastature, jeSnimanje, uPoljuZaUnos, zatvorenIzbornik } from './tastatura-platna';
import { SIRINA_PLATNA } from './geometrija';
import { PORUKA_PREVLACENJE, SlikeEditora } from './slike-editora';
import { type Polje, pravougaoniciTabele } from './tabela';
import { ID_POMOCI_TEKSTA, TekstUredjivacComponent } from './tekst/tekst-uredjivac.component';
import { TrakaAlataComponent } from './traka-alata.component';

/** Tabovi panela redom (indeks `mat-tab-group`-a); "Animacije" dolazi u F17. */
const TABOVI: readonly TabPanela[] = ['SVOJSTVA', 'SLOJEVI'];

@Component({
  selector: 'app-platno-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // OtpremanjeSlike živi koliko editor slajda: promena izbora ili taba ne prekida otpremanje (F6)
  providers: [PlatnoEditorStore, FokusPlatna, OtpremanjeSlike, SlikeEditora],
  imports: [
    MatTabsModule, PlatnoPrikazComponent, PlatnoOverlayComponent, PanelSlojeviComponent, PanelSvojstvaComponent,
    TekstUredjivacComponent, TrakaAlataComponent,
  ],
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y slušaju se na korenu editora (i iz panela i trake); ostale prečice samo na okviru
  host: { 'data-oznaka': OZNAKA_EDITORA_PLATNA, class: 'uz-ep', '(keydown)': 'tastaturaKorena($event)' },
  template: `
    <app-traka-alata [tema]="tema()" />
    <div class="uz-ep-telo">
      <div class="uz-ep-glavno">
        <!-- okvir (fokus prsten, ivica) prati režim editora; samo platno je uvek dnevno (rezim-dan uz-dan) -->
        <div #okvir class="uz-ep-platno uz-okvir" tabindex="0" role="group" aria-label="Platno slajda"
             aria-describedby="uz-ep-precice" (keydown)="tastatura($event)"
             (dragover)="preko($event)" (drop)="spusteno($event)">
          <div class="uz-platno rezim-dan uz-dan">
            <app-platno-prikaz [platno]="store.zaPrikaz()" />
            <app-platno-overlay />
            <!-- nova sesija = nov uređivač (track po objektu sesije); presek teksta ne pravi nov -->
            @for (u of sesija(); track u.uredjivanje) {
              <div class="uz-pl-platno uz-ep-uredjivanje" [style.font-kerning]="kerning" [style.font-variant-ligatures]="ligature">
                @if (u.celija; as c) {
                  <!-- sloj tabele propušta pokazivač (klik u drugu ćeliju ide overlay-u); uređuje se samo ćelija -->
                  <div class="uz-pl-sloj uz-ep-sloj-celije" [style]="u.stil">
                    <div class="uz-ep-celija" [style]="c.stil"><app-tekst-uredjivac [sloj]="u.sloj" [celija]="c.polje" [tema]="tema()" /></div>
                  </div>
                } @else {
                  <div class="uz-pl-sloj" [style]="u.stil"><app-tekst-uredjivac [sloj]="u.sloj" [tema]="tema()" /></div>
                }
              </div>
            }
          </div>
        </div>
        <p id="uz-ep-precice" class="cdk-visually-hidden">
          Strelice pomeraju izabrano (Shift: 10), Delete briše, Ctrl+Z poništava, Ctrl+Y ponavlja, Ctrl+D duplira,
          Ctrl+] i Ctrl+[ menjaju redosled, Esc poništava izbor, Enter uređuje tekst. Ctrl+Z i Ctrl+Y rade i iz panela.
        </p>
        <p [id]="idPomoci" class="cdk-visually-hidden">
          Esc završava uređivanje teksta. Enter pravi nov pasus, Shift+Enter nov red, Tab na početku stavke liste menja nivo.
        </p>
        <p class="cdk-visually-hidden" aria-live="polite">{{ najava() }}</p>
      </div>
      <mat-tab-group class="uz-ep-paneli" mat-stretch-tabs="false" [selectedIndex]="indeksTaba()"
                     (selectedIndexChange)="promenaTaba($event)">
        <mat-tab label="Svojstva"><app-panel-svojstva [tema]="tema()" /></mat-tab>
        <mat-tab label="Slojevi" [disabled]="!!store.uredjivanje()"><app-panel-slojevi /></mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    :host { display: block; container: uz-ep / inline-size; margin-bottom: 16px; }
    .uz-ep-telo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px 16px; align-items: start; }
    /*
     * Paneli desno od platna od editora širokog 760 px (prozor 1366 px sa bočnom navigacijom: editor 822 px, platno
     * 526 px); ispod praga idu ispod platna. Platno je lepljivo, a zaglavlje tabova takođe (globalni deo u
     * uzivo-editor.css): dok se stranica skroluje kroz dugačak panel, platno i tabovi ostaju na ekranu. 64 px = lepljiva
     * gornja traka ljuske (njen min-height 56 px, top-bar.scss) + 8 px;
     * ako se traka promeni, promeni i ovo (i zaglavlje tabova u uzivo-editor.css).
     */
    @container uz-ep (min-width: 760px) {
      .uz-ep-telo { grid-template-columns: minmax(0, 1fr) 280px; }
      .uz-ep-glavno { position: sticky; top: 64px; }
    }
    .uz-ep-glavno { min-width: 0; }
    .uz-ep-platno {
      position: relative;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
      outline: none;
    }
    .uz-ep-platno:focus { outline: 2px solid var(--focus); outline-offset: 2px; }
    .uz-ep-paneli { min-width: 0; }
    .uz-ep-uredjivanje .uz-ep-sloj-celije { pointer-events: none; outline: none; }
    .uz-ep-celija { position: absolute; pointer-events: auto; outline: 1px dashed var(--primary); }
  `,
})
export class PlatnoEditorComponent implements OnInit, OnDestroy {
  /** Čita se jednom (`ngOnInit`), kao u `SlajdFormaComponent`; id se čita u trenutku izmene (nacrt dobija pravi id). */
  readonly slajd = input.required<SlajdDetails>();
  /** Tema prezentacije: novi slojevi uzimaju njene fontove i boje (F7, F12, F14, F16). */
  readonly tema = input.required<Tema>();

  protected readonly store = inject(PlatnoEditorStore);
  private readonly editorStore = inject(EditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);
  private readonly slike = inject(SlikeEditora);
  private readonly obavestenja = inject(NotificationStore);
  private readonly okvir = viewChild.required<ElementRef<HTMLElement>>('okvir');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Odjava SAMO ove registracije pražnjenja (nova instanca se može registrovati pre nego što ova nestane). */
  private odjava: (() => void) | null = null;

  protected readonly indeksTaba = computed(() => Math.max(0, TABOVI.indexOf(this.store.tab())));
  protected readonly idPomoci = ID_POMOCI_TEKSTA;
  /** Kao prikaz (`platno-prikaz`): `'normal'` = ponašanje pregledača, svojstvo se ne postavlja. */
  protected readonly kerning = METRIKA.kerning === 'none' ? 'none' : null;
  protected readonly ligature = METRIKA.ligature === 'none' ? 'none' : null;
  /**
   * Sesija teksta (0 ili 1 stavka): sloj, njegov stil (isti kao u prikazu) i objekat sesije za `track`; za ćeliju tabele
   * TEKST sloj sastavljen od ćelije i pravougaonik ćelije u sloju (`celija`).
   */
  protected readonly sesija = computed(() => {
    const u = this.store.uredjivanje();
    const p = this.store.platno();
    const s = p.slojevi.find((x) => x.id === u?.slojId);
    if (!u || !s) return [];
    if (!u.celija) return s.tip === 'TEKST' ? [{ uredjivanje: u, sloj: s, stil: stilSloja(s), celija: null }] : [];
    const c = s.tip === 'TABELA' ? s.celije[u.celija.r]?.[u.celija.k] : null;
    if (s.tip !== 'TABELA' || !c) return [];
    const m = METRIKA.marginaCelije;
    const sloj: TekstSloj = {
      ...s, tip: 'TEKST', pasusi: c.pasusi, popuna: c.popuna ?? p.pozadina.boja, ivica: null,
      okvir: {
        unutraLevo: m.levo, unutraGore: m.gore, unutraDesno: m.desno, unutraDole: m.dole, sidro: c.sidro, prelom: true,
        skala: 1, skalaProreda: 1,
      },
    };
    const { left, top, width, height, transform } = stilSloja(s);
    return [{ uredjivanje: u, sloj, stil: { left, top, width, height, transform }, celija: this.celijaSesije(s, u.celija) }];
  });
  protected readonly najava = computed(() => {
    const izabrani = this.store.izabraniSlojevi();
    if (!izabrani.length) return 'Ništa nije izabrano';
    const o = this.store.opsegCelijaIzbora();
    const celije = !o ? '' : o.r1 === o.r2 && o.k1 === o.k2 ? `, ćelija ${o.r1 + 1}, ${o.k1 + 1}`
      : `, ćelije ${o.r1 + 1}, ${o.k1 + 1} do ${o.r2 + 1}, ${o.k2 + 1}`;
    if (izabrani.length === 1) return `Izabrano: ${nazivSloja(this.store.platno(), izabrani[0])}${celije}`;
    return `Izabrano slojeva: ${izabrani.length}`;
  });

  constructor() {
    afterNextRender(() => this.fokusPlatna.postavi(this.okvir().nativeElement));
    // capture na hostu: zatvoren mat-select ne sme da vidi Ctrl/Cmd+Shift+Z (typeahead bi posle 200 ms izabrao opciju na "Z")
    const host = this.host;
    const uhvati = (e: KeyboardEvent) => this.izbornikPreSelecta(e);
    host.addEventListener('keydown', uhvati, { capture: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('keydown', uhvati, { capture: true }));
  }

  ngOnInit(): void {
    this.store.inicijalizuj(this.slajd().platno!);
    this.store.postaviIzlaz((p) => this.editorStore.izmeniPlatno(this.slajd().id, p));
    this.odjava = this.editorStore.registrujPraznjenje(() => this.store.isprazni(), () => this.store.imaOtvoreno());
  }

  ngOnDestroy(): void {
    // otvoreno prvo u dokument (dok je izlaz još tu), pa odjava samo svoje registracije
    this.store.isprazni();
    this.odjava?.();
    this.odjava = null;
    this.fokusPlatna.postavi(null);
  }

  /** Pravougaonik ćelije u sloju: izmeren iz prikaza (red raširen tekstom) ili po modelu. */
  private celijaSesije(t: TabelaSloj, p: Polje) {
    const r = pravougaoniciTabele(this.host.querySelector('.uz-platno'), t).find((x) => x.polje.r === p.r && x.polje.k === p.k);
    const stil = r ? { left: jedinice(r.x), top: jedinice(r.y), width: jedinice(r.w), height: jedinice(r.h) } : {};
    return { polje: p, stil };
  }

  protected promenaTaba(indeks: number): void {
    this.store.postaviTab(TABOVI[indeks] ?? 'SVOJSTVA');
  }

  /** Prevlačenje fajla preko platna: dozvoljeno samo za fajlove (ostalo prevlačenje se ne dira). */
  protected preko(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }

  /** Spuštanje fajla: prvi fajl prihvaćenog tipa, centar = tačka spuštanja u jedinicama platna (isto merenje kao overlay). */
  protected spusteno(e: DragEvent): void {
    const fajlovi = Array.from(e.dataTransfer?.files ?? []);
    if (!fajlovi.length && !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    const fajl = fajlovi.find((f) => TIPOVI_SLIKA.includes(f.type));
    if (!fajl) {
      this.obavestenja.greska(PORUKA_PREVLACENJE);
      return;
    }
    const rect = (this.okvir().nativeElement.querySelector('.uz-platno') ?? this.okvir().nativeElement).getBoundingClientRect();
    const px = rect.width > 0 ? rect.width / SIRINA_PLATNA : 1;
    const centar = { x: (e.clientX - rect.left) / px, y: (e.clientY - rect.top) / px };
    void this.slike.ubaci(fajl, centar).then((id) => {
      if (id !== null) this.fokusPlatna.fokus();
    });
  }

  /**
   * Poništi/ponovi na korenu editora (bubble): posle izmene u panelu (boja, prekidač) fokus je tamo, a ne na okviru. Isti
   * filter kao okvir (polja za unos i kontrole sa sopstvenim tasterima zadržavaju svoje ponašanje). Okvir ove prečice ne
   * obrađuje, pa nema duplog izvršavanja; zatvoren izbornik obrađuje `izbornikPreSelecta` u capture fazi.
   */
  protected tastaturaKorena(e: KeyboardEvent): void {
    const k = komandaTastature(e);
    if (!k || !jePonistavanje(k) || e.defaultPrevented) return;
    if (uPoljuZaUnos(e.target)) return;
    e.preventDefault();
    this.ponistiIliPonovi(k.tip);
  }

  /**
   * Zatvoren `mat-select` (posle izbora vrste ili crtice fokus ostaje na njemu) je jedini izuzetak filtera: undo/redo se
   * obrađuje PRE njega i ne stiže do njega (`stopPropagation`), jer zatvoren select Shift+slovo (i uz Ctrl/Meta) šalje u
   * typeahead i bira opciju. Otvoren izbornik, polja i okvir se ne diraju.
   */
  private izbornikPreSelecta(e: KeyboardEvent): void {
    if (!zatvorenIzbornik(e.target)) return;
    const k = komandaTastature(e);
    if (!k || !jePonistavanje(k)) return;
    e.preventDefault();
    e.stopPropagation();
    this.ponistiIliPonovi(k.tip);
  }

  private ponistiIliPonovi(tip: 'PONISTI' | 'PONOVI'): void {
    if (tip === 'PONISTI') this.store.ponisti();
    else this.store.ponovi();
  }

  /** Ostale prečice SAMO na okviru platna (odluka 24); poništi/ponovi idu do korena (`tastaturaKorena`). */
  protected tastatura(e: KeyboardEvent): void {
    if (jeSnimanje(e)) {
      this.store.isprazni(); // otvorena sesija teksta i gest u dokument; događaj ide dalje do stranice (sacuvajOdmah)
      return;
    }
    if (uPoljuZaUnos(e.target)) return;
    if (e.key === 'Escape' && this.store.gest()) return; // Esc usred gesta: samo F5 prekida gest (izbor ostaje)
    const k = komandaTastature(e);
    if (!k || jePonistavanje(k)) return;
    e.preventDefault();
    switch (k.tip) {
      case 'OBRISI': this.store.obrisiIzabrane(); break;
      case 'KOPIRAJ': this.store.kopiraj(); break;
      case 'NALEPI': this.store.nalepi(); break;
      case 'DUPLIRAJ': this.store.duplirajIzabrane(); break;
      case 'PONISTI_IZBOR': this.store.ponistiIzbor(); break;
      case 'IZABERI_SVE': this.store.izaberiSve(); break;
      case 'Z': this.store.zOsaIzabranih(k.smer); break;
      case 'POMERI': this.store.pomeriIzabrane(k.dx, k.dy); break;
      case 'UREDI': {
        // tekst (F12), izabrana ćelija tabele ili prva (F14); formula (F16) dodaje svoje
        const s = this.store.jedan();
        // izabrana ćelija (ako je posle poništavanja još u tabeli) ili prva
        const a = this.store.izabranaCelija();
        const celija = s?.tip !== 'TABELA' ? undefined : a && s.celije[a.r]?.[a.k] ? a : { r: 0, k: 0 };
        // već otvorena sesija istog sloja: pocniUredjivanje vraća true bez promene, pa fokus nazad u tekst (nov uređivač
        // se sam fokusira posle crtanja, a do tada aktivnog nema)
        if ((s?.tip === 'TEKST' || celija) && this.store.pocniUredjivanje(s!.id, celija)) this.store.aktivniUredjivac()?.fokus();
        break;
      }
    }
  }
}

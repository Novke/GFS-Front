import { TextFieldModule } from '@angular/cdk/text-field';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PRELAZ, greskeSlajda, novoPitanje, slajdUCmd, trajanjeIzSekundi } from '../data-access/slajd-pravila';
import { MedijInfo, SlajdCmd, SlajdDetails, TipPrelaza, TipSlajda } from '../data-access/uzivo.models';
import { PitanjeForma, PitanjeFormaComponent, pitanjeForma, pitanjeIzForme } from './pitanje-forma.component';
import { ZadatakForma, ZadatakFormaComponent, zadatakForma, zadatakIzForme } from './zadatak-forma.component';
// samo u @defer bloku (i `import type`): polja prelaza su lenji chunk, stranica editora ne raste
import { PrelazPoljaComponent } from './prelaz-polja.component';
import type { KontrolePrelaza } from './prelaz-polja.component';
import { SlikaPoljeComponent } from './slika-polje.component';

type SlajdForma = FormGroup<KontrolePrelaza & {
  naslov: FormControl<string>;
  sadrzaj: FormControl<string>;
  slikaId: FormControl<string | null>;
  postepeno: FormControl<boolean>;
  beleske: FormControl<string>;
  pitanje: PitanjeForma;
  zadatak: ZadatakForma;
}>;

const nn = { nonNullable: true } as const;

/**
 * Forma izabranog slajda. Gradi se jednom iz ulaza (roditelj pravi novu instancu za svaki slajd i tip, `track kljuc:tip`), pa
 * kasnije promene ulaza (lokalni prikaz, odgovor servera sa novim id-jevima opcija) ne prepisuju ono što nastavnik kuca.
 * Svaka izmena emituje celu `SlajdCmd`; greške (ista pravila kao server) se prikazuju ispod forme.
 */
@Component({
  selector: 'app-slajd-forma',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule, TextFieldModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule,
    PitanjeFormaComponent, PrelazPoljaComponent, SlikaPoljeComponent, ZadatakFormaComponent,
  ],
  template: `
    <form class="uz-ed-forma" [formGroup]="forma" (submit)="$event.preventDefault()">
      @if (tip === 'INFO') {
        <mat-form-field class="uz-ed-puno">
          <mat-label>Naslov</mat-label>
          <input matInput formControlName="naslov">
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic" class="uz-ed-puno">
          <mat-label>Tekst (Markdown)</mat-label>
          <textarea matInput cdkTextareaAutosize cdkAutosizeMinRows="6" formControlName="sadrzaj"></textarea>
          <mat-hint>**podebljano** · *kurziv* · "- " stavka liste · "1. " numerisana · "## " podnaslov · [veza](https://…)</mat-hint>
        </mat-form-field>
        <app-slika-polje [slikaId]="forma.controls.slikaId.value" oznaka="Slika na slajdu" (promena)="postaviSliku($event)" />
        <mat-checkbox formControlName="postepeno">Otkrivaj stavke liste jednu po jednu (tasterom →)</mat-checkbox>
        <!-- div: dugme ne zauzima celu širinu kolone forme; roditelj menja tip slajda (pretvoriUPlatno) -->
        <div>
          <button mat-stroked-button class="uz-ed-pretvori" type="button" aria-describedby="uz-ed-pretvori-opis"
                  (click)="pretvori.emit()">
            <mat-icon svgIcon="layers" />Pretvori u platno
          </button>
          <p class="uz-ed-napomena" id="uz-ed-pretvori-opis">Slajd postaje platno sa slojevima (naslov, tekst, slika) koje uređuješ slobodno.</p>
        </div>
      } @else if (tip === 'ZADATAK') {
        <!-- opis grupe prati odgovore servera (ulaz slajd), kontrole se grade jednom -->
        <app-zadatak-forma [forma]="forma.controls.zadatak" [info]="slajd().zadatak ?? null" [predmetId]="predmetId()" />
      } @else if (tip !== 'PLATNO') {
        <!-- PLATNO: slojeve uređuje editor platna iznad forme; ovde ostaju samo beleške -->
        <app-pitanje-forma [forma]="forma.controls.pitanje" />
      }
      @defer (on immediate) {
        <app-prelaz-polja [kontrole]="forma.controls" [efekat]="efekatPrelaza()" (pregled)="pregledPrelaza.emit()" />
      } @error {
        <p class="uz-ed-greska" role="alert">Polja prelaza nisu učitana. Osveži stranicu i pokušaj ponovo.</p>
      }
      <mat-form-field subscriptSizing="dynamic" class="uz-ed-puno">
        <mat-label>Beleške za predavača</mat-label>
        <textarea matInput cdkTextareaAutosize cdkAutosizeMinRows="2" formControlName="beleske"></textarea>
        <mat-hint>Vide se samo u konzoli, ne na projektoru.</mat-hint>
      </mat-form-field>
      @if (greske().length) {
        <div class="uz-ed-greske" role="status">
          <strong>Slajd se ne čuva dok ovo ne popraviš:</strong>
          <ul>
            @for (g of greske(); track g) { <li>{{ g }}</li> }
          </ul>
        </div>
      }
    </form>
  `,
})
export class SlajdFormaComponent implements OnInit {
  /** Početno stanje slajda; čita se samo pri pravljenju forme. */
  readonly slajd = input.required<SlajdDetails>();
  /** Predmet prezentacije (Zadatak slajd: izbor grupe iz banke tog predmeta). */
  readonly predmetId = input<number>(0);
  readonly izmena = output<SlajdCmd>();
  /** INFO: "Pretvori u platno" (odluka 20); forma se posle toga pravi ponovo (`track kljuc:tip`). */
  readonly pretvori = output<void>();
  /** "Pregledaj prelaz" (F17: dijalog sa prethodnim slajdom); forma se ne menja. */
  readonly pregledPrelaza = output<void>();

  private readonly destroyRef = inject(DestroyRef);

  protected forma!: SlajdForma;
  protected tip: TipSlajda = 'INFO';
  /** Dokument platna se ne menja formom: vraća se neizmenjen (izmena beleški ne sme da obriše slojeve). */
  private platno: SlajdCmd['platno'] = null;
  protected readonly greske = signal<string[]>([]);
  /** Vrednost kontrole efekta (polja Smer i Trajanje zavise od nje; OnPush ne vidi promenu kontrole sama). */
  protected readonly efekatPrelaza = signal<TipPrelaza | 'NEMA'>('NEMA');

  ngOnInit(): void {
    const cmd = slajdUCmd(this.slajd());
    this.tip = cmd.tip;
    this.platno = cmd.platno;
    this.forma = new FormGroup({
      naslov: new FormControl(cmd.naslov ?? '', nn),
      sadrzaj: new FormControl(cmd.sadrzaj ?? '', nn),
      slikaId: new FormControl<string | null>(cmd.slikaId),
      postepeno: new FormControl(cmd.postepeno, nn),
      beleske: new FormControl(cmd.beleske ?? '', nn),
      pitanje: pitanjeForma(cmd.pitanje ?? novoPitanje('JEDAN_TACAN')),
      zadatak: zadatakForma(cmd.zadatak ?? null),
      prelazEfekat: new FormControl<TipPrelaza | 'NEMA'>(cmd.prelaz?.efekat ?? 'NEMA', nn),
      prelazSmer: new FormControl(cmd.prelaz?.smer ?? 'DESNO', nn),
      prelazSekunde: new FormControl(String((cmd.prelaz?.trajanjeMs ?? PRELAZ.podrazumevano) / 1000).replace('.', ','), nn),
    });
    this.efekatPrelaza.set(this.forma.controls.prelazEfekat.value);
    this.greske.set(greskeSlajda(this.cmd()));
    this.forma.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.efekatPrelaza.set(this.forma.controls.prelazEfekat.value);
      const novi = this.cmd();
      this.greske.set(greskeSlajda(novi));
      this.izmena.emit(novi);
    });
  }

  protected postaviSliku(m: MedijInfo | null): void {
    this.forma.controls.slikaId.setValue(m?.id ?? null);
  }

  private cmd(): SlajdCmd {
    const v = this.forma.getRawValue();
    // ZADATAK: samo zadatak (uz beleške i prelaz), ostala polja sadržaja su null
    const zadatak = this.tip === 'ZADATAK';
    return {
      tip: this.tip,
      naslov: zadatak ? null : v.naslov || null,
      sadrzaj: zadatak ? null : v.sadrzaj || null,
      slikaId: zadatak ? null : v.slikaId,
      beleske: v.beleske || null,
      postepeno: zadatak ? false : v.postepeno,
      pitanje: this.tip === 'PITANJE' ? pitanjeIzForme(this.forma.controls.pitanje) : null,
      platno: this.platno,
      // zarez ili tačka; prazno ili neispravno polje daje 0 ms, pa poruku servera ispod forme
      prelaz: v.prelazEfekat === 'NEMA' ? null : {
        efekat: v.prelazEfekat, smer: v.prelazEfekat === 'FADE' ? null : v.prelazSmer, trajanjeMs: trajanjeIzSekundi(v.prelazSekunde),
      },
      zadatak: zadatak ? zadatakIzForme(this.forma.controls.zadatak) : null,
    };
  }
}

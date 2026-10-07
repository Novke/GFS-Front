import { TextFieldModule } from '@angular/cdk/text-field';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { greskeSlajda, novoPitanje, slajdUCmd } from '../data-access/slajd-pravila';
import { MedijInfo, SlajdCmd, SlajdDetails, TipSlajda } from '../data-access/uzivo.models';
import { PitanjeForma, PitanjeFormaComponent, pitanjeForma, pitanjeIzForme } from './pitanje-forma.component';
import { SlikaPoljeComponent } from './slika-polje.component';

type SlajdForma = FormGroup<{
  naslov: FormControl<string>;
  sadrzaj: FormControl<string>;
  slikaId: FormControl<string | null>;
  postepeno: FormControl<boolean>;
  beleske: FormControl<string>;
  pitanje: PitanjeForma;
}>;

const nn = { nonNullable: true } as const;

/**
 * Forma izabranog slajda. Gradi se jednom iz ulaza (roditelj pravi novu instancu za svaki slajd, `track kljuc`), pa
 * kasnije promene ulaza (lokalni prikaz, odgovor servera sa novim id-jevima opcija) ne prepisuju ono što nastavnik kuca.
 * Svaka izmena emituje celu `SlajdCmd`; greške (ista pravila kao server) se prikazuju ispod forme.
 */
@Component({
  selector: 'gfs-slajd-forma',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule, TextFieldModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, PitanjeFormaComponent,
    SlikaPoljeComponent,
  ],
  template: `
    <form class="uz-ed-forma" [formGroup]="forma" (submit)="$event.preventDefault()">
      @if (tip === 'INFO') {
        <mat-form-field class="uz-ed-puno">
          <mat-label>Naslov</mat-label>
          <input matInput formControlName="naslov">
        </mat-form-field>
        <mat-form-field class="uz-ed-puno">
          <mat-label>Tekst (Markdown)</mat-label>
          <textarea matInput cdkTextareaAutosize cdkAutosizeMinRows="6" formControlName="sadrzaj"></textarea>
          <mat-hint>**podebljano** · *kurziv* · "- " stavka liste · "1. " numerisana · "## " podnaslov · [veza](https://…)</mat-hint>
        </mat-form-field>
        <gfs-slika-polje [slikaId]="forma.controls.slikaId.value" oznaka="Slika na slajdu" (promena)="postaviSliku($event)" />
        <mat-checkbox formControlName="postepeno">Otkrivaj stavke liste jednu po jednu (tasterom →)</mat-checkbox>
      } @else {
        <gfs-pitanje-forma [forma]="forma.controls.pitanje" />
      }
      <mat-form-field class="uz-ed-puno">
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
  readonly izmena = output<SlajdCmd>();

  private readonly destroyRef = inject(DestroyRef);

  protected forma!: SlajdForma;
  protected tip: TipSlajda = 'INFO';
  protected readonly greske = signal<string[]>([]);

  ngOnInit(): void {
    const cmd = slajdUCmd(this.slajd());
    this.tip = cmd.tip;
    this.forma = new FormGroup({
      naslov: new FormControl(cmd.naslov ?? '', nn),
      sadrzaj: new FormControl(cmd.sadrzaj ?? '', nn),
      slikaId: new FormControl<string | null>(cmd.slikaId),
      postepeno: new FormControl(cmd.postepeno, nn),
      beleske: new FormControl(cmd.beleske ?? '', nn),
      pitanje: pitanjeForma(cmd.pitanje ?? novoPitanje('JEDAN_TACAN')),
    });
    this.greske.set(greskeSlajda(this.cmd()));
    this.forma.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
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
    return {
      tip: this.tip,
      naslov: v.naslov || null,
      sadrzaj: v.sadrzaj || null,
      slikaId: v.slikaId,
      beleske: v.beleske || null,
      postepeno: v.postepeno,
      pitanje: this.tip === 'PITANJE' ? pitanjeIzForme(this.forma.controls.pitanje) : null,
    };
  }
}

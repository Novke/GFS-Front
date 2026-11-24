import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BOJE, ElementCrteza, SIRINA_SCENE, StanjeAlata, VISINA_SCENE } from './crtanje.models';
import { PutanjaSvg, putanjeElementa, putanjeKes } from './geometrija';
import { IkonaCrtanjaComponent } from './ikona-crtanja.component';

interface Crta extends PutanjaSvg { boja: string; }

const crte = (e: ElementCrteza, p: PutanjaSvg[]): Crta[] => p.map(x => ({ ...x, boja: e.boja }));

/**
 * Sloj crteža preko slajda (spec 5.2): SVG `viewBox="0 0 960 540"` preko celog roditelja (16:9), bez pokazivača. Putanje
 * gotovih elemenata se pamte po objektu (`putanjeKes`), pa element u nastajanju ne preračunava celu stranu. Uz `alati`
 * (konzola crta, nastavnik uključio „oko”) levo je traka sa alatom i bojama.
 */
@Component({
  selector: 'app-sloj-crteza',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IkonaCrtanjaComponent],
  host: { class: 'crt-sloj' },
  styles: `
    :host { position: absolute; inset: 0; z-index: 1; pointer-events: none; container-type: inline-size; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: hidden; }
    .crt-pub-alati { position: absolute; left: 1.2cqw; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column;
      gap: 0.9cqw; padding: 1cqw; background: rgb(255 255 255 / 0.92); border-radius: 1.2cqw; box-shadow: 0 1px 6px rgb(0 0 0 / 0.18);
      align-items: center; color: #121a2a; }
    .crt-pub-alati app-ikona-crtanja { width: 2.6cqw; height: 2.6cqw; }
    .crt-pub-alati i { display: block; width: 2.4cqw; height: 2.4cqw; border-radius: 50%; }
    .crt-pub-alati i.izabrana { outline: 0.35cqw solid #121a2a; outline-offset: 0.25cqw; }
  `,
  template: `
    <svg [attr.viewBox]="viewBox" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      @for (c of gotove(); track $index) {
        <path [attr.d]="c.d" [attr.stroke]="c.boja" [attr.stroke-width]="c.sirina" [attr.fill]="c.popunjeno ? c.boja : 'none'"
              [attr.stroke-dasharray]="c.crtice" stroke-linecap="round" stroke-linejoin="round" />
      }
      @for (c of uTokuCrte(); track $index) {
        <path [attr.d]="c.d" [attr.stroke]="c.boja" [attr.stroke-width]="c.sirina" [attr.fill]="c.popunjeno ? c.boja : 'none'"
              [attr.stroke-dasharray]="c.crtice" stroke-linecap="round" stroke-linejoin="round" />
      }
    </svg>
    @if (alati(); as a) {
      <div class="crt-pub-alati" data-crt-pub-alati>
        <app-ikona-crtanja [ime]="a.alat" />
        @for (b of boje; track b.hex) { <i [style.background]="b.hex" [class.izabrana]="b.hex === a.boja"></i> }
      </div>
    }
  `,
})
export class SlojCrtezaComponent {
  readonly elementi = input<readonly ElementCrteza[]>([]);
  readonly uToku = input<ElementCrteza | null>(null);
  readonly alati = input<StanjeAlata | null>(null);
  protected readonly viewBox = `0 0 ${SIRINA_SCENE} ${VISINA_SCENE}`;
  protected readonly boje = BOJE;
  protected readonly gotove = computed(() => this.elementi().flatMap(e => crte(e, putanjeKes(e))));
  /** Element u nastajanju je nov objekat na svaki pomeraj: bez keša. */
  protected readonly uTokuCrte = computed(() => {
    const e = this.uToku();
    return e ? crte(e, putanjeElementa(e)) : [];
  });
}

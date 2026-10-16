import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PokretPrelaza, PrelazDirective } from './prelaz.directive';

/** Lažna animacija: `finished` se razrešava ručno, `cancel` ga odbija (kao WAAPI). */
interface LaznaAnimacija { finished: Promise<unknown>; cancel: ReturnType<typeof vi.fn>; zavrsi(): void; }

function laznaAnimacija(): LaznaAnimacija {
  let zavrsi!: () => void;
  let odbij!: (e: unknown) => void;
  const finished = new Promise<unknown>((r, o) => { zavrsi = () => r(undefined); odbij = o; });
  const cancel = vi.fn(() => odbij(new DOMException('Prekinuto', 'AbortError')));
  return { finished, cancel, zavrsi };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PrelazDirective],
  template: `<div class="omotac" [appPrelaz]="pokret()" [appPrelazZadrzi]="zadrzi()" (appPrelazKraj)="krajevi.push($event)"></div>`,
})
class Domacin {
  readonly pokret = signal<PokretPrelaza | null>(null);
  readonly zadrzi = signal(false);
  readonly krajevi: number[] = [];
}

const kadrovi: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

describe('PrelazDirective', () => {
  let animacije: LaznaAnimacija[];
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animacije = [];
    animate = vi.fn(() => {
      const a = laznaAnimacija();
      animacije.push(a);
      return a;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate });
  });

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  async function domacin() {
    const fixture = TestBed.createComponent(Domacin);
    fixture.detectChanges();
    await fixture.whenStable();
    const postavi = async (p: PokretPrelaza | null, zadrzi = false) => {
      fixture.componentInstance.pokret.set(p);
      fixture.componentInstance.zadrzi.set(zadrzi);
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { d: fixture.componentInstance, postavi, fixture };
  }

  it('nov ključ: animate(kadrovi, ease-in-out, fill both); kraj emituje ključ i prekida animaciju (bez zaostalog stila)', async () => {
    const { d, postavi } = await domacin();
    expect(animate).not.toHaveBeenCalled();
    await postavi({ kljuc: 7, kadrovi, trajanjeMs: 600 });
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(kadrovi, { duration: 600, easing: 'ease-in-out', fill: 'both' });
    expect(d.krajevi).toEqual([]);

    animacije[0].zavrsi();
    await animacije[0].finished;
    await Promise.resolve();
    expect(d.krajevi).toEqual([7]);
    expect(animacije[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('appPrelazZadrzi: krajnji kadar ostaje (bez cancel) dok omotač ne nestane', async () => {
    const { d, postavi, fixture } = await domacin();
    await postavi({ kljuc: 3, kadrovi, trajanjeMs: 500 }, true);
    animacije[0].zavrsi();
    await animacije[0].finished;
    await Promise.resolve();
    expect(d.krajevi).toEqual([3]);
    expect(animacije[0].cancel).not.toHaveBeenCalled();
    fixture.destroy();
    expect(animacije[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('null usred animacije: cancel, a odbijen finished ne emituje kraj', async () => {
    const { d, postavi } = await domacin();
    await postavi({ kljuc: 1, kadrovi, trajanjeMs: 500 });
    await postavi(null);
    expect(animacije[0].cancel).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(d.krajevi).toEqual([]);
  });

  it('null posle zadržane animacije: cancel', async () => {
    const { postavi } = await domacin();
    await postavi({ kljuc: 1, kadrovi, trajanjeMs: 500 }, true);
    animacije[0].zavrsi();
    await animacije[0].finished;
    await Promise.resolve();
    await postavi(null, true);
    expect(animacije[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('isti ključ ponovo (nov objekat, npr. potezi stigli): nema novog animate; nov ključ prekida stari', async () => {
    const { d, postavi } = await domacin();
    await postavi({ kljuc: 1, kadrovi, trajanjeMs: 500 });
    await postavi({ kljuc: 1, kadrovi: [...kadrovi], trajanjeMs: 500 });
    expect(animate).toHaveBeenCalledTimes(1);
    await postavi({ kljuc: 2, kadrovi, trajanjeMs: 500 });
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animacije[0].cancel).toHaveBeenCalledTimes(1);
    // stari finished (da se razreši posle prekida) ne sme da javi kraj
    animacije[1].zavrsi();
    await animacije[1].finished;
    await Promise.resolve();
    expect(d.krajevi).toEqual([2]);
  });

  it('bez animate (stari pregledač) ili trajanje 0: kraj odmah, bez animacije', async () => {
    const { d, postavi } = await domacin();
    await postavi({ kljuc: 4, kadrovi, trajanjeMs: 0 });
    expect(animate).not.toHaveBeenCalled();
    expect(d.krajevi).toEqual([4]);

    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    await postavi({ kljuc: 5, kadrovi, trajanjeMs: 500 });
    expect(d.krajevi).toEqual([4, 5]);
  });
});

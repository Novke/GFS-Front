import { describe, expect, it, vi } from 'vitest';
import { BravaEkrana, BudanEkran, WakeLockLike } from './budan-ekran';
import { isprazniMikrozadatke } from '../lazni-sat.testing';

class LaznaBrava extends EventTarget implements BravaEkrana {
  released = false;
  async release(): Promise<void> {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

function postavi(opcije: { odbij?: boolean } = {}) {
  const brave: LaznaBrava[] = [];
  let odbij = opcije.odbij ?? false;
  const resolveri: (() => void)[] = [];
  let rucno = false;
  const request = vi.fn(async () => {
    if (rucno) await new Promise<void>(r => resolveri.push(r));
    if (odbij) throw new DOMException('nije dozvoljeno', 'NotAllowedError');
    const b = new LaznaBrava();
    brave.push(b);
    return b;
  });
  const api: WakeLockLike = { request };
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const be = new BudanEkran(api, doc as never);
  return {
    be, doc, brave, request,
    postaviOdbij: (v: boolean) => (odbij = v),
    zadrzi: () => (rucno = true),
    zavrsi: () => resolveri.splice(0).forEach(r => r()),
    vidljivo: (v: boolean) => {
      doc.visibilityState = v ? 'visible' : 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

describe('BudanEkran', () => {
  it('bez API-ja je nepodržano i ne baca', () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const be = new BudanEkran(undefined, doc as never);
    expect(be.stanje()).toBe('nepodrzano');
    expect(() => { be.ukljuci(); be.iskljuci(); }).not.toThrow();
    expect(be.stanje()).toBe('nepodrzano');
  });

  it('ukljuci traži jednom i postaje aktivno', async () => {
    const t = postavi();
    t.be.ukljuci();
    t.be.ukljuci();
    await isprazniMikrozadatke();
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(t.request).toHaveBeenCalledWith('screen');
    expect(t.be.stanje()).toBe('aktivno');
  });

  it('posle puštanja brave od pregledača traži ponovo pri povratku', async () => {
    const t = postavi();
    t.be.ukljuci();
    await isprazniMikrozadatke();
    await t.brave[0].release();
    expect(t.be.stanje()).toBe('trazi');
    t.vidljivo(true);
    await isprazniMikrozadatke();
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(t.be.stanje()).toBe('aktivno');
  });

  it('dok je stranica skrivena ne traži', async () => {
    const t = postavi();
    t.doc.visibilityState = 'hidden';
    t.be.ukljuci();
    await isprazniMikrozadatke();
    expect(t.request).not.toHaveBeenCalled();
    t.vidljivo(true);
    await isprazniMikrozadatke();
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it('odbijen zahtev: odbijeno, pa ručni ukljuci traži ponovo', async () => {
    const t = postavi({ odbij: true });
    t.be.ukljuci();
    await isprazniMikrozadatke();
    expect(t.be.stanje()).toBe('odbijeno');
    t.postaviOdbij(false);
    t.be.ukljuci();
    await isprazniMikrozadatke();
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(t.be.stanje()).toBe('aktivno');
  });

  it('iskljuci pušta bravu i povratak više ne traži', async () => {
    const t = postavi();
    t.be.ukljuci();
    await isprazniMikrozadatke();
    t.be.iskljuci();
    await isprazniMikrozadatke();
    expect(t.brave[0].released).toBe(true);
    expect(t.be.stanje()).toBe('iskljuceno');
    t.vidljivo(true);
    await isprazniMikrozadatke();
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(t.be.stanje()).toBe('iskljuceno');
  });

  it('iskljuci dok zahtev traje: brava se odmah pusti', async () => {
    const t = postavi();
    t.zadrzi();
    t.be.ukljuci();
    t.be.iskljuci();
    t.zavrsi();
    await isprazniMikrozadatke();
    expect(t.brave[0].released).toBe(true);
    expect(t.be.stanje()).toBe('iskljuceno');
  });
});

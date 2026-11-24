/** Lažni BroadcastChannel za testove: poruka ide odmah svim drugim otvorenim kanalima istog imena (kao u pregledaču). */
export class LazniKanal {
  static otvoreni: LazniKanal[] = [];
  private readonly slusaoci: ((e: MessageEvent) => void)[] = [];
  constructor(readonly name: string) {
    LazniKanal.otvoreni.push(this);
  }
  addEventListener(_tip: 'message', cb: (e: MessageEvent) => void): void {
    this.slusaoci.push(cb);
  }
  postMessage(data: unknown): void {
    // kao structured clone: primalac ne deli objekat sa pošiljaocem
    const kopija = JSON.parse(JSON.stringify(data)) as unknown;
    for (const k of LazniKanal.otvoreni) {
      if (k !== this && k.name === this.name) k.slusaoci.forEach(cb => cb({ data: kopija } as MessageEvent));
    }
  }
  close(): void {
    LazniKanal.otvoreni = LazniKanal.otvoreni.filter(k => k !== this);
  }
}

/** Sve poruke na kanalu `ime` (prisluškivač kao još jedan prozor). */
export function prisluskuj(ime: string): unknown[] {
  const primljeno: unknown[] = [];
  new LazniKanal(ime).addEventListener('message', e => primljeno.push(e.data));
  return primljeno;
}

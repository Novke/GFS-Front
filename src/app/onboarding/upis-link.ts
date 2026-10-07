// Apsolutni javni link za token; radi i pod <base href="/gfs/"> i pod "/" (document.baseURI je već apsolutan).
export function upisLink(token: string): string {
  return new URL(`upis/${token}`, document.baseURI).href;
}

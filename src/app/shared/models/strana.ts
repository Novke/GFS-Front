/** Jedna strana liste, kako je vraća `GET api/<lista>/pretraga` (Spring `PagedModel`); `page.number` je 0-based. */
export interface Strana<T> {
  content: T[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

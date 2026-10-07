import { computed } from '@angular/core';
import { signalStoreFeature, withComputed, withState } from '@ngrx/signals';

export type RequestStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface RequestStatusState {
  status: RequestStatus;
  greska: string | null;
}

/** Status jednog (glavnog) zahteva store-a: `ucitava` i `imaGresku` za skeleton i panel greške. */
export function withRequestStatus() {
  return signalStoreFeature(
    withState<RequestStatusState>({ status: 'idle', greska: null }),
    withComputed(({ status }) => ({
      ucitava: computed(() => status() === 'loading'),
      imaGresku: computed(() => status() === 'error'),
    })),
  );
}

export const setLoading = () => ({ status: 'loading' as const, greska: null });
export const setLoaded = () => ({ status: 'loaded' as const, greska: null });
export const setError = (greska: string) => ({ status: 'error' as const, greska });

import { describe, expect, it } from 'vitest';

import { detektujInstalaciju, karticaNaTelefonu, UlazDetekcije } from './instalacija.pravila';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
  androidInstagram: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

const ulaz = (userAgent: string, o: Partial<UlazDetekcije> = {}): UlazDetekcije =>
  ({ userAgent, maxTouchPoints: 0, standalone: false, imaPonudu: false, ...o });

describe('detektujInstalaciju', () => {
  it.each([
    ['Android Chrome sa ponudom', ulaz(UA.androidChrome, { maxTouchPoints: 5, imaPonudu: true }), 'android', 'ponuda'],
    ['Samsung Internet sa ponudom', ulaz(UA.androidSamsung, { maxTouchPoints: 5, imaPonudu: true }), 'android', 'ponuda'],
    ['Android Chrome bez ponude (još nije stigla)', ulaz(UA.androidChrome, { maxTouchPoints: 5 }), 'android', 'android'],
    ['Firefox na Androidu', ulaz(UA.androidFirefox, { maxTouchPoints: 5 }), 'android', 'android'],
    ['Instagram na Androidu', ulaz(UA.androidInstagram, { maxTouchPoints: 5 }), 'android', 'android'],
    ['iPhone Safari', ulaz(UA.iphoneSafari, { maxTouchPoints: 5 }), 'iphone', 'ios-safari'],
    ['iPhone Chrome', ulaz(UA.iphoneChrome, { maxTouchPoints: 5 }), 'iphone', 'ios-drugi'],
    ['iPhone Firefox', ulaz(UA.iphoneFirefox, { maxTouchPoints: 5 }), 'iphone', 'ios-drugi'],
    ['iPad u desktop režimu', ulaz(UA.ipadDesktop, { maxTouchPoints: 5 }), 'iphone', 'ios-safari'],
    ['Mac Safari (bez dodira)', ulaz(UA.macSafari), 'racunar', 'racunar'],
    ['Windows Chrome sa ponudom', ulaz(UA.windowsChrome, { imaPonudu: true }), 'racunar', 'ponuda'],
    ['Windows Chrome bez ponude', ulaz(UA.windowsChrome), 'racunar', 'racunar'],
    ['instalirano na iPhone-u', ulaz(UA.iphoneSafari, { maxTouchPoints: 5, standalone: true }), 'iphone', 'instalirano'],
    ['instalirano na Androidu (ponuda se ne gleda)', ulaz(UA.androidChrome, { standalone: true, imaPonudu: true }), 'android', 'instalirano'],
  ] as const)('%s', (_naziv, u, uredjaj, nacin) => {
    expect(detektujInstalaciju(u)).toEqual({ uredjaj, nacin });
  });
});

describe('karticaNaTelefonu', () => {
  it('samo telefon bez instalirane aplikacije', () => {
    expect(karticaNaTelefonu({ uredjaj: 'android', nacin: 'ponuda' })).toBe(true);
    expect(karticaNaTelefonu({ uredjaj: 'iphone', nacin: 'ios-safari' })).toBe(true);
    expect(karticaNaTelefonu({ uredjaj: 'iphone', nacin: 'instalirano' })).toBe(false);
    expect(karticaNaTelefonu({ uredjaj: 'racunar', nacin: 'ponuda' })).toBe(false);
  });
});

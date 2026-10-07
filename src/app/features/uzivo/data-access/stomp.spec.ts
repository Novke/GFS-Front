import { wsUrl } from './stomp';

describe('wsUrl', () => {
  it('https baza daje wss', () => {
    expect(wsUrl('api/ws', 'https://gfs.dev.trif.rs/')).toBe('wss://gfs.dev.trif.rs/api/ws');
  });

  it('http baza sa podputanjom (/gfs/) daje ws i čuva podputanju', () => {
    expect(wsUrl('api/public/ws', 'http://novica-dev/gfs/')).toBe('ws://novica-dev/gfs/api/public/ws');
  });

  it('čuva port', () => {
    expect(wsUrl('api/ws', 'http://localhost:4200/')).toBe('ws://localhost:4200/api/ws');
  });
});

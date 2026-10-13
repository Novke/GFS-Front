import { RxStomp } from '@stomp/rx-stomp';
import { napraviStomp, wsUrl } from './stomp';

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

describe('napraviStomp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prekid socket-a ga odbacuje odmah (polumrtav socket posle spavanja telefona ne čeka `onclose`)', () => {
    const aktiviraj = vi.spyOn(RxStomp.prototype, 'activate').mockImplementation(() => undefined);
    const stomp = napraviStomp('api/ws');
    expect(aktiviraj).toHaveBeenCalledTimes(1);
    expect(stomp.stompClient.discardWebsocketOnCommFailure).toBe(true);
    expect(stomp.stompClient.brokerURL).toBe(wsUrl('api/ws'));
  });
});

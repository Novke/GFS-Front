import { waLinkZaPrikaz } from './wa-link';

describe('waLinkZaPrikaz', () => {
  it('pušta samo kanonski link grupe', () => {
    expect(waLinkZaPrikaz('https://chat.whatsapp.com/AbCdEf1234567890')).toBe('https://chat.whatsapp.com/AbCdEf1234567890');
  });

  it.each([
    null, undefined, 42, '', 'http://chat.whatsapp.com/AbCdEf1234567890', 'https://chat.whatsapp.com/kratak',
    'https://chat.whatsapp.com/AbCdEf1234567890?x=1', 'javascript:alert(1)', 'https://evil.example/AbCdEf1234567890',
    'https://chat.whatsapp.com.evil.example/AbCdEf1234567890', 'https://chat.whatsapp.com/AbCdEf1234567890\n',
  ])('odbija %j', v => {
    expect(waLinkZaPrikaz(v)).toBeNull();
  });
});

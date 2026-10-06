// Relativna putanja do backenda: u produkciji je proxy-uje nginx iz kontejnera (/api -> backend),
// u razvoju ng serve preko proxy.conf.json. Ne sme imati vodeću ni završnu kosu crtu.
export const API_URL = 'api';

import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Okvir javnih stranica naloga (`/nalog`, `/nalog/moodle`): kartica sa zaglavljem (znak iz logoa, "Građevinski fakultet
 * Subotica", `h1` "Nalog studenta") i telom u koje stranica projektuje svoj korak (`h2` koraka i sadržaj). Bez HTTP-a.
 */
@Component({
  selector: 'app-nalog-okvir',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="nalog">
      <header class="zaglavlje">
        <span class="znak" aria-hidden="true"><img src="assets/images/gfs-logo.png" alt="" width="170" height="128"></span>
        <div class="naslovi">
          <p class="nadnaslov">Građevinski fakultet Subotica</p>
          <h1>Nalog studenta</h1>
        </div>
      </header>
      <div class="telo"><ng-content /></div>
    </article>
  `,
  styles: `
    :host { display: block; padding-block: clamp(0px, 4vh, 48px); }

    .nalog {
      max-width: 480px;
      margin: 0 auto;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .zaglavlje {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px 20px;
      background: var(--hero-bg);
      color: var(--hero-ink);
    }

    /* znak iz logoa (kao na upisu i na prijavi nastavnika), beo na tamnoj podlozi */
    .znak {
      flex: none;
      width: 39px;
      height: 57px;
      overflow: hidden;
      filter: var(--logo-filter);
      mix-blend-mode: screen;
    }
    .znak img { display: block; max-width: none; margin: -36px 0 0 -66px; }

    .naslovi { min-width: 0; }
    .nadnaslov {
      margin: 0 0 4px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      opacity: .8;
    }
    h1 { margin: 0; color: inherit; font-size: 22px; line-height: 1.25; overflow-wrap: anywhere; }

    .telo { padding: 20px; }
  `,
})
export class NalogOkvir {}

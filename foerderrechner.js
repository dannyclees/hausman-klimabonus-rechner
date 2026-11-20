/* src/calc.js */
/*
 * Förderlogik Wärmepumpe – Luxemburg (Klimabonus Wunnen 2026–2030)
 *
 * Es wird immer das MAXIMUM berechnet ("bis zu …"): Jede Antwort außer einem
 * ausdrücklichen "Nein" zählt zugunsten des Kunden, bei unklarer Wärmepumpe
 * wird Erdwärme (höchste Pauschale) angesetzt.
 *
 * Alle Beträge stehen zentral in RATES. Werte mit `verified: false` müssen vor
 * dem Livegang mit dem Simulator der Klima-Agence (aides.klima-agence.lu)
 * abgeglichen werden.
 *
 * Quellen (Stand Okt. 2026):
 *  - Regierungs-Pressemitteilung 16.07.2026 "Klimabonus Wunnen 2026-2030"
 *  - Präsentation Klimabonus Wunnen, environnement.public.lu (Juli 2026)
 *  - Simulator aides.klima-agence.lu (Screenshot: Klimabonus 551 = 14.000 €
 *    mit Austausch + Anpassungsbonus + Tripartite; Gemeinde Bartringen 3.500 €;
 *    enoprimes Enovos 2.500 €)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HausmanCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RATES = {
    // Bestehendes Gebäude, Einfamilienhaus (Pauschalen, unabhängig von der Leistung)
    existingHouse: {
      verified: true,
      air: 10000, // Luft-Wasser-Wärmepumpe
      geo: 12000, // Erdwärme (Sole/Wasser-Wasser)
      noReplacementReduction: 4000 // ohne Ersatz einer fossilen/elektrischen Heizung
    },
    // Bestehendes Gebäude, Mehrfamilienhaus – pro Wohneinheit
    existingFlats: {
      verified: false,
      air: { perUnit: 8000, max: 24000 },
      geo: { perUnit: 8000, max: 24000 },
      noReplacementReductionPerUnit: 2000
    },
    // Anpassung von Heizkörpern/Leitungen (Betrag aus Simulator abgeleitet)
    adaptationBonus: { verified: false, amount: 2000 },
    // Tripartite-Bonus: Bestellung 01.01.2026 – 30.06.2027, Rechnung bis 31.12.2028
    tripartite: { verified: true, amount: 2000 },
    // Neubau
    newHouse: { verified: false, amount: 3000 },
    newFlats: { verified: false, perUnit: 2000, max: 10000 },
    // Zusatzboni Klimabonus
    oilTankRemoval: { verified: true, amount: 1500 },
    waterProtectionZone: { verified: true, amount: 2000 }, // Ölkessel-Ersatz in Trinkwasserschutzzone
    energyManagement: { verified: true, amount: 500 }, // ab Rechnungsdatum 01.10.2026
    // Weitere Beihilfen (Beispielwerte aus dem Simulator)
    commune: { verified: false, amount: 3500 }, // je nach Gemeinde, Beispiel Bartringen
    energySupplier: { verified: false, amount: 2500 }, // enoprimes (Enovos)
    // Mehrwertsteuer: 3 % statt 17 % (Hauptwohnsitz)
    vat: { standard: 0.17, reduced: 0.03 },
    // Typische Netto-Investition für die TVA-Ersparnis (Schätzwerte, anpassen!)
    typicalNetCost: {
      verified: false,
      house: { air: 25000, geo: 40000 },
      flatPerUnit: { air: 12000, geo: 18000 }
    }
  };

  var REPLACING = { oil: true, gas: true, electric: true };

  // Maximum-Logik: alles außer einem ausdrücklichen "Nein" zählt
  function maybe(v) { return v !== 'no'; }

  function clampUnits(n) {
    n = parseInt(n, 10);
    return isNaN(n) || n < 2 ? 2 : Math.min(n, 200);
  }

  /**
   * @param {object} a Antworten:
   *   building: 'bestand' | 'neubau'
   *   type: 'efh' | 'mfh'
   *   units: Anzahl Wohneinheiten (nur mfh)
   *   heating: 'oil' | 'gas' | 'electric' | 'other'
   *   pump: 'air' | 'geo' | 'unsure'
   *   oilTankRemoval, waterProtectionZone, energyManagement: 'yes' | 'no' | 'unsure'
   * @returns {{pump, items: Array<{key, amount}>, total, vatSaving, unverified}}
   */
  function calculate(a) {
    var pump = a.pump === 'air' ? 'air' : 'geo';
    var items = [];
    var isFlats = a.type === 'mfh';
    var units = isFlats ? clampUnits(a.units) : 1;
    var unverified = false;

    if (a.building === 'neubau') {
      if (isFlats) {
        items.push({ key: 'base', amount: Math.min(RATES.newFlats.perUnit * units, RATES.newFlats.max) });
      } else {
        items.push({ key: 'base', amount: RATES.newHouse.amount });
      }
      unverified = true;
    } else {
      var replacing = !!REPLACING[a.heating];
      if (isFlats) {
        var r = RATES.existingFlats[pump];
        var perUnit = r.perUnit - (replacing ? 0 : RATES.existingFlats.noReplacementReductionPerUnit);
        items.push({ key: 'base', amount: Math.min(perUnit * units, r.max) });
        unverified = !RATES.existingFlats.verified;
      } else {
        var base = RATES.existingHouse[pump] - (replacing ? 0 : RATES.existingHouse.noReplacementReduction);
        items.push({ key: 'base', amount: base });
      }
      items.push({ key: 'adaptationBonus', amount: RATES.adaptationBonus.amount });
      items.push({ key: 'tripartite', amount: RATES.tripartite.amount });
      if (a.heating === 'oil' && maybe(a.oilTankRemoval)) {
        items.push({ key: 'oilTankRemoval', amount: RATES.oilTankRemoval.amount });
      }
      if (a.heating === 'oil' && maybe(a.waterProtectionZone)) {
        items.push({ key: 'waterProtectionZone', amount: RATES.waterProtectionZone.amount });
      }
    }
    if (maybe(a.energyManagement)) items.push({ key: 'energyManagement', amount: RATES.energyManagement.amount });
    if (a.building !== 'neubau') {
      items.push({ key: 'commune', amount: RATES.commune.amount });
      items.push({ key: 'energySupplier', amount: RATES.energySupplier.amount });
    }

    var total = items.reduce(function (s, i) { return s + i.amount; }, 0);
    var netCost = isFlats
      ? RATES.typicalNetCost.flatPerUnit[pump] * units
      : RATES.typicalNetCost.house[pump];
    var vatSaving = Math.round(netCost * (RATES.vat.standard - RATES.vat.reduced));

    return { pump: pump, items: items, total: total, vatSaving: vatSaving, unverified: unverified };
  }

  return { RATES: RATES, calculate: calculate };
});

/* src/widget.js */
/*
 * Förderrechner-Widget (Shadow DOM, ohne Abhängigkeiten).
 *
 * Einbindung:
 *   <div id="hausman-foerderrechner"></div>
 *   <script src="foerderrechner.js"
 *           data-endpoint="https://…/api/lead"
 *           data-privacy-url="https://hausman.lu/datenschutz"
 *           data-cta-url="tel:+35280977311"></script>
 */
(function () {
  'use strict';

  var calc = window.HausmanCalc;
  var script = document.currentScript;
  var ds = (script && script.dataset) || {};
  var CONFIG = {
    target: '#hausman-foerderrechner',
    endpoint: '/api/lead',
    privacyUrl: 'https://hausman.lu/rechtliches',
    ctaUrl: 'tel:+35280977311',
    ctaLabel: 'Kostenlose Beratung anfragen',
    brand: 'Hausman',
    colorPrimary: '#ebc85b'
  };
  // Reihenfolge: Standardwerte < window.HausmanFoerderrechnerConfig < data-Attribute am Script-Tag
  [window.HausmanFoerderrechnerConfig || {}, ds].forEach(function (src) {
    Object.keys(CONFIG).forEach(function (k) { if (src[k] != null && src[k] !== '') CONFIG[k] = src[k]; });
  });

  // Wird von build.js durch das Logo (data-URI) ersetzt
  var LOGO = 'data:image/webp;base64,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';

  var T = {
    eyebrow: 'Klimabonus Rechner',
    title: 'Wie viel Förderung bekommst du für deine Wärmepumpe?',
    subtitle: 'Ein paar Klicks – und du weißt, mit wie viel Zuschuss du in Luxemburg rechnen kannst.',
    back: 'Zurück',
    next: 'Weiter',
    items: {
      base: 'Klimabonus Wärmepumpe',
      adaptationBonus: 'Anpassungsbonus Heizkörper & Leitungen',
      tripartite: 'Bonus Tripartite',
      oilTankRemoval: 'Bonus Entfernung Öltank',
      waterProtectionZone: 'Bonus Trinkwasserschutzzone',
      energyManagement: 'Energiemanagementsystem',
      commune: 'Beihilfe deiner Gemeinde',
      energySupplier: 'Beihilfe Energieversorger (enoprimes)'
    },
    pumps: { air: 'Luft-Wasser-Wärmepumpe', geo: 'Erdwärmepumpe' },
    gateTitle: 'Wir haben {n} Förderungen für dich gefunden.',
    walletTitle: 'Deine Förderungen',
    walletEmpty: 'Beantworte die Fragen – hier sammeln sich deine Förderungen.',
    walletFound: '{n} gefunden',
    walletSum: 'Gesamt bis zu',
    walletLocked: 'Beträge werden nach Eingabe deiner E-Mail freigeschaltet.',
    walletGhost: 'Weitere Förderung möglich',
    gateText: 'Gib deine E-Mail-Adresse ein und schalte alle Beträge frei. Wir schicken dir die Übersicht zusätzlich zu.',
    email: 'E-Mail-Adresse',
    emailInvalid: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    consent: 'Ich bin einverstanden, dass {brand} mich per E-Mail zu meiner Förderung und zu Wärmepumpen kontaktiert. Abmeldung jederzeit möglich. Mehr in der <a href="{privacy}" target="_blank" rel="noopener">Datenschutzerklärung</a>.',
    consentMissing: 'Bitte bestätige die Einwilligung.',
    submit: 'Beträge freischalten',
    sending: 'Einen Moment …',
    resultEyebrow: 'Deine maximale Förderung',
    upTo: 'Bis zu',
    calcFor: 'Berechnet für: {pump}',
    vat: 'Dazu sparst du durch 3 % statt 17 % Mehrwertsteuer bis zu {amount}.',
    unverified: 'Für Neubauten und Mehrfamilienhäuser ist der Betrag ein Richtwert – wir prüfen dein Projekt gerne individuell.',
    commune: 'Gemeinde- und Versorgerbeihilfen variieren je nach Wohnort und Anbieter.',
    disclaimer: 'Unverbindliche Maximal-Schätzung auf Basis des Klimabonus Wunnen 2026–2030 (Tripartite-Bonus bei Bestellung zwischen 01.01.2026 und 30.06.2027). Maßgeblich sind die Entscheidungen der Administration de l\'environnement, deiner Gemeinde und deines Energieversorgers.',
    restart: 'Neu berechnen'
  };

  var STEPS = [
    {
      id: 'building', q: 'Um welches Gebäude geht es?',
      options: [['bestand', 'Bestehendes Gebäude', 'Heizung wird ersetzt oder ergänzt'], ['neubau', 'Neubau', 'Wärmepumpe von Anfang an']]
    },
    {
      id: 'type', q: 'Welche Art von Gebäude?',
      options: [['efh', 'Einfamilienhaus', 'auch Doppel- oder Reihenhaus'], ['mfh', 'Mehrfamilienhaus', 'mehrere Wohneinheiten']]
    },
    {
      id: 'units', q: 'Wie viele Wohneinheiten hat das Gebäude?', input: 'number',
      show: function (a) { return a.type === 'mfh'; }
    },
    {
      id: 'heating', q: 'Womit heizt du aktuell?',
      show: function (a) { return a.building === 'bestand'; },
      options: [['oil', 'Heizöl'], ['gas', 'Gas'], ['electric', 'Elektroheizung'], ['other', 'Holz, Pellets oder andere']]
    },
    {
      id: 'pump', q: 'Welche Wärmepumpe interessiert dich?',
      options: [['air', 'Luft-Wasser', 'am häufigsten gewählt'], ['geo', 'Erdwärme', 'höchste Effizienz'], ['unsure', 'Weiß ich noch nicht', 'wir beraten dich gerne']]
    },
    {
      id: 'oilTankRemoval', q: 'Soll der alte Öltank entfernt werden?',
      show: function (a) { return a.building === 'bestand' && a.heating === 'oil'; },
      options: [['yes', 'Ja'], ['no', 'Nein'], ['unsure', 'Weiß ich nicht']]
    },
    {
      id: 'waterProtectionZone', q: 'Liegt das Haus in einer Trinkwasserschutzzone?',
      show: function (a) { return a.building === 'bestand' && a.heating === 'oil'; },
      options: [['yes', 'Ja'], ['no', 'Nein'], ['unsure', 'Weiß ich nicht']]
    },
    {
      id: 'energyManagement', q: 'Planst du ein Energiemanagementsystem?', hint: 'Zum Beispiel in Kombination mit einer Photovoltaikanlage.',
      options: [['yes', 'Ja'], ['no', 'Nein'], ['unsure', 'Weiß ich nicht']]
    }
  ];

  var CHEVRON = '<svg class="chev" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CSS = [
    ':host{all:initial;display:block;container-type:inline-size;--gold:' + CONFIG.colorPrimary + ';--ink:#1d1d1f;--sub:#6e6e73;--line:#d2d2d7;--fill:#f5f5f7;--card:#fff}',
    '*{box-sizing:border-box}',
    '.card{max-width:980px;margin:0 auto;background:var(--card);color:var(--ink);border-radius:28px;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr);',
    'box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 48px rgba(0,0,0,.08);',
    'font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Inter","Helvetica Neue",Arial,sans-serif;',
    'font-size:17px;line-height:1.47;letter-spacing:-.022em;-webkit-font-smoothing:antialiased}',
    '.view{animation:in .35s cubic-bezier(.25,.1,.25,1)}',
    '@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '.logo{display:block;width:44px;height:44px;margin:0 auto 18px;object-fit:contain}',
    '.eyebrow{text-align:center;font-size:14px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--sub);margin:0 0 8px}',
    'h2{margin:0 auto 12px;max-width:480px;text-align:center;font-size:32px;line-height:1.125;font-weight:700;letter-spacing:-.03em}',
    '.lead{margin:0 auto 32px;max-width:440px;text-align:center;color:var(--sub)}',
    '.bar{height:4px;background:#e8e8ed;border-radius:2px;overflow:hidden;margin:0 0 32px}',
    '.bar>i{display:block;height:100%;background:var(--gold);border-radius:2px;transition:width .45s cubic-bezier(.25,.1,.25,1)}',
    'h3{margin:0 0 8px;text-align:center;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-.025em}',
    '.hint{margin:0 0 4px;text-align:center;font-size:15px;color:var(--sub)}',
    '.opts{display:flex;flex-direction:column;gap:10px;margin-top:24px}',
    'button.opt{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;text-align:left;padding:18px 20px;border:0;border-radius:16px;',
    'background:var(--fill);color:var(--ink);font:inherit;cursor:pointer;transition:background .2s,box-shadow .2s,transform .1s}',
    'button.opt:hover{background:#ebebf0}',
    'button.opt:active{transform:scale(.99)}',
    'button.opt:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 60%,transparent)}',
    'button.opt.sel{background:#fff;box-shadow:inset 0 0 0 2px var(--gold)}',
    '.opt strong{display:block;font-weight:600}',
    '.opt small{display:block;font-size:14px;color:var(--sub);margin-top:2px}',
    '.chev{flex:none;color:#86868b}',
    '.nav{display:flex;justify-content:center;margin-top:24px;min-height:24px}',
    'button.link{background:none;border:0;color:var(--sub);font:inherit;font-size:15px;cursor:pointer;padding:4px 8px}',
    'button.link:hover{color:var(--ink)}',
    '.btn{display:block;width:100%;margin-top:20px;background:var(--gold);color:var(--ink);border:0;border-radius:980px;padding:16px 24px;',
    'font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer;transition:filter .2s,transform .1s}',
    '.btn:hover{filter:brightness(.96)}',
    '.btn:active{transform:scale(.99)}',
    '.btn:disabled{opacity:.6;cursor:wait}',
    'input[type=email],input[type=number]{display:block;width:100%;margin-top:24px;padding:16px 18px;border:1px solid var(--line);border-radius:14px;',
    'font:inherit;color:var(--ink);background:#fff;transition:border-color .2s,box-shadow .2s}',
    'input:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 4px color-mix(in srgb,var(--gold) 30%,transparent)}',
    'label.chk{display:flex;gap:12px;align-items:flex-start;font-size:13px;line-height:1.4;color:var(--sub);margin:16px 0 0;cursor:pointer}',
    'label.chk input{margin:1px 0 0;width:18px;height:18px;flex:none;accent-color:var(--ink)}',
    'a{color:var(--ink)}',
    '.err{color:#d70015;font-size:14px;min-height:20px;margin-top:10px;text-align:center}',
    '.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',
    '.upto{text-align:center;font-size:21px;font-weight:600;color:var(--sub);margin:4px 0 0}',
    '.big{text-align:center;font-size:64px;line-height:1.05;font-weight:700;letter-spacing:-.04em;margin:2px 0 8px}',
    '.big::after{content:"";display:block;width:56px;height:4px;border-radius:2px;background:var(--gold);margin:18px auto 0}',
    '.for{text-align:center;font-size:15px;color:var(--sub);margin:0 0 28px}',
    '.list{background:var(--fill);border-radius:18px;padding:4px 20px}',
    '.row{display:flex;justify-content:space-between;gap:16px;padding:14px 0;font-size:16px}',
    '.row+.row{border-top:1px solid #e5e5ea}',
    '.row span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.row.sum{font-weight:700}',
    '.note{text-align:center;font-size:15px;color:var(--sub);margin:20px 0 0}',
    '.small{font-size:12px;line-height:1.4;color:#86868b;margin-top:24px;text-align:center}',
    '.main{padding:44px 36px 36px;min-width:0}',
    /* Wallet: dunkle Fläche, in der sich die Förderungen sammeln */
    '.wallet{position:relative;background:#1d1d1f;color:#f5f5f7;padding:28px 24px;display:flex;flex-direction:column;gap:14px;min-width:0;overflow:hidden;order:-1}',
    '.wallet::before{content:"";position:absolute;inset:-40% -30% auto auto;width:360px;height:360px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--gold) 35%,transparent),transparent);pointer-events:none}',
    '.wallet.empty{display:none}',
    '.wh{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.wh span{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#a1a1a6}',
    '.count{background:var(--gold);color:#1d1d1f;border-radius:980px;padding:4px 10px;font-size:13px;font-weight:700;white-space:nowrap}',
    '.count.pop{animation:pop .5s cubic-bezier(.3,1.6,.5,1)}',
    '@keyframes pop{0%{transform:scale(.6)}100%{transform:scale(1)}}',
    '.passes{position:relative;display:flex;flex-wrap:wrap;gap:8px}',
    '.pass{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);border-radius:980px;padding:6px 11px;font-size:13px;line-height:1.3}',
    '.pass.ghost{display:none;background:transparent;border:1px dashed rgba(255,255,255,.16);color:#6e6e73;position:relative;overflow:hidden}',
    '.pass.ghost .dot{background:#48484a;box-shadow:none}',
    '.pass.ghost::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.07) 50%,transparent 70%);transform:translateX(-100%);animation:shimmer 2.4s infinite;animation-delay:var(--d,0ms)}',
    '@keyframes shimmer{to{transform:translateX(100%)}}',
    '.wh{min-height:26px}',
    '.pass .nm{min-width:0}',
    '.pass .amt{display:inline-block;margin-left:auto;padding-left:4px;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}',
    '.dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 10px var(--gold)}',
    '.pass.new{animation:arrive .7s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:var(--d,0ms)}',
    '@keyframes arrive{0%{opacity:0;transform:translateY(14px) scale(.94);box-shadow:0 0 0 0 transparent}60%{opacity:1;box-shadow:0 0 0 1px var(--gold),0 0 24px color-mix(in srgb,var(--gold) 45%,transparent)}100%{opacity:1;transform:none;box-shadow:0 0 0 0 transparent}}',
    '.locked{filter:blur(5px);user-select:none;letter-spacing:.05em}',
    '.wsum{position:relative;display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1px solid rgba(255,255,255,.12);padding-top:14px;font-weight:700}',
    '.wsum .amt{font-size:22px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.wnote{position:relative;margin:0;font-size:12px;color:#a1a1a6}',
    '.wallet.result{order:0}',
    '.wallet.result .reveal{animation:reveal .6s ease both;animation-delay:var(--d,0ms)}',
    '@keyframes reveal{from{filter:blur(6px);opacity:.3}to{filter:none;opacity:1}}',
    /* Breiter Container: Fragen links, Wallet rechts als Liste mit Beträgen */
    '@container (min-width:760px){.card{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}.wallet{order:0;padding:36px 28px;justify-content:flex-start}.wallet.empty{display:flex}',
    '.passes{flex-direction:column;flex-wrap:nowrap}.pass{padding:14px 16px;font-size:15px;border-radius:14px}.pass.ghost{display:flex}.pass .amt,.wsum{display:flex}.main{padding:48px 44px 40px}.empty-hint{margin-bottom:6px}}',
    '.wallet.result .passes{flex-direction:column;flex-wrap:nowrap}.wallet.result .pass{padding:14px 16px;font-size:15px;border-radius:14px}.wallet.result .pass .amt,.wallet.result .wsum{display:flex}',
    '.empty-hint{position:relative;margin:0;font-size:14px;color:#a1a1a6;line-height:1.45}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}',
    '@container (max-width:520px){.main{padding:32px 20px 24px}.card{border-radius:22px}h2{font-size:26px}h3{font-size:21px}.big{font-size:48px}.wallet{padding:20px}}'
  ].join('');

  function eur(n) {
    return new Intl.NumberFormat('de-LU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mount(host) {
    var root = host.attachShadow({ mode: 'open' });
    var state = { answers: {}, step: 0, view: 'steps', result: null, shown: {}, lastCount: 0 };

    function visibleSteps() {
      return STEPS.filter(function (s) { return !s.show || s.show(state.answers); });
    }

    function render() {
      var html = '<style>' + CSS + '</style><div class="card" part="card"><div class="main"><div class="view">';
      if (state.view === 'steps') html += renderStep();
      else if (state.view === 'gate') html += renderGate();
      else html += renderResult();
      root.innerHTML = html + '</div></div>' + renderWallet() + '</div>';
      bind();
      if (state.view === 'result') countUp();
    }

    // Förderungen, die nach den bisherigen Antworten schon feststehen (für die Wallet)
    function found() {
      var a = state.answers;
      if (state.view === 'result') return state.result.items;
      if (!a.building) return [];
      var r = calc.calculate({
        building: a.building, type: a.type || 'efh', units: a.units || 2, heating: a.heating || 'gas', pump: a.pump || 'air',
        oilTankRemoval: a.oilTankRemoval || 'no', waterProtectionZone: a.waterProtectionZone || 'no', energyManagement: a.energyManagement || 'no'
      });
      return r.items.filter(function (i) {
        if (i.key === 'adaptationBonus') return !!a.type;
        if (i.key === 'commune' || i.key === 'energySupplier') return !!a.heating;
        return true;
      });
    }

    function mask(n) { return eur(n).replace(/\d/g, '8'); }

    function renderWallet() {
      var items = found();
      var isResult = state.view === 'result';
      var total = items.reduce(function (s, i) { return s + i.amount; }, 0);
      var pop = items.length > state.lastCount ? ' pop' : '';
      state.lastCount = items.length;
      var fresh = 0;
      var h = '<aside class="wallet' + (items.length ? '' : ' empty') + (isResult ? ' result' : '') + '" aria-live="polite">';
      h += '<div class="wh"><span>' + T.walletTitle + '</span>' +
        (items.length ? '<b class="count' + pop + '">' + T.walletFound.replace('{n}', items.length) + '</b>' : '') + '</div>';
      if (!items.length) h += '<p class="empty-hint">' + T.walletEmpty + '</p>';
      h += '<div class="passes">';
      items.forEach(function (i, idx) {
        var isNew = !state.shown[i.key];
        state.shown[i.key] = true;
        var delay = isResult ? idx * 140 : (isNew ? fresh++ * 160 : 0);
        var amt = isResult
          ? '<span class="amt reveal" style="--d:' + delay + 'ms">' + eur(i.amount) + '</span>'
          : '<span class="amt locked" aria-label="gesperrt">' + mask(i.amount) + '</span>';
        h += '<div class="pass' + (isNew ? ' new' : '') + '" style="--d:' + delay + 'ms"><i class="dot"></i><span class="nm">' +
          T.items[i.key] + '</span>' + amt + '</div>';
      });
      if (!isResult) {
        for (var g = 0; g < Math.max(0, 6 - items.length); g++) {
          h += '<div class="pass ghost" style="--d:' + g * 300 + 'ms" aria-hidden="true"><i class="dot"></i><span class="nm">' + T.walletGhost + '</span></div>';
        }
      }
      h += '</div>';
      if (items.length) {
        h += '<div class="wsum"><span>' + T.walletSum + '</span>' + (isResult
          ? '<span class="amt" id="wsum">' + eur(total) + '</span>'
          : '<span class="amt locked">' + mask(total) + '</span>') + '</div>';
        if (!isResult) h += '<p class="wnote">' + T.walletLocked + '</p>';
      }
      return h + '</aside>';
    }

    // Summe im Ergebnis hochzählen lassen
    function countUp() {
      var els = [root.querySelector('.big'), root.querySelector('#wsum')].filter(Boolean);
      var target = state.result.total;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var start = null, dur = 1400;
      function frame(t) {
        if (start === null) start = t;
        var k = Math.min(1, (t - start) / dur);
        var v = Math.round(target * (1 - Math.pow(1 - k, 3)) / 50) * 50;
        els.forEach(function (el) { el.textContent = eur(k === 1 ? target : v); });
        if (k < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function logo() {
      return LOGO.indexOf('data:') === 0 ? '<img class="logo" src="' + LOGO + '" alt="' + esc(CONFIG.brand) + '">' : '';
    }

    function renderStep() {
      var steps = visibleSteps();
      var s = steps[state.step];
      var pct = Math.max(4, Math.round((state.step / (steps.length + 1)) * 100));
      var h = '';
      if (state.step === 0) h += logo() + '<p class="eyebrow">' + T.eyebrow + '</p><h2>' + T.title + '</h2><p class="lead">' + T.subtitle + '</p>';
      h += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
      h += '<h3>' + s.q + '</h3>' + (s.hint ? '<p class="hint">' + s.hint + '</p>' : '');
      if (s.input === 'number') {
        h += '<input type="number" min="2" max="200" inputmode="numeric" id="num" value="' + esc(state.answers[s.id] || '') + '" placeholder="z. B. 6">';
        h += '<div class="err" id="err"></div><button class="btn" id="next">' + T.next + '</button>';
      } else {
        h += '<div class="opts">' + s.options.map(function (o) {
          var sel = state.answers[s.id] === o[0] ? ' sel' : '';
          return '<button class="opt' + sel + '" data-v="' + o[0] + '"><span><strong>' + o[1] + '</strong>' +
            (o[2] ? '<small>' + o[2] + '</small>' : '') + '</span>' + CHEVRON + '</button>';
        }).join('') + '</div>';
      }
      h += '<div class="nav">' + (state.step > 0 ? '<button class="link" id="back">‹ ' + T.back + '</button>' : '') + '</div>';
      return h;
    }

    function renderGate() {
      return '<div class="bar"><i style="width:96%"></i></div>' +
        '<h3>' + T.gateTitle.replace('{n}', found().length) + '</h3><p class="hint">' + T.gateText + '</p>' +
        '<form id="gate" novalidate>' +
        '<input type="email" id="email" autocomplete="email" placeholder="' + T.email + '" required>' +
        '<div class="hp" aria-hidden="true"><input type="text" id="website" tabindex="-1" autocomplete="off"></div>' +
        '<label class="chk"><input type="checkbox" id="consent"><span>' +
        T.consent.replace('{brand}', esc(CONFIG.brand)).replace('{privacy}', esc(CONFIG.privacyUrl)) + '</span></label>' +
        '<div class="err" id="err"></div>' +
        '<button class="btn" type="submit" id="submit">' + T.submit + '</button></form>' +
        '<div class="nav"><button class="link" id="back">‹ ' + T.back + '</button></div>';
    }

    function renderResult() {
      var r = state.result;
      var h = logo() + '<p class="eyebrow">' + T.resultEyebrow + '</p>';
      h += '<p class="upto">' + T.upTo + '</p><div class="big">' + eur(r.total) + '</div>';
      h += '<p class="for">' + T.calcFor.replace('{pump}', T.pumps[r.pump]) + '</p>';
      h += '<p class="note">' + T.vat.replace('{amount}', eur(r.vatSaving)) + '</p>';
      if (r.unverified) h += '<p class="note">' + T.unverified + '</p>';
      h += '<a class="btn" href="' + esc(CONFIG.ctaUrl) + '" target="_top">' + esc(CONFIG.ctaLabel) + '</a>';
      h += '<div class="nav"><button class="link" id="restart">' + T.restart + '</button></div>';
      h += '<p class="small">' + T.commune + ' ' + T.disclaimer + '</p>';
      return h;
    }

    function $(sel) { return root.querySelector(sel); }

    function advance() {
      var steps = visibleSteps();
      if (state.step < steps.length - 1) state.step++;
      else state.view = 'gate';
      track(state.view === 'gate' ? 'calculator_complete' : 'calculator_step', { step: state.step });
      render();
    }

    function bind() {
      root.querySelectorAll('button.opt').forEach(function (b) {
        b.addEventListener('click', function () {
          var s = visibleSteps()[state.step];
          state.answers[s.id] = b.getAttribute('data-v');
          if (state.step === 0) track('calculator_start');
          advance();
        });
      });
      var back = $('#back');
      if (back) back.addEventListener('click', function () {
        if (state.view === 'gate') state.view = 'steps';
        else state.step = Math.max(0, state.step - 1);
        render();
      });
      var next = $('#next');
      if (next) next.addEventListener('click', function () {
        var v = parseInt($('#num').value, 10);
        if (isNaN(v) || v < 2 || v > 200) { $('#err').textContent = 'Bitte gib eine Zahl zwischen 2 und 200 ein.'; return; }
        state.answers[visibleSteps()[state.step].id] = v;
        advance();
      });
      var num = $('#num');
      if (num) {
        num.focus();
        num.addEventListener('keydown', function (e) { if (e.key === 'Enter') next.click(); });
      }
      var form = $('#gate');
      if (form) form.addEventListener('submit', onSubmit);
      var restart = $('#restart');
      if (restart) restart.addEventListener('click', function () {
        state = { answers: {}, step: 0, view: 'steps', result: null, shown: {}, lastCount: 0 };
        render();
      });
    }

    function onSubmit(e) {
      e.preventDefault();
      var email = $('#email').value.trim();
      var err = $('#err');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = T.emailInvalid; return; }
      if (!$('#consent').checked) { err.textContent = T.consentMissing; return; }
      var btn = $('#submit');
      btn.disabled = true;
      btn.textContent = T.sending;

      // Nur Antworten aus aktuell sichtbaren Schritten übernehmen
      var answers = {};
      visibleSteps().forEach(function (s) { answers[s.id] = state.answers[s.id]; });
      state.result = calc.calculate(answers);

      var payload = {
        email: email,
        consent: true,
        consentText: T.consent.replace(/<[^>]+>/g, '').replace('{brand}', CONFIG.brand),
        website: $('#website').value, // Honeypot
        answers: answers,
        result: { max: state.result.total, pump: state.result.pump },
        pageUrl: location.href,
        referrer: document.referrer,
        utm: utm(),
        createdAt: new Date().toISOString()
      };

      // Event für die einbettende Seite (z. B. Testmodus oder eigenes Tracking)
      host.dispatchEvent(new CustomEvent('hausman:lead', { detail: payload, bubbles: true }));

      // Ohne Endpoint (Testmodus) wird nichts gesendet.
      // text/plain vermeidet CORS-Preflight (wichtig für Google Apps Script).
      var send = CONFIG.endpoint && CONFIG.endpoint !== 'none'
        ? fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
        : Promise.resolve({ ok: true });
      send
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); })
        .catch(function (ex) { console.warn('[Förderrechner] Lead konnte nicht gespeichert werden:', ex); })
        .then(function () {
          track('generate_lead', { value: state.result.total, currency: 'EUR' });
          state.view = 'result';
          render();
          host.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    render();
  }

  function utm() {
    var p = new URLSearchParams(location.search), o = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach(function (k) {
      if (p.get(k)) o[k] = p.get(k);
    });
    return o;
  }

  // Tracking-Hooks: greifen automatisch, falls GA4/GTM bzw. Meta Pixel vorhanden sind
  function track(event, data) {
    data = data || {};
    try {
      if (window.dataLayer) window.dataLayer.push(Object.assign({ event: 'hm_' + event }, data));
      if (window.gtag) window.gtag('event', event, data);
      if (window.fbq && event === 'generate_lead') window.fbq('track', 'Lead', data);
    } catch (e) { /* Tracking darf den Rechner nie blockieren */ }
  }

  function init() {
    var host = document.querySelector(CONFIG.target);
    if (!host) { console.warn('[Förderrechner] Container ' + CONFIG.target + ' nicht gefunden.'); return; }
    if (host.shadowRoot) return;
    mount(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

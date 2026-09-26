/* Reglas del visor (también se usan en Node para pruebas).
   El digest diario reemplaza solo la línea `const DATA`; estas funciones
   se quedan y corrigen fotos, precios, fechas y "nuevo hoy" al cargar. */
(function (root) {
  var LIMA = 'America/Lima';
  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  function parseInstant(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      var dt = value.getTime();
      return isNaN(dt) ? null : dt;
    }
    if (typeof value === 'number') return isFinite(value) ? value : null;
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var noon = Date.parse(s + 'T12:00:00-05:00');
      return isNaN(noon) ? null : noon;
    }
    var t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  function limaDayKey(value) {
    var t = value instanceof Date ? value.getTime() : parseInstant(value);
    if (t == null || isNaN(t)) return '';
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: LIMA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(t));
    var y = '', m = '', d = '';
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'year') y = parts[i].value;
      else if (parts[i].type === 'month') m = parts[i].value;
      else if (parts[i].type === 'day') d = parts[i].value;
    }
    if (!y || !m || !d) return '';
    return y + '-' + m + '-' + d;
  }

  function isNewListing(listing, now) {
    if (!listing) return false;
    var fs = listing.first_seen_at || listing.firstSeenDate || listing.first_seen;
    var day = limaDayKey(fs);
    if (!day) return false;
    return day === limaDayKey(now || new Date());
  }

  function displayAmount(display) {
    var s = String(display || '').trim();
    if (!s) return null;
    if (/^(free|gratis)\b/i.test(s)) return 0;
    var m = s.match(/^(?:pen|s\/\.?)\s*([0-9][0-9.,]*)/i);
    if (!m) return null;
    var raw = m[1];
    if (/^\d{1,3}(,\d{3})+$/.test(raw)) return Number(raw.replace(/,/g, ''));
    if (/^\d+,\d{1,2}$/.test(raw)) return Number(raw.replace(',', '.'));
    var n = Number(raw.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  /* Free, en blanco, PEN0 y PEN1 (también "/ Month") = consultar, no regalado. */
  function isContactPrice(listing) {
    if (!listing) return true;
    var display = String(listing.price_display || '').trim();
    if (/^(free|gratis)\b/i.test(display)) return true;
    if (/^precio desconocido\b/i.test(display)) return true;
    var amount = displayAmount(display);
    if (amount != null) return amount <= 1;
    var sortNum = listing.sort_price == null || listing.sort_price === ''
      ? null
      : Number(listing.sort_price);
    if (sortNum != null && isFinite(sortNum)) return sortNum <= 1;
    if (listing.price_unknown) return true;
    if (!display) return true;
    return false;
  }

  function priceView(listing) {
    if (isContactPrice(listing)) {
      return { display: 'Precio desconocido', sort: null, unknown: true };
    }
    var sortNum = listing.sort_price == null || listing.sort_price === ''
      ? null
      : Number(listing.sort_price);
    return {
      display: listing.price_display,
      sort: isFinite(sortNum) ? sortNum : null,
      unknown: false
    };
  }

  function unitEn(name) {
    if (name === 'minute') return MIN;
    if (name === 'hour') return HOUR;
    if (name === 'day') return DAY;
    if (name === 'week') return 7 * DAY;
    if (name === 'month') return 30 * DAY;
    if (name === 'year') return 365 * DAY;
    return null;
  }

  function unitEs(name) {
    var n = String(name).toLowerCase();
    if (n.indexOf('minuto') === 0) return MIN;
    if (n.indexOf('hora') === 0) return HOUR;
    if (n.indexOf('d') === 0) return DAY;
    if (n.indexOf('semana') === 0) return 7 * DAY;
    if (n.indexOf('mes') === 0) return 30 * DAY;
    if (n.indexOf('a') === 0) return 365 * DAY;
    return null;
  }

  function relativePhraseToMs(phrase) {
    var p = String(phrase || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!p) return null;
    if (p === 'just now' || p === 'hoy' || p === 'today' || p === 'ahora' || p === 'hace un momento') return 0;
    if (p === 'yesterday' || p === 'ayer' || p === 'a day ago' || p === '1 day ago' ||
        p === 'hace un día' || p === 'hace un dia' || p === 'hace 1 día' || p === 'hace 1 dia') return DAY;
    var fixed = {
      'a minute ago': MIN,
      '1 minute ago': MIN,
      'an hour ago': HOUR,
      'a hour ago': HOUR,
      '1 hour ago': HOUR,
      'a week ago': 7 * DAY,
      '1 week ago': 7 * DAY,
      'a month ago': 30 * DAY,
      '1 month ago': 30 * DAY,
      'a year ago': 365 * DAY,
      '1 year ago': 365 * DAY
    };
    if (Object.prototype.hasOwnProperty.call(fixed, p)) return fixed[p];
    var m = p.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
    if (m) return Number(m[1]) * unitEn(m[2]);
    m = p.match(/^hace\s+(\d+|un|una)\s+(minuto|hora|d[ií]a|semana|mes|a[nñ]o)s?$/);
    if (m) {
      var n = (m[1] === 'un' || m[1] === 'una') ? 1 : Number(m[1]);
      var u = unitEs(m[2]);
      return u == null ? null : n * u;
    }
    return null;
  }

  /* "2 days ago in Tarapoto, SM" observado en scrapedAt. Precios y "in Ciudad" no son fechas. */
  function parseRelativeListed(text, scrapedAtMs) {
    if (text == null || scrapedAtMs == null) return null;
    var raw = String(text).trim();
    if (!raw) return null;
    var inIdx = raw.search(/\s+in\s+/i);
    var phrase = (inIdx >= 0 ? raw.slice(0, inIdx) : raw).trim();
    var delta = relativePhraseToMs(phrase);
    if (delta == null) return null;
    return scrapedAtMs - delta;
  }

  function isDatePhrase(text) {
    if (!text) return false;
    return parseRelativeListed(text, 0) != null;
  }

  function postedTime(listing) {
    if (!listing) return null;
    var text = listing.listed_text || listing.posted_text || '';
    var scraped = parseInstant(listing.scraped_at);
    if (text && scraped != null) {
      var rel = parseRelativeListed(text, scraped);
      if (rel != null) return rel;
      if (!isDatePhrase(text)) {
        /* Texto que no es fecha (PEN1, "in Tarapoto"): no usar un listed_at heredado. */
        if (String(text).trim()) return null;
      }
    }
    return parseInstant(listing.listed_at);
  }

  function chronoTime(listing) {
    var posted = postedTime(listing);
    if (posted != null) return posted;
    var seen = parseInstant(listing && listing.first_seen_at);
    if (seen != null) return seen;
    var scraped = parseInstant(listing && listing.scraped_at);
    return scraped == null ? 0 : scraped;
  }

  function formatLimaDate(ms) {
    try {
      return new Date(ms).toLocaleDateString('es-PE', {
        timeZone: LIMA,
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  function listedLabelText(listing) {
    var posted = postedTime(listing);
    var seen = parseInstant(listing && listing.first_seen_at);
    var bits = [];
    if (posted != null) bits.push('Publicado: ' + formatLimaDate(posted));
    if (seen != null) bits.push('Visto: ' + formatLimaDate(seen));
    return bits.join(' · ') || 'Fecha desconocida';
  }

  /* Avatares de Messenger/perfil: ~100px o cuadrados ~260px. Las fotos de anuncio son más grandes. */
  function isAvatarDimensions(w, h) {
    w = Number(w);
    h = Number(h);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return false;
    if (Math.max(w, h) <= 168) return true;
    if (Math.abs(w - h) <= 4 && Math.min(w, h) >= 220 && Math.max(w, h) <= 310) return true;
    return false;
  }

  function sizeM2(listing) {
    if (!listing) return null;
    if (listing.size_m2 != null && listing.size_m2 !== '' && isFinite(Number(listing.size_m2))) {
      return Number(listing.size_m2);
    }
    if (listing.size_ha != null && listing.size_ha !== '' && isFinite(Number(listing.size_ha))) {
      return Number(listing.size_ha) * 10000;
    }
    return null;
  }

  function sizeHa(listing) {
    if (!listing) return null;
    if (listing.size_ha != null && listing.size_ha !== '' && isFinite(Number(listing.size_ha))) {
      return Number(listing.size_ha);
    }
    var m2 = sizeM2(listing);
    return m2 == null ? null : m2 / 10000;
  }

  var api = {
    LIMA: LIMA,
    parseInstant: parseInstant,
    limaDayKey: limaDayKey,
    isNewListing: isNewListing,
    displayAmount: displayAmount,
    isContactPrice: isContactPrice,
    priceView: priceView,
    parseRelativeListed: parseRelativeListed,
    isDatePhrase: isDatePhrase,
    postedTime: postedTime,
    chronoTime: chronoTime,
    formatLimaDate: formatLimaDate,
    listedLabelText: listedLabelText,
    isAvatarDimensions: isAvatarDimensions,
    sizeM2: sizeM2,
    sizeHa: sizeHa
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  var g = root || (typeof globalThis !== 'undefined' ? globalThis : this);
  for (var k in api) {
    if (Object.prototype.hasOwnProperty.call(api, k)) g[k] = api[k];
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

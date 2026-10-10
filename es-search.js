/* Búsqueda en español para CompraTerrenos.pe (navegador + Node).
   - sin tildes / mayúsculas (ñ → n al plegar, igual en consulta y texto)
   - sinónimos y plurales (terreno/lote/solar, chacra/finca/fundo/parcela, casa/vivienda/quinta, ha/hectárea, m2/metros)
   - alias de lugares (Tarapoto ≈ La Banda de Shilcayo / Morales)
   - números: "20 mil", "s/ 20000", "20k", "menos de 20 mil", "1 ha", "500 m2"
   - tolerancia a errores comunes (terrno, moyobanba) contra un vocabulario conocido */
(function (root) {
  'use strict';
  function fold(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

  // grupos de sinónimos: cada término de la consulta coincide si el texto contiene CUALQUIER variante
  var GROUPS = [
    { k: 'terreno', v: ['terreno', 'terrenos', 'lote', 'lotes', 'solar', 'solares', 'parcela', 'parcelas', 'predio', 'predios'], tipos: ['terreno', 'lote'] },
    { k: 'lote', v: ['lote', 'lotes', 'terreno', 'terrenos', 'solar', 'solares'], tipos: ['lote', 'terreno'] },
    { k: 'solar', v: ['solar', 'solares', 'lote', 'lotes', 'terreno', 'terrenos'], tipos: ['lote', 'terreno'] },
    { k: 'chacra', v: ['chacra', 'chacras', 'finca', 'fincas', 'fundo', 'fundos', 'parcela', 'parcelas'], tipos: ['chacra', 'finca'] },
    { k: 'finca', v: ['finca', 'fincas', 'fundo', 'fundos', 'chacra', 'chacras', 'hacienda'], tipos: ['finca', 'chacra'] },
    { k: 'fundo', v: ['fundo', 'fundos', 'finca', 'fincas', 'chacra', 'chacras', 'hacienda'], tipos: ['finca', 'chacra'] },
    { k: 'parcela', v: ['parcela', 'parcelas', 'chacra', 'chacras', 'finca', 'fundo', 'lote', 'lotes', 'terreno'], tipos: ['chacra', 'finca', 'lote', 'terreno'] },
    { k: 'casa', v: ['casa', 'casas', 'vivienda', 'viviendas', 'casa de campo', 'quinta', 'quintas', 'departamento'], tipos: ['casa', 'casa con terreno', 'quinta/casa de campo', 'departamento'] },
    { k: 'vivienda', v: ['vivienda', 'viviendas', 'casa', 'casas'], tipos: ['casa', 'casa con terreno', 'quinta/casa de campo'] },
    { k: 'quinta', v: ['quinta', 'quintas', 'casa de campo', 'casas de campo', 'casa campo'], tipos: ['quinta/casa de campo'] },
    { k: 'hectarea', v: ['hectarea', 'hectareas', ' ha ', ' has ', 'ha.', 'hec'], tipos: null },
    { k: 'metro', v: ['m2', 'mt2', 'mts', 'metros', 'metro', 'm²'], tipos: null },
    { k: 'tarapoto', v: ['tarapoto', 'banda de shilcayo', 'banda shilcayo', 'shilcayo', 'morales', 'cacatachi'], tipos: null },
    { k: 'banda de shilcayo', v: ['banda de shilcayo', 'banda shilcayo', 'shilcayo'], tipos: null },
    { k: 'moyobamba', v: ['moyobamba', 'yantalo', 'calzada', 'jepelacio'], tipos: null },
    { k: 'lamas', v: ['lamas', 'cunumbuqui', 'rumisapa', 'cumbaza', 'tabalosos'], tipos: null },
    { k: 'rioja', v: ['rioja', 'nueva cajamarca', 'segunda jerusalen', 'elias soplin'], tipos: null },
    { k: 'yurimaguas', v: ['yurimaguas'], tipos: null },
    { k: 'juanjui', v: ['juanjui'], tipos: null },
    { k: 'chachapoyas', v: ['chachapoyas'], tipos: null },
    { k: 'san martin', v: ['san martin', ', sm', 'tarapoto', 'moyobamba', 'lamas', 'rioja', 'juanjui'], tipos: null },
    { k: 'barato', v: [], tipos: null, cheap: true }
  ];
  // alias simples → clave de grupo (plurales, femeninos, variantes)
  var ALIAS = { terrenos: 'terreno', lotes: 'lote', solares: 'solar', chacras: 'chacra', fincas: 'finca', fundos: 'fundo', parcelas: 'parcela', casas: 'casa',
    viviendas: 'vivienda', quintas: 'quinta', hectareas: 'hectarea', ha: 'hectarea', has: 'hectarea', hect: 'hectarea', m2: 'metro', mt2: 'metro', mts: 'metro', metros: 'metro', 'm²': 'metro',
    baratos: 'barato', barata: 'barato', baratas: 'barato', economico: 'barato', economicos: 'barato', remate: 'barato', ocasion: 'barato',
    shilcayo: 'banda de shilcayo', tpp: 'tarapoto', moyo: 'moyobamba' };
  var GBYK = {}; GROUPS.forEach(function (g) { GBYK[g.k] = g; });
  // palabras vacías (no restringen): "terrenos en venta en tarapoto"
  var STOP = { en: 1, de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, y: 1, a: 1, con: 1, para: 1, por: 1, un: 1, una: 1, venta: 1, vendo: 1, vende: 1, se: 1, compra: 1, comprar: 1, precio: 1, soles: 1, sol: 1, s: 1, 's/': 1, pen: 1, 'cerca': 1 };
  // multi-palabra (se detectan antes de partir)
  var PHRASES = [['banda de shilcayo', 'banda de shilcayo'], ['la banda', 'banda de shilcayo'], ['casa de campo', 'quinta'], ['san martin', 'san martin'], ['nueva cajamarca', 'rioja']];

  var VOCAB = Object.keys(ALIAS).concat(GROUPS.map(function (g) { return g.k; })).filter(function (w) { return w.indexOf(' ') < 0 && w.length >= 4; });
  function dist(a, b, max) { // Damerau-Levenshtein (transposiciones), corta si supera max
    var m = a.length, n = b.length; if (Math.abs(m - n) > max) return max + 1;
    var d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) { var best = 1e9; for (j = 1; j <= n; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      if (d[i][j] < best) best = d[i][j]; } if (best > max) return max + 1; }
    return d[m][n];
  }
  function fuzzyKey(w) {
    if (w.length < 4) return null;
    var max = w.length >= 8 ? 2 : 1, hit = null, hd = 9;
    for (var i = 0; i < VOCAB.length; i++) { var dd = dist(w, VOCAB[i], max); if (dd <= max && dd < hd) { hd = dd; hit = VOCAB[i]; } }
    return hit ? (ALIAS[hit] || hit) : null;
  }
  function amount(n, unit) { n = parseFloat(String(n).replace(/,/g, '')); if (!isFinite(n)) return null; if (/^(mil|k)$/.test(unit || '')) n *= 1000; return n; }

  function parse(q) {
    var s = ' ' + fold(q).replace(/[“”"¿?¡!]/g, ' ') + ' ';
    var out = { terms: [], groups: [], priceMax: null, priceMin: null, sizeM2: null, cheap: false, raw: q };
    // precio: "menos de 20 mil", "hasta s/ 20000", "mas de 50 mil", "20 mil", "s/ 20000", "20k"
    s = s.replace(/(menos de|hasta|maximo|max\.?|bajo|debajo de|mas de|desde|minimo|min\.?)?\s*(?:s\/\.?|soles|pen)?\s*(\d[\d.,]*)\s*(mil|k)?\s*(soles|s\/)?(?=\s)/g, function (m, op, n, unit, cur) {
      var hasCur = /s\/|soles|pen/.test(m), raw = n.replace(/[.,](?=\d{3}\b)/g, '');
      var v = amount(raw, unit);
      if (v == null) return m;
      if (!unit && !hasCur && !op) return m; // número suelto (p. ej. "7x14", "1 ha") → lo ve el parser de tamaño
      if (!unit && !hasCur && v < 1000) return m;
      if (/mas de|desde|minimo|min/.test(op || '')) out.priceMin = v;
      else if (op) out.priceMax = v;
      else { out.priceMax = Math.round(v * 1.15); out.priceMin = Math.round(v * 0.6); } // "lotes 20 mil" ≈ alrededor de 20 mil
      return ' ';
    });
    // tamaño: "1 ha", "2.5 hectareas", "500 m2", "300 metros"
    s = s.replace(/(\d[\d.,]*)\s*(ha|has|hectareas?|hect|m2|mt2|mts2?|metros?(?: cuadrados)?|m²)(?=\s|\.)/g, function (m, n, u) {
      var v = parseFloat(n.replace(/,/g, '.')); if (!isFinite(v)) return m;
      out.sizeM2 = /^h/.test(u) ? v * 10000 : v; return ' ';
    });
    PHRASES.forEach(function (p) { if (s.indexOf(' ' + p[0] + ' ') >= 0) { s = s.split(' ' + p[0] + ' ').join(' '); pushGroup(out, p[1]); } });
    s.split(/[\s,;/]+/).forEach(function (w) {
      w = w.replace(/^[^a-z0-9ñ]+|[^a-z0-9ñ]+$/g, ''); if (!w || STOP[w]) return;
      var key = GBYK[w] ? w : ALIAS[w] || null;
      if (!key && w.length > 4 && /s$/.test(w) && GBYK[w.slice(0, -1)]) key = w.slice(0, -1);
      if (!key && !/\d/.test(w)) key = fuzzyKey(w);
      if (key) pushGroup(out, key); else out.terms.push(w.length > 4 ? w.replace(/(es|s)$/, '') : w); // plural genérico
    });
    return out;
  }
  function pushGroup(out, key) { var g = GBYK[key]; if (!g) return; if (g.cheap) { out.cheap = true; return; } if (out.groups.indexOf(g) < 0) out.groups.push(g); }
  function isEmpty(p) { return !p || (!p.terms.length && !p.groups.length && p.priceMax == null && p.priceMin == null && p.sizeM2 == null && !p.cheap); }

  // hay: texto plegado del anuncio · price: precio en soles (o null) · m2: tamaño en m² (o null) · tipo: l.tipo
  function match(p, hay, price, m2, tipo) {
    var h = ' ' + hay + ' ';
    for (var i = 0; i < p.groups.length; i++) {
      var g = p.groups[i], ok = g.tipos && tipo && g.tipos.indexOf(tipo) >= 0;
      for (var j = 0; !ok && j < g.v.length; j++) ok = h.indexOf(g.v[j]) >= 0;
      if (!ok) return false;
    }
    for (i = 0; i < p.terms.length; i++) if (h.indexOf(p.terms[i]) < 0) return false;
    if (p.priceMax != null && (price == null || price > p.priceMax)) return false;
    if (p.priceMin != null && (price == null || price < p.priceMin)) return false;
    if (p.sizeM2 != null && (m2 == null || m2 < p.sizeM2 * 0.8 || m2 > p.sizeM2 * 1.25)) return false;
    return true;
  }
  function describe(p) {
    var bits = [];
    p.groups.forEach(function (g) { bits.push(g.k); }); p.terms.forEach(function (t) { bits.push('“' + t + '”'); });
    var f = function (n) { return 'S/ ' + Math.round(n).toLocaleString('es-PE'); };
    if (p.priceMin != null && p.priceMax != null) bits.push(f(p.priceMin) + '–' + f(p.priceMax));
    else if (p.priceMax != null) bits.push('hasta ' + f(p.priceMax)); else if (p.priceMin != null) bits.push('desde ' + f(p.priceMin));
    if (p.sizeM2 != null) bits.push(p.sizeM2 >= 10000 ? '≈' + (p.sizeM2 / 10000) + ' ha' : '≈' + p.sizeM2 + ' m²');
    if (p.cheap) bits.push('baratos (más baratos primero)');
    return bits.join(' · ');
  }
  var api = { fold: fold, parse: parse, match: match, isEmpty: isEmpty, describe: describe, _dist: dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ESSearch = api;
})(this);

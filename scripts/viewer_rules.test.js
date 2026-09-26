const assert = require('assert');
const r = require('../viewer-rules.js');

function t(name, fn) {
  try {
    fn();
    console.log('ok', name);
  } catch (e) {
    console.error('FAIL', name);
    throw e;
  }
}

t('lima day shifts before 05:00 UTC', () => {
  assert.strictEqual(r.limaDayKey('2026-09-26T03:00:00.000Z'), '2026-09-25');
  assert.strictEqual(r.limaDayKey('2026-09-26T05:00:00.000Z'), '2026-09-26');
  assert.strictEqual(r.limaDayKey('2026-09-26T13:34:45.745Z'), '2026-09-26');
  assert.strictEqual(r.limaDayKey('2026-09-26'), '2026-09-26');
});

t('nuevo is current Lima day of first_seen, not the baked flag', () => {
  const listing = {
    first_seen_at: '2026-09-26T13:34:45.745Z',
    is_new: true
  };
  const morningAfter = new Date('2026-09-27T02:30:00.000Z'); // 21:30 Lima del 26
  const nextMorning = new Date('2026-09-27T13:00:00.000Z'); // 08:00 Lima del 27
  assert.strictEqual(r.isNewListing(listing, morningAfter), true);
  assert.strictEqual(r.isNewListing(listing, nextMorning), false);
  assert.strictEqual(r.isNewListing({ is_new: true }, nextMorning), false);
  assert.strictEqual(r.isNewListing({
    first_seen_at: '2026-09-27T02:00:00.000Z',
    is_new: true
  }, nextMorning), false);
});

t('PEN0 PEN1 Free and blank are unknown, real prices are not', () => {
  for (const display of ['Free', 'FREE', 'Gratis', 'PEN0', 'PEN1', 'PEN 1', 'PEN1 / Month', 'FREE / Month', 'S/1', 'Precio desconocido']) {
    assert.strictEqual(r.isContactPrice({ price_display: display, sort_price: 1, price_unknown: false }), true, display);
  }
  assert.strictEqual(r.isContactPrice({ price_display: '', sort_price: null, price_unknown: false }), true);
  assert.strictEqual(r.isContactPrice({ price_display: 'PEN0', sort_price: 0 }), true);
  for (const display of ['PEN10', 'PEN15', 'PEN18,000', 'PEN50,000', 'PEN1,000', 'PEN100,000', 'PEN25']) {
    const view = r.priceView({ price_display: display, sort_price: r.displayAmount(display), price_unknown: false });
    assert.strictEqual(view.unknown, false, display);
    assert.ok(view.sort > 1, display + ' sort ' + view.sort);
  }
  const pen1 = r.priceView({ price_display: 'PEN1', sort_price: 1, price_unknown: false });
  assert.strictEqual(pen1.unknown, true);
  assert.strictEqual(pen1.sort, null);
  assert.strictEqual(pen1.display, 'Precio desconocido');
});

t('relative Facebook dates sort chronologically and ignore prices', () => {
  const scraped = Date.parse('2026-09-26T13:41:06.689Z');
  const week = r.parseRelativeListed('a week ago in Tarapoto, SM', scraped);
  const twoDays = r.parseRelativeListed('2 days ago in La Banda de Shilcayo, SM', scraped);
  const hours = r.parseRelativeListed('20 hours ago in La Banda de Shilcayo, SM', scraped);
  assert.ok(week < twoDays && twoDays < hours && hours < scraped);
  assert.strictEqual(r.parseRelativeListed('PEN1', scraped), null);
  assert.strictEqual(r.parseRelativeListed('PEN55,000', scraped), null);
  assert.strictEqual(r.parseRelativeListed('in Tarapoto, SM', scraped), null);
  assert.strictEqual(r.parseRelativeListed('FREE', scraped), null);
  const older = { listed_text: '11 weeks ago in Lamas, SM', scraped_at: '2026-09-26T13:41:06.689Z', first_seen_at: '2026-09-26T13:34:45.745Z' };
  const newer = { listed_text: 'a day ago in Tarapoto, SM', scraped_at: '2026-09-26T13:41:06.689Z', first_seen_at: '2026-09-20T14:00:00.000Z' };
  assert.ok(r.chronoTime(newer) > r.chronoTime(older));
  assert.ok(r.listedLabelText(older).indexOf('Publicado:') === 0);
  assert.ok(r.listedLabelText(older).indexOf('PEN') === -1);
  const noDate = { listed_text: 'PEN1', scraped_at: '2026-09-26T13:41:06.689Z', first_seen_at: '2026-09-12T12:00:00.000Z' };
  assert.strictEqual(r.postedTime(noDate), null);
  assert.ok(r.listedLabelText(noDate).indexOf('Visto:') === 0);
});

t('ISO timestamps with and without milliseconds compare as time', () => {
  const a = r.parseInstant('2026-09-15T13:57:00Z');
  const b = r.parseInstant('2026-09-15T13:57:00.000Z');
  const c = r.parseInstant('2026-09-15T21:32:03.038Z');
  assert.strictEqual(a, b);
  assert.ok(c > a);
  const rows = [
    { scraped_at: '2026-09-15T13:57:00Z', first_seen_at: '2026-09-15T13:57:00Z' },
    { scraped_at: '2026-09-15T21:32:03.038Z', first_seen_at: '2026-09-15T21:32:03.038Z' }
  ];
  rows.sort((x, y) => r.chronoTime(y) - r.chronoTime(x));
  assert.strictEqual(rows[0].scraped_at, '2026-09-15T21:32:03.038Z');
});

t('avatar dimensions are messenger/profile sizes only', () => {
  assert.strictEqual(r.isAvatarDimensions(100, 100), true);
  assert.strictEqual(r.isAvatarDimensions(100, 101), true);
  assert.strictEqual(r.isAvatarDimensions(260, 260), true);
  assert.strictEqual(r.isAvatarDimensions(261, 261), true);
  assert.strictEqual(r.isAvatarDimensions(960, 720), false);
  assert.strictEqual(r.isAvatarDimensions(960, 960), false);
  assert.strictEqual(r.isAvatarDimensions(768, 960), false);
  assert.strictEqual(r.isAvatarDimensions(540, 960), false);
});

t('size filters can use either m2 or ha', () => {
  assert.strictEqual(r.sizeM2({ size_ha: 1.5, size_m2: null }), 15000);
  assert.strictEqual(r.sizeHa({ size_m2: 500, size_ha: null }), 0.05);
  assert.strictEqual(r.sizeM2({ size_m2: 200, size_ha: 1.5 }), 200);
});

console.log('all tests passed');

/* Adaptador de envíos de CompraTerrenos.pe (anuncios, pagos de planes).
   Hoy: LocalAdapter guarda en localStorage y muestra "Próximamente".
   Mañana: SupabaseAdapter (ver supabase/schema.sql). Para activarlo, define antes de este script:
     window.CT_BACKEND = { kind: 'supabase', url: 'https://<proyecto>.supabase.co', anonKey: '<anon key>' };
   y carga @supabase/supabase-js. La interfaz es la misma: submitListing(data, files), submitPayment(data, file). */
(function () {
  var KEY = 'compraTerrenosOutboxV1';
  function readOutbox() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
  function fileMeta(f) { return f ? { name: f.name, size: f.size, type: f.type } : null; }
  function newId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

  var LocalAdapter = {
    kind: 'local',
    submitListing: function (data, files) {
      var rec = { id: newId('anuncio'), kind: 'listing', status: 'pendiente', created_at: new Date().toISOString(), data: data, photos: (files || []).map(fileMeta) };
      var box = readOutbox(); box.push(rec); localStorage.setItem(KEY, JSON.stringify(box));
      return Promise.resolve({ ok: true, id: rec.id, pending: true });
    },
    submitPayment: function (data, file) {
      var rec = { id: newId('pago'), kind: 'payment', status: 'por_revisar', created_at: new Date().toISOString(), data: data, comprobante: fileMeta(file) };
      var box = readOutbox(); box.push(rec); localStorage.setItem(KEY, JSON.stringify(box));
      return Promise.resolve({ ok: true, id: rec.id, pending: true });
    },
    outbox: readOutbox,
  };

  // Esqueleto: se completa cuando exista el proyecto Supabase (sin llamadas de red hoy).
  function SupabaseAdapter(cfg) {
    var client = window.supabase && window.supabase.createClient(cfg.url, cfg.anonKey);
    return {
      kind: 'supabase',
      submitListing: async function (data, files) {
        var up = [];
        for (var i = 0; i < files.length; i++) {
          var path = 'pendientes/' + newId('f') + '-' + files[i].name;
          var r = await client.storage.from('fotos').upload(path, files[i]); if (r.error) throw r.error; up.push(path);
        }
        var ins = await client.from('listings').insert({ source: 'web', status: 'pendiente', title: data.titulo, tipo: data.tipo, price_pen: data.precio, size_m2: data.size_m2,
          location_text: data.ubicacion, reference: data.referencia, lat: data.lat, lng: data.lng, description: data.descripcion, whatsapp: data.whatsapp,
          partida: data.partida || null, legal_status: data.estado_legal, photo_paths: up }).select('id').single();
        if (ins.error) throw ins.error; return { ok: true, id: ins.data.id, pending: true };
      },
      submitPayment: async function (data, file) {
        var path = 'comprobantes/' + data.reference + '-' + file.name;
        var r = await client.storage.from('comprobantes').upload(path, file); if (r.error) throw r.error;
        var ins = await client.from('payments').insert({ reference: data.reference, plan_id: data.plan, amount_pen: data.amount, method: 'yape_plin', listing_ref: data.listing, whatsapp: data.whatsapp, receipt_path: path, status: 'por_revisar' }).select('id').single();
        if (ins.error) throw ins.error; return { ok: true, id: ins.data.id, pending: true };
      },
    };
  }
  var cfg = window.CT_BACKEND;
  window.CTBackend = cfg && cfg.kind === 'supabase' && window.supabase ? SupabaseAdapter(cfg) : LocalAdapter;
  window.CTProximamente = function (el, title, text) {
    el.hidden = false;
    el.innerHTML = '<div class="box warn"><b>' + title + '</b><br>' + text + '<br><span class="note">Próximamente: por ahora tu envío queda guardado solo en este navegador y aún no llega a nuestro equipo.</span></div>';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
})();

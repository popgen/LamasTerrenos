(function () {
  var PLANS = { dest7: ['Destacado + partida verificada · 7 días', 19], dest30: ['Destacado + partida verificada · 30 días', 49], portada7: ['Portada · 7 días', 39], renovar: ['Renovar', 5], pack: ['Pack Inmobiliaria · mensual', 149] };
  var chosen = null, ref = null;
  function refCode() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'CT-'; for (var i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  document.getElementById('plans').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]'); if (!b) return;
    chosen = b.getAttribute('data-pick'); ref = refCode();
    document.querySelectorAll('.plan').forEach(function (p) { p.classList.toggle('sel', p.getAttribute('data-plan') === chosen); });
    document.getElementById('payPlan').textContent = PLANS[chosen][0];
    document.getElementById('payAmount').textContent = 'S/ ' + PLANS[chosen][1];
    document.getElementById('payRef').textContent = ref;
    var st = document.getElementById('payStep'); st.hidden = false; st.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  var form = document.getElementById('payForm'), err = document.getElementById('payErr');
  var q = new URLSearchParams(location.search); if (q.get('anuncio')) form.listing.value = q.get('anuncio');
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var e = [];
    if (!form.listing.value.trim()) e.push('Indica tu anuncio.');
    if (!/^\+?[\d\s]{9,15}$/.test(form.whatsapp.value.trim())) e.push('Escribe un WhatsApp válido.');
    if (!form.comprobante.files.length) e.push('Sube la foto del comprobante.');
    err.innerHTML = e.map(function (x) { return '• ' + x; }).join('<br>'); if (e.length) return;
    window.CTBackend.submitPayment({ plan: chosen, amount: PLANS[chosen][1], reference: ref, listing: form.listing.value.trim(), whatsapp: form.whatsapp.value.trim() }, form.comprobante.files[0]).then(function (r) {
      form.hidden = true;
      CTProximamente(document.getElementById('payDone'), 'Comprobante recibido · referencia ' + ref, 'Activaremos tu plan cuando confirmemos el pago.');
    });
  });
})();

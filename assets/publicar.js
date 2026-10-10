(function () {
  var form = document.getElementById('pubForm'), err = document.getElementById('pubErr');
  var pin = null, marker = null;
  if (window.L) {
    var m = L.map('pinMap').setView([-9.19, -75.02], 5);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }).addTo(m);
    m.on('click', function (e) {
      pin = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) };
      if (marker) marker.setLatLng(e.latlng); else marker = L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 2, fillColor: '#e8590c', fillOpacity: 1 }).addTo(m);
      document.getElementById('pinTxt').textContent = 'Pin: ' + pin.lat + ', ' + pin.lng;
    });
  }
  form.fotos.addEventListener('change', function () {
    var t = document.getElementById('thumbs'); t.innerHTML = '';
    [].slice.call(form.fotos.files, 0, 12).forEach(function (f) { var i = document.createElement('img'); i.src = URL.createObjectURL(f); t.appendChild(i); });
  });
  function validate() {
    var e = [];
    if (form.titulo.value.trim().length < 10) e.push('Escribe un título de al menos 10 caracteres.');
    if (!form.tipo.value) e.push('Elige el tipo.');
    var precio = Number(form.precio.value), tam = Number(form.tamano.value);
    var m2 = form.unidad.value === 'ha' ? tam * 10000 : tam;
    if (!(precio >= 100)) e.push('Pon un precio real en soles (no 0, 1 ni “consultar”).');
    else if (m2 >= 1000 && precio < 1000) e.push('El precio parece demasiado bajo para ese tamaño. Pon el precio total del terreno.');
    if (!(tam > 0)) e.push('Indica el tamaño.');
    if (!form.ubicacion.value.trim()) e.push('Indica la ubicación.');
    if (form.descripcion.value.trim().length < 30) e.push('La descripción debe tener al menos 30 caracteres.');
    if (form.fotos.files.length < 3) e.push('Sube al menos 3 fotos.');
    if (!/^\+?[\d\s]{9,15}$/.test(form.whatsapp.value.trim())) e.push('Escribe un número de WhatsApp válido.');
    if (form.partida.value && !/^\d{6,12}$/.test(form.partida.value.trim())) e.push('El número de partida debe tener solo dígitos (6 a 12).');
    if (!form.estado_legal.value) e.push('Elige el estado legal.');
    return { errors: e, m2: m2, precio: precio };
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = validate();
    err.innerHTML = v.errors.map(function (x) { return '• ' + x; }).join('<br>');
    if (v.errors.length) { err.scrollIntoView({ block: 'center' }); return; }
    var data = { titulo: form.titulo.value.trim(), tipo: form.tipo.value, precio: v.precio, size_m2: v.m2, ubicacion: form.ubicacion.value.trim(), referencia: form.referencia.value.trim(),
      lat: pin && pin.lat, lng: pin && pin.lng, descripcion: form.descripcion.value.trim(), whatsapp: form.whatsapp.value.trim(), partida: form.partida.value.trim(), estado_legal: form.estado_legal.value };
    window.CTBackend.submitListing(data, [].slice.call(form.fotos.files)).then(function (r) {
      form.hidden = true;
      CTProximamente(document.getElementById('pubDone'), '¡Gracias! Recibimos tu anuncio (' + r.id + ').', 'Lo revisaremos antes de publicarlo. ¿Quieres más visitas? <a href="destacar.html">Destaca tu anuncio</a>.');
    }).catch(function (e) { err.textContent = 'No se pudo enviar: ' + (e.message || e); });
  });
})();

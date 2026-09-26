# LamasTerrenos

Sitio estático de terrenos de Facebook Marketplace cerca de Lamas (Hostinger publica `main` en https://bienvenidoalamas.com).

## Fotos

Cada anuncio solo debe mostrar JPEGs de **su** ficha en `listings/<id>/`. El scrape también guardaba la cara de Messenger/perfil (unos 100×100 o 260×260 px) y miniaturas repetidas de otros anuncios. Esas imágenes se eliminan con:

```bash
python3 scripts/sanitize_listing_photos.py
```

El visor, además, descarta en el navegador cualquier imagen que cargue con tamaño de avatar, aunque un digest futuro vuelva a enlazarla.

## Fechas y «nuevos de hoy»

Un anuncio es **Nuevo** si `first_seen_at` (en `known-ids.json`) cae en el día civil **actual** de `America/Lima`, no según una marca `is_new` congelada en el digest. Después de medianoche en Perú las chapas y el filtro «Solo nuevos de hoy» se actualizan solos.

Si Facebook trae un texto tipo `2 days ago in Tarapoto`, se guarda `listed_at` y se ordena por ese instante. `PEN1`, `FREE` o `in Tarapoto` no son fechas. Free, en blanco, PEN0 y PEN1 son **precio desconocido**, no terreno gratis.

## Cómo comprobar en https://bienvenidoalamas.com después del deploy

1. Recarga forzada (Ctrl+F5). El pie debe decir la hora de Perú y «N nuevo(s) hoy (Perú)».
2. Abre varios anuncios, sobre todo uno que antes mostraba una cara. La miniatura y la ficha solo tienen fotos de ese terreno, o el texto «Sin fotos del anuncio». No debe repetirse el mismo rostro en fichas distintas.
3. En la ficha, las flechas de foto y Anterior/Siguiente recorren solo el filtro activo. El bloque Vendedor aparece si hay nombre.
4. Filtros → Novedad → «Solo nuevos de hoy». La lista y los pines verdes son únicamente anuncios vistos por primera vez hoy en Perú. Mañana, antes del digest, esos mismos anuncios ya no deben salir.
5. Orden «Precio ↑»: los primeros precios son montos reales. PEN1 / Gratis no encabezan la lista; dicen «Precio desconocido».
6. Orden «Más reciente»: un anuncio «hace 11 semanas» queda detrás de uno «hace 1 día», aunque se haya vuelto a scrapear hoy.

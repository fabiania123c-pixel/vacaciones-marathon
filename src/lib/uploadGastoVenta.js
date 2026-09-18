import { supabase } from '../supabaseClient'

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Sube el resultado de parseGastoVentaFile a Supabase:
 * 1) upsert de tiendas (catálogo)
 * 2) upsert de gasto por tienda+período+categoría
 * 3) upsert del resumen precalculado por tienda+período (lo que lee el dashboard)
 * 4) registro en gv_uploads con el resumen de la carga
 */
export async function uploadGastoVenta(parsed, userId, onProgress) {
  const notify = (msg) => onProgress && onProgress(msg)

  // 1) Tiendas — upsert por nombre, traemos los ids de vuelta.
  notify('Guardando catálogo de tiendas…')
  const tiendaIdByNombre = new Map()
  for (const grupo of chunk(parsed.tiendas, 200)) {
    const { data, error } = await supabase
      .from('gv_tiendas')
      .upsert(grupo.map((t) => ({
        nombre: t.nombre,
        tipo: t.tipo,
        provincia: t.provincia,
        pais: t.pais,
        metraje: t.metraje,
      })), { onConflict: 'nombre' })
      .select('id, nombre')
    if (error) throw error
    data.forEach((row) => tiendaIdByNombre.set(row.nombre, row.id))
  }
  // Algunas tiendas pudieron ya existir sin cambios y no volver en el select
  // según el driver; nos aseguramos con un select final si falta alguna.
  const faltantes = parsed.tiendas.map((t) => t.nombre).filter((n) => !tiendaIdByNombre.has(n))
  if (faltantes.length > 0) {
    const { data, error } = await supabase.from('gv_tiendas').select('id, nombre').in('nombre', faltantes)
    if (error) throw error
    data.forEach((row) => tiendaIdByNombre.set(row.nombre, row.id))
  }

  // 2) Gasto por categoría
  notify(`Guardando gasto detallado (${parsed.gastoDetalle.length} combinaciones tienda/mes/rubro)…`)
  const gastoRows = parsed.gastoDetalle
    .map((g) => ({
      tienda_id: tiendaIdByNombre.get(g.tienda),
      periodo: g.periodo,
      categoria_rubro: g.categoria,
      importe: g.importe,
      moneda: 'USD',
    }))
    .filter((g) => g.tienda_id)
  for (const grupo of chunk(gastoRows, 500)) {
    const { error } = await supabase
      .from('gv_gasto_mensual')
      .upsert(grupo, { onConflict: 'tienda_id,periodo,categoria_rubro' })
    if (error) throw error
  }

  // 3) Resumen precalculado
  notify(`Guardando resumen por tienda y mes (${parsed.resumen.length} filas)…`)
  const resumenRows = parsed.resumen
    .map((r) => ({
      tienda_id: tiendaIdByNombre.get(r.tienda),
      periodo: r.periodo,
      gasto_total: r.gastoTotal,
      venta: r.venta,
      hc: r.hc,
      ratio_pct: r.ratioPct,
    }))
    .filter((r) => r.tienda_id)
  for (const grupo of chunk(resumenRows, 500)) {
    const { error } = await supabase
      .from('gv_resumen_mensual')
      .upsert(grupo, { onConflict: 'tienda_id,periodo' })
    if (error) throw error
  }

  // 4) Registro de la carga
  notify('Registrando la carga…')
  const ultimoPeriodo = parsed.resumen.reduce((max, r) => (r.periodo > max ? r.periodo : max), '0000-00-00')
  const { error: upErr } = await supabase.from('gv_uploads').insert({
    periodo: ultimoPeriodo,
    source_file: parsed.sourceFile,
    n_filas: parsed.stats.nFilas,
    n_tiendas: parsed.stats.nTiendas,
    n_tiendas_sin_venta: parsed.stats.nTiendaPeriodoSinVenta,
    importe_periodo_no_asignado: parsed.stats.importeRecuperado,
    uploaded_by: userId || null,
  })
  if (upErr) throw upErr

  return {
    ultimoPeriodo,
    nTiendas: parsed.stats.nTiendas,
    nFilas: parsed.stats.nFilas,
    nTiendasSinVenta: parsed.stats.nTiendaPeriodoSinVenta,
    importeRecuperado: parsed.stats.importeRecuperado,
  }
}
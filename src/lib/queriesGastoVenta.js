import { supabase } from '../supabaseClient'

// Mismo criterio que vacaciones: el período más reciente es el de la ÚLTIMA
// carga subida (por created_at), no el de fecha más alta dentro del archivo.
export async function getLatestPeriodo() {
  const { data, error } = await supabase
    .from('gv_uploads')
    .select('periodo')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.periodo || null
}

// Todas las tiendas con su resumen del período pedido.
export async function getResumenPeriodo(periodo) {
  const { data, error } = await supabase
    .from('gv_resumen_mensual')
    .select(`
      gasto_total, venta, hc, ratio_pct,
      tienda_id,
      gv_tiendas ( id, nombre, tipo, provincia, pais, metraje, venta_disponible )
    `)
    .eq('periodo', periodo)
  if (error) throw error
  return data.map((row) => ({
    ...row.gv_tiendas,
    gastoTotal: row.gasto_total,
    venta: row.venta,
    hc: row.hc,
    ratioPct: row.ratio_pct,
  }))
}

// Historial completo (todos los períodos, todas las tiendas) sin agregar —
// se agrega en JS según el filtro de tienda activo (buildEvolucionSerie).
export async function getEvolucionDetalle() {
  const { data, error } = await supabase
    .from('gv_resumen_mensual')
    .select(`
      periodo, gasto_total, venta, hc,
      tienda_id,
      gv_tiendas ( nombre )
    `)
  if (error) throw error
  return data.map((r) => ({
    periodo: r.periodo,
    gasto: r.gasto_total || 0,
    venta: r.venta,
    hc: r.hc || 0,
    tienda: r.gv_tiendas?.nombre,
  }))
}

// Si tiendaNombre viene vacío, consolida todas las tiendas por período.
// Si viene una tienda puntual, devuelve solo su serie mensual.
export function buildEvolucionSerie(evolucionDetalle, tiendaNombre) {
  const rows = tiendaNombre ? evolucionDetalle.filter((r) => r.tienda === tiendaNombre) : evolucionDetalle
  const byPeriodo = {}
  rows.forEach((r) => {
    if (!byPeriodo[r.periodo]) byPeriodo[r.periodo] = { periodo: r.periodo, gasto: 0, venta: 0, hc: 0 }
    byPeriodo[r.periodo].gasto += r.gasto || 0
    byPeriodo[r.periodo].venta += r.venta || 0
    byPeriodo[r.periodo].hc += r.hc || 0
  })
  return Object.values(byPeriodo).sort((a, b) => a.periodo.localeCompare(b.periodo))
}

// Desglose de gasto por categoría de rubro para un período (todas las tiendas
// o filtrado luego en JS por tienda/provincia).
export async function getRubroBreakdown(periodo) {
  const { data, error } = await supabase
    .from('gv_gasto_mensual')
    .select(`
      categoria_rubro, importe,
      tienda_id,
      gv_tiendas ( nombre, tipo, provincia )
    `)
    .eq('periodo', periodo)
  if (error) throw error
  return data.map((row) => ({
    categoria: row.categoria_rubro,
    importe: row.importe,
    tienda: row.gv_tiendas?.nombre,
    tipo: row.gv_tiendas?.tipo,
    provincia: row.gv_tiendas?.provincia,
  }))
}

export function buildKpis(resumenRows) {
  const conVenta = resumenRows.filter((r) => r.venta != null)
  const gastoTotal = resumenRows.reduce((s, r) => s + (r.gastoTotal || 0), 0)
  const ventaTotal = conVenta.reduce((s, r) => s + (r.venta || 0), 0)
  const hcTotal = resumenRows.reduce((s, r) => s + (r.hc || 0), 0)
  const ratioPct = ventaTotal ? Math.round((gastoTotal / ventaTotal) * 1000) / 10 : null
  return {
    gastoTotal, ventaTotal, ratioPct, hcTotal,
    nTiendas: resumenRows.length,
    nTiendasSinVenta: resumenRows.length - conVenta.length,
  }
}

// Tiendas ordenadas por ratio gasto/venta desc — las que más gasto de
// personal consumen respecto a lo que venden van primero.
export function buildRanking(resumenRows, limit = 15) {
  return resumenRows
    .filter((r) => r.ratioPct != null)
    .sort((a, b) => b.ratioPct - a.ratioPct)
    .slice(0, limit)
}

export function buildRubroTotales(rubroRows) {
  const byCat = {}
  rubroRows.forEach((r) => {
    byCat[r.categoria] = (byCat[r.categoria] || 0) + (r.importe || 0)
  })
  return Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, importe]) => ({ categoria, importe: Math.round(importe * 100) / 100 }))
}

// Ficha completa de UNA tienda (estilo tu Excel: M2, HC, Venta/m2, Venta/HC,
// Gasto/Venta%, Comisiones/Venta%, y el desglose por categoría como % de venta).
export function buildFichaTienda(tiendaRow, rubroRowsTienda) {
  if (!tiendaRow) return null
  const venta = tiendaRow.venta
  const ventaPorM2 = venta && tiendaRow.metraje ? venta / tiendaRow.metraje : null
  const ventaPorHc = venta && tiendaRow.hc ? venta / tiendaRow.hc : null
  const comisiones = rubroRowsTienda.find((r) => r.categoria === 'Comisiones')?.importe || 0
  const comisionesPct = venta ? Math.round((comisiones / venta) * 1000) / 10 : null
  const desglose = rubroRowsTienda
    .slice()
    .sort((a, b) => b.importe - a.importe)
    .map((r) => ({ categoria: r.categoria, importe: r.importe, pctVenta: venta ? Math.round((r.importe / venta) * 1000) / 10 : null }))
  return {
    ...tiendaRow, ventaPorM2, ventaPorHc, comisiones, comisionesPct, desglose,
  }
}

export function buildProvinciaRanking(resumenRows, limit = 10) {
  const byProv = {}
  resumenRows.forEach((r) => {
    if (!r.provincia) return
    if (!byProv[r.provincia]) byProv[r.provincia] = { provincia: r.provincia, gasto: 0, venta: 0, hc: 0 }
    byProv[r.provincia].gasto += r.gastoTotal || 0
    byProv[r.provincia].venta += r.venta || 0
    byProv[r.provincia].hc += r.hc || 0
  })
  return Object.values(byProv)
    .map((p) => ({ ...p, ratioPct: p.venta ? Math.round((p.gasto / p.venta) * 1000) / 10 : null }))
    .sort((a, b) => b.gasto - a.gasto)
    .slice(0, limit)
}
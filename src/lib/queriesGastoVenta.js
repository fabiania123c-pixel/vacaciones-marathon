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

// Evolución consolidada (todas las tiendas) — lee la vista gv_evolucion_consolidada,
// que ya viene agregada por período en la base (20 filas, no 2600+). Nunca usar
// un select() sin filtro directo sobre gv_resumen_mensual: Supabase corta a 1000
// filas por consulta y esa tabla ya pasa ese número, lo que rompía el gráfico.
export async function getEvolucionConsolidada() {
  const { data, error } = await supabase
    .from('gv_evolucion_consolidada')
    .select('periodo, gasto, venta, hc')
    .order('periodo', { ascending: true })
  if (error) throw error
  return data
}

// Evolución de UNA tienda puntual — filtrada por tienda_id, como mucho ~20
// filas (una por período cargado), tampoco choca nunca con el límite de 1000.
export async function getEvolucionPorTienda(tiendaId) {
  if (!tiendaId) return []
  const { data, error } = await supabase
    .from('gv_resumen_mensual')
    .select('periodo, gasto_total, venta, hc')
    .eq('tienda_id', tiendaId)
    .order('periodo', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ periodo: r.periodo, gasto: r.gasto_total || 0, venta: r.venta, hc: r.hc || 0 }))
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

// Agrega el resumen de varios meses (un año completo) en UNA fila por
// tienda, con la misma forma que getResumenPeriodo — así el resto del
// dashboard (kpis, ranking, ficha, provinciaRanking) funciona igual sin
// cambios. Gasto y venta se SUMAN (total del año); el HC se PROMEDIA
// (sumar dotación mes a mes no tiene sentido); venta queda null solo si
// la tienda no tuvo venta cruzada en NINGÚN mes del año.
// periodRows: [{ periodo, rows }, ...] — rows = lo que devuelve getResumenPeriodo.
export function buildResumenAnual(periodRows) {
  const byTienda = new Map()
  periodRows.forEach(({ rows }) => {
    rows.forEach((r) => {
      if (!byTienda.has(r.id)) {
        byTienda.set(r.id, {
          id: r.id, nombre: r.nombre, tipo: r.tipo, provincia: r.provincia, pais: r.pais, metraje: r.metraje,
          gastoTotal: 0, ventaSum: 0, ventaMeses: 0, hcSum: 0, hcMeses: 0,
        })
      }
      const acc = byTienda.get(r.id)
      acc.gastoTotal += r.gastoTotal || 0
      if (r.venta != null) { acc.ventaSum += r.venta; acc.ventaMeses += 1 }
      if (r.hc != null) { acc.hcSum += r.hc; acc.hcMeses += 1 }
    })
  })
  return Array.from(byTienda.values()).map((acc) => {
    const venta = acc.ventaMeses > 0 ? acc.ventaSum : null
    const hc = acc.hcMeses > 0 ? Math.round(acc.hcSum / acc.hcMeses) : 0
    const ratioPct = venta ? Math.round((acc.gastoTotal / venta) * 1000) / 10 : null
    return { id: acc.id, nombre: acc.nombre, tipo: acc.tipo, provincia: acc.provincia, pais: acc.pais, metraje: acc.metraje, gastoTotal: acc.gastoTotal, venta, hc, ratioPct }
  })
}

// Agrega el desglose de rubros de varios meses en UNA fila por tienda+categoría
// (suma de importe). Sin esto, buildFichaTienda (que hace .find por categoría)
// solo tomaría el importe del primer mes y el desglose saldría duplicado con
// una fila por mes en vez de una fila por categoría.
// periodRubroArrays: [ [...getRubroBreakdown(p)], [...], ... ]
export function buildRubroRowsAnual(periodRubroArrays) {
  const byKey = new Map()
  periodRubroArrays.flat().forEach((r) => {
    const key = `${r.tienda}|${r.categoria}`
    if (!byKey.has(key)) byKey.set(key, { categoria: r.categoria, tienda: r.tienda, tipo: r.tipo, provincia: r.provincia, importe: 0 })
    byKey.get(key).importe += r.importe || 0
  })
  return Array.from(byKey.values())
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
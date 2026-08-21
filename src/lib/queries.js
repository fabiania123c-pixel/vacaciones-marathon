import { supabase } from '../supabaseClient'

export async function getLatestCorte() {
  const { data, error } = await supabase
    .from('vac_snapshots')
    .select('fecha_corte')
    .order('fecha_corte', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.fecha_corte || null
}

// Single fetch: all snapshots for the corte, joined with colaborador data.
// Everything else (KPIs, rankings, distribution) is computed from this in JS.
export async function getCorteData(fechaCorte) {
  const { data, error } = await supabase
    .from('vac_snapshots')
    .select(`
      saldo_actual, dias_tomados, saldo_proyectado_diciembre, diferencia,
      colaborador_id,
      vac_colaboradores ( id, nombre, cedula, verificado, cargo, unidad_organizativa, bp_responsable )
    `)
    .eq('fecha_corte', fechaCorte)
  if (error) throw error
  return data.map((row) => ({
    ...row.vac_colaboradores,
    saldo: row.saldo_actual,
    tomados: row.dias_tomados,
    saldoProyectado: row.saldo_proyectado_diciembre,
    diferencia: row.diferencia,
  }))
}

export async function getAgendaFuturaIds() {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('vac_agenda')
    .select('colaborador_id')
    .gte('desde', today)
  if (error) throw error
  return new Set(data.map((r) => r.colaborador_id))
}

export async function getRatio(fechaCorte) {
  const { data, error } = await supabase
    .from('vac_ratios')
    .select('*')
    .eq('fecha_corte', fechaCorte)
    .eq('pais', 'EC')
    .maybeSingle()
  if (error) throw error
  return data
}

export function buildKpis(personas, agendaIds) {
  const saldoTotal = personas.reduce((s, p) => s + (p.saldo || 0), 0)
  const tomadosTotal = personas.reduce((s, p) => s + (p.tomados || 0), 0)
  const riesgoAlto = personas.filter((p) => p.saldo > 15).length
  const riesgoCritico = personas.filter((p) => p.saldo > 30).length
  const sinAgendaRiesgo = personas.filter((p) => p.saldo > 15 && !agendaIds.has(p.id)).length
  const proyectadoDic = personas.reduce((s, p) => s + (p.saldoProyectado || 0), 0)
  return {
    saldoTotal, tomadosTotal, riesgoAlto, riesgoCritico, sinAgendaRiesgo,
    total: personas.length, proyectadoDic,
  }
}

export function buildPriorityList(personas, agendaIds, limit = 12) {
  return personas
    .map((p) => {
      const tieneAgenda = agendaIds.has(p.id)
      const score = (p.saldo || 0) * 0.5
        + (!tieneAgenda ? 40 : 0)
        + (p.diferencia > 0 ? p.diferencia * 0.5 : 0)
      return { ...p, tieneAgenda, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function buildAreaRanking(personas, limit = 6) {
  const byArea = {}
  personas.forEach((p) => {
    if (!p.unidad_organizativa) return
    byArea[p.unidad_organizativa] = (byArea[p.unidad_organizativa] || 0) + (p.saldo || 0)
  })
  return Object.entries(byArea)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([area, total]) => ({ area, total }))
}

export function buildBpBreakdown(personas) {
  const byBp = {}
  personas.forEach((p) => {
    if (!p.bp_responsable) return
    if (!byBp[p.bp_responsable]) byBp[p.bp_responsable] = { n: 0, saldo: 0, criticos: 0 }
    byBp[p.bp_responsable].n += 1
    byBp[p.bp_responsable].saldo += p.saldo || 0
    if (p.saldo > 30) byBp[p.bp_responsable].criticos += 1
  })
  return Object.entries(byBp)
    .sort((a, b) => b[1].saldo - a[1].saldo)
    .map(([bp, v]) => ({ bp, ...v }))
}

export function buildDistribution(personas) {
  const buckets = { r0: 0, r1_10: 0, r11_20: 0, r21_30: 0, r30plus: 0 }
  personas.forEach((p) => {
    const s = p.saldo || 0
    if (s === 0) buckets.r0++
    else if (s <= 10) buckets.r1_10++
    else if (s <= 20) buckets.r11_20++
    else if (s <= 30) buckets.r21_30++
    else buckets.r30plus++
  })
  return buckets
}

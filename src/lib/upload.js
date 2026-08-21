import { supabase } from '../supabaseClient'

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function toISODate(d) {
  if (!d) return null
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return null
}

// Pushes a parsed Excel result to Supabase. Returns a summary for the UI.
// Idempotent: safe to re-upload the same file (unique constraints prevent
// duplicate snapshots/agenda entries for the same corte).
export async function uploadParsedData(parsed, userId, onProgress) {
  const { employees, fechaCorte, sourceFile, ratio } = parsed
  const report = (msg) => onProgress && onProgress(msg)

  // 1) Upsert colaboradores (core fields, never touches cedula here)
  report('Guardando colaboradores…')
  const colaboradorRows = employees.map((e) => ({
    nombre: e.nombre,
    cargo: e.cargo,
    unidad_organizativa: e.area,
    bp_responsable: e.bp,
    fecha_ingreso: toISODate(e.fechaIngreso),
    pais: 'EC',
  }))

  const idByName = {}
  for (const batch of chunk(colaboradorRows, 100)) {
    const { data, error } = await supabase
      .from('vac_colaboradores')
      .upsert(batch, { onConflict: 'nombre_normalizado,pais', ignoreDuplicates: false })
      .select('id, nombre')
    if (error) throw new Error('Error guardando colaboradores: ' + error.message)
    data.forEach((row) => { idByName[row.nombre] = row.id })
  }

  // 2) Patch cedula only where it's currently missing (never overwrite a
  // verified cedula with a possibly-wrong one from a re-upload)
  report('Verificando cédulas…')
  const withCedula = employees.filter((e) => e.cedula && idByName[e.nombre])
  for (const batch of chunk(withCedula, 20)) {
    await Promise.all(batch.map((e) =>
      supabase.from('vac_colaboradores')
        .update({ cedula: e.cedula, verificado: true })
        .eq('id', idByName[e.nombre])
        .is('cedula', null)
    ))
  }

  // 3) Snapshots (one row per person per corte — accumulates history)
  report('Guardando snapshot del corte…')
  const snapshotRows = employees
    .filter((e) => idByName[e.nombre])
    .map((e) => ({
      colaborador_id: idByName[e.nombre],
      fecha_corte: fechaCorte,
      saldo_actual: e.saldo || 0,
      dias_tomados: e.tomados || 0,
      saldo_proyectado_diciembre: e.saldoProyectado ?? null,
      diferencia: e.diferencia ?? null,
      source_file: sourceFile,
    }))
  for (const batch of chunk(snapshotRows, 100)) {
    const { error } = await supabase
      .from('vac_snapshots')
      .upsert(batch, { onConflict: 'colaborador_id,fecha_corte' })
    if (error) throw new Error('Error guardando snapshot: ' + error.message)
  }

  // 4) Agenda (accumulates — never overwrites, only adds new periods)
  report('Guardando fechas agendadas…')
  const agendaRows = []
  employees.forEach((e) => {
    if (!idByName[e.nombre]) return
    e.schedule.forEach((s) => {
      agendaRows.push({
        colaborador_id: idByName[e.nombre],
        desde: toISODate(s.desde),
        hasta: toISODate(s.hasta),
        dias: typeof s.dias === 'number' ? s.dias : null,
        fecha_corte_origen: fechaCorte,
      })
    })
  })
  for (const batch of chunk(agendaRows, 100)) {
    const { error } = await supabase
      .from('vac_agenda')
      .upsert(batch, { onConflict: 'colaborador_id,desde,hasta', ignoreDuplicates: true })
    if (error) throw new Error('Error guardando agenda: ' + error.message)
  }

  // 5) Ratio oficial (solo si el Excel lo trae explícito)
  if (ratio && ratio.base) {
    report('Guardando ratio oficial…')
    await supabase.from('vac_ratios').upsert({
      fecha_corte: fechaCorte,
      pais: 'EC',
      base_asignado: ratio.base,
      dias_tomados: ratio.tomados,
      pct_tomado: ratio.pctTomado,
      pct_pendiente: ratio.pctPendiente,
    }, { onConflict: 'fecha_corte,pais' })
  }

  // 6) Log de auditoría
  await supabase.from('vac_uploads').insert({
    fecha_corte: fechaCorte,
    pais: 'EC',
    source_file: sourceFile,
    uploaded_by: userId,
    n_colaboradores: employees.length,
  })

  return {
    fechaCorte,
    nColaboradores: employees.length,
    nAgenda: agendaRows.length,
    nSinCedula: employees.filter((e) => !e.cedula).length,
  }
}

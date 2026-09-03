import { supabase } from '../supabaseClient'

export async function getSeguimiento() {
  const { data, error } = await supabase.from('vac_seguimiento').select('*')
  if (error) throw error
  const map = {}
  data.forEach((row) => { map[row.colaborador_id] = row })
  return map
}

export async function upsertSeguimiento(colaboradorId, { estado, fechaDesde, fechaHasta, comentario }, userId) {
  const { error } = await supabase.from('vac_seguimiento').upsert({
    colaborador_id: colaboradorId,
    estado,
    fecha_desde: fechaDesde || null,
    fecha_hasta: fechaHasta || null,
    comentario: comentario || null,
    actualizado_por: userId,
  }, { onConflict: 'colaborador_id' })
  if (error) throw error
}

export const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  en_gestion: 'En gestión',
  resuelto: 'Resuelto',
}
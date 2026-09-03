import { useState } from 'react'
import { upsertSeguimiento, ESTADO_LABELS } from '../lib/seguimiento'

export default function SeguimientoModal({ persona, current, userId, onClose, onSaved }) {
  const [estado, setEstado] = useState(current?.estado || 'pendiente')
  const [fechaDesde, setFechaDesde] = useState(current?.fecha_desde || '')
  const [fechaHasta, setFechaHasta] = useState(current?.fecha_hasta || '')
  const [comentario, setComentario] = useState(current?.comentario || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await upsertSeguimiento(persona.id, { estado, fechaDesde, fechaHasta, comentario }, userId)
      onSaved()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div className="card" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <h2>{persona.nombre}</h2>
        <div className="desc">Seguimiento de gestión de vacaciones</div>
        {error && <div style={{ color: 'var(--crit)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Estado</label>
        <select
          className="search-box" style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
          value={estado} onChange={(e) => setEstado(e.target.value)}
        >
          {Object.entries(ESTADO_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Desde</label>
        <input type="date" className="search-box" style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
          min="2020-01-01" max="2030-12-31"
          value={fechaDesde || ''} onChange={(e) => setFechaDesde(e.target.value)} />

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Hasta</label>
        <input type="date" className="search-box" style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
          min="2020-01-01" max="2030-12-31"
          value={fechaHasta || ''} onChange={(e) => setFechaHasta(e.target.value)} />

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Comentario</label>
        <input className="search-box" style={{ width: '100%', marginBottom: 18, marginTop: 4 }}
          value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Opcional" />

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function EditProfileModal({ persona, onClose, onSaved }) {
  const [cedula, setCedula] = useState(persona.cedula || '')
  const [cargo, setCargo] = useState(persona.cargo || '')
  const [area, setArea] = useState(persona.unidad_organizativa || '')
  const [bp, setBp] = useState(persona.bp_responsable || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('vac_colaboradores')
      .update({
        cedula: cedula || null,
        cargo: cargo || null,
        unidad_organizativa: area || null,
        bp_responsable: bp || null,
        verificado: !!cedula,
      })
      .eq('id', persona.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div className="card" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <h2>{persona.nombre}</h2>
        <div className="desc">Corregir o completar datos de esta persona</div>
        {error && <div style={{ color: 'var(--crit)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Cédula</label>
        <input className="search-box" style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
          value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Sin verificar" />

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Cargo</label>
        <input className="search-box" style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
          value={cargo} onChange={(e) => setCargo(e.target.value)} />

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>Unidad organizativa</label>
        <input className="search-box" style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
          value={area} onChange={(e) => setArea(e.target.value)} />

        <label style={{ fontSize: 11, color: 'var(--text-mute)' }}>BP Responsable</label>
        <input className="search-box" style={{ width: '100%', marginBottom: 18, marginTop: 4 }}
          value={bp} onChange={(e) => setBp(e.target.value)} />

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

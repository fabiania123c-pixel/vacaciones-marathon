import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { parseVacacionesFile } from '../lib/parser'
import { uploadParsedData } from '../lib/upload'

export default function Upload() {
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState(null) // { step, error, result }

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setStatus({ step: 'Leyendo el archivo…' })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const parsed = await parseVacacionesFile(file)
      const result = await uploadParsedData(parsed, user?.id, (msg) => setStatus({ step: msg }))
      setStatus({ done: true, result })
    } catch (err) {
      setStatus({ error: err.message || 'Error inesperado procesando el archivo.' })
    }
  }, [])

  function onDrop(e) {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="page">
      <div className="topnav">
        <div>
          <div className="eyebrow">Gestión de personas · Vacaciones</div>
          <h1 style={{ fontSize: 30 }}>Cargar corte semanal</h1>
        </div>
        <div className="navlinks">
          <Link to="/vacaciones">Dashboard</Link>
          <Link to="/vacaciones/upload" className="active">Cargar</Link>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="sub">Suelta el Excel de esta semana — mismo formato de siempre (hojas con NOMBRE Y APELLIDO + Hoja1 de cédulas).</div>

      <div
        className={`dropzone${dragActive ? ' active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-input').click()}
      >
        <div className="big-icon">⬆</div>
        <div>Arrastra el archivo aquí, o haz click para elegirlo</div>
        <input
          id="file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {status && (
        <div className="card" style={{ marginTop: 24 }}>
          {status.error && (
            <div style={{ color: 'var(--crit)' }}>
              <b>No se pudo procesar:</b> {status.error}
            </div>
          )}
          {status.done && status.result && (
            <div>
              <h2 style={{ color: 'var(--good, #8ecf8e)' }}>Carga completa</h2>
              <div className="desc">
                Corte {status.result.fechaCorte} · {status.result.nColaboradores} colaboradores ·{' '}
                {status.result.nAgenda} períodos agendados
                {status.result.nSinCedula > 0 && <> · {status.result.nSinCedula} sin cédula (pendiente de verificar)</>}
              </div>
              <Link to="/vacaciones" className="btn btn-primary">Ver dashboard →</Link>
            </div>
          )}
          {!status.done && !status.error && (
            <div>{status.step}</div>
          )}
        </div>
      )}
    </div>
  )
}
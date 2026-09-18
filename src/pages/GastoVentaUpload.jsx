import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { parseGastoVentaFile } from '../lib/parserGastoVenta'
import { uploadGastoVenta } from '../lib/uploadGastoVenta'

export default function GastoVentaUpload() {
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState(null) // { step, error, result }

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setStatus({ step: 'Leyendo el archivo… (este es grande, puede tardar un poco)' })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const parsed = await parseGastoVentaFile(file)
      const result = await uploadGastoVenta(parsed, user?.id, (msg) => setStatus({ step: msg }))
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
          <div className="eyebrow">Gestión de personas · Gasto vs Venta</div>
          <h1 style={{ fontSize: 30 }}>Cargar corte mensual</h1>
        </div>
        <div className="navlinks">
          <Link to="/gasto-venta">Dashboard</Link>
          <Link to="/gasto-venta/upload" className="active">Cargar</Link>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="sub">Suelta el Excel "GASTO VENTA" del mes — se lee la hoja "Consolidado 2025 - 2026".</div>

      <div
        className={`dropzone${dragActive ? ' active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-input-gv').click()}
      >
        <div className="big-icon">⬆</div>
        <div>Arrastra el archivo aquí, o haz click para elegirlo</div>
        <input
          id="file-input-gv" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
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
                Período {status.result.ultimoPeriodo} · {status.result.nTiendas} tiendas · {status.result.nFilas.toLocaleString()} filas procesadas
                {status.result.nTiendasSinVenta > 0 && (
                  <> · {status.result.nTiendasSinVenta} combinaciones tienda/mes sin venta cruzada (revisar con finanzas)</>
                )}
                {status.result.importeRecuperado > 0 && (
                  <> · ${status.result.importeRecuperado.toLocaleString()} recuperados de filas sin período (derivado de fecha de pago)</>
                )}
              </div>
              <Link to="/gasto-venta" className="btn btn-primary">Ver dashboard →</Link>
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
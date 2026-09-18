import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'
import {
  getLatestPeriodo, getResumenPeriodo, getEvolucionMensual, getRubroBreakdown,
  buildKpis, buildRanking, buildRubroTotales, buildProvinciaRanking,
} from '../lib/queriesGastoVenta'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'detalle', label: 'Detalle' },
]

function fmtMoney(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function fmtPeriodo(p) {
  if (!p) return '—'
  const [y, m] = p.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${meses[parseInt(m, 10) - 1]} ${y}`
}

export default function GastoVentaDashboard() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumen')
  const [periodo, setPeriodo] = useState(null)
  const [resumen, setResumen] = useState([])
  const [evolucion, setEvolucion] = useState([])
  const [rubroRows, setRubroRows] = useState([])
  const [search, setSearch] = useState('')
  const [provinciaFilter, setProvinciaFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')

  async function load() {
    setLoading(true)
    const p = await getLatestPeriodo()
    if (!p) { setLoading(false); return }
    const [res, evo, rub] = await Promise.all([
      getResumenPeriodo(p), getEvolucionMensual(), getRubroBreakdown(p),
    ])
    setPeriodo(p)
    setResumen(res)
    setEvolucion(evo)
    setRubroRows(rub)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const provinciaOptions = useMemo(
    () => [...new Set(resumen.map((r) => r.provincia).filter(Boolean))].sort(),
    [resumen],
  )

  const filteredResumen = useMemo(() => {
    return resumen.filter((r) => {
      if (provinciaFilter && r.provincia !== provinciaFilter) return false
      if (tipoFilter && r.tipo !== tipoFilter) return false
      return true
    })
  }, [resumen, provinciaFilter, tipoFilter])

  const kpis = useMemo(() => buildKpis(filteredResumen), [filteredResumen])
  const ranking = useMemo(() => buildRanking(filteredResumen, 12), [filteredResumen])
  const rubroTotales = useMemo(() => buildRubroTotales(rubroRows), [rubroRows])
  const maxRubro = rubroTotales[0]?.importe || 1
  const provinciaRanking = useMemo(() => buildProvinciaRanking(resumen, 8), [resumen])
  const maxProvincia = provinciaRanking[0]?.gasto || 1

  const tableRows = useMemo(() => {
    return filteredResumen.filter((r) => {
      if (!search) return true
      return (r.nombre || '').toLowerCase().includes(search.toLowerCase())
    }).sort((a, b) => (b.gastoTotal || 0) - (a.gastoTotal || 0))
  }, [filteredResumen, search])

  function exportExcel() {
    const rows = tableRows.map((r) => ({
      Tienda: r.nombre, Provincia: r.provincia || '', Tipo: r.tipo,
      'Gasto de personal': r.gastoTotal, Venta: r.venta ?? '', '% Gasto/Venta': r.ratioPct ?? '',
      Colaboradores: r.hc, 'Metraje (m²)': r.metraje || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gasto vs Venta')
    XLSX.writeFile(wb, `gasto_venta_${periodo}.xlsx`)
  }

  if (loading) return <div className="page">Cargando…</div>
  if (!periodo) {
    return (
      <div className="page">
        <h1>Sin datos todavía</h1>
        <p className="sub">Nadie ha cargado un corte de gasto/venta aún.</p>
        <Link to="/gasto-venta/upload" className="btn btn-primary">Cargar el primer Excel →</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topnav">
        <div>
          <div className="eyebrow">Gestión de personas · Gasto vs Venta</div>
          <h1 style={{ fontSize: 34 }}>Gasto de Personal vs Venta — Tiendas Ecuador</h1>
        </div>
        <div className="navlinks">
          <Link to="/gasto-venta" className="active">Dashboard</Link>
          <Link to="/gasto-venta/upload">Cargar</Link>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="sub">
        Período <b>{fmtPeriodo(periodo)}</b> · mostrando <b>{filteredResumen.length}</b> de {resumen.length} tiendas
        {(provinciaFilter || tipoFilter) && <> — filtros activos</>}
      </div>

      <div className="filters">
        <div className="filter-pill">Período: <b>{fmtPeriodo(periodo)}</b></div>
        <div className="filter-pill">
          Provincia:
          <select className="filter-select" value={provinciaFilter} onChange={(e) => setProvinciaFilter(e.target.value)}>
            <option value="">Todas</option>
            {provinciaOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          Tipo:
          <select className="filter-select" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="TIENDAS">Tiendas</option>
            <option value="ISLA">Isla</option>
          </select>
        </div>
        {(provinciaFilter || tipoFilter) && (
          <button className="btn" onClick={() => { setProvinciaFilter(''); setTipoFilter('') }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'resumen' && (
        <>
          <div className="hero-ratio">
            <div className="hero-card">
              <div className="hero-label">% Gasto de personal sobre Venta</div>
              <div className="hero-pct">{kpis.ratioPct != null ? `${kpis.ratioPct}%` : '—'}</div>
              <div className="hero-days">{fmtMoney(kpis.gastoTotal)} de gasto sobre {fmtMoney(kpis.ventaTotal)} de venta</div>
              <div className="hero-source global">
                {kpis.nTiendasSinVenta > 0
                  ? `${kpis.nTiendasSinVenta} tienda(s) sin venta cruzada, excluidas del ratio`
                  : 'Todas las tiendas del filtro tienen venta cruzada'}
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-label">Colaboradores (HC)</div>
              <div className="hero-pct" style={{ color: 'var(--text)' }}>{kpis.hcTotal.toLocaleString()}</div>
              <div className="hero-days">en {kpis.nTiendas} tiendas — {fmtPeriodo(periodo)}</div>
            </div>
          </div>

          <div className="grid-kpi">
            <div className="kpi crit"><div className="label">Gasto de personal</div><div className="value">{fmtMoney(kpis.gastoTotal)}</div><div className="ctx">{fmtPeriodo(periodo)}</div></div>
            <div className="kpi"><div className="label">Venta</div><div className="value">{fmtMoney(kpis.ventaTotal)}</div><div className="ctx">tiendas con venta cruzada</div></div>
            <div className="kpi warn"><div className="label">% Gasto/Venta</div><div className="value">{kpis.ratioPct != null ? `${kpis.ratioPct}%` : '—'}</div><div className="ctx">consolidado del filtro</div></div>
            <div className="kpi action"><div className="label">Sin venta cruzada</div><div className="value">{kpis.nTiendasSinVenta}</div><div className="ctx">tiendas a resolver con finanzas</div></div>
            <div className="kpi"><div className="label">Tiendas</div><div className="value">{kpis.nTiendas}</div><div className="ctx">en este filtro</div></div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Evolución mensual — Gasto vs Venta</h2>
            <div className="desc">Consolidado de todas las tiendas, ene 2025 a la fecha</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={evolucion.map((e) => ({ ...e, periodoLabel: fmtPeriodo(e.periodo) }))} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="periodoLabel" stroke="#8f9bc0" fontSize={11} />
                <YAxis stroke="#5c6690" fontSize={11} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: '#111c38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12.5 }}
                  formatter={(v) => fmtMoney(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12.5 }} />
                <Line type="monotone" dataKey="gasto" name="Gasto de personal" stroke="#ffb199" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="venta" name="Venta" stroke="#8ecf8e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="row-3col">
            <div className="card">
              <h2>Tiendas con mayor % Gasto/Venta</h2>
              <div className="desc">Las que más gasto de personal consumen sobre su venta</div>
              {ranking.length === 0 && <div className="desc">Nadie en este filtro.</div>}
              {ranking.map((r, i) => (
                <div className="priority-item" key={r.id}>
                  <div className="p-left">
                    <div className="p-rank">{i + 1}</div>
                    <div>
                      <div className="p-name">{r.nombre}</div>
                      <div className="p-meta">{r.provincia || '—'} · HC {r.hc}</div>
                    </div>
                  </div>
                  <div className="p-right">
                    {r.ratioPct > 30 && <span className="badge" style={{ color: '#ffb199' }}>Alto</span>}
                    <div className="p-saldo">{r.ratioPct}%</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <h2>Gasto por categoría</h2>
              <div className="desc">{fmtPeriodo(periodo)} — todas las tiendas</div>
              {rubroTotales.map((r) => (
                <div className="area-row" key={r.categoria}>
                  <div className="area-name">{r.categoria}</div>
                  <div className="area-bar-bg"><div className="area-bar" style={{ width: `${r.importe / maxRubro * 100}%` }} /></div>
                  <div className="area-val">{fmtMoney(r.importe)}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <h2>Gasto por provincia</h2>
              <div className="desc">Top {provinciaRanking.length} — {fmtPeriodo(periodo)}</div>
              {provinciaRanking.map((p) => (
                <div className="area-row" key={p.provincia}>
                  <div className="area-name">{p.provincia}</div>
                  <div className="area-bar-bg"><div className="area-bar" style={{ width: `${p.gasto / maxProvincia * 100}%` }} /></div>
                  <div className="area-val">
                    {fmtMoney(p.gasto)} {p.ratioPct != null && <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>({p.ratioPct}%)</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'detalle' && (
        <div className="card">
          <h2>Detalle por tienda</h2>
          <div className="desc">Buscable por nombre de tienda</div>
          <div className="search-row">
            <input
              className="search-box" placeholder="Buscar tienda…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="row-count">Mostrando {tableRows.length} de {resumen.length}</div>
              <button className="btn" onClick={exportExcel}>⬇ Exportar Excel</button>
            </div>
          </div>
          <table className="detail">
            <thead>
              <tr>
                <th>Tienda</th><th>Provincia</th><th>Tipo</th><th>Gasto</th><th>Venta</th>
                <th>% Gasto/Venta</th><th>HC</th><th>m²</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(0, 80).map((r) => (
                <tr key={r.id}>
                  <td className="name">{r.nombre}</td>
                  <td>{r.provincia || '—'}</td>
                  <td>{r.tipo}</td>
                  <td className="num">{fmtMoney(r.gastoTotal)}</td>
                  <td className="num">{r.venta != null ? fmtMoney(r.venta) : <span className="flag-sin">sin venta</span>}</td>
                  <td className="num">{r.ratioPct != null ? `${r.ratioPct}%` : '—'}</td>
                  <td className="num">{r.hc}</td>
                  <td className="num">{r.metraje || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableRows.length > 80 && <div className="row-count" style={{ marginTop: 10 }}>Y {tableRows.length - 80} más — usa el buscador para filtrar</div>}
        </div>
      )}
    </div>
  )
}
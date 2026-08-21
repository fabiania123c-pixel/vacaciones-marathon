import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'
import {
  getLatestCorte, getCorteData, getAgendaFuturaIds, getRatio,
  buildKpis, buildPriorityList, buildAreaRanking, buildBpBreakdown, buildDistribution,
} from '../lib/queries'
import EditProfileModal from '../components/EditProfileModal'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [fechaCorte, setFechaCorte] = useState(null)
  const [personas, setPersonas] = useState([])
  const [agendaIds, setAgendaIds] = useState(new Set())
  const [ratio, setRatio] = useState(null)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [bpFilter, setBpFilter] = useState('')
  const [saldoFilter, setSaldoFilter] = useState('')
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true)
    const corte = await getLatestCorte()
    if (!corte) { setLoading(false); return }
    const [p, ids, r] = await Promise.all([
      getCorteData(corte), getAgendaFuturaIds(), getRatio(corte),
    ])
    setFechaCorte(corte)
    setPersonas(p)
    setAgendaIds(ids)
    setRatio(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const kpis = useMemo(() => buildKpis(personas, agendaIds), [personas, agendaIds])
  const priority = useMemo(() => buildPriorityList(personas, agendaIds), [personas, agendaIds])
  const areas = useMemo(() => buildAreaRanking(personas), [personas])
  const maxArea = areas[0]?.total || 1
  const bps = useMemo(() => buildBpBreakdown(personas), [personas])
  const dist = useMemo(() => buildDistribution(personas), [personas])
  const maxDist = Math.max(...Object.values(dist), 1)

  const areaOptions = useMemo(() => [...new Set(personas.map((p) => p.unidad_organizativa).filter(Boolean))].sort(), [personas])
  const bpOptions = useMemo(() => [...new Set(personas.map((p) => p.bp_responsable).filter(Boolean))].sort(), [personas])

  const filtered = useMemo(() => {
    return personas.filter((p) => {
      if (search) {
        const q = search.toLowerCase()
        const hay = (p.nombre || '').toLowerCase().includes(q)
          || (p.cedula || '').includes(q)
          || (p.cargo || '').toLowerCase().includes(q)
        if (!hay) return false
      }
      if (areaFilter && p.unidad_organizativa !== areaFilter) return false
      if (bpFilter && p.bp_responsable !== bpFilter) return false
      if (saldoFilter === '15+' && !(p.saldo > 15)) return false
      if (saldoFilter === '30+' && !(p.saldo > 30)) return false
      return true
    }).sort((a, b) => (b.saldo || 0) - (a.saldo || 0))
  }, [personas, search, areaFilter, bpFilter, saldoFilter])

  function exportExcel() {
    const rows = filtered.map((p) => ({
      Colaborador: p.nombre, Cédula: p.cedula || '', Cargo: p.cargo, Área: p.unidad_organizativa,
      BP: p.bp_responsable, 'Saldo actual': p.saldo, 'Días tomados': p.tomados,
      Agenda: agendaIds.has(p.id) ? 'Sí' : 'No',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones')
    XLSX.writeFile(wb, `vacaciones_${fechaCorte}.xlsx`)
  }

  const pctTomado = ratio ? Math.round(ratio.pct_tomado * 1000) / 10 : null
  const pctPendiente = ratio ? Math.round(ratio.pct_pendiente * 1000) / 10 : null
  const proyeccionDelta = kpis.saldoTotal - kpis.proyectadoDic
  const proyeccionPct = kpis.saldoTotal ? Math.round((proyeccionDelta / kpis.saldoTotal) * 100) : 0

  if (loading) return <div className="page">Cargando…</div>
  if (!fechaCorte) {
    return (
      <div className="page">
        <h1>Sin datos todavía</h1>
        <p className="sub">Nadie ha cargado un corte aún.</p>
        <Link to="/upload" className="btn btn-primary">Cargar el primer Excel →</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topnav">
        <div>
          <div className="eyebrow">Gestión de personas · Vacaciones</div>
          <h1 style={{ fontSize: 34 }}>Control de Vacaciones — Administrativos Ecuador</h1>
        </div>
        <div className="navlinks">
          <Link to="/" className="active">Dashboard</Link>
          <Link to="/upload">Cargar</Link>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="sub">Corte <b>{fechaCorte}</b> · {kpis.total} colaboradores · se actualiza cuando alguien sube un Excel nuevo</div>

      <div className="filters">
        <div className="filter-pill">Corte: <b>{fechaCorte}</b></div>
        <div className="filter-pill">
          Unidad:
          <select className="filter-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="">Todas</option>
            {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          BP:
          <select className="filter-select" value={bpFilter} onChange={(e) => setBpFilter(e.target.value)}>
            <option value="">Todos</option>
            {bpOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          Saldo:
          <select className="filter-select" value={saldoFilter} onChange={(e) => setSaldoFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="15+">Más de 15 días</option>
            <option value="30+">Más de 30 días</option>
          </select>
        </div>
        <div className="filter-pill" style={{ opacity: .4 }}>Empresa / Región: sin data</div>
      </div>

      {ratio && (
        <div className="hero-ratio">
          <div className="hero-card">
            <div className="hero-label">% Vacaciones tomadas</div>
            <div className="hero-pct">{pctTomado}%</div>
            <div className="hero-days">{ratio.dias_tomados.toLocaleString()} de {ratio.base_asignado.toLocaleString()} días asignados</div>
            <div className="hero-source">Leído directo de tu fila de ratio oficial — no recalculado</div>
          </div>
          <div className="hero-card pending">
            <div className="hero-label">% Vacaciones pendientes</div>
            <div className="hero-pct">{pctPendiente}%</div>
            <div className="hero-days">{Math.round(ratio.base_asignado - ratio.dias_tomados).toLocaleString()} días sin tomar</div>
            <div className="hero-source">Mismo origen — fórmula de tu equipo, tal cual</div>
          </div>
        </div>
      )}

      <div className="grid-kpi">
        <div className="kpi crit"><div className="label">Saldo acumulado</div><div className="value">{kpis.saldoTotal.toLocaleString()}</div><div className="ctx">días sin tomar</div></div>
        <div className="kpi warn"><div className="label">Riesgo alto (&gt;15)</div><div className="value">{kpis.riesgoAlto}</div><div className="ctx">de {kpis.total} personas</div></div>
        <div className="kpi crit"><div className="label">Riesgo crítico (&gt;30)</div><div className="value">{kpis.riesgoCritico}</div><div className="ctx">{Math.round(kpis.riesgoCritico / kpis.total * 100)}% del total</div></div>
        <div className="kpi action"><div className="label">Sin agenda + riesgo</div><div className="value">{kpis.sinAgendaRiesgo}</div><div className="ctx">nada programado</div></div>
        <div className="kpi"><div className="label">Días tomados</div><div className="value">{kpis.tomadosTotal.toLocaleString()}</div><div className="ctx">este corte</div></div>
        <div className="kpi"><div className="label">Colaboradores</div><div className="value">{kpis.total}</div><div className="ctx">Administrativos EC</div></div>
      </div>

      <div className="row">
        <div className="card">
          <h2>Prioridad de la semana</h2>
          <div className="desc">Saldo alto + sin fecha agendada + tendencia creciente</div>
          {priority.map((p, i) => (
            <div className="priority-item" key={p.id}>
              <div className="p-left">
                <div className="p-rank">{i + 1}</div>
                <div>
                  <div className="p-name">{p.nombre}</div>
                  <div className="p-meta">{p.cargo || '—'} · {p.unidad_organizativa || '—'}</div>
                </div>
              </div>
              <div className="p-right">
                {!p.tieneAgenda && <span className="badge no-agenda">Sin agenda</span>}
                {p.diferencia > 0 && <span className="badge up">↑ {p.diferencia}</span>}
                <div className="p-saldo">{p.saldo}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Proyección a diciembre 2026</h2>
          <div className="desc">Si nada cambia, así cierra el año — dato de tu Excel</div>
          <div className="trend-box">
            <div className="big">{kpis.saldoTotal.toLocaleString()} → {kpis.proyectadoDic.toLocaleString()}</div>
            <div className="arrow" style={{ color: proyeccionDelta > 0 ? 'var(--good)' : 'var(--crit)' }}>
              {proyeccionDelta > 0 ? '↓' : '↑'} {Math.abs(proyeccionPct)}%
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
            {proyeccionDelta > 0 ? 'Baja' : 'Sube'} proyectada de {Math.abs(proyeccionDelta).toLocaleString()} días
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card">
          <h2>Distribución de saldo</h2>
          <div className="desc">{kpis.total} personas por rango de días acumulados</div>
          {[['0 días', dist.r0], ['1–10', dist.r1_10], ['11–20', dist.r11_20], ['21–30', dist.r21_30], ['30+', dist.r30plus]].map(([label, val]) => (
            <div className="area-row" key={label}>
              <div className="area-name">{label}</div>
              <div className="area-bar-bg"><div className="area-bar" style={{ width: `${val / maxDist * 100}%` }} /></div>
              <div className="area-val">{val}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Carga por BP Responsable</h2>
          <div className="desc">Para seguimiento directo</div>
          {bps.map((b) => (
            <div className="priority-item" key={b.bp}>
              <div className="p-left"><div><div className="p-name">{b.bp}</div><div className="p-meta">{b.n} personas</div></div></div>
              <div className="p-right">
                {b.criticos > 0 && <span className="badge" style={{ color: '#ffb199' }}>{b.criticos} críticos</span>}
                <div className="p-saldo">{b.saldo.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Saldo acumulado por unidad organizativa</h2>
        <div className="desc">Top {areas.length} áreas con más días pendientes</div>
        {areas.map((a) => (
          <div className="area-row" key={a.area}>
            <div className="area-name">{a.area}</div>
            <div className="area-bar-bg"><div className="area-bar" style={{ width: `${a.total / maxArea * 100}%` }} /></div>
            <div className="area-val">{a.total}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Detalle por persona</h2>
        <div className="desc">Buscable — click en una fila para editar cédula u otros datos</div>
        <div className="search-row">
          <input
            className="search-box" placeholder="Buscar por nombre, cédula o cargo…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="row-count">Mostrando {filtered.length} de {kpis.total}</div>
            <button className="btn" onClick={exportExcel}>⬇ Exportar Excel</button>
          </div>
        </div>
        <table className="detail">
          <thead>
            <tr><th>Colaborador</th><th>Área</th><th>BP</th><th>Saldo</th><th>Tomados</th><th>Agenda</th><th>Cédula</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, 60).map((p) => (
              <tr key={p.id} onClick={() => setEditing(p)} style={{ cursor: 'pointer' }}>
                <td className="name">{p.nombre}</td>
                <td>{p.unidad_organizativa || '—'}</td>
                <td>{p.bp_responsable || '—'}</td>
                <td className="num">{p.saldo}</td>
                <td>{p.tomados}</td>
                <td className={agendaIds.has(p.id) ? '' : 'flag-sin'}>{agendaIds.has(p.id) ? 'Sí' : 'Sin agenda'}</td>
                <td>{p.cedula || <span style={{ opacity: .4 }}>pendiente</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 60 && <div className="row-count" style={{ marginTop: 10 }}>Y {filtered.length - 60} más — usa el buscador para filtrar</div>}
      </div>

      {editing && (
        <EditProfileModal
          persona={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'
import {
  getLatestCorte, getCorteData, getAgendaFuturaIds, getRatio,
  buildKpis, buildPriorityList, buildAreaRanking, buildBpBreakdown, buildDistribution,
} from '../lib/queries'
import { getSeguimiento, upsertSeguimiento, ESTADO_LABELS } from '../lib/seguimiento'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import EditProfileModal from '../components/EditProfileModal'

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'seguimiento', label: 'Seguimiento' },
  { id: 'detalle', label: 'Detalle' },
]

const ESTADO_COLOR = {
  pendiente: '#ffb199',
  en_gestion: '#ffd27a',
  resuelto: '#8ecf8e',
}

const SORT_FIELDS = {
  nombre: (p) => p.nombre || '',
  saldo: (p) => p.saldo || 0,
  estado: (p, seg) => (seg[p.id]?.estado || 'pendiente'),
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumen')
  const [userId, setUserId] = useState(null)
  const [fechaCorte, setFechaCorte] = useState(null)
  const [personas, setPersonas] = useState([])
  const [agendaIds, setAgendaIds] = useState(new Set())
  const [ratio, setRatio] = useState(null)
  const [seguimiento, setSeguimiento] = useState({})
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [bpFilter, setBpFilter] = useState('')
  const [saldoFilter, setSaldoFilter] = useState('')
  const [liderFilter, setLiderFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [sortField, setSortField] = useState('saldo')
  const [sortDir, setSortDir] = useState('desc')

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id || null)
    const corte = await getLatestCorte()
    if (!corte) { setLoading(false); return }
    const [p, ids, r, seg] = await Promise.all([
      getCorteData(corte), getAgendaFuturaIds(), getRatio(corte), getSeguimiento(),
    ])
    setFechaCorte(corte)
    setPersonas(p)
    setAgendaIds(ids)
    setRatio(r)
    setSeguimiento(seg)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filteredPersonas = useMemo(() => {
    return personas.filter((p) => {
      if (areaFilter && p.unidad_organizativa !== areaFilter) return false
      if (bpFilter && p.bp_responsable !== bpFilter) return false
      if (saldoFilter === '15+' && !(p.saldo > 15)) return false
      if (saldoFilter === '30+' && !(p.saldo > 30)) return false
      if (liderFilter && p.jefe_directo !== liderFilter) return false
      if (regionFilter && p.region !== regionFilter) return false
      return true
    })
  }, [personas, areaFilter, bpFilter, saldoFilter, liderFilter, regionFilter])

  const kpis = useMemo(() => buildKpis(filteredPersonas, agendaIds), [filteredPersonas, agendaIds])
  const priority = useMemo(() => buildPriorityList(filteredPersonas, agendaIds), [filteredPersonas, agendaIds])
  const areas = useMemo(() => buildAreaRanking(filteredPersonas), [filteredPersonas])
  const maxArea = areas[0]?.total || 1
  const bps = useMemo(() => buildBpBreakdown(filteredPersonas), [filteredPersonas])
  const dist = useMemo(() => buildDistribution(filteredPersonas), [filteredPersonas])
  const maxDist = Math.max(...Object.values(dist), 1)

  const areaOptions = useMemo(() => [...new Set(personas.map((p) => p.unidad_organizativa).filter(Boolean))].sort(), [personas])
  const bpOptions = useMemo(() => [...new Set(personas.map((p) => p.bp_responsable).filter(Boolean))].sort(), [personas])
  const liderOptions = useMemo(() => [...new Set(personas.map((p) => p.jefe_directo).filter(Boolean))].sort(), [personas])
  const regionOptions = useMemo(() => [...new Set(personas.map((p) => p.region).filter(Boolean))].sort(), [personas])

  const tableRows = useMemo(() => {
    return filteredPersonas.filter((p) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (p.nombre || '').toLowerCase().includes(q)
        || (p.cedula || '').includes(q)
        || (p.cargo || '').toLowerCase().includes(q)
    }).sort((a, b) => (b.saldo || 0) - (a.saldo || 0))
  }, [filteredPersonas, search])

  const gestionables = useMemo(() => filteredPersonas.filter((p) => p.saldo > 15), [filteredPersonas])
  const resueltos = useMemo(() => gestionables.filter((p) => seguimiento[p.id]?.estado === 'resuelto'), [gestionables, seguimiento])
  const diasTotalesGestion = useMemo(() => gestionables.reduce((s, p) => s + (p.saldo || 0), 0), [gestionables])
  const diasResueltos = useMemo(() => resueltos.reduce((s, p) => s + (p.saldo || 0), 0), [resueltos])
  const pctResuelto = diasTotalesGestion ? Math.round(diasResueltos / diasTotalesGestion * 100) : 0

  const progresoPorBp = useMemo(() => {
    const byBp = {}
    gestionables.forEach((p) => {
      if (!p.bp_responsable) return
      if (!byBp[p.bp_responsable]) byBp[p.bp_responsable] = { personas: 0, diasTotal: 0, diasResueltos: 0 }
      byBp[p.bp_responsable].personas += 1
      byBp[p.bp_responsable].diasTotal += (p.saldo || 0)
      if (seguimiento[p.id]?.estado === 'resuelto') byBp[p.bp_responsable].diasResueltos += (p.saldo || 0)
    })
    return Object.entries(byBp).sort((a, b) => b[1].diasTotal - a[1].diasTotal).map(([bp, v]) => ({ bp, ...v }))
  }, [gestionables, seguimiento])

  const seguimientoRows = useMemo(() => {
    const rows = [...gestionables]
    const getVal = SORT_FIELDS[sortField]
    rows.sort((a, b) => {
      const va = getVal(a, seguimiento)
      const vb = getVal(b, seguimiento)
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [gestionables, seguimiento, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  async function saveSeguimientoField(persona, patch) {
    const prev = seguimiento[persona.id] || {}
    const next = { ...prev, colaborador_id: persona.id, ...patch }
    setSeguimiento((s) => ({ ...s, [persona.id]: next }))
    try {
      await upsertSeguimiento(persona.id, {
        estado: next.estado || 'pendiente',
        fechaDesde: next.fecha_desde,
        fechaHasta: next.fecha_hasta,
        comentario: next.comentario,
      }, userId)
    } catch (e) {
      alert('No se pudo guardar: ' + e.message)
      setSeguimiento((s) => ({ ...s, [persona.id]: prev }))
    }
  }

  function exportExcel() {
    const rows = tableRows.map((p) => ({
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
  const proyeccionDelta = kpis.saldoTotal - kpis.proyectadoDic
  const proyeccionPct = kpis.saldoTotal ? Math.round((proyeccionDelta / kpis.saldoTotal) * 100) : 0

  if (loading) return <div className="page">Cargando…</div>
  if (!fechaCorte) {
    return (
      <div className="page">
        <h1>Sin datos todavía</h1>
        <p className="sub">Nadie ha cargado un corte aún.</p>
        <Link to="/vacaciones/upload" className="btn btn-primary">Cargar el primer Excel →</Link>
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
          <Link to="/vacaciones" className="active">Dashboard</Link>
          <Link to="/vacaciones/upload">Cargar</Link>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="sub">
        Corte <b>{fechaCorte}</b> · mostrando <b>{filteredPersonas.length}</b> de {personas.length} colaboradores
        {(areaFilter || bpFilter || saldoFilter || liderFilter || regionFilter) && <> — filtros activos</>}
      </div>

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
        <div className="filter-pill">
          Líder:
          <select className="filter-select" value={liderFilter} onChange={(e) => setLiderFilter(e.target.value)}>
            <option value="">Todos</option>
            {liderOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          Región:
          <select className="filter-select" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="">Todas</option>
            {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {(areaFilter || bpFilter || saldoFilter || liderFilter || regionFilter) && (
          <button className="btn" onClick={() => { setAreaFilter(''); setBpFilter(''); setSaldoFilter(''); setLiderFilter(''); setRegionFilter('') }}>
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
            {ratio ? (
              <div className="hero-card">
                <div className="hero-label">% Vacaciones tomadas</div>
                <div className="hero-pct">{pctTomado}%</div>
                <div className="hero-days">{ratio.dias_tomados.toLocaleString()} de {ratio.base_asignado.toLocaleString()} días asignados</div>
                <div className="hero-source global">Cifra global de la empresa — no cambia con los filtros (viene tal cual de tu Excel)</div>
              </div>
            ) : (
              <div className="hero-card">
                <div className="hero-label">% Vacaciones tomadas</div>
                <div className="hero-pct" style={{ color: 'var(--text-mute)', fontSize: 28 }}>Sin dato este corte</div>
                <div className="hero-days">El Excel de este mes no trajo el bloque de ratio</div>
              </div>
            )}
            <div className="hero-card">
              <div className="hero-label">Días tomados</div>
              <div className="hero-pct" style={{ color: 'var(--text)' }}>{kpis.tomadosTotal.toLocaleString()}</div>
              <div className="hero-days">este corte</div>
            </div>
          </div>

          <div className="grid-kpi">
            <div className="kpi crit"><div className="label">Saldo acumulado</div><div className="value">{kpis.saldoTotal.toLocaleString()}</div><div className="ctx">días sin tomar</div></div>
            <div className="kpi warn"><div className="label">Riesgo alto (&gt;15)</div><div className="value">{kpis.riesgoAlto}</div><div className="ctx">de {kpis.total} personas</div></div>
            <div className="kpi crit"><div className="label">Riesgo crítico (&gt;30)</div><div className="value">{kpis.riesgoCritico}</div><div className="ctx">{kpis.total ? Math.round(kpis.riesgoCritico / kpis.total * 100) : 0}% del total</div></div>
            <div className="kpi action"><div className="label">Sin agenda + riesgo</div><div className="value">{kpis.sinAgendaRiesgo}</div><div className="ctx">nada programado</div></div>
            <div className="kpi"><div className="label">Colaboradores</div><div className="value">{kpis.total}</div><div className="ctx">en este filtro</div></div>
          </div>

          <div className="row-3col">
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
              {bps.length === 0 && <div className="desc">Nadie en este filtro.</div>}
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

            <div className="card">
              <h2>Saldo por unidad organizativa</h2>
              <div className="desc">Top {areas.length} áreas en este filtro</div>
              {areas.length === 0 && <div className="desc">Nadie en este filtro.</div>}
              {areas.map((a) => (
                <div className="area-row" key={a.area}>
                  <div className="area-name">{a.area}</div>
                  <div className="area-bar-bg"><div className="area-bar" style={{ width: `${a.total / maxArea * 100}%` }} /></div>
                  <div className="area-val">
                    {a.total} <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>
                      ({kpis.saldoTotal ? Math.round(a.total / kpis.saldoTotal * 100) : 0}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="card">
              <h2>Prioridad de la semana</h2>
              <div className="desc">Saldo alto + sin fecha agendada + tendencia creciente</div>
              {priority.length === 0 && <div className="desc">Nadie en este filtro.</div>}
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
        </>
      )}

      {tab === 'seguimiento' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Avance de gestión</h2>
            <div className="desc">{gestionables.length} personas con más de 15 días acumulados necesitan seguimiento</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
              <div className="hero-pct" style={{ fontSize: 44, color: 'var(--good)' }}>{pctResuelto}%</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{diasResueltos.toLocaleString()} de {diasTotalesGestion.toLocaleString()} días resueltos — {resueltos.length} de {gestionables.length} personas</div>
            </div>
            {progresoPorBp.map((b) => {
              const pct = b.diasTotal ? Math.round(b.diasResueltos / b.diasTotal * 100) : 0
              return (
                <div className="area-row" key={b.bp}>
                  <div className="area-name">{b.bp}</div>
                  <div className="area-bar-bg"><div className="area-bar" style={{ width: `${pct}%`, background: 'var(--good)' }} /></div>
                  <div className="area-val">
                    {b.diasResueltos}/{b.diasTotal} días <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>({pct}%)</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Comparación por BP</h2>
            <div className="desc">Días resueltos vs pendientes, por responsable</div>
            <ResponsiveContainer width="100%" height={Math.max(220, progresoPorBp.length * 55)}>
              <BarChart
                layout="vertical"
                data={progresoPorBp.map((b) => ({ name: b.bp, Resuelto: b.diasResueltos, Pendiente: b.diasTotal - b.diasResueltos }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#5c6690" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#8f9bc0" fontSize={12} width={50} />
                <Tooltip contentStyle={{ background: '#111c38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12.5 }} />
                <Legend wrapperStyle={{ fontSize: 12.5 }} />
                <Bar dataKey="Resuelto" stackId="a" fill="#8ecf8e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Pendiente" stackId="a" fill="#ffb199" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2>Detalle de seguimiento</h2>
            <div className="desc">Click en cualquier campo para editarlo directo — se guarda solo</div>
            <table className="detail">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('nombre')}>Colaborador {sortField === 'nombre' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th>Área</th>
                  <th>BP</th>
                  <th onClick={() => toggleSort('saldo')}>Saldo {sortField === 'saldo' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => toggleSort('estado')}>Estado {sortField === 'estado' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Comentario</th>
                </tr>
              </thead>
              <tbody>
                {seguimientoRows.slice(0, 100).map((p) => {
                  const seg = seguimiento[p.id]
                  const estado = seg?.estado || 'pendiente'
                  return (
                    <tr key={p.id}>
                      <td className="name" onClick={() => setEditing(p)} style={{ cursor: 'pointer' }}>{p.nombre}</td>
                      <td>{p.unidad_organizativa || '—'}</td>
                      <td>{p.bp_responsable || '—'}</td>
                      <td className="num">{p.saldo}</td>
                      <td>
                        <div className="estado-quick">
                          {['pendiente', 'en_gestion', 'resuelto'].map((e) => (
                            <button
                              key={e}
                              className={`${e}${estado === e ? ' active' : ''}`}
                              title={ESTADO_LABELS[e]}
                              onClick={() => saveSeguimientoField(p, { estado: e })}
                            />
                          ))}
                        </div>
                      </td>
                      <td>
                        <input
                          type="date" className="search-box" style={{ width: 140, padding: '5px 8px', fontSize: 12 }}
                          value={seg?.fecha_desde || ''}
                          onChange={(e) => saveSeguimientoField(p, { fecha_desde: e.target.value || null })}
                        />
                      </td>
                      <td>
                        <input
                          type="date" className="search-box" style={{ width: 140, padding: '5px 8px', fontSize: 12 }}
                          value={seg?.fecha_hasta || ''}
                          onChange={(e) => saveSeguimientoField(p, { fecha_hasta: e.target.value || null })}
                        />
                      </td>
                      <td>
                        <input
                          type="text" className="search-box" style={{ width: 160, padding: '5px 8px', fontSize: 12 }}
                          defaultValue={seg?.comentario || ''}
                          placeholder="Sin comentario"
                          onBlur={(e) => {
                            if (e.target.value !== (seg?.comentario || '')) saveSeguimientoField(p, { comentario: e.target.value })
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {seguimientoRows.length > 100 && <div className="row-count" style={{ marginTop: 10 }}>Y {seguimientoRows.length - 100} más — usa los filtros de arriba</div>}
          </div>
        </>
      )}

      {tab === 'detalle' && (
        <div className="card">
          <h2>Detalle por persona</h2>
          <div className="desc">Buscable — click en una fila para editar cédula u otros datos</div>
          <div className="search-row">
            <input
              className="search-box" placeholder="Buscar por nombre, cédula o cargo…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="row-count">Mostrando {tableRows.length} de {personas.length}</div>
              <button className="btn" onClick={exportExcel}>⬇ Exportar Excel</button>
            </div>
          </div>
          <table className="detail">
            <thead>
              <tr><th>Colaborador</th><th>Área</th><th>BP</th><th>Saldo</th><th>Tomados</th><th>Agenda</th><th>Cédula</th><th>Gestión</th></tr>
            </thead>
            <tbody>
              {tableRows.slice(0, 60).map((p) => {
                const estadoActual = seguimiento[p.id]?.estado || 'pendiente'
                return (
                <tr key={p.id}>
                  <td className="name" onClick={() => setEditing(p)} style={{ cursor: 'pointer' }}>{p.nombre}</td>
                  <td>{p.unidad_organizativa || '—'}</td>
                  <td>{p.bp_responsable || '—'}</td>
                  <td className="num">{p.saldo}</td>
                  <td>{p.tomados}</td>
                  <td className={agendaIds.has(p.id) ? '' : 'flag-sin'}>{agendaIds.has(p.id) ? 'Sí' : 'Sin agenda'}</td>
                  <td>{p.cedula || <span style={{ opacity: .4 }}>pendiente</span>}</td>
                  <td>
                    <div className="estado-quick">
                      {['pendiente', 'en_gestion', 'resuelto'].map((e) => (
                        <button
                          key={e}
                          className={`${e}${estadoActual === e ? ' active' : ''}`}
                          title={ESTADO_LABELS[e]}
                          onClick={(ev) => { ev.stopPropagation(); saveSeguimientoField(p, { estado: e }) }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {tableRows.length > 60 && <div className="row-count" style={{ marginTop: 10 }}>Y {tableRows.length - 60} más — usa el buscador para filtrar</div>}
        </div>
      )}

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
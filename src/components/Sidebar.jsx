import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const ITEMS = [
  { label: 'Vacaciones', icon: '📅', to: '/vacaciones', active: true },
  { label: 'Gasto / Venta', icon: '💰', to: null, active: false },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    if (next) navigate('/') // al colapsar, vuelve a la pantalla en blanco
  }

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <button className="sidebar-toggle" onClick={toggleCollapse} title={collapsed ? 'Expandir' : 'Colapsar'}>
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav className="sidebar-nav">
        {ITEMS.map((item) => {
          const isCurrent = item.active && location.pathname.startsWith(item.to)
          if (!item.active) {
            return (
              <div key={item.label} className="sidebar-item disabled" title={item.label}>
                <span className="sidebar-icon">{item.icon}</span>
                {!collapsed && <>{item.label}<span className="sidebar-soon">Próximamente</span></>}
              </div>
            )
          }
          return (
            <Link key={item.label} to={item.to} className={`sidebar-item${isCurrent ? ' active' : ''}`} title={item.label}>
              <span className="sidebar-icon">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
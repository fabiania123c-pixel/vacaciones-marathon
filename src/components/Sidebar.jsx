import { useState, createElement } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const ITEMS = [
  { label: 'Vacaciones', icon: '📅', kind: 'internal', to: '/vacaciones' },
  { label: 'Gasto / Venta', icon: '💰', kind: 'internal', to: '/gasto-venta' },
  { label: 'Únete a Nuestro Equipo', icon: '🤝', kind: 'external', href: 'https://uneteanuestroequipo.ec.aseyco.com/login' },
  { label: 'Dashboard de Control', icon: '📊', kind: 'external', href: 'https://us-east-1.quicksight.aws.amazon.com/sn/account/marathonsports/dashboards/cbd0544d-43c8-4595-952f-d965c41cbb05/views/d98fb1da-2469-4275-ba9a-6a6a78643b94' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    if (next) navigate('/')
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
          if (item.kind === 'soon') {
            return (
              <div key={item.label} className="sidebar-item disabled" title={item.label}>
                <span className="sidebar-icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    {item.label}
                    <span className="sidebar-soon">Próximamente</span>
                  </>
                )}
              </div>
            )
          }

          if (item.kind === 'external') {
            return createElement(
              'a',
              {
                key: item.label,
                href: item.href,
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'sidebar-item',
                title: item.label,
              },
              <span key="icon" className="sidebar-icon">{item.icon}</span>,
              !collapsed ? item.label : null
            )
          }

          const isCurrent = location.pathname.startsWith(item.to)
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`sidebar-item${isCurrent ? ' active' : ''}`}
              title={item.label}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
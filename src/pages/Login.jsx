import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError('Correo o clave incorrectos.')
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="eyebrow">Gestión de personas</div>
        <h1 style={{ fontSize: 28, marginBottom: 20 }}>Control de Vacaciones</h1>
        {error && <div className="error">{error}</div>}
        <input
          type="email" placeholder="correo@ec.aseyco.com" value={email}
          onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          type="password" placeholder="Contraseña" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: 10 }} disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}

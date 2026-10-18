import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Link, Navigate, useLocation } from 'react-router'
import { auth } from '../firebase'
import { useAuth } from '../hooks/useAuth'

const AUTH_ERRORS = {
  'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'auth/invalid-email': 'البريد الإلكتروني غير صالح',
  'auth/too-many-requests': 'محاولات كثيرة، حاول مرة أخرى بعد قليل',
  'auth/network-request-failed': 'تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت',
  'auth/configuration-not-found': 'تسجيل الدخول غير مفعّل في مشروع Firebase',
  'auth/operation-not-allowed': 'تسجيل الدخول بالبريد الإلكتروني غير مفعّل في مشروع Firebase',
}

export function LoginPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (loading) return <p className="status">جارٍ التحميل…</p>
  // Students sign in too; they just get read-only pages (editing needs role 'admin').
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError(AUTH_ERRORS[err.code] ?? err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="login">
      <h1>تسجيل الدخول</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            dir="ltr"
            required
            autoFocus
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            dir="ltr"
            required
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </div>
      </form>
      <p>
        <Link to="/">العودة للرئيسية</Link>
      </p>
    </section>
  )
}

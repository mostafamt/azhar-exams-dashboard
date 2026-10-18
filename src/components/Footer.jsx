import { GraduationCap, LogIn } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useCollection } from '../hooks/useCollection'
import { routeFor } from '../lib/paths'

export function Footer() {
  const { user } = useAuth()
  const { items: grades } = useCollection([])
  const location = useLocation()

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-about">
          <Link to="/" className="brand">
            <GraduationCap size={22} aria-hidden="true" />
            امتحانات الأزهر
          </Link>
          <p>صور امتحانات الأزهر الشريف مرتبة حسب الصف والقسم والمادة.</p>
        </div>

        {grades.length > 0 && (
          <nav aria-label="الصفوف" className="footer-links">
            <h2>الصفوف</h2>
            <ul>
              {grades.map((grade) => (
                <li key={grade.id}>
                  <Link to={routeFor([grade.id])}>{grade.name || grade.id}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} امتحانات الأزهر</span>
        {!user && location.pathname !== '/login' && (
          <Link to="/login" state={{ from: location.pathname }} className="footer-login">
            <LogIn size={14} aria-hidden="true" />
            دخول المشرفين
          </Link>
        )}
      </div>
    </footer>
  )
}

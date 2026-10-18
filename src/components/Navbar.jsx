import { signOut } from 'firebase/auth'
import { GraduationCap, LogOut } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { auth } from '../firebase'
import { useAuth } from '../hooks/useAuth'

export function Navbar() {
  const { user, isAdmin } = useAuth()

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <GraduationCap size={26} aria-hidden="true" />
          امتحانات الأزهر
        </Link>

        <div className="navbar-menu">
          <nav aria-label="القائمة الرئيسية">
            <ul className="navbar-links">
              <li>
                <NavLink to="/" end>
                  الرئيسية
                </NavLink>
              </li>
            </ul>
          </nav>

          {user && (
            <div className="navbar-user">
              <span className="navbar-email" dir="ltr">
                {user.email}
              </span>
              {isAdmin && <span className="badge">مشرف</span>}
              <button type="button" onClick={() => signOut(auth)}>
                <LogOut size={16} aria-hidden="true" />
                خروج
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

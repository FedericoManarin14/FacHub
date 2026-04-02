import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'


export default function Topbar({ title, backTo, showLogout = false, rightActions }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  const handleBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 bg-navy-800 text-white shadow-md">
      <div className="flex items-center justify-between h-14 px-4 max-w-4xl mx-auto">

        {/* Left side: logo + optional back button + title */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Logo — always visible */}
          <img src="/logo.png" alt="Logo" className="h-8 w-auto" />

          {/* Back button — only when backTo is provided */}
          {backTo !== undefined && (
            <button
              onClick={handleBack}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-navy-700 transition-colors active:bg-navy-600"
              aria-label="Indietro"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <span className="font-semibold text-base truncate leading-none">{title}</span>
        </div>

        {/* Right side: optional extra actions + logout */}
        <div className="flex items-center gap-1">
          {rightActions}
          {showLogout && (
            <button
              onClick={handleLogout}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-navy-700 transition-colors active:bg-navy-600"
              aria-label="Esci"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

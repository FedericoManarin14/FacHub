import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Topbar({ title, backTo, showLogout = false, rightActions }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()

  const isStock = location.pathname.startsWith('/stock')
  const bg    = isStock ? 'bg-red-800'   : 'bg-navy-800'
  const hover = isStock
    ? 'hover:bg-red-700 active:bg-red-600'
    : 'hover:bg-navy-700 active:bg-navy-600'
  const showSwitcher = location.pathname !== '/login'

  const handleBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className={`sticky top-0 z-50 ${bg} text-white shadow-md`}>
      <div className="flex items-center justify-between h-14 px-4 max-w-4xl mx-auto">

        {/* Left side: logo + switcher + optional back button + title */}
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="Logo" className="h-8 w-auto flex-shrink-0" />

          {/* App switcher */}
          {showSwitcher && (
            <div className="flex items-center gap-0.5 bg-black/20 rounded-lg p-0.5 flex-shrink-0">
              {/* FacHub */}
              <button
                onClick={() => navigate('/')}
                className={`p-1.5 rounded-md transition-colors ${!isStock ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                title="FacHub"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm6-6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zm0 8a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              {/* FacStock */}
              <button
                onClick={() => navigate('/stock')}
                className={`p-1.5 rounded-md transition-colors ${isStock ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'}`}
                title="FacStock"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </button>
            </div>
          )}

          {/* Back button */}
          {backTo !== undefined && (
            <button
              onClick={handleBack}
              className={`flex-shrink-0 p-1.5 rounded-lg ${hover} transition-colors`}
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
              className={`flex-shrink-0 p-2 rounded-lg ${hover} transition-colors`}
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

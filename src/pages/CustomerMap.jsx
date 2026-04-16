import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Spinner from '../components/Spinner'

/* ── Fix Leaflet default marker icons (Vite asset handling) ── */
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

/* ── Colored pin icons ────────────────────────────────────── */
function makePin(fill) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C7.6 0 4 3.6 4 8c0 5.9 8 28 8 28s8-22.1 8-28c0-4.4-3.6-8-8-8z"
      fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
    <circle cx="12" cy="8" r="3.5" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:    [24, 36],
    iconAnchor:  [12, 36],
    popupAnchor: [0, -36],
  })
}

const ICON_BLUE   = makePin('#3b82f6')   // colle
const ICON_ORANGE = makePin('#f97316')   // abrasivi

const CENTER = [45.8, 12.3]
const ZOOM   = 9

const STATUS_LABEL = {
  ongoing: { label: 'Attivo',    cls: 'bg-green-100 text-green-700' },
  pending: { label: 'In attesa', cls: 'bg-yellow-100 text-yellow-700' },
  expired: { label: 'Rifiutato', cls: 'bg-red-100 text-red-700' },
}

/* ── Child: fly-to handler ─────────────────────────────────── */
function MapFlyTo({ target }) {
  const map   = useMap()
  const prev  = useRef(null)
  useEffect(() => {
    if (!target || target === prev.current) return
    prev.current = target
    map.flyTo([target.lat, target.lng], 14, { animate: true, duration: 1 })
  }, [target, map])
  return null
}

/* ── Child: click/crosshair handler ───────────────────────── */
function MapInteraction({ isPlacing, onPlace }) {
  // Use ref to avoid stale-closure in useMapEvents (deps=[])
  const stateRef = useRef({ isPlacing, onPlace })
  stateRef.current = { isPlacing, onPlace }

  const map = useMapEvents({
    click(e) {
      if (stateRef.current.isPlacing) stateRef.current.onPlace(e.latlng)
    },
  })

  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = isPlacing ? 'crosshair' : ''
    return () => { el.style.cursor = '' }
  }, [isPlacing, map])

  return null
}

/* ══════════════════════════════════════════════════════════ */
export default function CustomerMap() {
  const navigate = useNavigate()

  const [customers,        setCustomers]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [showGlues,        setShowGlues]        = useState(true)
  const [showAbrasives,    setShowAbrasives]    = useState(true)
  const [sidebarOpen,      setSidebarOpen]      = useState(true)
  const [placingCustomer,  setPlacingCustomer]  = useState(null)
  const [savingPlace,      setSavingPlace]      = useState(false)
  const [flyTarget,        setFlyTarget]        = useState(null)

  useEffect(() => { loadCustomers() }, [])

  async function loadCustomers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, sector, offer_status, description, latitude, longitude, address')
      .order('company_name')
    if (!error) setCustomers(data ?? [])
    setLoading(false)
  }

  /* ── derived ─────────────────────────────────────────────── */
  const visible = customers.filter(c =>
    (c.sector === 'glues'     ? showGlues     : true) &&
    (c.sector === 'abrasives' ? showAbrasives : true)
  )
  const withCoords = visible.filter(c => c.latitude != null && c.longitude != null)

  /* ── place customer on map ───────────────────────────────── */
  async function handlePlace(latlng) {
    if (!placingCustomer || savingPlace) return
    setSavingPlace(true)
    const { data, error } = await supabase
      .from('customers')
      .update({ latitude: latlng.lat, longitude: latlng.lng })
      .eq('id', placingCustomer.id)
      .select()
      .single()
    if (!error && data) {
      setCustomers(prev => prev.map(c => c.id === data.id
        ? { ...c, latitude: data.latitude, longitude: data.longitude }
        : c
      ))
      setFlyTarget({ lat: latlng.lat, lng: latlng.lng, ts: Date.now() })
    }
    setPlacingCustomer(null)
    setSavingPlace(false)
  }

  function flyTo(customer) {
    if (!customer.latitude || !customer.longitude) return
    setFlyTarget({ lat: customer.latitude, lng: customer.longitude, ts: Date.now() })
  }

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <Topbar title="Mappa clienti" showLogout />

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 flex items-center gap-2 flex-shrink-0 z-10">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0"
          title={sidebarOpen ? 'Nascondi lista' : 'Mostra lista'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>

        <button
          onClick={() => setShowGlues(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
            showGlues ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          Colle
        </button>

        <button
          onClick={() => setShowAbrasives(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
            showAbrasives ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-gray-100 text-gray-400 border-gray-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          Abrasivi
        </button>

        <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
          {withCoords.length}/{visible.length} posizionati
        </span>
      </div>

      {/* ── Placement banner ───────────────────────────────── */}
      {placingCustomer && (
        <div className="bg-blue-600 text-white text-sm px-4 py-2 flex items-center justify-between flex-shrink-0 z-10">
          <span>
            Clicca sulla mappa per posizionare{' '}
            <strong>{placingCustomer.company_name}</strong>
            {savingPlace && ' — salvataggio…'}
          </span>
          <button
            onClick={() => setPlacingCustomer(null)}
            className="ml-4 text-white/80 hover:text-white text-xs underline flex-shrink-0"
          >
            Annulla (ESC)
          </button>
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">

          {/* ── Sidebar ─────────────────────────────────── */}
          {sidebarOpen && (
            <div
              className="w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white"
              style={{ paddingBottom: '4rem' }}
            >
              <div className="p-2 space-y-1.5">
                {customers.map(c => {
                  const hasCoords = c.latitude != null && c.longitude != null
                  const isPlacing = placingCustomer?.id === c.id
                  const st = STATUS_LABEL[c.offer_status] ?? STATUS_LABEL.pending

                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl p-3 border transition-all ${
                        isPlacing
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                    >
                      {/* name + status */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-navy-800 leading-tight truncate">
                          {c.company_name}
                        </p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>

                      {/* category dot */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          c.sector === 'glues' ? 'bg-blue-500' : 'bg-orange-500'
                        }`} />
                        <span className="text-xs text-gray-400">
                          {c.sector === 'glues' ? 'Colle' : 'Abrasivi'}
                        </span>
                        {hasCoords ? null : (
                          <span className="ml-auto text-xs text-gray-400 italic">
                            Posizione non impostata
                          </span>
                        )}
                      </div>

                      {/* actions */}
                      <div className="flex items-center gap-2">
                        {hasCoords && (
                          <button
                            onClick={() => flyTo(c)}
                            className="flex-1 text-xs text-blue-600 hover:text-blue-800 font-medium text-left truncate"
                          >
                            Mostra sulla mappa →
                          </button>
                        )}
                        <button
                          onClick={() => setPlacingCustomer(isPlacing ? null : c)}
                          className={`ml-auto flex-shrink-0 text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                            isPlacing
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {isPlacing ? 'Annulla' : 'Posiziona sulla mappa'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Map ─────────────────────────────────────── */}
          <div className="flex-1 relative min-w-0" style={{ paddingBottom: '4rem' }}>
            <MapContainer
              center={CENTER}
              zoom={ZOOM}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

              <MapFlyTo target={flyTarget} />
              <MapInteraction isPlacing={!!placingCustomer} onPlace={handlePlace} />

              {withCoords.map(c => (
                <Marker
                  key={c.id}
                  position={[c.latitude, c.longitude]}
                  icon={c.sector === 'glues' ? ICON_BLUE : ICON_ORANGE}
                >
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <p style={{ fontWeight: 600, marginBottom: 2 }}>{c.company_name}</p>
                      {c.description && (
                        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                          {c.description}
                        </p>
                      )}
                      <span style={{
                        display: 'inline-block',
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 20,
                        background: c.offer_status === 'ongoing' ? '#dcfce7' : c.offer_status === 'expired' ? '#fee2e2' : '#fef9c3',
                        color:      c.offer_status === 'ongoing' ? '#15803d' : c.offer_status === 'expired' ? '#dc2626' : '#a16207',
                        marginBottom: 8,
                      }}>
                        {(STATUS_LABEL[c.offer_status] ?? STATUS_LABEL.pending).label}
                      </span>
                      <br />
                      <button
                        onClick={() => navigate(`/customers/${c.id}`)}
                        style={{
                          fontSize: 12,
                          color: '#2563eb',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontWeight: 500,
                        }}
                      >
                        Vai al cliente →
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* ── Legend (overlaid) ─────────────────────── */}
            <div className="absolute bottom-20 left-3 z-[1000] bg-white rounded-xl border border-gray-200 p-3 shadow-md text-xs space-y-1.5 pointer-events-none">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Legenda</p>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="text-gray-700">Colle</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
                <span className="text-gray-700">Abrasivi</span>
              </div>
            </div>
          </div>

        </div>
      )}

      <BottomNav />
    </div>
  )
}

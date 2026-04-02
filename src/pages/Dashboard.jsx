import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Spinner from '../components/Spinner'

const INACTIVE_DAYS = 60

/* ─── date helpers ─────────────────────────────────────── */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function formatCurrency(val) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val ?? 0)
}

/** Returns { year, month (1-based), label } for the last N months */
function buildMonthSlots(n = 6) {
  const slots = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    slots.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
    })
  }
  return slots
}

function isSameMonth(dateStr, year, month) {
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

/* ─── KPI card ─────────────────────────────────────────── */
function KpiCard({ icon, label, value, sub, subPositive }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">{label}</span>
        <span className="text-navy-800 opacity-60">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-navy-800 leading-none">{value}</p>
      {sub !== undefined && (
        <p className={`text-xs font-medium ${
          subPositive === true ? 'text-green-600' :
          subPositive === false ? 'text-red-500' : 'text-gray-400'
        }`}>
          {sub}
        </p>
      )}
    </div>
  )
}

/* ─── chart tooltip ────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-navy-800 mb-0.5">{label}</p>
      <p className="text-gray-600">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

/* ════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [chartData,          setChartData]          = useState([])
  const [kpis,               setKpis]               = useState(null)
  const [inactiveCustomers,  setInactiveCustomers]  = useState([])
  const [recentNotes,        setRecentNotes]        = useState([])
  const [loading,            setLoading]            = useState(true)
  const [error,              setError]              = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      setLoading(true)

      // ── date boundaries ────────────────────────────────
      const now       = new Date()
      const thisYear  = now.getFullYear()
      const thisMonth = now.getMonth() + 1

      const prevDate  = new Date(now)
      prevDate.setMonth(prevDate.getMonth() - 1)
      const prevYear  = prevDate.getFullYear()
      const prevMonth = prevDate.getMonth() + 1

      // 7 months back window (6 chart + 1 prev-month KPI)
      const windowStart = new Date(now)
      windowStart.setMonth(windowStart.getMonth() - 6)
      windowStart.setDate(1)
      const windowStartStr = windowStart.toISOString().split('T')[0]

      // 60-day cutoff
      const cutoff60 = new Date()
      cutoff60.setDate(cutoff60.getDate() - INACTIVE_DAYS)
      const cutoff60Str = cutoff60.toISOString().split('T')[0]

      // ── parallel fetches ───────────────────────────────
      const [
        { data: customers,     error: custErr  },
        { data: allLines,      error: linesErr },
        { data: recentLinesForActivity, error: actErr },
        { data: notes,         error: notesErr },
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id, company_name, sector, offer_status')
          .order('company_name'),

        // Lines in the 7-month window for chart + KPIs
        supabase
          .from('order_lines')
          .select('customer_id, date, sale_price, purchase_price, quantity')
          .gte('date', windowStartStr),

        // All lines ever, just customer_id + date for activity tracking
        supabase
          .from('order_lines')
          .select('customer_id, date')
          .order('date', { ascending: false }),

        supabase
          .from('customer_notes')
          .select('id, text, created_at, customer_id, customers(company_name)')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (custErr)  throw custErr
      if (linesErr) throw linesErr
      if (actErr)   throw actErr
      if (notesErr) throw notesErr

      // ── last order date per customer (for inactive list) ─
      const lastOrderMap = {}
      for (const l of (recentLinesForActivity ?? [])) {
        if (!lastOrderMap[l.customer_id]) lastOrderMap[l.customer_id] = l.date
      }

      const inactive = (customers ?? [])
        .filter(c => {
          const last = lastOrderMap[c.id]
          return !last || new Date(last) < cutoff60
        })
        .map(c => ({
          ...c,
          lastOrderDate: lastOrderMap[c.id] ?? null,
          daysSince:     lastOrderMap[c.id] ? daysSince(lastOrderMap[c.id]) : null,
        }))

      setInactiveCustomers(inactive)
      setRecentNotes(notes ?? [])

      // ── revenue chart — last 6 months ──────────────────
      const slots = buildMonthSlots(6)
      const chart = slots.map(({ year, month, label }) => {
        const revenue = (allLines ?? [])
          .filter(l => isSameMonth(l.date, year, month))
          .reduce((sum, l) => sum + +l.quantity * +l.sale_price, 0)
        return { label, revenue: parseFloat(revenue.toFixed(2)) }
      })
      setChartData(chart)

      // ── KPIs ──────────────────────────────────────────
      const thisLines = (allLines ?? []).filter(l => isSameMonth(l.date, thisYear, thisMonth))
      const prevLines = (allLines ?? []).filter(l => isSameMonth(l.date, prevYear, prevMonth))

      const revenueThis = thisLines.reduce((s, l) => s + +l.quantity * +l.sale_price, 0)
      const revenuePrev = prevLines.reduce((s, l) => s + +l.quantity * +l.sale_price, 0)
      const revenueDelta = revenuePrev > 0
        ? ((revenueThis - revenuePrev) / revenuePrev) * 100
        : null

      // Active customers = distinct customers with at least 1 line in last 60 days
      const activeCustomerIds = new Set(
        (recentLinesForActivity ?? [])
          .filter(l => new Date(l.date) >= cutoff60)
          .map(l => l.customer_id)
      )

      // Avg margin on this month's lines
      const avgMarginThis = (() => {
        const valid = thisLines.filter(l => +l.purchase_price > 0)
        if (!valid.length) return null
        const total = valid.reduce(
          (s, l) => s + (((+l.sale_price - +l.purchase_price) / +l.purchase_price) * 100), 0
        )
        return (total / valid.length).toFixed(1)
      })()

      // "Ordini questo mese" = count of order lines this month
      const linesThisMonth = thisLines.length

      setKpis({
        revenueThis,
        revenueDelta,
        activeCustomers: activeCustomerIds.size,
        avgMargin:       avgMarginThis,
        linesThisMonth,
      })

    } catch (e) {
      setError('Errore nel caricamento dei dati.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const sectorLabel = s => s === 'glues' ? 'Colle' : 'Abrasivi'

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title="FacHub" showLogout />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">

        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        ) : (
          <>
            {/* ── Revenue chart ──────────────────────────── */}
            <section className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Fatturato ultimi 6 mesi
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `€${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} width={42} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9', radius: 4 }} />
                  <Bar dataKey="revenue" fill="#1e2a4a" radius={[5, 5, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* ── KPI cards ──────────────────────────────── */}
            {kpis && (
              <section className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Fatturato mese"
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  value={formatCurrency(kpis.revenueThis)}
                  sub={kpis.revenueDelta !== null
                    ? `${kpis.revenueDelta >= 0 ? '+' : ''}${kpis.revenueDelta.toFixed(1)}% vs mese scorso`
                    : 'Nessun dato mese scorso'}
                  subPositive={kpis.revenueDelta !== null ? kpis.revenueDelta >= 0 : undefined}
                />
                <KpiCard
                  label="Clienti attivi"
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                  value={kpis.activeCustomers}
                  sub={`ordini negli ultimi ${INACTIVE_DAYS} giorni`}
                />
                <KpiCard
                  label="Margine medio"
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                  value={kpis.avgMargin !== null ? `${kpis.avgMargin}%` : '—'}
                  sub="sulle righe di questo mese"
                />
                <KpiCard
                  label="Righe questo mese"
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                  value={kpis.linesThisMonth}
                  sub="righe d'ordine registrate"
                />
              </section>
            )}

            {/* ── Inactive customers ─────────────────────── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Clienti senza ordini da +{INACTIVE_DAYS} giorni
                </h2>
              </div>
              {inactiveCustomers.length === 0 ? (
                <div className="bg-white rounded-xl p-5 text-center text-gray-400 text-sm border border-gray-100">
                  Tutti i clienti hanno ordinato di recente
                </div>
              ) : (
                <div className="space-y-2">
                  {inactiveCustomers.map(customer => (
                    <button key={customer.id} onClick={() => navigate(`/customers/${customer.id}`)}
                      className="w-full text-left bg-white rounded-xl p-4 border border-gray-100 hover:border-navy-200 hover:shadow-sm transition-all active:scale-[0.99]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-navy-800 truncate">{customer.company_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{sectorLabel(customer.sector)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {customer.lastOrderDate ? (
                            <>
                              <p className="text-xs font-medium text-red-500">{customer.daysSince} giorni fa</p>
                              <p className="text-xs text-gray-400 mt-0.5">{formatDate(customer.lastOrderDate)}</p>
                            </>
                          ) : (
                            <p className="text-xs font-medium text-gray-400">Nessun ordine</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ── Recent notes ───────────────────────────── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-navy-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Ultime note aggiunte
                </h2>
              </div>
              {recentNotes.length === 0 ? (
                <div className="bg-white rounded-xl p-5 text-center text-gray-400 text-sm border border-gray-100">
                  Nessuna nota presente
                </div>
              ) : (
                <div className="space-y-2">
                  {recentNotes.map(note => (
                    <button key={note.id} onClick={() => navigate(`/customers/${note.customer_id}`)}
                      className="w-full text-left bg-white rounded-xl p-4 border border-gray-100 hover:border-navy-200 hover:shadow-sm transition-all active:scale-[0.99]">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <p className="text-xs font-semibold text-navy-700">{note.customers?.company_name}</p>
                        <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(note.created_at)}</p>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{note.text}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

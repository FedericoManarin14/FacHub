import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Modal from '../components/Modal'
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

function buildMonthSlots(n = 6) {
  const slots = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
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
  const [chartData,    setChartData]    = useState([])
  const [kpis,         setKpis]         = useState(null)
  const [monitorItems, setMonitorItems] = useState([])
  const [reminders,    setReminders]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [newText,      setNewText]      = useState('')
  const [newDate,      setNewDate]      = useState('')
  const [addingReminder, setAddingReminder] = useState(false)

  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      setLoading(true)

      const now       = new Date()
      const thisYear  = now.getFullYear()
      const thisMonth = now.getMonth() + 1

      const prevDate  = new Date(now)
      prevDate.setMonth(prevDate.getMonth() - 1)
      const prevYear  = prevDate.getFullYear()
      const prevMonth = prevDate.getMonth() + 1

      const windowStart = new Date(now)
      windowStart.setMonth(windowStart.getMonth() - 6)
      windowStart.setDate(1)
      const windowStartStr = windowStart.toISOString().split('T')[0]

      const cutoff60 = new Date()
      cutoff60.setDate(cutoff60.getDate() - INACTIVE_DAYS)

      const [
        { data: customers,     error: custErr   },
        { data: allLines,      error: linesErr  },
        { data: activityLines, error: actErr    },
        { data: remindersData, error: remErr    },
        { data: intervals,     error: intErr    },
      ] = await Promise.all([
        supabase.from('customers').select('id, company_name, sector, offer_status').order('company_name'),
        supabase.from('order_lines').select('customer_id, date, sale_price, purchase_price, quantity').gte('date', windowStartStr),
        supabase.from('order_lines').select('customer_id, product_name, date').order('date', { ascending: false }),
        supabase.from('reminders').select('*').order('due_date', { ascending: true }),
        supabase.from('customer_product_intervals').select('customer_id, product_name, avg_days'),
      ])

      if (custErr)  throw custErr
      if (linesErr) throw linesErr
      if (actErr)   throw actErr

      // Last order per customer (for KPI active count)
      const lastOrderMap = {}
      for (const l of (activityLines ?? [])) {
        if (!lastOrderMap[l.customer_id]) lastOrderMap[l.customer_id] = l.date
      }

      // Last order per customer+product_name
      const lastProductOrderMap = {}
      for (const l of (activityLines ?? [])) {
        const key = `${l.customer_id}__${l.product_name}`
        if (!lastProductOrderMap[key]) lastProductOrderMap[key] = l.date
      }

      // Build "Clienti da monitorare" — only Attivo customers with Attesa/Ritardo intervals
      const activeCustomerMap = {}
      for (const c of (customers ?? [])) {
        if (c.offer_status === 'ongoing') activeCustomerMap[c.id] = c
      }

      const items = []
      for (const interval of (intervals ?? [])) {
        const customer = activeCustomerMap[interval.customer_id]
        if (!customer) continue
        const key = `${interval.customer_id}__${interval.product_name}`
        const lastDate = lastProductOrderMap[key]
        const ds = lastDate ? daysSince(lastDate) : Infinity
        const overdue = ds === Infinity ? interval.avg_days : ds - interval.avg_days
        let status
        if (ds === Infinity || ds > interval.avg_days + 30) status = 'ritardo'
        else if (ds > interval.avg_days) status = 'attesa'
        else continue
        items.push({ customer_id: interval.customer_id, product_name: interval.product_name, avg_days: interval.avg_days, lastDate: lastDate ?? null, daysSince: ds === Infinity ? null : ds, overdue, status, customer })
      }

      // Sort: ritardo first, then most overdue
      items.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'ritardo' ? -1 : 1
        return b.overdue - a.overdue
      })

      setMonitorItems(items)
      setReminders(remindersData ?? [])

      // Chart
      const slots = buildMonthSlots(12)
      setChartData(slots.map(({ year, month, label }) => {
        const revenue = (allLines ?? [])
          .filter(l => isSameMonth(l.date, year, month))
          .reduce((sum, l) => sum + +l.quantity * +l.sale_price, 0)
        return { label, revenue: parseFloat(revenue.toFixed(2)) }
      }))

      // KPIs
      const thisLines = (allLines ?? []).filter(l => isSameMonth(l.date, thisYear, thisMonth))
      const prevLines = (allLines ?? []).filter(l => isSameMonth(l.date, prevYear, prevMonth))

      const revenueThis = thisLines.reduce((s, l) => s + +l.quantity * +l.sale_price, 0)
      const revenuePrev = prevLines.reduce((s, l) => s + +l.quantity * +l.sale_price, 0)
      const revenueDelta = revenuePrev > 0 ? ((revenueThis - revenuePrev) / revenuePrev) * 100 : null

      const activeIds = new Set(
        (activityLines ?? []).filter(l => new Date(l.date) >= cutoff60).map(l => l.customer_id)
      )

      const avgMarginThis = (() => {
        const valid = thisLines.filter(l => +l.purchase_price > 0)
        if (!valid.length) return null
        return (valid.reduce((s, l) => s + (((+l.sale_price - +l.purchase_price) / +l.purchase_price) * 100), 0) / valid.length).toFixed(1)
      })()

      setKpis({ revenueThis, revenueDelta, activeCustomers: activeIds.size, avgMargin: avgMarginThis, linesThisMonth: thisLines.length })

    } catch (e) {
      setError('Errore nel caricamento dei dati.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function addReminder() {
    if (!newText.trim() || !newDate) return
    setAddingReminder(true)
    const { data, error } = await supabase.from('reminders').insert({ text: newText.trim(), due_date: newDate }).select().single()
    if (!error) setReminders(prev => [...prev, data].sort((a, b) => a.due_date.localeCompare(b.due_date)))
    setNewText(''); setNewDate('')
    setAddingReminder(false)
  }

  async function deleteReminder(id) {
    await supabase.from('reminders').delete().eq('id', id)
    setReminders(prev => prev.filter(r => r.id !== id))
  }

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
            {/* ── Mappa clienti shortcut ─────────────────── */}
            <button
              onClick={() => navigate('/map')}
              className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4 hover:border-navy-200 hover:shadow-sm transition-all active:scale-[0.99] text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-navy-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-navy-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-navy-800 text-sm">Mappa clienti</p>
                <p className="text-xs text-gray-400 mt-0.5">Visualizza la posizione geografica dei clienti</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* ── Revenue chart ──────────────────────────── */}
            <section className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Fatturato ultimi 12 mesi
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
                  sub={kpis.revenueDelta !== null ? `${kpis.revenueDelta >= 0 ? '+' : ''}${kpis.revenueDelta.toFixed(1)}% vs mese scorso` : 'Nessun dato mese scorso'}
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

            {/* ── Clienti da monitorare ──────────────────── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Clienti da monitorare
                </h2>
              </div>
              {monitorItems.length === 0 ? (
                <div className="bg-white rounded-xl p-5 text-center text-gray-400 text-sm border border-gray-100">
                  Nessun prodotto in ritardo o in attesa
                </div>
              ) : (
                <div className="space-y-2">
                  {monitorItems.map((item, idx) => (
                    <button key={idx} onClick={() => navigate(`/customers/${item.customer_id}`)}
                      className="w-full text-left bg-white rounded-xl p-4 border border-gray-100 hover:border-navy-200 hover:shadow-sm transition-all active:scale-[0.99]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy-800 truncate">{item.customer.company_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.product_name}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            {item.daysSince !== null ? (
                              <p className="text-xs text-gray-400">{item.daysSince}g fa</p>
                            ) : (
                              <p className="text-xs text-gray-400">Nessun ordine</p>
                            )}
                            <p className="text-xs text-gray-300 mt-0.5">ogni ~{item.avg_days}g</p>
                          </div>
                          {item.status === 'attesa' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium whitespace-nowrap">Attesa ordine</span>
                          )}
                          {item.status === 'ritardo' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium whitespace-nowrap">Ritardo</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ── Promemoria ─────────────────────────────── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-navy-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Promemoria</h2>
              </div>

              {/* inline add form */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addReminder() }}
                  placeholder="Nuovo promemoria…"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-navy-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-800"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800"
                />
                <button
                  onClick={addReminder}
                  disabled={addingReminder || !newText.trim() || !newDate}
                  className="px-4 py-2 bg-navy-800 text-white text-sm font-semibold rounded-xl hover:bg-navy-900 transition-colors disabled:opacity-50"
                >
                  {addingReminder ? '…' : 'Aggiungi'}
                </button>
              </div>

              {reminders.length === 0 ? (
                <div className="bg-white rounded-xl p-5 text-center text-gray-400 text-sm border border-gray-100">
                  Nessun promemoria
                </div>
              ) : (
                <div className="space-y-2">
                  {reminders.map(r => {
                    const overdue = new Date(r.due_date) < new Date(new Date().toISOString().split('T')[0])
                    return (
                      <div key={r.id}
                        className={`flex items-center justify-between gap-3 bg-white rounded-xl px-4 py-3 border ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${overdue ? 'text-red-700' : 'text-navy-800'} truncate`}>{r.text}</p>
                          <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                            {overdue ? '⚠️ ' : ''}{formatDate(r.due_date)}
                          </p>
                        </div>
                        <button onClick={() => deleteReminder(r.id)}
                          className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
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

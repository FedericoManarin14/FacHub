import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
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

/**
 * Parse a DD/MM/YYYY string → "YYYY-MM-DD".
 * Also handles ISO dates and Excel numeric serials.
 */
function parseDDMMYYYY(raw) {
  if (!raw && raw !== 0) return ''
  // Excel numeric serial date
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  // JS Date object
  if (raw instanceof Date) return raw.toISOString().split('T')[0]
  const s = String(raw).trim()
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return s
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
  const [chartData,         setChartData]         = useState([])
  const [kpis,              setKpis]              = useState(null)
  const [inactiveCustomers, setInactiveCustomers] = useState([])
  const [recentNotes,       setRecentNotes]       = useState([])
  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState('')

  // Multi-customer Excel import
  const fileInputRef                                  = useRef(null)
  const [importModalOpen,   setImportModalOpen]   = useState(false)
  const [importPreview,     setImportPreview]     = useState(null)  // { valid: [{customer, rows}], warnings: [] }
  const [importFileError,   setImportFileError]   = useState('')
  const [savingImport,      setSavingImport]       = useState(false)
  const [importSuccess,     setImportSuccess]     = useState('')

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
        { data: customers,    error: custErr  },
        { data: allLines,     error: linesErr },
        { data: activityLines,error: actErr   },
        { data: notes,        error: notesErr },
      ] = await Promise.all([
        supabase.from('customers').select('id, company_name, sector, offer_status').order('company_name'),
        supabase.from('order_lines').select('customer_id, date, sale_price, purchase_price, quantity').gte('date', windowStartStr),
        supabase.from('order_lines').select('customer_id, date').order('date', { ascending: false }),
        supabase.from('customer_notes')
          .select('id, text, created_at, customer_id, customers(company_name)')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (custErr)  throw custErr
      if (linesErr) throw linesErr
      if (actErr)   throw actErr
      if (notesErr) throw notesErr

      // Last order per customer
      const lastOrderMap = {}
      for (const l of (activityLines ?? [])) {
        if (!lastOrderMap[l.customer_id]) lastOrderMap[l.customer_id] = l.date
      }

      const inactive = (customers ?? [])
        .filter(c => { const last = lastOrderMap[c.id]; return !last || new Date(last) < cutoff60 })
        .map(c => ({ ...c, lastOrderDate: lastOrderMap[c.id] ?? null, daysSince: lastOrderMap[c.id] ? daysSince(lastOrderMap[c.id]) : null }))

      setInactiveCustomers(inactive)
      setRecentNotes(notes ?? [])

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

  /* ── Multi-customer Excel import ─────────────────────────── */
  const handleImportFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportFileError('')
    setImportSuccess('')

    // Load all customers for name→id lookup
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('id, company_name')
    if (custErr) { setImportFileError('Errore nel caricamento dei clienti.'); e.target.value = ''; return }

    const customerMap = new Map(customers.map(c => [c.company_name, c.id]))

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        const HEADERS = ['product_name', 'quantity', 'date', 'sale_price', 'purchase_price']

        const valid    = []  // [{ sheetName, customerId, rows: [...] }]
        const warnings = []  // sheet names with no matching customer

        for (const sheetName of wb.SheetNames) {
          const customerId = customerMap.get(sheetName)
          if (!customerId) {
            warnings.push(sheetName)
            continue
          }

          const ws  = wb.Sheets[sheetName]
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          if (!raw || raw.length < 2) continue

          // Expect header row 1 with exact column names
          const headerRow = raw[0].map(c => String(c).trim())
          const colMap = {}
          HEADERS.forEach(h => { colMap[h] = headerRow.indexOf(h) })

          const rows = []
          for (let i = 1; i < raw.length; i++) {
            const row = raw[i]
            if (!row || row.every(c => c === '' || c === null || c === undefined)) continue

            const product_name   = String(row[colMap.product_name] ?? '').trim()
            const quantity       = parseFloat(row[colMap.quantity])
            const date           = parseDDMMYYYY(row[colMap.date])
            const sale_price     = parseFloat(row[colMap.sale_price])
            const purchase_price = parseFloat(row[colMap.purchase_price])

            // Skip rows with missing/zero prices
            if (!sale_price || !purchase_price || sale_price === 0 || purchase_price === 0) continue
            if (!product_name || isNaN(quantity) || !date || isNaN(sale_price) || isNaN(purchase_price)) continue

            rows.push({ product_name, quantity, date, sale_price, purchase_price })
          }

          if (rows.length > 0) {
            valid.push({ sheetName, customerId, rows })
          }
        }

        setImportPreview({ valid, warnings })
        setImportModalOpen(true)
      } catch (err) {
        setImportFileError('Impossibile leggere il file. Verifica che sia un .xlsx valido.')
        console.error(err)
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.valid?.length) return
    setSavingImport(true)

    const allRows = importPreview.valid.flatMap(({ customerId, rows }) =>
      rows.map(r => ({
        customer_id:    customerId,
        product_id:     null,
        product_name:   r.product_name,
        date:           r.date,
        quantity:       r.quantity,
        sale_price:     r.sale_price,
        purchase_price: r.purchase_price,
        notes:          null,
      }))
    )

    const { error } = await supabase.from('order_lines').insert(allRows)

    if (error) {
      setImportFileError("Errore durante l'importazione. Riprova.")
      setSavingImport(false)
      return
    }

    const totalRows      = allRows.length
    const totalCustomers = importPreview.valid.length
    setImportSuccess(`Importate ${totalRows} righe per ${totalCustomers} client${totalCustomers === 1 ? 'e' : 'i'}`)
    setSavingImport(false)
    setImportModalOpen(false)
    setImportPreview(null)
    fetchData()
  }

  const sectorLabel = s => s === 'glues' ? 'Colle' : 'Abrasivi'

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title="FacHub" showLogout />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleImportFileChange}
      />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">

        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        ) : (
          <>
            {/* ── Success banner ─────────────────────────── */}
            {importSuccess && (
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
                <span>✓ {importSuccess}</span>
                <button onClick={() => setImportSuccess('')} className="text-green-500 hover:text-green-700 ml-3">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── File error banner ──────────────────────── */}
            {importFileError && (
              <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                <span>{importFileError}</span>
                <button onClick={() => setImportFileError('')} className="text-red-400 hover:text-red-600 ml-3">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

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

            {/* ── Inactive customers ─────────────────────── */}
            <section>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Clienti senza ordini da +{INACTIVE_DAYS} giorni
                  </h2>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-navy-800 text-white rounded-lg text-xs font-semibold hover:bg-navy-900 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Importa da Excel
                </button>
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

      {/* ═══ Import preview modal ═══════════════════════════ */}
      {importPreview && (
        <Modal
          isOpen={importModalOpen}
          onClose={() => { setImportModalOpen(false); setImportPreview(null) }}
          title="Anteprima importazione"
        >
          <div className="space-y-4">

            {/* Valid sheets summary */}
            {importPreview.valid.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">
                  Righe da importare per cliente:
                </p>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                  {importPreview.valid.map(({ sheetName, rows }) => (
                    <div key={sheetName} className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <span className="text-sm font-medium text-navy-800">{sheetName}</span>
                      <span className="text-sm font-semibold text-green-600">
                        {rows.length} {rows.length === 1 ? 'riga' : 'righe'}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                    <span className="text-sm font-semibold text-gray-600">Totale</span>
                    <span className="text-sm font-bold text-navy-800">
                      {importPreview.valid.reduce((s, c) => s + c.rows.length, 0)} righe
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl text-sm">
                Nessuna riga valida trovata nel file.
              </div>
            )}

            {/* Warnings for unmatched sheets */}
            {importPreview.warnings.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl space-y-1">
                <p className="text-xs font-semibold text-yellow-800 mb-1">
                  Fogli ignorati (cliente non trovato):
                </p>
                {importPreview.warnings.map(name => (
                  <p key={name} className="text-xs text-yellow-700">• {name}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setImportModalOpen(false); setImportPreview(null) }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={savingImport || importPreview.valid.length === 0}
                className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingImport && <Spinner size="sm" />}
                {savingImport ? 'Importazione...' : `Importa ${importPreview.valid.reduce((s, c) => s + c.rows.length, 0)} righe`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

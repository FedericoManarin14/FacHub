import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Topbar from '../../components/Topbar'
import BottomNav from '../../components/BottomNav'
import Spinner from '../../components/Spinner'

/* ── helpers ─────────────────────────────────────────────── */
function daysSinceDate(dateStr) {
  if (!dateStr) return Infinity
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function intervalStatus(ds, avgDays) {
  if (!avgDays || avgDays <= 0) return null
  if (ds <= avgDays) return 'regolare'
  if (ds <= avgDays + 30) return 'attesa'
  return 'ritardo'
}

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return `${(+n).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg`
}

// Total stock per product: SUM(units × quantity_kg)
function buildStockMap(rows) {
  const map = {}
  for (const row of rows) {
    const units = row.units ?? 1
    const kg    = +(row.quantity_kg) || 0
    if (!map[row.product_name]) map[row.product_name] = 0
    map[row.product_name] += units * kg
  }
  return map
}

/* ── sub-components ──────────────────────────────────────── */
function SectionHeader({ color, label, count }) {
  const colors = {
    red:    'bg-red-50 border-red-200 text-red-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    gray:   'bg-gray-50 border-gray-200 text-gray-600',
  }
  return (
    <div className={`flex items-center justify-between px-4 py-2 rounded-xl border ${colors[color]} mb-2`}>
      <span className="font-semibold text-sm">{label}</span>
      <span className="text-xs font-medium opacity-70">{count} {count === 1 ? 'prodotto' : 'prodotti'}</span>
    </div>
  )
}

function MonitorCard({ item, type }) {
  const styles = {
    imminenti: { dot: 'bg-red-500',    border: 'border-red-100' },
    attesa:    { dot: 'bg-yellow-400', border: 'border-yellow-100' },
    ritardo:   { dot: 'bg-gray-400',   border: 'border-gray-100' },
  }
  const s = styles[type]

  let timingLabel, timingColor
  if (type === 'imminenti') {
    if (item.remaining > 0) {
      timingLabel = `Ordine previsto tra ${item.remaining}g`
      timingColor = 'text-orange-600'
    } else if (item.remaining === 0) {
      timingLabel = 'Ordine previsto oggi'
      timingColor = 'text-red-600 font-semibold'
    } else {
      timingLabel = `Ordine previsto ${Math.abs(item.remaining)}g fa`
      timingColor = 'text-red-600 font-semibold'
    }
  } else {
    timingLabel  = item.days_since !== null ? `Ultimo ordine ${item.days_since}g fa` : 'Nessun ordine registrato'
    timingColor  = type === 'attesa' ? 'text-yellow-700' : 'text-gray-600'
  }

  return (
    <div className={`bg-white rounded-xl border ${s.border} px-4 py-3 flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
          <p className="text-xs text-gray-400 truncate">{item.customer_name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-right">
        <div>
          <p className={`text-xs ${timingColor}`}>{timingLabel}</p>
          <p className="text-xs text-gray-400">ogni {item.avg_days}g</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-600 font-medium">
            {item.stock_kg !== null ? fmt(item.stock_kg) : '— kg'}
          </p>
          <p className="text-xs text-gray-400">in stock</p>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ label }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-4 px-4 text-center text-gray-400 text-sm">
      {label}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════ */
export default function StockDashboard() {
  const [loading,   setLoading]   = useState(true)
  const [imminenti, setImminenti] = useState([])
  const [attesa,    setAttesa]    = useState([])
  const [ritardo,   setRitardo]   = useState([])
  const [demand,    setDemand]    = useState([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [custRes, intRes, linesRes, stockRes] = await Promise.all([
        supabase.from('customers').select('id, company_name').eq('offer_status', 'ongoing'),
        supabase.from('customer_product_intervals').select('*'),
        supabase.from('order_lines').select('customer_id, product_name, quantity, date').order('date', { ascending: false }),
        supabase.from('warehouse_stock').select('product_name, quantity_kg, units'),
      ])

      const activeCustomers = custRes.data ?? []
      const activeMap       = Object.fromEntries(activeCustomers.map(c => [c.id, c]))
      const intervals       = (intRes.data ?? []).filter(i => activeMap[i.customer_id])
      const lines           = linesRes.data ?? []

      // Total stock per product = SUM(units × quantity_kg)
      const totalStockMap = buildStockMap(stockRes.data ?? [])

      // Last order date per customer+product
      const lastOrderMap = {}
      for (const line of lines) {
        const key = `${line.customer_id}__${line.product_name}`
        if (!lastOrderMap[key]) lastOrderMap[key] = line.date
      }

      const imminentiArr = [], attesaArr = [], ritardoArr = []

      for (const interval of intervals) {
        const customer = activeMap[interval.customer_id]
        if (!customer) continue

        const key       = `${interval.customer_id}__${interval.product_name}`
        const lastDate  = lastOrderMap[key]
        const ds        = daysSinceDate(lastDate)
        const remaining = ds === Infinity ? null : interval.avg_days - ds
        const status    = ds === Infinity ? 'ritardo' : intervalStatus(ds, interval.avg_days)
        const stockKg   = totalStockMap[interval.product_name] ?? null

        const item = {
          customer_id:   interval.customer_id,
          customer_name: customer.company_name,
          product_name:  interval.product_name,
          avg_days:      interval.avg_days,
          days_since:    ds === Infinity ? null : ds,
          remaining,
          stock_kg: stockKg > 0 ? stockKg : null,
        }

        if (remaining !== null && remaining >= 0 && remaining < 15) {
          imminentiArr.push(item)
        } else if (status === 'attesa') {
          attesaArr.push(item)
        } else if (status === 'ritardo') {
          ritardoArr.push(item)
        }
      }

      imminentiArr.sort((a, b) => a.remaining - b.remaining)
      attesaArr.sort((a, b) => (b.days_since ?? 0) - (a.days_since ?? 0))
      ritardoArr.sort((a, b) => (b.days_since ?? Infinity) - (a.days_since ?? Infinity))

      setImminenti(imminentiArr)
      setAttesa(attesaArr)
      setRitardo(ritardoArr)

      /* ── Demand forecast — 30 days ─────────────────────── */
      const productContribs = {}
      for (const interval of intervals) {
        const customerLines = lines
          .filter(l => l.customer_id === interval.customer_id && l.product_name === interval.product_name)
          .slice(0, 3)
        if (customerLines.length === 0) continue
        const avgQty       = customerLines.reduce((s, l) => s + (+l.quantity), 0) / customerLines.length
        const contribution = (30 / interval.avg_days) * avgQty
        if (!productContribs[interval.product_name]) productContribs[interval.product_name] = 0
        productContribs[interval.product_name] += contribution
      }

      const demandArr = Object.entries(productContribs)
        .map(([product_name, total]) => {
          const stockKg  = totalStockMap[product_name] ?? null
          const expected = Math.round(total * 10) / 10
          const sufficient = stockKg !== null ? stockKg >= expected : null
          return { product_name, expected_kg: expected, stock_kg: stockKg, sufficient }
        })
        .filter(d => d.expected_kg > 0)
        .sort((a, b) => a.product_name.localeCompare(b.product_name))

      setDemand(demandArr)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Topbar title="FacStock" showLogout />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">
        {loading ? (
          <Spinner className="py-20" />
        ) : (
          <>
            {/* ── Ordini imminenti ───────────────────────────── */}
            <section>
              <SectionHeader color="red" label="Ordini imminenti" count={imminenti.length} />
              {imminenti.length === 0 ? (
                <EmptyState label="Nessun ordine previsto nei prossimi 15 giorni" />
              ) : (
                <div className="space-y-2">
                  {imminenti.map((item, i) => <MonitorCard key={`imm-${i}`} item={item} type="imminenti" />)}
                </div>
              )}
            </section>

            {/* ── Attesa ordine ──────────────────────────────── */}
            <section>
              <SectionHeader color="yellow" label="Attesa ordine" count={attesa.length} />
              {attesa.length === 0 ? (
                <EmptyState label="Nessun prodotto in attesa di ordine" />
              ) : (
                <div className="space-y-2">
                  {attesa.map((item, i) => <MonitorCard key={`att-${i}`} item={item} type="attesa" />)}
                </div>
              )}
            </section>

            {/* ── Ritardo ───────────────────────────────────── */}
            <section>
              <SectionHeader color="gray" label="Ritardo" count={ritardo.length} />
              {ritardo.length === 0 ? (
                <EmptyState label="Nessun prodotto in ritardo" />
              ) : (
                <div className="space-y-1.5">
                  {ritardo.map((item, i) => <MonitorCard key={`rit-${i}`} item={item} type="ritardo" />)}
                </div>
              )}
            </section>

            {/* ── Fabbisogno stimato — prossimi 30 giorni ───── */}
            {demand.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                  Fabbisogno stimato — prossimi 30 giorni
                </p>
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {demand.map((d, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                      <p className="text-xs font-medium text-gray-700 min-w-0 truncate">{d.product_name}</p>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{fmt(d.expected_kg)} attesi</p>
                          <p className="text-xs text-gray-400">
                            {d.stock_kg !== null ? `${fmt(d.stock_kg)} in stock` : 'Stock non registrato'}
                          </p>
                        </div>
                        {d.sufficient === null ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">Scorte non registrate</span>
                        ) : d.sufficient ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">✅ Scorte sufficienti</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">⚠️ Riordino consigliato</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

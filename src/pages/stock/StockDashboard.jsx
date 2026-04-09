import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

function fmt(n, unit = 'kg') {
  if (n === null || n === undefined) return '—'
  return `${(+n).toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${unit}`
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

function MonitorCard({ item, accent }) {
  const accents = {
    red:    { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',    border: 'border-red-100' },
    yellow: { dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-100' },
    gray:   { dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600',   border: 'border-gray-100' },
  }
  const a = accents[accent]

  return (
    <div className={`bg-white rounded-xl border ${a.border} px-4 py-3 flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.dot}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
          <p className="text-xs text-gray-400 truncate">{item.customer_name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-right">
        {item.remaining !== null && item.remaining >= 0 ? (
          <div>
            <p className="text-xs font-semibold text-red-600">{item.remaining}g rimasti</p>
            <p className="text-xs text-gray-400">ogni {item.avg_days}g</p>
          </div>
        ) : item.days_since !== null ? (
          <div>
            <p className="text-xs font-semibold text-gray-700">{item.days_since}g fa</p>
            <p className="text-xs text-gray-400">ogni {item.avg_days}g</p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-400">Nessun ordine</p>
            <p className="text-xs text-gray-400">ogni {item.avg_days}g</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-xs text-gray-500 font-medium">
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
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [imminenti, setImminenti] = useState([])
  const [attesa, setAttesa]       = useState([])
  const [ritardo, setRitardo]     = useState([])
  const [demand, setDemand]       = useState([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [custRes, intRes, linesRes, stockRes] = await Promise.all([
        supabase.from('customers').select('id, company_name').eq('offer_status', 'active'),
        supabase.from('customer_product_intervals').select('*'),
        supabase.from('order_lines').select('customer_id, product_name, quantity, date').order('date', { ascending: false }),
        supabase.from('warehouse_stock').select('*'),
      ])

      const activeCustomers = custRes.data ?? []
      const activeMap       = Object.fromEntries(activeCustomers.map(c => [c.id, c]))
      const intervals       = (intRes.data ?? []).filter(i => activeMap[i.customer_id])
      const lines           = linesRes.data ?? []
      const stock           = stockRes.data ?? []
      const stockMap        = Object.fromEntries(stock.map(s => [s.product_name, s]))

      /* last order date per customer+product */
      const lastOrderMap = {}
      for (const line of lines) {
        const key = `${line.customer_id}__${line.product_name}`
        if (!lastOrderMap[key]) lastOrderMap[key] = line.date
      }

      /* categorise */
      const imminentiArr = [], attesaArr = [], ritardoArr = []

      for (const interval of intervals) {
        const customer = activeMap[interval.customer_id]
        if (!customer) continue
        const key      = `${interval.customer_id}__${interval.product_name}`
        const lastDate = lastOrderMap[key]
        const ds       = daysSinceDate(lastDate)
        const status   = ds === Infinity ? 'ritardo' : intervalStatus(ds, interval.avg_days)
        const remaining = ds === Infinity ? null : interval.avg_days - ds
        const stockEntry = stockMap[interval.product_name]

        const item = {
          customer_id:   interval.customer_id,
          customer_name: customer.company_name,
          product_name:  interval.product_name,
          avg_days:      interval.avg_days,
          days_since:    ds === Infinity ? null : ds,
          remaining,
          stock_kg:      stockEntry?.quantity_kg ?? null,
        }

        if (status === 'ritardo') {
          ritardoArr.push(item)
        } else if (status === 'attesa') {
          attesaArr.push(item)
        } else if (status === 'regolare' && remaining !== null && remaining < 15) {
          imminentiArr.push(item)
        }
      }

      imminentiArr.sort((a, b) => a.remaining - b.remaining)
      attesaArr.sort((a, b) => (b.days_since ?? 0) - (a.days_since ?? 0))
      ritardoArr.sort((a, b) => (b.days_since ?? Infinity) - (a.days_since ?? Infinity))

      setImminenti(imminentiArr)
      setAttesa(attesaArr)
      setRitardo(ritardoArr)

      /* demand forecast — 30 days */
      const productContribs = {}
      for (const interval of intervals) {
        const customerLines = lines
          .filter(l => l.customer_id === interval.customer_id && l.product_name === interval.product_name)
          .slice(0, 3)
        if (customerLines.length === 0) continue
        const avgQty      = customerLines.reduce((s, l) => s + (+l.quantity), 0) / customerLines.length
        const contribution = (30 / interval.avg_days) * avgQty
        if (!productContribs[interval.product_name]) productContribs[interval.product_name] = 0
        productContribs[interval.product_name] += contribution
      }

      const demandArr = Object.entries(productContribs)
        .map(([product_name, total]) => {
          const stockEntry = stockMap[product_name]
          const stock_kg   = stockEntry?.quantity_kg ?? null
          const expected   = Math.round(total * 10) / 10
          const sufficient = stock_kg !== null ? stock_kg >= expected : null
          return { product_name, expected_kg: expected, stock_kg, sufficient }
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
                <EmptyState label="Nessun ordine imminente nei prossimi 15 giorni" />
              ) : (
                <div className="space-y-2">
                  {imminenti.map((item, i) => (
                    <MonitorCard key={`imm-${i}`} item={item} accent="red" />
                  ))}
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
                  {attesa.map((item, i) => (
                    <MonitorCard key={`att-${i}`} item={item} accent="yellow" />
                  ))}
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
                  {ritardo.map((item, i) => (
                    <MonitorCard key={`rit-${i}`} item={item} accent="gray" />
                  ))}
                </div>
              )}
            </section>

            {/* ── Fabbisogno stimato ─────────────────────────── */}
            {demand.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                  Fabbisogno stimato — prossimi 30 giorni
                </p>
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {demand.map((d, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                      <p className="text-xs font-medium text-gray-700 min-w-0 truncate">{d.product_name}</p>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div>
                          <p className="text-xs text-gray-500">{fmt(d.expected_kg)} attesi</p>
                          <p className="text-xs text-gray-400">
                            {d.stock_kg !== null ? `${fmt(d.stock_kg)} in stock` : 'Stock non registrato'}
                          </p>
                        </div>
                        <span className="text-sm">
                          {d.sufficient === null
                            ? <span className="text-xs text-gray-400">⚠️</span>
                            : d.sufficient
                              ? <span title="Sufficiente">✅</span>
                              : <span title="Riordino necessario">⚠️</span>
                          }
                        </span>
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

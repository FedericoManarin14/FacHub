import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Spinner from '../components/Spinner'

/* ── helpers ─────────────────────────────────────────────── */
function formatCurrency(val) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val ?? 0)
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calcMargin(sale, purchase) {
  if (!purchase || +purchase === 0) return null
  return (((+sale - +purchase) / +purchase) * 100)
}

function marginColor(m) {
  if (m === null) return 'text-gray-400'
  if (m >= 30) return 'text-green-600'
  if (m >= 15) return 'text-yellow-600'
  return 'text-red-500'
}

/* ══════════════════════════════════════════════════════════ */
export default function ProductDetail() {
  const { productName } = useParams()
  const decoded = decodeURIComponent(productName)

  const [product,    setProduct]    = useState(null)
  const [customers,  setCustomers]  = useState([])
  const [priceHistory, setPriceHistory] = useState([])
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => { loadData() }, [decoded])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [prodRes, linesRes, custRes] = await Promise.all([
        supabase.from('products').select('*').eq('name', decoded).maybeSingle(),
        supabase.from('order_lines')
          .select('customer_id, product_name, quantity, sale_price, purchase_price, date')
          .eq('product_name', decoded)
          .order('date', { ascending: false }),
        supabase.from('customers').select('id, company_name'),
      ])

      if (prodRes.error) throw prodRes.error
      if (linesRes.error) throw linesRes.error

      setProduct(prodRes.data)

      const lines   = linesRes.data ?? []
      const custMap = Object.fromEntries((custRes.data ?? []).map(c => [c.id, c]))

      /* ── Per-customer stats ───────────────────────────── */
      const custStats = {}
      for (const l of lines) {
        const cid = l.customer_id
        if (!custStats[cid]) {
          custStats[cid] = {
            customer_id:   cid,
            company_name:  custMap[cid]?.company_name ?? '—',
            total_kg:      0,
            total_revenue: 0,
            margins:       [],
            last_date:     null,
          }
        }
        const qty = +(l.quantity) || 0
        const sp  = +(l.sale_price) || 0
        const pp  = +(l.purchase_price) || 0
        custStats[cid].total_kg      += qty
        custStats[cid].total_revenue += qty * sp
        const m = calcMargin(sp, pp)
        if (m !== null) custStats[cid].margins.push(m)
        if (!custStats[cid].last_date || l.date > custStats[cid].last_date) {
          custStats[cid].last_date = l.date
        }
      }

      const custArr = Object.values(custStats).map(c => ({
        ...c,
        avg_margin: c.margins.length ? (c.margins.reduce((s, m) => s + m, 0) / c.margins.length) : null,
      })).sort((a, b) => b.total_revenue - a.total_revenue)

      setCustomers(custArr)

      /* ── Price history per customer ───────────────────── */
      // Group by customer_id + sale_price, find date range
      const priceMap = {} // key: `custId__price`
      for (const l of [...lines].reverse()) { // asc date
        const key = `${l.customer_id}__${l.sale_price}`
        if (!priceMap[key]) {
          priceMap[key] = {
            company_name: custMap[l.customer_id]?.company_name ?? '—',
            sale_price:   +(l.sale_price),
            first_date:   l.date,
            last_date:    l.date,
          }
        } else {
          if (l.date > priceMap[key].last_date) priceMap[key].last_date = l.date
        }
      }

      const ph = Object.values(priceMap)
        .sort((a, b) => a.company_name.localeCompare(b.company_name) || b.last_date.localeCompare(a.last_date))
      setPriceHistory(ph)

      /* ── Global stats ─────────────────────────────────── */
      const allMargins = lines
        .map(l => calcMargin(l.sale_price, l.purchase_price))
        .filter(m => m !== null)
      const totalRevenue = lines.reduce((s, l) => s + (+(l.quantity) || 0) * (+(l.sale_price) || 0), 0)
      const totalKg      = lines.reduce((s, l) => s + (+(l.quantity) || 0), 0)
      const avgMargin    = allMargins.length ? allMargins.reduce((s, m) => s + m, 0) / allMargins.length : null
      setStats({ totalRevenue, totalKg, avgMargin })

    } catch (e) {
      setError('Errore nel caricamento.')
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Topbar title={decoded} backTo="/products" />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        ) : (
          <>
            {/* ── Product header card ────────────────────── */}
            {product && (
              <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-bold text-navy-800">{product.name}</h1>
                    {product.type && <p className="text-sm text-gray-400 mt-0.5">{product.type}</p>}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-navy-50 text-navy-700 font-medium capitalize flex-shrink-0">
                    {product.category === 'glues' ? 'Colle' : 'Abrasivi'}
                  </span>
                </div>
                <div className="flex gap-6 pt-1 border-t border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Costo base</p>
                    <p className="text-sm font-semibold text-navy-800">{formatCurrency(product.purchase_cost_kg)}/kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Margine base</p>
                    <p className="text-sm font-semibold text-navy-800">{product.base_margin ?? '—'}%</p>
                  </div>
                  {product.purchase_cost_kg && product.base_margin && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Prezzo stimato</p>
                      <p className="text-sm font-semibold text-green-600">
                        {formatCurrency(+product.purchase_cost_kg * (1 + +product.base_margin / 100))}/kg
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Global stats ──────────────────────────── */}
            {stats && (
              <section className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Fatturato totale</p>
                  <p className="text-base font-bold text-navy-800">{formatCurrency(stats.totalRevenue)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Kg venduti</p>
                  <p className="text-base font-bold text-navy-800">
                    {stats.totalKg.toLocaleString('it-IT', { maximumFractionDigits: 1 })}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Margine medio</p>
                  <p className={`text-base font-bold ${marginColor(stats.avgMargin)}`}>
                    {stats.avgMargin !== null ? `${stats.avgMargin.toFixed(1)}%` : '—'}
                  </p>
                </div>
              </section>
            )}

            {/* ── Customers who buy this product ────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                Clienti acquirenti
              </h2>
              {customers.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-5 text-center text-gray-400 text-sm">
                  Nessun ordine registrato per questo prodotto
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {customers.map(c => (
                    <div key={c.customer_id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-navy-800 truncate">{c.company_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Ultimo ordine: {formatDate(c.last_date)}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div>
                          <p className="text-xs text-gray-500">{c.total_kg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg</p>
                          <p className="text-xs text-gray-400">totali</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-navy-700">{formatCurrency(c.total_revenue)}</p>
                          <p className="text-xs text-gray-400">fatturato</p>
                        </div>
                        <div>
                          <p className={`text-xs font-semibold ${marginColor(c.avg_margin)}`}>
                            {c.avg_margin !== null ? `${c.avg_margin.toFixed(1)}%` : '—'}
                          </p>
                          <p className="text-xs text-gray-400">margine</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Price history ─────────────────────────── */}
            {priceHistory.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                  Storico prezzi per cliente
                </h2>
                <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {priceHistory.map((ph, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-navy-800 truncate">{ph.company_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(ph.first_date)}
                          {ph.first_date !== ph.last_date ? ` → ${formatDate(ph.last_date)}` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-navy-700 flex-shrink-0">
                        {formatCurrency(ph.sale_price)}/kg
                      </p>
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

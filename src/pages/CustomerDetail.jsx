import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const STATUS_OPTIONS = [
  { value: 'ongoing', label: 'In corso',  color: 'text-green-600' },
  { value: 'pending', label: 'In attesa', color: 'text-yellow-600' },
  { value: 'expired', label: 'Rifiutata', color: 'text-red-600' },
]

const STATUS_BG = {
  ongoing: 'bg-green-50 border-green-200',
  pending: 'bg-yellow-50 border-yellow-200',
  expired: 'bg-red-50 border-red-200',
}

function calcMargin(sale, purchase) {
  if (!purchase || purchase === 0) return 0
  return ((sale - purchase) / purchase) * 100
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatCurrency(val) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val ?? 0)
}

function getLast6Months() {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
    })
  }
  return months
}

/* ── shared field style ──────────────────────────────────── */
const fieldCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white'

/* ═══════════════════════════════════════════════════════════ */
export default function CustomerDetail() {
  const { id } = useParams()
  const [customer,  setCustomer]  = useState(null)
  const [orders,    setOrders]    = useState([])
  const [offers,    setOffers]    = useState([])
  const [notes,     setNotes]     = useState([])
  const [products,  setProducts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  /* note modal */
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteText,      setNoteText]      = useState('')
  const [savingNote,    setSavingNote]    = useState(false)

  /* order modal */
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderForm,      setOrderForm]      = useState({ date: today(), notes: '' })
  const [orderLines,     setOrderLines]     = useState([emptyLine()])
  const [savingOrder,    setSavingOrder]    = useState(false)
  const [orderError,     setOrderError]     = useState('')

  /* offer modal */
  const [offerModalOpen, setOfferModalOpen] = useState(false)
  const [offerForm,      setOfferForm]      = useState(emptyOffer())
  const [savingOffer,    setSavingOffer]     = useState(false)
  const [offerError,     setOfferError]     = useState('')

  /* status */
  const [statusSaving, setStatusSaving] = useState(false)

  function today() { return new Date().toISOString().split('T')[0] }
  function emptyLine() {
    return { product_id: '', product_name: '', quantity: 1, sale_price: '', purchase_price: '' }
  }
  function emptyOffer() {
    return { date: today(), product_id: '', product_name: '', proposed_price: '', notes: '' }
  }

  /* ── fetch ─────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [custRes, ordRes, offRes, notesRes, prodsRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).single(),
        supabase.from('orders').select('*, order_lines(*)').eq('customer_id', id).order('date', { ascending: false }),
        supabase.from('offers').select('*').eq('customer_id', id).order('date', { ascending: false }),
        supabase.from('customer_notes').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
      ])
      if (custRes.error)  throw custRes.error
      if (ordRes.error)   throw ordRes.error
      if (notesRes.error) throw notesRes.error
      setCustomer(custRes.data)
      setOrders(ordRes.data)
      setOffers(offRes.error ? [] : offRes.data)
      setNotes(notesRes.data)
      if (!prodsRes.error) setProducts(prodsRes.data)
    } catch (e) {
      setError('Errore nel caricamento del cliente.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── chart ──────────────────────────────────────────────── */
  const chartData = getLast6Months().map(({ year, month, label }) => {
    const revenue = orders
      .filter(o => { const d = new Date(o.date); return d.getFullYear() === year && d.getMonth() + 1 === month })
      .reduce((sum, o) => sum + (o.order_lines || []).reduce((s, l) => s + l.quantity * l.sale_price, 0), 0)
    return { label, revenue: parseFloat(revenue.toFixed(2)) }
  })

  const avgMargin = (() => {
    const lines = orders.flatMap(o => o.order_lines || [])
    if (!lines.length) return null
    return (lines.reduce((s, l) => s + calcMargin(l.sale_price, l.purchase_price), 0) / lines.length).toFixed(1)
  })()

  /* ── status ─────────────────────────────────────────────── */
  const handleStatusChange = async (newStatus) => {
    setStatusSaving(true)
    const { data, error } = await supabase
      .from('customers').update({ offer_status: newStatus }).eq('id', id).select().single()
    if (!error) setCustomer(data)
    setStatusSaving(false)
  }

  /* ── note ───────────────────────────────────────────────── */
  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!noteText.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase
      .from('customer_notes').insert([{ customer_id: id, text: noteText.trim() }]).select().single()
    if (!error) { setNotes(p => [data, ...p]); setNoteText(''); setNoteModalOpen(false) }
    setSavingNote(false)
  }

  /* ── order helpers ──────────────────────────────────────── */
  const handleLineChange = (index, field, value) => {
    setOrderLines(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      if (field === 'product_id' && value) {
        const p = products.find(p => p.id === value)
        if (p) {
          next[index].product_name   = p.name
          next[index].purchase_price = p.purchase_cost_kg
          if (!next[index].sale_price)
            next[index].sale_price = parseFloat((p.purchase_cost_kg * (1 + p.base_margin / 100)).toFixed(4))
        }
      }
      return next
    })
  }
  const addLine    = () => setOrderLines(p => [...p, emptyLine()])
  const removeLine = (i) => setOrderLines(p => p.filter((_, idx) => idx !== i))

  const handleAddOrder = async (e) => {
    e.preventDefault()
    setOrderError('')
    const validLines = orderLines.filter(l => l.product_name.trim() && l.quantity > 0)
    if (!validLines.length) { setOrderError('Aggiungi almeno una riga prodotto valida.'); return }
    setSavingOrder(true)

    const { data: orderData, error: orderErr } = await supabase
      .from('orders').insert([{ customer_id: id, date: orderForm.date, notes: orderForm.notes }]).select().single()
    if (orderErr) { setOrderError('Errore nel salvataggio ordine.'); setSavingOrder(false); return }

    const { error: linesErr } = await supabase.from('order_lines').insert(
      validLines.map(l => ({
        order_id: orderData.id, product_id: l.product_id || null,
        product_name: l.product_name, quantity: parseFloat(l.quantity),
        sale_price: parseFloat(l.sale_price) || 0, purchase_price: parseFloat(l.purchase_price) || 0,
      }))
    )
    if (linesErr) { setOrderError('Errore nel salvataggio delle righe.'); setSavingOrder(false); return }

    setSavingOrder(false); setOrderModalOpen(false)
    setOrderForm({ date: today(), notes: '' }); setOrderLines([emptyLine()])
    fetchData()
  }

  /* ── offer helpers ──────────────────────────────────────── */
  const handleOfferProductChange = (productId) => {
    const p = products.find(p => p.id === productId)
    setOfferForm(f => ({
      ...f,
      product_id:     productId,
      product_name:   p ? p.name : f.product_name,
      proposed_price: p ? parseFloat((p.purchase_cost_kg * (1 + p.base_margin / 100)).toFixed(4)) : f.proposed_price,
    }))
  }

  const handleAddOffer = async (e) => {
    e.preventDefault()
    setOfferError('')
    const name = offerForm.product_id
      ? (products.find(p => p.id === offerForm.product_id)?.name ?? offerForm.product_name)
      : offerForm.product_name
    if (!name.trim()) { setOfferError('Seleziona o scrivi un prodotto.'); return }
    if (!offerForm.proposed_price) { setOfferError('Inserisci un prezzo proposto.'); return }
    setSavingOffer(true)

    const { data, error } = await supabase.from('offers').insert([{
      customer_id:    id,
      product_id:     offerForm.product_id || null,
      product_name:   name.trim(),
      proposed_price: parseFloat(offerForm.proposed_price),
      notes:          offerForm.notes.trim() || null,
      date:           offerForm.date,
    }]).select().single()

    if (error) { setOfferError('Errore nel salvataggio. Riprova.'); setSavingOffer(false); return }
    setOffers(p => [data, ...p])
    setOfferModalOpen(false); setOfferForm(emptyOffer()); setSavingOffer(false)
  }

  /* ── loading / error states ─────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title="Cliente" backTo="/customers" />
      <Spinner size="lg" className="py-20" />
      <BottomNav />
    </div>
  )

  if (error || !customer) return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title="Cliente" backTo="/customers" />
      <div className="max-w-4xl mx-auto px-4 py-5">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error || 'Cliente non trovato.'}
        </div>
      </div>
      <BottomNav />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title={customer.company_name} backTo="/customers" />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* ── Header card ───────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div>
            <h1 className="text-xl font-bold text-navy-800">{customer.company_name}</h1>
            {customer.description && (
              <p className="text-sm text-gray-500 mt-1">{customer.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {customer.email && (
              <a
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(customer.email)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-navy-50 hover:bg-navy-100 text-navy-700 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {customer.phone}
              </a>
            )}
          </div>
        </div>

        {/* ── Offer status ──────────────────────────────────── */}
        <div className={`bg-white rounded-xl border p-4 ${STATUS_BG[customer.offer_status]}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Stato offerta</span>
            {statusSaving && <Spinner size="sm" />}
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                disabled={statusSaving}
                className={`flex-1 min-w-[100px] py-2.5 rounded-lg text-sm font-semibold transition-all border ${
                  customer.offer_status === opt.value
                    ? opt.value === 'ongoing' ? 'bg-green-500 text-white border-green-500'
                    : opt.value === 'pending' ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Orders ────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy-800">Ordini ({orders.length})</h2>
            <button
              onClick={() => { setOrderModalOpen(true); setOrderError('') }}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi
            </button>
          </div>
          {orders.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Nessun ordine registrato</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map(order => {
                const total = (order.order_lines || []).reduce((s, l) => s + l.quantity * l.sale_price, 0)
                return (
                  <div key={order.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-navy-700">{formatDate(order.date)}</span>
                      <span className="text-sm font-semibold text-navy-800">{formatCurrency(total)}</span>
                    </div>
                    {order.notes && <p className="text-xs text-gray-500 mb-2 italic">{order.notes}</p>}
                    <div className="space-y-1.5">
                      {(order.order_lines || []).map(line => {
                        const margin = calcMargin(line.sale_price, line.purchase_price)
                        return (
                          <div key={line.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-gray-700 font-medium truncate block">{line.product_name}</span>
                              <span className="text-gray-400">{line.quantity} kg</span>
                            </div>
                            <div className="text-right ml-3 flex-shrink-0">
                              <div className="text-gray-700">{formatCurrency(line.sale_price)}/kg</div>
                              <div className={`font-semibold ${margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {margin.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Offers ────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy-800">Offerte ({offers.length})</h2>
            <button
              onClick={() => { setOfferModalOpen(true); setOfferError(''); setOfferForm(emptyOffer()) }}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi
            </button>
          </div>

          {offers.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Nessuna offerta registrata</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {offers.map(offer => (
                <div key={offer.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-800 truncate">{offer.product_name}</p>
                      {offer.notes && (
                        <p className="text-xs text-gray-500 mt-0.5 italic">{offer.notes}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-navy-700">{formatCurrency(offer.proposed_price)}<span className="text-xs font-normal text-gray-400">/kg</span></p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(offer.date)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Notes ─────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy-800">Note ({notes.length})</h2>
            <button
              onClick={() => { setNoteModalOpen(true); setNoteText('') }}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Nessuna nota presente</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {notes.map(note => (
                <div key={note.id} className="p-4">
                  <p className="text-xs text-gray-400 mb-1">{formatDate(note.created_at)}</p>
                  <p className="text-sm text-gray-700">{note.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Revenue chart ─────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-semibold text-navy-800 mb-4">Fatturato ultimi 6 mesi</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
              <Tooltip
                formatter={v => [formatCurrency(v), 'Fatturato']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Bar dataKey="revenue" fill="#1e2a4a" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
          {avgMargin !== null && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Margine medio</span>
              <span className={`text-sm font-bold ${parseFloat(avgMargin) >= 30 ? 'text-green-600' : parseFloat(avgMargin) >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                {avgMargin}%
              </span>
            </div>
          )}
        </section>

      </main>

      <BottomNav />

      {/* ═══ Note modal ══════════════════════════════════════ */}
      <Modal isOpen={noteModalOpen} onClose={() => setNoteModalOpen(false)} title="Nuova nota">
        <form onSubmit={handleAddNote} className="space-y-4">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={5} required autoFocus
            className={`${fieldCls} resize-none`}
            placeholder="Scrivi una nota su questo cliente..."
          />
          <div className="flex gap-3">
            <button type="button" onClick={() => setNoteModalOpen(false)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingNote || !noteText.trim()}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingNote && <Spinner size="sm" />}
              {savingNote ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Order modal ═════════════════════════════════════ */}
      <Modal isOpen={orderModalOpen} onClose={() => setOrderModalOpen(false)} title="Nuovo ordine">
        <form onSubmit={handleAddOrder} className="space-y-4">
          {orderError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{orderError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data ordine</label>
            <input type="date" value={orderForm.date} required
              onChange={e => setOrderForm(f => ({ ...f, date: e.target.value }))}
              className={fieldCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note ordine</label>
            <textarea value={orderForm.notes} rows={2}
              onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
              className={`${fieldCls} resize-none`} placeholder="Note sull'ordine (opzionale)" />
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Prodotti</label>
              <button type="button" onClick={addLine}
                className="text-xs text-navy-600 font-semibold hover:text-navy-800 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Aggiungi riga
              </button>
            </div>
            <div className="space-y-3">
              {orderLines.map((line, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <select value={line.product_id}
                      onChange={e => handleLineChange(i, 'product_id', e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-lg text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white">
                      <option value="">-- Seleziona prodotto --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {orderLines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)}
                        className="p-2.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {!line.product_id && (
                    <input type="text" value={line.product_name}
                      onChange={e => handleLineChange(i, 'product_name', e.target.value)}
                      placeholder="Oppure scrivi nome prodotto"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800" />
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'quantity',       label: 'Qtà (kg)',        step: '0.001', min: '0.001' },
                      { key: 'sale_price',     label: 'P. vendita €/kg', step: '0.0001', min: '0' },
                      { key: 'purchase_price', label: 'P. acquisto €/kg',step: '0.0001', min: '0' },
                    ].map(({ key, label, step, min }) => (
                      <div key={key}>
                        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                        <input type="number" value={line[key]}
                          onChange={e => handleLineChange(i, key, e.target.value)}
                          min={min} step={step} required
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800" />
                      </div>
                    ))}
                  </div>
                  {line.sale_price && line.purchase_price && (
                    <div className="text-xs text-right">
                      <span className="text-gray-400">Margine: </span>
                      <span className={`font-semibold ${calcMargin(line.sale_price, line.purchase_price) >= 30 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {calcMargin(line.sale_price, line.purchase_price).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOrderModalOpen(false)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingOrder}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingOrder && <Spinner size="sm" />}
              {savingOrder ? 'Salvataggio...' : 'Salva ordine'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Offer modal ═════════════════════════════════════ */}
      <Modal isOpen={offerModalOpen} onClose={() => setOfferModalOpen(false)} title="Nuova offerta">
        <form onSubmit={handleAddOffer} className="space-y-4">
          {offerError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{offerError}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data offerta</label>
            <input type="date" value={offerForm.date} required
              onChange={e => setOfferForm(f => ({ ...f, date: e.target.value }))}
              className={fieldCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prodotto</label>
            <select value={offerForm.product_id}
              onChange={e => handleOfferProductChange(e.target.value)}
              className={fieldCls}>
              <option value="">-- Seleziona dal catalogo --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {!offerForm.product_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Oppure scrivi nome prodotto</label>
              <input type="text" value={offerForm.product_name}
                onChange={e => setOfferForm(f => ({ ...f, product_name: e.target.value }))}
                className={fieldCls} placeholder="Es. Colla Epossidica speciale" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prezzo proposto (€/kg)</label>
            <input type="number" value={offerForm.proposed_price} required
              onChange={e => setOfferForm(f => ({ ...f, proposed_price: e.target.value }))}
              min="0" step="0.0001"
              className={fieldCls} placeholder="0.0000" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (opzionale)</label>
            <textarea value={offerForm.notes} rows={3}
              onChange={e => setOfferForm(f => ({ ...f, notes: e.target.value }))}
              className={`${fieldCls} resize-none`}
              placeholder="Es. Prezzo valido fino al 30 aprile, include trasporto..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOfferModalOpen(false)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingOffer}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingOffer && <Spinner size="sm" />}
              {savingOffer ? 'Salvataggio...' : 'Salva offerta'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

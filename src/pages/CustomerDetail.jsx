import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

/* ── constants ───────────────────────────────────────────── */
const STATUS_OPTIONS = [
  { value: 'ongoing', label: 'Attivo',    bg: 'bg-green-500  border-green-500'  },
  { value: 'pending', label: 'In attesa', bg: 'bg-yellow-500 border-yellow-500' },
  { value: 'expired', label: 'Rifiutato', bg: 'bg-red-500    border-red-500'    },
]
const STATUS_BG = {
  ongoing: 'bg-green-50  border-green-200',
  pending: 'bg-yellow-50 border-yellow-200',
  expired: 'bg-red-50    border-red-200',
}
const fieldCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white'

/* ── helpers ─────────────────────────────────────────────── */
function today() { return new Date().toISOString().split('T')[0] }

function calcMargin(sale, purchase) {
  if (!purchase || +purchase === 0) return 0
  return ((+sale - +purchase) / +purchase) * 100
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateShort(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
}

function formatCurrency(v) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v ?? 0)
}

function timeAgo(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return 'oggi'
  if (days === 1) return 'ieri'
  if (days < 30) return `${days} giorni fa`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} ${months === 1 ? 'mese' : 'mesi'} fa`
  const years = Math.round(days / 365)
  return `${years} ${years === 1 ? 'anno' : 'anni'} fa`
}

function getLast12Months() {
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    months.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
    })
  }
  return months
}

function emptyLine() {
  return { product_id: '', product_name: '', date: today(), quantity: '', sale_price: '', purchase_price: '', notes: '' }
}
function emptyOffer() {
  return { date: today(), product_id: '', product_name: '', proposed_price: '', notes: '' }
}

/* ── margin color ────────────────────────────────────────── */
function marginColor(m) {
  if (m >= 30) return 'text-green-600'
  if (m >= 15) return 'text-yellow-600'
  return 'text-red-500'
}

/* ── icon buttons ────────────────────────────────────────── */
function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════ */
export default function CustomerDetail() {
  const { id } = useParams()

  /* ── core data ──────────────────────────────────────────── */
  const [customer,   setCustomer]   = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [offers,     setOffers]     = useState([])
  const [notes,      setNotes]      = useState([])
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  /* ── add order line ─────────────────────────────────────── */
  const [addModalOpen,    setAddModalOpen]    = useState(false)
  const [addForm,         setAddForm]         = useState(emptyLine)
  const [addError,        setAddError]        = useState('')
  const [savingAdd,       setSavingAdd]       = useState(false)
  const [addOfferHint,    setAddOfferHint]    = useState(false)
  const [addProductCosts, setAddProductCosts] = useState([])   // product_costs for selected product
  const [addCostId,       setAddCostId]       = useState('')   // selected cost id in dropdown

  /* ── edit order line ────────────────────────────────────── */
  const [editLineTarget,  setEditLineTarget]  = useState(null)
  const [editLineForm,    setEditLineForm]    = useState({})
  const [editLineError,   setEditLineError]   = useState('')
  const [savingEditLine,  setSavingEditLine]  = useState(false)

  /* ── delete order line ──────────────────────────────────── */
  const [deleteLineTarget, setDeleteLineTarget] = useState(null)
  const [deletingLine,     setDeletingLine]     = useState(false)

  /* ── add note ───────────────────────────────────────────── */
  const [noteModalOpen,   setNoteModalOpen]   = useState(false)
  const [noteText,        setNoteText]        = useState('')
  const [savingNote,      setSavingNote]      = useState(false)

  /* ── edit note ──────────────────────────────────────────── */
  const [editNoteTarget,  setEditNoteTarget]  = useState(null)
  const [editNoteText,    setEditNoteText]    = useState('')
  const [savingEditNote,  setSavingEditNote]  = useState(false)

  /* ── delete note ────────────────────────────────────────── */
  const [deleteNoteTarget, setDeleteNoteTarget] = useState(null)
  const [deletingNote,     setDeletingNote]     = useState(false)

  /* ── add offer ──────────────────────────────────────────── */
  const [offerModalOpen,  setOfferModalOpen]  = useState(false)
  const [offerForm,       setOfferForm]       = useState(emptyOffer)
  const [offerError,      setOfferError]      = useState('')
  const [savingOffer,     setSavingOffer]     = useState(false)

  /* ── edit offer ─────────────────────────────────────────── */
  const [editOfferTarget, setEditOfferTarget] = useState(null)
  const [editOfferForm,   setEditOfferForm]   = useState({})
  const [editOfferError,  setEditOfferError]  = useState('')
  const [savingEditOffer, setSavingEditOffer] = useState(false)

  /* ── delete offer ───────────────────────────────────────── */
  const [deleteOfferTarget, setDeleteOfferTarget] = useState(null)
  const [deletingOffer,     setDeletingOffer]     = useState(false)

  /* ── status ─────────────────────────────────────────────── */
  const [statusSaving, setStatusSaving] = useState(false)

  /* ── fetch ─────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [custRes, linesRes, offRes, notesRes, prodsRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).single(),
        supabase.from('order_lines').select('*').eq('customer_id', id).order('date', { ascending: false }),
        supabase.from('offers').select('*').eq('customer_id', id).order('date', { ascending: false }),
        supabase.from('customer_notes').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
      ])
      if (custRes.error)  throw custRes.error
      if (linesRes.error) throw linesRes.error
      if (notesRes.error) throw notesRes.error
      setCustomer(custRes.data)
      setOrderLines(linesRes.data ?? [])
      setOffers(offRes.error ? [] : (offRes.data ?? []))
      setNotes(notesRes.data ?? [])
      if (!prodsRes.error) setProducts(prodsRes.data ?? [])
    } catch (e) {
      setError('Errore nel caricamento del cliente.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── derived data ───────────────────────────────────────── */
  const chartData = getLast12Months().map(({ year, month, label }) => {
    const revenue = orderLines
      .filter(l => { const d = new Date(l.date); return d.getFullYear() === year && d.getMonth() + 1 === month })
      .reduce((s, l) => s + +l.quantity * +l.sale_price, 0)
    return { label, revenue: parseFloat(revenue.toFixed(2)) }
  })

  const avgMargin = (() => {
    const valid = orderLines.filter(l => +l.purchase_price > 0)
    if (!valid.length) return null
    return (valid.reduce((s, l) => s + calcMargin(l.sale_price, l.purchase_price), 0) / valid.length).toFixed(1)
  })()

  const groupedLines = (() => {
    const map = new Map()
    for (const line of orderLines) {
      if (!map.has(line.product_name)) map.set(line.product_name, [])
      map.get(line.product_name).push(line)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  })()

  const lastOrderDate = orderLines.length > 0
    ? orderLines.reduce((max, l) => (l.date > max ? l.date : max), orderLines[0].date)
    : null

  /* ── handlers: status ───────────────────────────────────── */
  const handleStatusChange = async (newStatus) => {
    setStatusSaving(true)
    const { data, error } = await supabase
      .from('customers').update({ offer_status: newStatus }).eq('id', id).select().single()
    if (!error) setCustomer(data)
    setStatusSaving(false)
  }

  /* ── handlers: add order line ───────────────────────────── */
  const handleAddFormProductChange = async (productId) => {
    const p = products.find(pr => pr.id === productId)
    setAddOfferHint(false)
    setAddCostId('')
    setAddProductCosts([])
    setAddForm(f => ({
      ...f,
      product_id:     productId,
      product_name:   p ? p.name : f.product_name,
      purchase_price: p ? String(p.purchase_cost_kg) : '',
      sale_price:     p ? String(parseFloat((p.purchase_cost_kg * (1 + p.base_margin / 100)).toFixed(4))) : f.sale_price,
    }))

    if (!productId || !p) return

    // Fetch product_costs and offer hint in parallel
    const [costsRes, offerRes] = await Promise.all([
      supabase.from('product_costs').select('*').eq('product_id', productId).order('created_at'),
      supabase.from('offers').select('proposed_price').eq('customer_id', id)
        .eq('product_id', productId).order('date', { ascending: false }).limit(1).maybeSingle(),
    ])

    const costs = costsRes.data ?? []
    setAddProductCosts(costs)

    if (costs.length === 1) {
      // Single cost → auto-fill directly, no dropdown
      setAddCostId(costs[0].id)
      setAddForm(f => ({ ...f, purchase_price: String(costs[0].cost_per_kg) }))
    } else if (costs.length > 1) {
      // Multiple costs → default to "Base" entry
      const base = costs.find(c => c.label === 'Base') ?? costs[0]
      setAddCostId(base.id)
      setAddForm(f => ({ ...f, purchase_price: String(base.cost_per_kg) }))
    }
    // length === 0 → falls back to product.purchase_cost_kg set above

    // Offer hint overrides sale price
    if (offerRes.data?.proposed_price) {
      setAddForm(f => ({ ...f, sale_price: String(offerRes.data.proposed_price) }))
      setAddOfferHint(true)
    }
  }

  const handleAddCostSelect = (costId) => {
    setAddCostId(costId)
    const cost = addProductCosts.find(c => c.id === costId)
    if (cost) setAddForm(f => ({ ...f, purchase_price: String(cost.cost_per_kg) }))
  }

  const handleAddRow = async (e) => {
    e.preventDefault()
    setAddError('')
    const name = addForm.product_id
      ? (products.find(p => p.id === addForm.product_id)?.name ?? addForm.product_name)
      : addForm.product_name
    if (!name.trim())             { setAddError('Seleziona o scrivi un prodotto.'); return }
    if (!addForm.date)            { setAddError('Inserisci la data.'); return }
    if (!addForm.quantity || +addForm.quantity <= 0) { setAddError('Quantità non valida.'); return }
    if (!addForm.sale_price)      { setAddError('Prezzo di vendita non valido.'); return }
    if (!addForm.purchase_price)  { setAddError('Prezzo di acquisto non valido.'); return }

    setSavingAdd(true)
    const { error } = await supabase.from('order_lines').insert([{
      customer_id:    id,
      product_id:     addForm.product_id || null,
      product_name:   name.trim(),
      date:           addForm.date,
      quantity:       parseFloat(addForm.quantity),
      sale_price:     parseFloat(addForm.sale_price),
      purchase_price: parseFloat(addForm.purchase_price),
      notes:          addForm.notes.trim() || null,
    }])
    if (error) { setAddError('Errore nel salvataggio. Riprova.'); setSavingAdd(false); return }
    setSavingAdd(false)
    setAddModalOpen(false)
    setAddForm(emptyLine())
    setAddOfferHint(false)
    fetchData()
  }

  /* ── handlers: edit order line ──────────────────────────── */
  const openEditLine = (line) => {
    setEditLineTarget(line)
    setEditLineForm({
      product_id:     line.product_id || '',
      product_name:   line.product_name,
      date:           line.date,
      quantity:       String(line.quantity),
      sale_price:     String(line.sale_price),
      purchase_price: String(line.purchase_price),
      notes:          line.notes || '',
    })
    setEditLineError('')
  }

  const handleEditLineProductChange = (productId) => {
    const p = products.find(pr => pr.id === productId)
    setEditLineForm(f => ({
      ...f,
      product_id:   productId,
      product_name: p ? p.name : f.product_name,
    }))
  }

  const handleEditLine = async (e) => {
    e.preventDefault()
    setEditLineError('')
    if (!editLineForm.date)                                       { setEditLineError('Inserisci la data.'); return }
    if (!editLineForm.quantity || +editLineForm.quantity <= 0)    { setEditLineError('Quantità non valida.'); return }
    if (!editLineForm.sale_price)                                 { setEditLineError('Prezzo di vendita non valido.'); return }
    if (!editLineForm.purchase_price)                             { setEditLineError('Prezzo di acquisto non valido.'); return }
    if (!editLineForm.product_name.trim())                        { setEditLineError('Il nome prodotto è obbligatorio.'); return }

    setSavingEditLine(true)
    const { data, error } = await supabase
      .from('order_lines')
      .update({
        product_id:     editLineForm.product_id || null,
        product_name:   editLineForm.product_name.trim(),
        date:           editLineForm.date,
        quantity:       parseFloat(editLineForm.quantity),
        sale_price:     parseFloat(editLineForm.sale_price),
        purchase_price: parseFloat(editLineForm.purchase_price),
        notes:          editLineForm.notes.trim() || null,
      })
      .eq('id', editLineTarget.id)
      .select()
      .single()

    if (error) { setEditLineError('Errore nel salvataggio. Riprova.'); setSavingEditLine(false); return }
    setOrderLines(prev => prev.map(l => l.id === editLineTarget.id ? data : l))
    setEditLineTarget(null)
    setSavingEditLine(false)
  }

  /* ── handlers: delete order line ───────────────────────── */
  const handleDeleteLine = async () => {
    if (!deleteLineTarget) return
    setDeletingLine(true)
    await supabase.from('order_lines').delete().eq('id', deleteLineTarget.id)
    setOrderLines(prev => prev.filter(l => l.id !== deleteLineTarget.id))
    setDeleteLineTarget(null)
    setDeletingLine(false)
  }

  /* ── handlers: add note ─────────────────────────────────── */
  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!noteText.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase
      .from('customer_notes').insert([{ customer_id: id, text: noteText.trim() }]).select().single()
    if (!error) { setNotes(p => [data, ...p]); setNoteText(''); setNoteModalOpen(false) }
    setSavingNote(false)
  }

  /* ── handlers: edit note ────────────────────────────────── */
  const openEditNote = (note) => {
    setEditNoteTarget(note)
    setEditNoteText(note.text)
  }

  const handleEditNote = async (e) => {
    e.preventDefault()
    if (!editNoteText.trim()) return
    setSavingEditNote(true)
    const { data, error } = await supabase
      .from('customer_notes')
      .update({ text: editNoteText.trim() })
      .eq('id', editNoteTarget.id)
      .select()
      .single()
    if (!error) {
      setNotes(prev => prev.map(n => n.id === editNoteTarget.id ? data : n))
      setEditNoteTarget(null)
    }
    setSavingEditNote(false)
  }

  /* ── handlers: delete note ──────────────────────────────── */
  const handleDeleteNote = async () => {
    if (!deleteNoteTarget) return
    setDeletingNote(true)
    await supabase.from('customer_notes').delete().eq('id', deleteNoteTarget.id)
    setNotes(prev => prev.filter(n => n.id !== deleteNoteTarget.id))
    setDeleteNoteTarget(null)
    setDeletingNote(false)
  }

  /* ── handlers: add offer ────────────────────────────────── */
  const handleOfferProductChange = (productId) => {
    const p = products.find(pr => pr.id === productId)
    setOfferForm(f => ({
      ...f,
      product_id:     productId,
      product_name:   p ? p.name : f.product_name,
      proposed_price: p ? String(parseFloat((p.purchase_cost_kg * (1 + p.base_margin / 100)).toFixed(4))) : f.proposed_price,
    }))
  }

  const handleAddOffer = async (e) => {
    e.preventDefault()
    setOfferError('')
    const name = offerForm.product_id
      ? (products.find(p => p.id === offerForm.product_id)?.name ?? offerForm.product_name)
      : offerForm.product_name
    if (!name.trim())              { setOfferError('Seleziona o scrivi un prodotto.'); return }
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

  /* ── handlers: edit offer ───────────────────────────────── */
  const openEditOffer = (offer) => {
    setEditOfferTarget(offer)
    setEditOfferForm({
      product_id:     offer.product_id || '',
      product_name:   offer.product_name,
      proposed_price: String(offer.proposed_price),
      notes:          offer.notes || '',
      date:           offer.date,
    })
    setEditOfferError('')
  }

  const handleEditOfferProductChange = (productId) => {
    const p = products.find(pr => pr.id === productId)
    setEditOfferForm(f => ({
      ...f,
      product_id:   productId,
      product_name: p ? p.name : f.product_name,
    }))
  }

  const handleEditOffer = async (e) => {
    e.preventDefault()
    setEditOfferError('')
    const name = editOfferForm.product_id
      ? (products.find(p => p.id === editOfferForm.product_id)?.name ?? editOfferForm.product_name)
      : editOfferForm.product_name
    if (!name.trim())               { setEditOfferError('Seleziona o scrivi un prodotto.'); return }
    if (!editOfferForm.proposed_price) { setEditOfferError('Inserisci un prezzo proposto.'); return }
    setSavingEditOffer(true)
    const { data, error } = await supabase
      .from('offers')
      .update({
        product_id:     editOfferForm.product_id || null,
        product_name:   name.trim(),
        proposed_price: parseFloat(editOfferForm.proposed_price),
        notes:          editOfferForm.notes.trim() || null,
        date:           editOfferForm.date,
      })
      .eq('id', editOfferTarget.id)
      .select()
      .single()
    if (error) { setEditOfferError('Errore nel salvataggio. Riprova.'); setSavingEditOffer(false); return }
    setOffers(prev => prev.map(o => o.id === editOfferTarget.id ? data : o))
    setEditOfferTarget(null)
    setSavingEditOffer(false)
  }

  /* ── handlers: delete offer ─────────────────────────────── */
  const handleDeleteOffer = async () => {
    if (!deleteOfferTarget) return
    setDeletingOffer(true)
    await supabase.from('offers').delete().eq('id', deleteOfferTarget.id)
    setOffers(prev => prev.filter(o => o.id !== deleteOfferTarget.id))
    setDeleteOfferTarget(null)
    setDeletingOffer(false)
  }

  /* ── loading / error ─────────────────────────────────────── */
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

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title={customer.company_name} backTo="/customers" />

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div>
            <h1 className="text-xl font-bold text-navy-800">{customer.company_name}</h1>
            {customer.description && <p className="text-sm text-gray-500 mt-1">{customer.description}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            {customer.email && (
              <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(customer.email)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-navy-50 hover:bg-navy-100 text-navy-700 rounded-lg text-sm font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {customer.phone}
              </a>
            )}
          </div>
        </div>

        {/* ── Customer status ──────────────────────────────────── */}
        <div className={`bg-white rounded-xl border p-4 ${STATUS_BG[customer.offer_status] ?? ''}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">Stato cliente</span>
            {statusSaving && <Spinner size="sm" />}
          </div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleStatusChange(opt.value)} disabled={statusSaving}
                className={`flex-1 min-w-[100px] py-2.5 rounded-lg text-sm font-semibold transition-all border ${
                  customer.offer_status === opt.value
                    ? `${opt.bg} text-white`
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ ORDER LINES TABLE ══════════════════════════════════ */}
        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-navy-800">
              Ordini
              <span className="ml-2 text-xs font-normal text-gray-400">({orderLines.length} righe)</span>
            </h2>
            <button
              onClick={() => { setAddModalOpen(true); setAddError(''); setAddForm(emptyLine()); setAddOfferHint(false); setAddProductCosts([]); setAddCostId('') }}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi riga
            </button>
          </div>

          {orderLines.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Nessuna riga d'ordine registrata</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 w-24">Data</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-20">Qtà (kg)</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-24">P. vendita</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-24">P. acquisto</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-20">Margine</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-24">Fatturato</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Note</th>
                    <th className="px-2 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {groupedLines.map(([productName, lines], groupIdx) => (
                    <>
                      <tr key={`group-${groupIdx}`} className="bg-navy-800">
                        <td colSpan={8} className="px-3 py-2 font-semibold text-white text-xs">
                          {productName}
                          <span className="ml-2 text-white/50 font-normal">{lines.length} {lines.length === 1 ? 'riga' : 'righe'}</span>
                        </td>
                      </tr>
                      {lines.map((line, rowIdx) => {
                        const margin    = calcMargin(line.sale_price, line.purchase_price)
                        const fatturato = +line.quantity * +line.sale_price
                        return (
                          <tr key={line.id}
                            className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}
                          >
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDateShort(line.date)}</td>
                            <td className="px-3 py-2 text-right text-gray-700 font-medium tabular-nums">{(+line.quantity).toLocaleString('it-IT', { maximumFractionDigits: 3 })}</td>
                            <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{formatCurrency(line.sale_price)}</td>
                            <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{formatCurrency(line.purchase_price)}</td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${marginColor(margin)}`}>{margin.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right font-semibold text-navy-700 tabular-nums">{formatCurrency(fatturato)}</td>
                            <td className="px-3 py-2 text-gray-400 max-w-[140px] truncate">{line.notes ?? '—'}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-0.5">
                                <button onClick={() => openEditLine(line)}
                                  className="p-1.5 rounded text-gray-300 hover:text-navy-600 transition-colors"
                                  aria-label="Modifica riga">
                                  <EditIcon />
                                </button>
                                <button onClick={() => setDeleteLineTarget(line)}
                                  className="p-1.5 rounded text-gray-300 hover:text-red-500 transition-colors"
                                  aria-label="Elimina riga">
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Last order indicator ─────────────────────────────── */}
        <p className="text-xs text-gray-400 px-1 -mt-2">
          {lastOrderDate
            ? `L'ultimo ordine è stato ${timeAgo(lastOrderDate)}`
            : 'Nessun ordine registrato'}
        </p>

        {/* ── Offers ──────────────────────────────────────────── */}
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
                <div key={offer.id} className="p-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-800 truncate">{offer.product_name}</p>
                    {offer.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{offer.notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-navy-700">
                      {formatCurrency(offer.proposed_price)}<span className="text-xs font-normal text-gray-400">/kg</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(offer.date)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => openEditOffer(offer)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-navy-600 transition-colors"
                      aria-label="Modifica offerta">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => setDeleteOfferTarget(offer)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                      aria-label="Elimina offerta">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Notes ───────────────────────────────────────────── */}
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
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-400">{formatDate(note.created_at)}</p>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => openEditNote(note)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-navy-600 transition-colors"
                        aria-label="Modifica nota">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => setDeleteNoteTarget(note)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                        aria-label="Elimina nota">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">{note.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Revenue chart ────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-semibold text-navy-800 mb-4">Fatturato ultimi 12 mesi</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `€${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} width={42} />
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
              <span className={`text-sm font-bold ${marginColor(parseFloat(avgMargin))}`}>{avgMargin}%</span>
            </div>
          )}
        </section>

      </main>

      <BottomNav />

      {/* ═══ Add row modal ═══════════════════════════════════ */}
      <Modal isOpen={addModalOpen} onClose={() => { setAddModalOpen(false); setAddOfferHint(false); setAddProductCosts([]); setAddCostId('') }} title="Aggiungi riga d'ordine">
        <form onSubmit={handleAddRow} className="space-y-4">
          {addError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{addError}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prodotto</label>
            <select value={addForm.product_id} onChange={e => handleAddFormProductChange(e.target.value)} className={fieldCls}>
              <option value="">-- Seleziona dal catalogo --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {!addForm.product_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Oppure scrivi nome prodotto</label>
              <input type="text" value={addForm.product_name}
                onChange={e => setAddForm(f => ({ ...f, product_name: e.target.value }))}
                className={fieldCls} placeholder="Es. Colla Epossidica speciale" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data</label>
            <input type="date" value={addForm.date} required
              onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
              className={fieldCls} />
          </div>

          {/* Cost dropdown — shown only when 2+ product_costs exist (single → auto-filled silently) */}
          {addProductCosts.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Fornitore / Costo</label>
              <select value={addCostId} onChange={e => handleAddCostSelect(e.target.value)} className={fieldCls}>
                {addProductCosts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label} – {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(c.cost_per_kg)}/kg
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Qtà (kg)</label>
              <input type="number" value={addForm.quantity} min="0.001" step="0.001" required
                onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">P. vendita €/kg</label>
              <input type="number" value={addForm.sale_price} min="0" step="0.0001" required
                onChange={e => { setAddForm(f => ({ ...f, sale_price: e.target.value })); setAddOfferHint(false) }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white" />
              {addOfferHint && (
                <p className="text-xs text-blue-600 mt-1 leading-tight">Prezzo precompilato dall'offerta</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">P. acquisto €/kg</label>
              <input type="number" value={addForm.purchase_price} min="0" step="0.0001" required
                onChange={e => { setAddForm(f => ({ ...f, purchase_price: e.target.value })); setAddCostId('') }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white" />
            </div>
          </div>

          {addForm.sale_price && addForm.purchase_price && +addForm.purchase_price > 0 && (
            <div className="px-3 py-2 bg-gray-50 rounded-xl text-xs text-right">
              <span className="text-gray-400">Margine: </span>
              <span className={`font-semibold ${marginColor(calcMargin(addForm.sale_price, addForm.purchase_price))}`}>
                {calcMargin(addForm.sale_price, addForm.purchase_price).toFixed(1)}%
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (opzionale)</label>
            <input type="text" value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
              className={fieldCls} placeholder="Note sull'ordine..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setAddModalOpen(false); setAddOfferHint(false); setAddProductCosts([]); setAddCostId('') }}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingAdd}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingAdd && <Spinner size="sm" />}
              {savingAdd ? 'Salvataggio...' : 'Salva riga'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Edit row modal ══════════════════════════════════ */}
      <Modal isOpen={!!editLineTarget} onClose={() => setEditLineTarget(null)} title="Modifica riga d'ordine">
        <form onSubmit={handleEditLine} className="space-y-4">
          {editLineError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{editLineError}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prodotto</label>
            <select value={editLineForm.product_id ?? ''} onChange={e => handleEditLineProductChange(e.target.value)} className={fieldCls}>
              <option value="">-- Seleziona dal catalogo --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {!editLineForm.product_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome prodotto</label>
              <input type="text" value={editLineForm.product_name ?? ''}
                onChange={e => setEditLineForm(f => ({ ...f, product_name: e.target.value }))}
                className={fieldCls} placeholder="Nome prodotto..." />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data</label>
            <input type="date" value={editLineForm.date ?? ''} required
              onChange={e => setEditLineForm(f => ({ ...f, date: e.target.value }))}
              className={fieldCls} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'quantity',       label: 'Qtà (kg)',         step: '0.001',  min: '0.001' },
              { key: 'sale_price',     label: 'P. vendita €/kg',  step: '0.0001', min: '0' },
              { key: 'purchase_price', label: 'P. acquisto €/kg', step: '0.0001', min: '0' },
            ].map(({ key, label, step, min }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type="number" value={editLineForm[key] ?? ''} min={min} step={step} required
                  onChange={e => setEditLineForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white" />
              </div>
            ))}
          </div>

          {editLineForm.sale_price && editLineForm.purchase_price && +editLineForm.purchase_price > 0 && (
            <div className="px-3 py-2 bg-gray-50 rounded-xl text-xs text-right">
              <span className="text-gray-400">Margine: </span>
              <span className={`font-semibold ${marginColor(calcMargin(editLineForm.sale_price, editLineForm.purchase_price))}`}>
                {calcMargin(editLineForm.sale_price, editLineForm.purchase_price).toFixed(1)}%
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (opzionale)</label>
            <input type="text" value={editLineForm.notes ?? ''}
              onChange={e => setEditLineForm(f => ({ ...f, notes: e.target.value }))}
              className={fieldCls} placeholder="Note sull'ordine..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditLineTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingEditLine}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingEditLine && <Spinner size="sm" />}
              {savingEditLine ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Delete line confirm ══════════════════════════════ */}
      <Modal isOpen={!!deleteLineTarget} onClose={() => setDeleteLineTarget(null)} title="Elimina riga">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sei sicuro di voler eliminare questa riga di <span className="font-semibold text-navy-800">{deleteLineTarget?.product_name}</span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteLineTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleDeleteLine} disabled={deletingLine}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {deletingLine && <Spinner size="sm" />}
              {deletingLine ? 'Eliminazione...' : 'Elimina'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ Note modal ══════════════════════════════════════ */}
      <Modal isOpen={noteModalOpen} onClose={() => setNoteModalOpen(false)} title="Nuova nota">
        <form onSubmit={handleAddNote} className="space-y-4">
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
            rows={5} required autoFocus
            className={`${fieldCls} resize-none`}
            placeholder="Scrivi una nota su questo cliente..." />
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

      {/* ═══ Edit note modal ══════════════════════════════════ */}
      <Modal isOpen={!!editNoteTarget} onClose={() => setEditNoteTarget(null)} title="Modifica nota">
        <form onSubmit={handleEditNote} className="space-y-4">
          <textarea value={editNoteText} onChange={e => setEditNoteText(e.target.value)}
            rows={5} required autoFocus
            className={`${fieldCls} resize-none`} />
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditNoteTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingEditNote || !editNoteText.trim()}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingEditNote && <Spinner size="sm" />}
              {savingEditNote ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Delete note confirm ══════════════════════════════ */}
      <Modal isOpen={!!deleteNoteTarget} onClose={() => setDeleteNoteTarget(null)} title="Elimina nota">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Sei sicuro di voler eliminare questa nota? L'operazione non è reversibile.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteNoteTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleDeleteNote} disabled={deletingNote}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {deletingNote && <Spinner size="sm" />}
              {deletingNote ? 'Eliminazione...' : 'Elimina'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ Add offer modal ══════════════════════════════════ */}
      <Modal isOpen={offerModalOpen} onClose={() => setOfferModalOpen(false)} title="Nuova offerta">
        <form onSubmit={handleAddOffer} className="space-y-4">
          {offerError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{offerError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data offerta</label>
            <input type="date" value={offerForm.date} required
              onChange={e => setOfferForm(f => ({ ...f, date: e.target.value }))} className={fieldCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prodotto</label>
            <select value={offerForm.product_id}
              onChange={e => handleOfferProductChange(e.target.value)} className={fieldCls}>
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
            <input type="number" value={offerForm.proposed_price} required min="0" step="0.0001"
              onChange={e => setOfferForm(f => ({ ...f, proposed_price: e.target.value }))}
              className={fieldCls} placeholder="0.0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (opzionale)</label>
            <textarea value={offerForm.notes} rows={3}
              onChange={e => setOfferForm(f => ({ ...f, notes: e.target.value }))}
              className={`${fieldCls} resize-none`}
              placeholder="Es. Prezzo valido fino al 30 aprile..." />
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

      {/* ═══ Edit offer modal ════════════════════════════════ */}
      <Modal isOpen={!!editOfferTarget} onClose={() => setEditOfferTarget(null)} title="Modifica offerta">
        <form onSubmit={handleEditOffer} className="space-y-4">
          {editOfferError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{editOfferError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data offerta</label>
            <input type="date" value={editOfferForm.date ?? ''} required
              onChange={e => setEditOfferForm(f => ({ ...f, date: e.target.value }))} className={fieldCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prodotto</label>
            <select value={editOfferForm.product_id ?? ''}
              onChange={e => handleEditOfferProductChange(e.target.value)} className={fieldCls}>
              <option value="">-- Seleziona dal catalogo --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {!editOfferForm.product_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome prodotto</label>
              <input type="text" value={editOfferForm.product_name ?? ''}
                onChange={e => setEditOfferForm(f => ({ ...f, product_name: e.target.value }))}
                className={fieldCls} placeholder="Nome prodotto..." />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Prezzo proposto (€/kg)</label>
            <input type="number" value={editOfferForm.proposed_price ?? ''} required min="0" step="0.0001"
              onChange={e => setEditOfferForm(f => ({ ...f, proposed_price: e.target.value }))}
              className={fieldCls} placeholder="0.0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (opzionale)</label>
            <textarea value={editOfferForm.notes ?? ''} rows={3}
              onChange={e => setEditOfferForm(f => ({ ...f, notes: e.target.value }))}
              className={`${fieldCls} resize-none`}
              placeholder="Es. Prezzo valido fino al 30 aprile..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditOfferTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingEditOffer}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingEditOffer && <Spinner size="sm" />}
              {savingEditOffer ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ Delete offer confirm ════════════════════════════ */}
      <Modal isOpen={!!deleteOfferTarget} onClose={() => setDeleteOfferTarget(null)} title="Elimina offerta">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sei sicuro di voler eliminare l'offerta per <span className="font-semibold text-navy-800">{deleteOfferTarget?.product_name}</span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOfferTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleDeleteOffer} disabled={deletingOffer}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {deletingOffer && <Spinner size="sm" />}
              {deletingOffer ? 'Eliminazione...' : 'Elimina'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

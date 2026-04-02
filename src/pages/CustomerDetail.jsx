import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
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
  { value: 'ongoing', label: 'In corso',  bg: 'bg-green-500  border-green-500'  },
  { value: 'pending', label: 'In attesa', bg: 'bg-yellow-500 border-yellow-500' },
  { value: 'expired', label: 'Rifiutata', bg: 'bg-red-500    border-red-500'    },
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

function getLast6Months() {
  const months = []
  for (let i = 5; i >= 0; i--) {
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
  return { product_id: '', product_name: '', quantity: '', sale_price: '', purchase_price: '', notes: '' }
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

/* ── parse Excel/CSV date values ─────────────────────────── */
function parseXlsxDate(raw) {
  if (!raw) return ''
  // Already a JS Date
  if (raw instanceof Date) return raw.toISOString().split('T')[0]
  // Numeric serial (Excel date)
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  // String — try common formats
  const s = String(raw).trim()
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return s
}

/* ══════════════════════════════════════════════════════════ */
export default function CustomerDetail() {
  const { id } = useParams()

  const [customer,    setCustomer]    = useState(null)
  const [orderLines,  setOrderLines]  = useState([])   // flat rows from DB
  const [offers,      setOffers]      = useState([])
  const [notes,       setNotes]       = useState([])
  const [products,    setProducts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  /* add-row modal */
  const [addModalOpen,  setAddModalOpen]  = useState(false)
  const [addForm,       setAddForm]       = useState(emptyLine)
  const [addError,      setAddError]      = useState('')
  const [savingAdd,     setSavingAdd]     = useState(false)

  /* excel import modal */
  const fileInputRef                        = useRef(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importRows,      setImportRows]      = useState([])   // parsed preview rows
  const [importError,     setImportError]     = useState('')
  const [savingImport,    setSavingImport]     = useState(false)

  /* note modal */
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteText,      setNoteText]      = useState('')
  const [savingNote,    setSavingNote]    = useState(false)

  /* offer modal */
  const [offerModalOpen, setOfferModalOpen] = useState(false)
  const [offerForm,      setOfferForm]      = useState(emptyOffer)
  const [offerError,     setOfferError]     = useState('')
  const [savingOffer,    setSavingOffer]    = useState(false)

  /* status */
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

  /* ── chart data ─────────────────────────────────────────── */
  const chartData = getLast6Months().map(({ year, month, label }) => {
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

  /* ── grouped table data ─────────────────────────────────── */
  const groupedLines = (() => {
    const map = new Map()
    // Order the lines: already sorted by date desc from DB
    for (const line of orderLines) {
      const key = line.product_name
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(line)
    }
    // Sort keys alphabetically
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  })()

  const totalRevenue = orderLines.reduce((s, l) => s + +l.quantity * +l.sale_price, 0)

  /* ── status ─────────────────────────────────────────────── */
  const handleStatusChange = async (newStatus) => {
    setStatusSaving(true)
    const { data, error } = await supabase
      .from('customers').update({ offer_status: newStatus }).eq('id', id).select().single()
    if (!error) setCustomer(data)
    setStatusSaving(false)
  }

  /* ── add row ─────────────────────────────────────────────── */
  const handleAddFormProductChange = (productId) => {
    const p = products.find(p => p.id === productId)
    setAddForm(f => ({
      ...f,
      product_id:     productId,
      product_name:   p ? p.name : f.product_name,
      purchase_price: p ? String(p.purchase_cost_kg) : f.purchase_price,
      sale_price:     p ? String(parseFloat((p.purchase_cost_kg * (1 + p.base_margin / 100)).toFixed(4))) : f.sale_price,
    }))
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
    fetchData()
  }

  /* ── excel import ────────────────────────────────────────── */
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        // Get raw array of arrays
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (!raw || raw.length < 2) {
          setImportError('Il file è vuoto o ha meno di 2 righe.')
          return
        }

        // Detect if first row is a header
        const firstRow = raw[0].map(c => String(c).toLowerCase().trim())
        const HEADERS = ['product_name', 'quantity', 'date', 'sale_price', 'purchase_price']
        const hasHeader = HEADERS.some(h => firstRow.includes(h))

        // Build column index map
        let colMap = {}
        if (hasHeader) {
          HEADERS.forEach(h => { colMap[h] = firstRow.indexOf(h) })
        } else {
          // Positional: product_name, quantity, date, sale_price, purchase_price
          HEADERS.forEach((h, i) => { colMap[h] = i })
        }

        const dataRows = hasHeader ? raw.slice(1) : raw

        const parsed = []
        const errs = []
        dataRows.forEach((row, idx) => {
          if (!row || row.every(c => c === '' || c === null || c === undefined)) return
          const product_name   = String(row[colMap.product_name] ?? '').trim()
          const quantity       = parseFloat(row[colMap.quantity])
          const date           = parseXlsxDate(row[colMap.date])
          const sale_price     = parseFloat(row[colMap.sale_price])
          const purchase_price = parseFloat(row[colMap.purchase_price])

          if (!product_name)        { errs.push(`Riga ${idx + (hasHeader ? 2 : 1)}: nome prodotto mancante`); return }
          if (isNaN(quantity))      { errs.push(`Riga ${idx + (hasHeader ? 2 : 1)}: quantità non valida`); return }
          if (!date)                { errs.push(`Riga ${idx + (hasHeader ? 2 : 1)}: data non valida`); return }
          if (isNaN(sale_price))    { errs.push(`Riga ${idx + (hasHeader ? 2 : 1)}: prezzo vendita non valido`); return }
          if (isNaN(purchase_price)){ errs.push(`Riga ${idx + (hasHeader ? 2 : 1)}: prezzo acquisto non valido`); return }

          parsed.push({ product_name, quantity, date, sale_price, purchase_price })
        })

        if (errs.length > 0) {
          setImportError(errs.slice(0, 5).join('\n') + (errs.length > 5 ? `\n...e altri ${errs.length - 5} errori` : ''))
        }
        if (parsed.length === 0) {
          setImportError('Nessuna riga valida trovata.')
          return
        }
        setImportRows(parsed)
        setImportModalOpen(true)
      } catch (err) {
        setImportError('Impossibile leggere il file. Verifica il formato.')
        console.error(err)
      } finally {
        // Reset input so same file can be re-selected
        e.target.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleConfirmImport = async () => {
    setSavingImport(true)
    const rows = importRows.map(r => ({
      customer_id:    id,
      product_id:     null,
      product_name:   r.product_name,
      date:           r.date,
      quantity:       r.quantity,
      sale_price:     r.sale_price,
      purchase_price: r.purchase_price,
      notes:          null,
    }))

    const { error } = await supabase.from('order_lines').insert(rows)
    if (error) {
      setImportError('Errore durante l\'importazione. Riprova.')
      setSavingImport(false)
      return
    }
    setSavingImport(false)
    setImportModalOpen(false)
    setImportRows([])
    fetchData()
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

  /* ── offer ──────────────────────────────────────────────── */
  const handleOfferProductChange = (productId) => {
    const p = products.find(p => p.id === productId)
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

        {/* ── Offer status ────────────────────────────────────── */}
        <div className={`bg-white rounded-xl border p-4 ${STATUS_BG[customer.offer_status] ?? ''}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">Stato offerta</span>
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
          {/* Section header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-navy-800">
              Ordini
              <span className="ml-2 text-xs font-normal text-gray-400">({orderLines.length} righe)</span>
            </h2>
            <div className="flex items-center gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => { setImportError(''); fileInputRef.current?.click() }}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-navy-800 transition-colors border border-gray-200 hover:border-navy-300 px-2.5 py-1.5 rounded-lg"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                Importa Excel
              </button>
              <button
                onClick={() => { setAddModalOpen(true); setAddError(''); setAddForm({ ...emptyLine(), date: today() }) }}
                className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Aggiungi riga
              </button>
            </div>
          </div>

          {orderLines.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Nessuna riga d'ordine registrata</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                {/* Column headers */}
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 w-24">Data</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-20">Qtà (kg)</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-24">P. vendita</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-24">P. acquisto</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-20">Margine</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 w-24">Fatturato</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedLines.map(([productName, lines], groupIdx) => (
                    <>
                      {/* Product group header */}
                      <tr key={`group-${groupIdx}`} className="bg-navy-800">
                        <td colSpan={7} className="px-3 py-2 font-semibold text-white text-xs">
                          {productName}
                          <span className="ml-2 text-white/50 font-normal">{lines.length} {lines.length === 1 ? 'riga' : 'righe'}</span>
                        </td>
                      </tr>
                      {/* Data rows */}
                      {lines.map((line, rowIdx) => {
                        const margin   = calcMargin(line.sale_price, line.purchase_price)
                        const fatturato = +line.quantity * +line.sale_price
                        return (
                          <tr
                            key={line.id}
                            className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${
                              rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                            }`}
                          >
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDateShort(line.date)}</td>
                            <td className="px-3 py-2 text-right text-gray-700 font-medium tabular-nums">{(+line.quantity).toLocaleString('it-IT', { maximumFractionDigits: 3 })}</td>
                            <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{formatCurrency(line.sale_price)}</td>
                            <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{formatCurrency(line.purchase_price)}</td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${marginColor(margin)}`}>
                              {margin.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-navy-700 tabular-nums">
                              {formatCurrency(fatturato)}
                            </td>
                            <td className="px-3 py-2 text-gray-400 max-w-[160px] truncate">{line.notes ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </>
                  ))}

                  {/* Grand total row */}
                  <tr className="bg-navy-800 border-t-2 border-navy-700">
                    <td colSpan={5} className="px-3 py-2.5 text-xs font-semibold text-white/70 uppercase tracking-wide">
                      Totale fatturato
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-bold text-white tabular-nums">
                      {formatCurrency(totalRevenue)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

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
                <div key={offer.id} className="p-4 flex items-start justify-between gap-3">
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
                  <p className="text-xs text-gray-400 mb-1">{formatDate(note.created_at)}</p>
                  <p className="text-sm text-gray-700">{note.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Revenue chart ────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-semibold text-navy-800 mb-4">Fatturato ultimi 6 mesi</h2>
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
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Aggiungi riga d'ordine">
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

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'quantity',       label: 'Qtà (kg)',        step: '0.001', min: '0.001' },
              { key: 'sale_price',     label: 'P. vendita €/kg', step: '0.0001', min: '0' },
              { key: 'purchase_price', label: 'P. acquisto €/kg',step: '0.0001', min: '0' },
            ].map(({ key, label, step, min }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type="number" value={addForm[key]} min={min} step={step} required
                  onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white" />
              </div>
            ))}
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
            <button type="button" onClick={() => setAddModalOpen(false)}
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

      {/* ═══ Import preview modal ════════════════════════════ */}
      <Modal isOpen={importModalOpen} onClose={() => { setImportModalOpen(false); setImportRows([]) }} title={`Anteprima importazione (${importRows.length} righe)`}>
        <div className="space-y-4">
          {importError && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl text-xs whitespace-pre-line">{importError}</div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Prodotto</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Qtà</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Data</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">P. Vendita</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">P. Acquisto</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 text-gray-700 font-medium">{row.product_name}</td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{row.quantity}</td>
                    <td className="px-3 py-2 text-gray-600">{row.date}</td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{formatCurrency(row.sale_price)}</td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{formatCurrency(row.purchase_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => { setImportModalOpen(false); setImportRows([]) }}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleConfirmImport} disabled={savingImport}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingImport && <Spinner size="sm" />}
              {savingImport ? 'Importazione...' : `Importa ${importRows.length} righe`}
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

      {/* ═══ Offer modal ═════════════════════════════════════ */}
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
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const STATUS_CONFIG = {
  ongoing: { label: 'Attivo',    color: 'bg-green-100 text-green-700 border-green-200' },
  pending: { label: 'In attesa', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  expired: { label: 'Rifiutato', color: 'bg-red-100 text-red-700 border-red-200' },
}

const DOT_CONFIG = {
  ongoing: 'bg-green-500',
  pending: 'bg-yellow-500',
  expired: 'bg-red-500',
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const dot = DOT_CONFIG[status] || DOT_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {cfg.label}
    </span>
  )
}

const EMPTY_FORM = {
  company_name: '',
  sector: 'glues',
  description: '',
  email: '',
  phone: '',
  offer_status: 'pending',
}

/**
 * Parse a DD/MM/YYYY string → "YYYY-MM-DD".
 * Also handles ISO dates and Excel numeric serials.
 */
function parseDDMMYYYY(raw) {
  if (!raw && raw !== 0) return ''
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  if (raw instanceof Date) return raw.toISOString().split('T')[0]
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return s
}

export default function CustomerList() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('glues')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Excel import
  const fileInputRef                                  = useRef(null)
  const [importModalOpen,   setImportModalOpen]   = useState(false)
  const [importPreview,     setImportPreview]     = useState(null)
  const [importFileError,   setImportFileError]   = useState('')
  const [savingImport,      setSavingImport]       = useState(false)
  const [importSuccess,     setImportSuccess]     = useState('')

  const navigate = useNavigate()

  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('company_name')
      if (error) throw error
      setCustomers(data)
    } catch (e) {
      setError('Errore nel caricamento dei clienti.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = customers.filter(c =>
    c.sector === activeTab &&
    c.company_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.company_name.trim()) {
      setFormError('Il nome azienda è obbligatorio.')
      return
    }
    setSaving(true)
    setFormError('')

    const { data, error } = await supabase
      .from('customers')
      .insert([form])
      .select()
      .single()

    if (error) {
      setFormError('Errore nel salvataggio. Riprova.')
      setSaving(false)
      return
    }

    setCustomers(prev => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name)))
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setSaving(false)
    navigate(`/customers/${data.id}`)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('customers').delete().eq('id', deleteTarget.id)
    setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  /* ── Excel import ──────────────────────────────────────── */
  const handleImportFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportFileError('')
    setImportSuccess('')

    const { data: allCustomers, error: custErr } = await supabase
      .from('customers')
      .select('id, company_name')
    if (custErr) { setImportFileError('Errore nel caricamento dei clienti.'); e.target.value = ''; return }

    const customerMap = new Map(allCustomers.map(c => [c.company_name, c.id]))
    const HEADERS = ['product_name', 'quantity', 'date', 'sale_price', 'purchase_price']

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })

        const valid    = []
        const warnings = []

        for (const sheetName of wb.SheetNames) {
          const customerId = customerMap.get(sheetName)
          if (!customerId) { warnings.push(sheetName); continue }

          const ws  = wb.Sheets[sheetName]
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          if (!raw || raw.length < 2) continue

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

            if (!sale_price || !purchase_price || sale_price === 0 || purchase_price === 0) continue
            if (!product_name || isNaN(quantity) || !date || isNaN(sale_price) || isNaN(purchase_price)) continue

            rows.push({ product_name, quantity, date, sale_price, purchase_price })
          }

          if (rows.length > 0) valid.push({ sheetName, customerId, rows })
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
  }

  const tabCounts = {
    glues: customers.filter(c => c.sector === 'glues').length,
    abrasives: customers.filter(c => c.sector === 'abrasives').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleImportFileChange}
      />

      <Topbar
        title="Clienti"
        showLogout
        rightActions={
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-700 hover:bg-navy-600 active:bg-navy-500 text-white text-sm font-semibold transition-colors"
            aria-label="Importa da Excel"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importa
          </button>
        }
      />

      <main className="max-w-4xl mx-auto px-4 py-5">

        {/* Success banner */}
        {importSuccess && (
          <div className="flex items-center justify-between p-3 mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
            <span>✓ {importSuccess}</span>
            <button onClick={() => setImportSuccess('')} className="text-green-500 hover:text-green-700 ml-3">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* File error banner */}
        {importFileError && (
          <div className="flex items-center justify-between p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            <span>{importFileError}</span>
            <button onClick={() => setImportFileError('')} className="text-red-400 hover:text-red-600 ml-3">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca cliente..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-navy-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-800 focus:border-transparent text-base"
          />
        </div>

        {/* Tabs */}
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-4">
          {[
            { key: 'glues', label: 'Colle' },
            { key: 'abrasives', label: 'Abrasivi' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? 'bg-navy-800 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${activeTab === tab.key ? 'text-white/70' : 'text-gray-400'}`}>
                ({tabCounts[tab.key]})
              </span>
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          onClick={() => { setModalOpen(true); setFormError(''); setForm({ ...EMPTY_FORM, sector: activeTab }) }}
          className="w-full bg-navy-800 text-white py-3 rounded-xl font-semibold text-sm hover:bg-navy-900 active:bg-navy-950 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Aggiungi cliente
        </button>

        {/* List */}
        {loading ? (
          <Spinner size="lg" className="py-12" />
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? 'Nessun cliente trovato per questa ricerca.' : 'Nessun cliente in questa categoria.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(customer => (
              <div key={customer.id} className="flex items-stretch gap-2">
                <button
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  className="flex-1 text-left bg-white rounded-xl p-4 border border-gray-100 hover:border-navy-200 hover:shadow-sm transition-all active:scale-[0.99] min-w-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-800 truncate">{customer.company_name}</p>
                      {customer.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{customer.description}</p>
                      )}
                    </div>
                    <StatusBadge status={customer.offer_status} />
                  </div>
                </button>
                <button
                  onClick={() => setDeleteTarget(customer)}
                  className="flex-shrink-0 flex items-center justify-center w-10 bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-red-500 hover:border-red-200 transition-colors"
                  aria-label="Elimina cliente"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Elimina cliente">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sei sicuro di voler eliminare <span className="font-semibold text-navy-800">{deleteTarget?.company_name}</span>?
            Tutti i suoi dati verranno persi.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {deleting ? <Spinner size="sm" /> : null}
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Customer Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuovo cliente">
        <form onSubmit={handleAdd} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{formError}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome azienda *</label>
            <input
              type="text"
              value={form.company_name}
              onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="Es. Falegnameria Rossi SRL"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Settore *</label>
            <select
              value={form.sector}
              onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white"
            >
              <option value="glues">Colle</option>
              <option value="abrasives">Abrasivi</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrizione</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base resize-none"
              placeholder="Breve descrizione dell'azienda"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="info@azienda.it"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefono</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="+39 02 1234567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stato cliente</label>
            <select
              value={form.offer_status}
              onChange={e => setForm(f => ({ ...f, offer_status: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white"
            >
              <option value="ongoing">Attivo</option>
              <option value="pending">In attesa</option>
              <option value="expired">Rifiutato</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Spinner size="sm" />}
              {saving ? 'Salvataggio...' : 'Aggiungi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Import preview modal */}
      {importPreview && (
        <Modal
          isOpen={importModalOpen}
          onClose={() => { setImportModalOpen(false); setImportPreview(null) }}
          title="Anteprima importazione"
        >
          <div className="space-y-4">
            {importPreview.valid.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Righe da importare per cliente:</p>
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

            {importPreview.warnings.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl space-y-1">
                <p className="text-xs font-semibold text-yellow-800 mb-1">Fogli ignorati (cliente non trovato):</p>
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

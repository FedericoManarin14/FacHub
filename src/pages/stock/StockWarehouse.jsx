import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import Topbar from '../../components/Topbar'
import BottomNav from '../../components/BottomNav'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

/* ── helpers ─────────────────────────────────────────────── */
function fmt(n) {
  if (n === null || n === undefined || n === '') return '—'
  return `${(+n).toLocaleString('it-IT', { maximumFractionDigits: 2 })} kg`
}

const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-700 text-sm bg-white'

/* ══════════════════════════════════════════════════════════ */
export default function StockWarehouse() {
  const [loading, setLoading]         = useState(true)
  const [stock, setStock]             = useState([])
  const [products, setProducts]       = useState([])

  /* inline edit state */
  const [editingRow, setEditingRow]   = useState(null) // product_name
  const [editQty, setEditQty]         = useState('')
  const [editThreshold, setEditThreshold] = useState('')
  const [saving, setSaving]           = useState(false)

  /* add modal */
  const [addOpen, setAddOpen]         = useState(false)
  const [addProduct, setAddProduct]   = useState('')
  const [addQty, setAddQty]           = useState('')
  const [addSaving, setAddSaving]     = useState(false)

  /* import */
  const fileRef                       = useRef(null)
  const [importPreview, setImportPreview] = useState(null) // array of { product_name, quantity_kg }
  const [importOpen, setImportOpen]   = useState(false)
  const [importSaving, setImportSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [stockRes, prodsRes] = await Promise.all([
      supabase.from('warehouse_stock').select('*').order('product_name'),
      supabase.from('products').select('id, name').order('name'),
    ])
    setStock(stockRes.data ?? [])
    setProducts(prodsRes.data ?? [])
    setLoading(false)
  }

  /* ── inline edit ──────────────────────────────────────── */
  function startEdit(row) {
    setEditingRow(row.product_name)
    setEditQty(String(row.quantity_kg ?? ''))
    setEditThreshold(row.reorder_threshold_kg !== null && row.reorder_threshold_kg !== undefined
      ? String(row.reorder_threshold_kg) : '')
  }

  function cancelEdit() {
    setEditingRow(null)
    setEditQty('')
    setEditThreshold('')
  }

  async function saveEdit(productName) {
    const qty = parseFloat(editQty)
    if (isNaN(qty) || qty < 0) return cancelEdit()
    setSaving(true)
    const threshold = editThreshold !== '' ? parseFloat(editThreshold) : null
    const { data, error } = await supabase
      .from('warehouse_stock')
      .upsert(
        { product_name: productName, quantity_kg: qty, reorder_threshold_kg: threshold, updated_at: new Date().toISOString() },
        { onConflict: 'product_name' }
      )
      .select().single()
    if (!error) {
      setStock(prev => prev.map(r => r.product_name === productName ? data : r))
    }
    cancelEdit()
    setSaving(false)
  }

  /* ── delete ───────────────────────────────────────────── */
  async function deleteRow(productName) {
    if (!window.confirm(`Rimuovere "${productName}" dal magazzino?`)) return
    await supabase.from('warehouse_stock').delete().eq('product_name', productName)
    setStock(prev => prev.filter(r => r.product_name !== productName))
  }

  /* ── add product ──────────────────────────────────────── */
  async function handleAdd() {
    if (!addProduct || addProduct.trim() === '') return
    const qty = parseFloat(addQty)
    if (isNaN(qty) || qty < 0) return
    setAddSaving(true)
    const { data, error } = await supabase
      .from('warehouse_stock')
      .upsert(
        { product_name: addProduct.trim(), quantity_kg: qty, updated_at: new Date().toISOString() },
        { onConflict: 'product_name' }
      )
      .select().single()
    if (!error) {
      setStock(prev => {
        const exists = prev.find(r => r.product_name === data.product_name)
        return exists
          ? prev.map(r => r.product_name === data.product_name ? data : r)
          : [...prev, data].sort((a, b) => a.product_name.localeCompare(b.product_name))
      })
    }
    setAddOpen(false)
    setAddProduct('')
    setAddQty('')
    setAddSaving(false)
  }

  /* ── xlsx import ──────────────────────────────────────── */
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        const cleaned = rows
          .filter(r => r.product_name && r.quantity_kg !== undefined)
          .map(r => ({ product_name: String(r.product_name).trim(), quantity_kg: parseFloat(r.quantity_kg) }))
          .filter(r => r.product_name && !isNaN(r.quantity_kg))
        setImportPreview(cleaned)
        setImportOpen(true)
      } catch (err) {
        alert('Errore nella lettura del file Excel.')
        console.error(err)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!importPreview?.length) return
    setImportSaving(true)
    const rows = importPreview.map(r => ({
      product_name: r.product_name,
      quantity_kg:  r.quantity_kg,
      updated_at:   new Date().toISOString(),
    }))
    const { data, error } = await supabase
      .from('warehouse_stock')
      .upsert(rows, { onConflict: 'product_name' })
      .select()
    if (!error && data) {
      await loadData()
    }
    setImportOpen(false)
    setImportPreview(null)
    setImportSaving(false)
  }

  /* ── render ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Topbar title="Magazzino" backTo="/stock" showLogout />

      <main className="max-w-4xl mx-auto px-4 py-5">
        {/* header actions */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {stock.length} {stock.length === 1 ? 'prodotto' : 'prodotti'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Import Excel */}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Importa Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

            {/* Add product */}
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi prodotto
            </button>
          </div>
        </div>

        {loading ? (
          <Spinner className="py-20" />
        ) : stock.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-gray-400 text-sm">
            Nessun prodotto nel magazzino.<br />
            <button onClick={() => setAddOpen(true)} className="mt-2 text-red-600 font-medium hover:underline text-sm">
              Aggiungi il primo prodotto
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {stock.map((row) => {
              const isEditing   = editingRow === row.product_name
              const underThreshold = row.reorder_threshold_kg !== null &&
                row.reorder_threshold_kg !== undefined &&
                +row.quantity_kg <= +row.reorder_threshold_kg

              return (
                <div
                  key={row.product_name}
                  className={`px-4 py-3 ${underThreshold && !isEditing ? 'bg-red-50' : ''}`}
                >
                  {isEditing ? (
                    /* ── edit mode ── */
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-800">{row.product_name}</p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 mb-1 block">Quantità (kg)</label>
                          <input
                            type="number" min="0" step="0.1" autoFocus
                            value={editQty}
                            onChange={e => setEditQty(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(row.product_name); if (e.key === 'Escape') cancelEdit() }}
                            className={inputCls}
                            placeholder="es. 150"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 mb-1 block">Soglia riordino (kg)</label>
                          <div className="relative">
                            <input
                              type="number" min="0" step="0.1"
                              value={editThreshold}
                              onChange={e => setEditThreshold(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(row.product_name); if (e.key === 'Escape') cancelEdit() }}
                              className={`${inputCls} pr-7`}
                              placeholder="Opzionale"
                            />
                            {editThreshold !== '' && (
                              <button
                                onClick={() => setEditThreshold('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                title="Rimuovi soglia"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end pt-1">
                        <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Annulla</button>
                        <button
                          onClick={() => saveEdit(row.product_name)}
                          disabled={saving}
                          className="text-xs bg-red-700 text-white px-3 py-1.5 rounded-lg hover:bg-red-800 transition-colors font-medium"
                        >
                          {saving ? 'Salvataggio…' : 'Salva'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── view mode ── */
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">{row.product_name}</p>
                          {underThreshold && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex-shrink-0">Sotto soglia</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={`text-sm font-medium ${underThreshold ? 'text-red-700' : 'text-gray-700'}`}>
                            {fmt(row.quantity_kg)}
                          </span>
                          {row.reorder_threshold_kg !== null && row.reorder_threshold_kg !== undefined && (
                            <span className="text-xs text-gray-400">soglia: {fmt(row.reorder_threshold_kg)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEdit(row)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          title="Modifica"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteRow(row.product_name)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Rimuovi"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Add product modal ────────────────────────────── */}
      <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setAddProduct(''); setAddQty('') }} title="Aggiungi prodotto">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block font-medium">Prodotto</label>
            <select
              value={addProduct}
              onChange={e => setAddProduct(e.target.value)}
              className={inputCls}
            >
              <option value="">Seleziona prodotto…</option>
              {products.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Oppure inserisci manualmente:
            </p>
            <input
              type="text"
              value={addProduct}
              onChange={e => setAddProduct(e.target.value)}
              className={`${inputCls} mt-1`}
              placeholder="Nome prodotto"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block font-medium">Quantità (kg)</label>
            <input
              type="number" min="0" step="0.1"
              value={addQty}
              onChange={e => setAddQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              className={inputCls}
              placeholder="es. 200"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={addSaving || !addProduct || addQty === ''}
            className="w-full py-3 bg-red-700 text-white rounded-xl font-semibold text-sm hover:bg-red-800 transition-colors disabled:opacity-50"
          >
            {addSaving ? 'Salvataggio…' : 'Aggiungi'}
          </button>
        </div>
      </Modal>

      {/* ── Import preview modal ─────────────────────────── */}
      <Modal isOpen={importOpen} onClose={() => { setImportOpen(false); setImportPreview(null) }} title="Anteprima importazione">
        {importPreview && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{importPreview.length} {importPreview.length === 1 ? 'riga trovata' : 'righe trovate'}. Conferma per importare.</p>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50 bg-white">
              {importPreview.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-medium text-gray-700">{r.product_name}</span>
                  <span className="text-gray-500">{r.quantity_kg} kg</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setImportOpen(false); setImportPreview(null) }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={confirmImport}
                disabled={importSaving}
                className="flex-1 py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold hover:bg-red-800 transition-colors disabled:opacity-50"
              >
                {importSaving ? 'Importazione…' : 'Conferma importazione'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <BottomNav />
    </div>
  )
}

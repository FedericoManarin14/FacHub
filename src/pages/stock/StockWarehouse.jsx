import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import Topbar from '../../components/Topbar'
import BottomNav from '../../components/BottomNav'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

/* ── helpers ─────────────────────────────────────────────── */
function fmtKg(n) {
  if (n === null || n === undefined || n === '') return '—'
  return `${(+n).toLocaleString('it-IT', { maximumFractionDigits: 2 })} kg`
}

function fmtDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
}

function totalKg(rows) {
  return rows.reduce((s, r) => s + (+(r.units ?? 1)) * (+(r.quantity_kg) || 0), 0)
}

const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-700 text-sm bg-white'

/* ══════════════════════════════════════════════════════════ */
export default function StockWarehouse() {
  const [loading, setLoading]     = useState(true)
  const [rows, setRows]           = useState([])          // warehouse_stock rows
  const [thresholds, setThresholds] = useState({})        // { product_name: { id, threshold_kg } }
  const [products, setProducts]   = useState([])

  /* row edit */
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({ quantity_kg: '', units: '', notes: '' })
  const [savingRow, setSavingRow] = useState(false)

  /* notes quick-edit */
  const [notesId, setNotesId]     = useState(null)
  const [notesVal, setNotesVal]   = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  /* threshold inline edit */
  const [thrProduct, setThrProduct] = useState(null)
  const [thrVal, setThrVal]         = useState('')
  const [savingThr, setSavingThr]   = useState(false)

  /* add modal */
  const [addOpen, setAddOpen]     = useState(false)
  const [addForm, setAddForm]     = useState({ product_name: '', quantity_kg: '', units: '1', notes: '' })
  const [addSaving, setAddSaving] = useState(false)

  /* xlsx import */
  const fileRef = useRef(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importOpen, setImportOpen]       = useState(false)
  const [importSaving, setImportSaving]   = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [stockRes, thrRes, prodsRes] = await Promise.all([
      supabase.from('warehouse_stock').select('*').order('product_name').order('created_at'),
      supabase.from('warehouse_thresholds').select('*'),
      supabase.from('products').select('id, name').order('name'),
    ])
    setRows(stockRes.data ?? [])
    const thrMap = {}
    for (const t of (thrRes.data ?? [])) thrMap[t.product_name] = { id: t.id, threshold_kg: t.threshold_kg }
    setThresholds(thrMap)
    setProducts(prodsRes.data ?? [])
    setLoading(false)
  }

  /* ── group rows by product_name ───────────────────────── */
  const groups = Object.entries(
    rows.reduce((acc, r) => {
      if (!acc[r.product_name]) acc[r.product_name] = []
      acc[r.product_name].push(r)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  /* ── row edit ─────────────────────────────────────────── */
  function startEdit(row) {
    setEditingId(row.id)
    setEditForm({ quantity_kg: String(row.quantity_kg ?? ''), units: String(row.units ?? 1), notes: row.notes ?? '' })
    setNotesId(null)
  }
  function cancelEdit() { setEditingId(null) }

  async function saveEdit(id) {
    const qty = parseFloat(editForm.quantity_kg)
    if (isNaN(qty) || qty < 0) return cancelEdit()
    setSavingRow(true)
    const units = parseInt(editForm.units) || 1
    const { data, error } = await supabase
      .from('warehouse_stock')
      .update({ quantity_kg: qty, units, notes: editForm.notes || null })
      .eq('id', id)
      .select().single()
    if (!error) setRows(prev => prev.map(r => r.id === id ? data : r))
    cancelEdit()
    setSavingRow(false)
  }

  /* ── notes quick-edit ─────────────────────────────────── */
  function startNotes(row) {
    setNotesId(row.id)
    setNotesVal(row.notes ?? '')
    setEditingId(null)
  }
  function cancelNotes() { setNotesId(null) }

  async function saveNotes(id) {
    setSavingNotes(true)
    const { data, error } = await supabase
      .from('warehouse_stock')
      .update({ notes: notesVal || null })
      .eq('id', id)
      .select().single()
    if (!error) setRows(prev => prev.map(r => r.id === id ? data : r))
    setNotesId(null)
    setSavingNotes(false)
  }

  /* ── delete row ───────────────────────────────────────── */
  async function deleteRow(id, productName) {
    if (!window.confirm(`Eliminare questa voce di "${productName}"?`)) return
    await supabase.from('warehouse_stock').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  /* ── threshold ────────────────────────────────────────── */
  function startThr(productName) {
    setThrProduct(productName)
    setThrVal(thresholds[productName] ? String(thresholds[productName].threshold_kg) : '')
  }
  function cancelThr() { setThrProduct(null) }

  async function saveThr(productName) {
    const val = parseFloat(thrVal)
    if (isNaN(val) || val < 0) return cancelThr()
    setSavingThr(true)
    const { data, error } = await supabase
      .from('warehouse_thresholds')
      .upsert({ product_name: productName, threshold_kg: val }, { onConflict: 'product_name' })
      .select().single()
    if (!error) setThresholds(prev => ({ ...prev, [productName]: { id: data.id, threshold_kg: data.threshold_kg } }))
    cancelThr()
    setSavingThr(false)
  }

  async function deleteThr(productName) {
    setSavingThr(true)
    await supabase.from('warehouse_thresholds').delete().eq('product_name', productName)
    setThresholds(prev => { const n = { ...prev }; delete n[productName]; return n })
    setSavingThr(false)
  }

  /* ── add product ──────────────────────────────────────── */
  function resetAdd() { setAddForm({ product_name: '', quantity_kg: '', units: '1', notes: '' }) }

  async function handleAdd() {
    if (!addForm.product_name.trim()) return
    const qty = parseFloat(addForm.quantity_kg)
    if (isNaN(qty) || qty < 0) return
    setAddSaving(true)
    const { data, error } = await supabase
      .from('warehouse_stock')
      .insert({
        product_name: addForm.product_name.trim(),
        quantity_kg:  qty,
        units:        parseInt(addForm.units) || 1,
        notes:        addForm.notes.trim() || null,
      })
      .select().single()
    if (!error) {
      setRows(prev => [...prev, data].sort((a, b) =>
        a.product_name.localeCompare(b.product_name) || new Date(a.created_at) - new Date(b.created_at)
      ))
    }
    setAddOpen(false)
    resetAdd()
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
        const parsed = XLSX.utils.sheet_to_json(ws)
        const cleaned = parsed
          .filter(r => r.product_name && r.quantity_kg !== undefined)
          .map(r => ({
            product_name: String(r.product_name).trim(),
            quantity_kg:  parseFloat(r.quantity_kg),
            units:        parseInt(r.units) || 1,
            notes:        r.notes ? String(r.notes).trim() : null,
          }))
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
    const { error } = await supabase.from('warehouse_stock').insert(importPreview)
    if (!error) await loadData()
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
            {rows.length} {rows.length === 1 ? 'voce' : 'voci'}
          </h2>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => { resetAdd(); setAddOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi
            </button>
          </div>
        </div>

        {loading ? (
          <Spinner className="py-20" />
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-gray-400 text-sm">
            Nessuna voce in magazzino.
            <br />
            <button onClick={() => { resetAdd(); setAddOpen(true) }} className="mt-2 text-red-600 font-medium hover:underline">
              Aggiungi il primo prodotto
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([productName, groupRows]) => {
              const total    = totalKg(groupRows)
              const thr      = thresholds[productName]
              const under    = thr && total <= thr.threshold_kg
              const isThrEdit = thrProduct === productName

              return (
                <div key={productName} className="bg-white rounded-xl border border-gray-100 overflow-hidden">

                  {/* ── Group header ── */}
                  <div className={`px-4 py-3 border-b border-gray-100 ${under ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">

                      {/* left: name + total + badge */}
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-semibold text-sm text-gray-800">{productName}</span>
                        <span className={`text-sm font-medium ${under ? 'text-red-700' : 'text-gray-600'}`}>
                          {fmtKg(total)} totali
                        </span>
                        {under && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Sotto soglia</span>
                        )}
                      </div>

                      {/* right: threshold controls */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isThrEdit ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">Soglia:</span>
                            <input
                              type="number" min="0" step="0.1" autoFocus
                              value={thrVal}
                              onChange={e => setThrVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveThr(productName); if (e.key === 'Escape') cancelThr() }}
                              className="w-20 px-2 py-0.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-red-700 bg-white"
                              placeholder="kg"
                            />
                            <span className="text-xs text-gray-400">kg</span>
                            <button onClick={() => saveThr(productName)} disabled={savingThr}
                              className="text-xs text-red-700 hover:text-red-900 font-medium px-1">✓</button>
                            <button onClick={cancelThr}
                              className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className={`text-xs ${thr ? 'text-gray-500' : 'text-gray-300'}`}>
                              Soglia: {thr ? fmtKg(thr.threshold_kg) : 'Nessuna'}
                            </span>
                            <button onClick={() => startThr(productName)}
                              className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors" title="Modifica soglia">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {thr && (
                              <button onClick={() => deleteThr(productName)} disabled={savingThr}
                                className="p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors" title="Rimuovi soglia">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Individual rows ── */}
                  <div className="divide-y divide-gray-50">
                    {groupRows.map(row => {
                      const isEditing = editingId === row.id
                      const isNotes   = notesId === row.id

                      return (
                        <div key={row.id} className="px-4 py-2.5">
                          {isEditing ? (
                            /* full edit */
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-gray-400 mb-1 block">Quantità (kg)</label>
                                  <input type="number" min="0" step="0.1" autoFocus
                                    value={editForm.quantity_kg}
                                    onChange={e => setEditForm(f => ({ ...f, quantity_kg: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(row.id); if (e.key === 'Escape') cancelEdit() }}
                                    className={inputCls} placeholder="es. 50" />
                                </div>
                                <div className="w-24">
                                  <label className="text-xs text-gray-400 mb-1 block">Unità</label>
                                  <input type="number" min="1" step="1"
                                    value={editForm.units}
                                    onChange={e => setEditForm(f => ({ ...f, units: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(row.id); if (e.key === 'Escape') cancelEdit() }}
                                    className={inputCls} placeholder="1" />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Note</label>
                                <input type="text"
                                  value={editForm.notes}
                                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(row.id); if (e.key === 'Escape') cancelEdit() }}
                                  className={inputCls} placeholder="Opzionale" />
                              </div>
                              <div className="flex items-center gap-2 justify-end">
                                <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Annulla</button>
                                <button onClick={() => saveEdit(row.id)} disabled={savingRow}
                                  className="text-xs bg-red-700 text-white px-3 py-1.5 rounded-lg hover:bg-red-800 font-medium">
                                  {savingRow ? 'Salvataggio…' : 'Salva'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* view */
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                {/* data */}
                                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                                  <span className="text-sm font-medium text-gray-700">
                                    {row.units > 1
                                      ? `${row.units} unità × ${fmtKg(row.quantity_kg)}`
                                      : fmtKg(row.quantity_kg)}
                                  </span>
                                  <span className="text-xs text-gray-400">{fmtDate(row.created_at)}</span>
                                  {row.notes && !isNotes && (
                                    <span className="text-xs text-gray-400 italic truncate max-w-xs">{row.notes}</span>
                                  )}
                                </div>
                                {/* actions */}
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {/* notes icon */}
                                  <button onClick={() => isNotes ? cancelNotes() : startNotes(row)}
                                    className={`p-1.5 rounded-lg transition-colors ${isNotes ? 'text-red-600 bg-red-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                    title="Note">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                  </button>
                                  {/* edit icon */}
                                  <button onClick={() => startEdit(row)}
                                    className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Modifica">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  {/* delete icon */}
                                  <button onClick={() => deleteRow(row.id, row.product_name)}
                                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Elimina">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* notes inline field */}
                              {isNotes && (
                                <div className="flex items-center gap-2 pt-1">
                                  <input type="text" autoFocus
                                    value={notesVal}
                                    onChange={e => setNotesVal(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveNotes(row.id); if (e.key === 'Escape') cancelNotes() }}
                                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700 bg-white"
                                    placeholder="Aggiungi nota…"
                                  />
                                  <button onClick={() => saveNotes(row.id)} disabled={savingNotes}
                                    className="text-xs text-red-700 hover:text-red-900 font-medium px-1">✓</button>
                                  <button onClick={cancelNotes}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Add modal ───────────────────────────────────── */}
      <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); resetAdd() }} title="Aggiungi voce magazzino">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Prodotto</label>
            <select value={addForm.product_name} onChange={e => setAddForm(f => ({ ...f, product_name: e.target.value }))} className={inputCls}>
              <option value="">Seleziona prodotto…</option>
              {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">Oppure inserisci manualmente:</p>
            <input type="text" value={addForm.product_name}
              onChange={e => setAddForm(f => ({ ...f, product_name: e.target.value }))}
              className={`${inputCls} mt-1`} placeholder="Nome prodotto" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Quantità (kg)</label>
              <input type="number" min="0" step="0.1"
                value={addForm.quantity_kg}
                onChange={e => setAddForm(f => ({ ...f, quantity_kg: e.target.value }))}
                className={inputCls} placeholder="es. 50" />
            </div>
            <div className="w-28">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Unità</label>
              <input type="number" min="1" step="1"
                value={addForm.units}
                onChange={e => setAddForm(f => ({ ...f, units: e.target.value }))}
                className={inputCls} placeholder="1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Note (opzionale)</label>
            <input type="text"
              value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              className={inputCls} placeholder="es. lotto A, data scadenza…" />
          </div>
          <button onClick={handleAdd}
            disabled={addSaving || !addForm.product_name || addForm.quantity_kg === ''}
            className="w-full py-3 bg-red-700 text-white rounded-xl font-semibold text-sm hover:bg-red-800 transition-colors disabled:opacity-50">
            {addSaving ? 'Salvataggio…' : 'Aggiungi'}
          </button>
        </div>
      </Modal>

      {/* ── Import preview modal ─────────────────────────── */}
      <Modal isOpen={importOpen} onClose={() => { setImportOpen(false); setImportPreview(null) }} title="Anteprima importazione">
        {importPreview && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              {importPreview.length} {importPreview.length === 1 ? 'riga trovata' : 'righe trovate'}. Ogni riga crea una nuova voce.
            </p>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50 bg-white">
              {importPreview.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm gap-2">
                  <span className="font-medium text-gray-700 truncate">{r.product_name}</span>
                  <span className="text-gray-500 flex-shrink-0">
                    {r.units > 1 ? `${r.units} × ` : ''}{r.quantity_kg} kg
                    {r.notes ? ` · ${r.notes}` : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setImportOpen(false); setImportPreview(null) }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Annulla
              </button>
              <button onClick={confirmImport} disabled={importSaving}
                className="flex-1 py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold hover:bg-red-800 transition-colors disabled:opacity-50">
                {importSaving ? 'Importazione…' : 'Conferma'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <BottomNav />
    </div>
  )
}

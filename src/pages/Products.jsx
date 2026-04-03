import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const EMPTY_FORM = { name: '', category: 'glues', type: '', purchase_cost_kg: '', base_margin: '' }
const EMPTY_COST = { label: '', cost_per_kg: '' }

function formatCurrency(val) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val ?? 0)
}

const fieldCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white'
const smallFieldCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white'

export default function Products() {
  const [products,     setProducts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  const [activeTab,    setActiveTab]    = useState('glues')

  /* add product */
  const [modalOpen,    setModalOpen]    = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState('')

  /* edit product */
  const [editTarget,   setEditTarget]   = useState(null)
  const [editForm,     setEditForm]     = useState(EMPTY_FORM)
  const [savingEdit,   setSavingEdit]   = useState(false)
  const [editError,    setEditError]    = useState('')

  /* delete product */
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  /* costs expansion */
  const [expandedId,   setExpandedId]   = useState(null)
  const [costsMap,     setCostsMap]     = useState({})          // productId → cost[]
  const [costsLoading, setCostsLoading] = useState(false)

  /* add cost */
  const [addCostForm,  setAddCostForm]  = useState(EMPTY_COST)
  const [savingCost,   setSavingCost]   = useState(false)
  const [addCostError, setAddCostError] = useState('')

  /* edit cost */
  const [editCostTarget, setEditCostTarget] = useState(null)
  const [editCostForm,   setEditCostForm]   = useState(EMPTY_COST)
  const [savingEditCost, setSavingEditCost] = useState(false)
  const [editCostError,  setEditCostError]  = useState('')

  /* delete cost */
  const [deleteCostTarget, setDeleteCostTarget] = useState(null)
  const [deletingCost,     setDeletingCost]     = useState(false)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('products').select('*').order('name')
      if (error) throw error
      setProducts(data)
    } catch (e) {
      setError('Errore nel caricamento dei prodotti.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadCosts(productId) {
    if (costsMap[productId]) return              // already cached
    setCostsLoading(true)
    const { data } = await supabase
      .from('product_costs')
      .select('*')
      .eq('product_id', productId)
      .order('created_at')
    setCostsMap(m => ({ ...m, [productId]: data ?? [] }))
    setCostsLoading(false)
  }

  const toggleExpand = async (productId) => {
    if (expandedId === productId) {
      setExpandedId(null)
      setAddCostForm(EMPTY_COST)
      setAddCostError('')
    } else {
      setExpandedId(productId)
      setAddCostForm(EMPTY_COST)
      setAddCostError('')
      await loadCosts(productId)
    }
  }

  const filtered = products.filter(p =>
    p.category === activeTab &&
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  /* ── add product ── */
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Il nome del prodotto è obbligatorio.'); return }
    if (!form.purchase_cost_kg || isNaN(form.purchase_cost_kg)) { setFormError('Inserisci un costo di acquisto valido.'); return }
    setSaving(true); setFormError('')
    const { data, error } = await supabase.from('products')
      .insert([{ ...form, purchase_cost_kg: parseFloat(form.purchase_cost_kg), base_margin: parseFloat(form.base_margin) || 0 }])
      .select().single()
    if (error) { setFormError('Errore nel salvataggio. Riprova.'); setSaving(false); return }
    setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setModalOpen(false); setForm(EMPTY_FORM); setSaving(false)
  }

  /* ── edit product ── */
  const openEditProduct = (product) => {
    setEditTarget(product)
    setEditForm({
      name: product.name, category: product.category, type: product.type || '',
      purchase_cost_kg: String(product.purchase_cost_kg), base_margin: String(product.base_margin),
    })
    setEditError('')
  }

  const handleEditProduct = async (e) => {
    e.preventDefault()
    if (!editForm.name.trim()) { setEditError('Il nome del prodotto è obbligatorio.'); return }
    if (!editForm.purchase_cost_kg || isNaN(editForm.purchase_cost_kg)) { setEditError('Inserisci un costo di acquisto valido.'); return }
    setSavingEdit(true); setEditError('')
    const { data, error } = await supabase.from('products')
      .update({ ...editForm, purchase_cost_kg: parseFloat(editForm.purchase_cost_kg), base_margin: parseFloat(editForm.base_margin) || 0 })
      .eq('id', editTarget.id).select().single()
    if (error) { setEditError('Errore nel salvataggio. Riprova.'); setSavingEdit(false); return }
    setProducts(prev => prev.map(p => p.id === editTarget.id ? data : p).sort((a, b) => a.name.localeCompare(b.name)))
    setEditTarget(null); setSavingEdit(false)
  }

  /* ── delete product ── */
  const handleDeleteProduct = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('products').delete().eq('id', deleteTarget.id)
    setProducts(prev => prev.filter(p => p.id !== deleteTarget.id))
    setDeleteTarget(null); setDeleting(false)
  }

  /* ── add cost ── */
  const handleAddCost = async (e) => {
    e.preventDefault()
    if (!addCostForm.label.trim()) { setAddCostError('Inserisci un\'etichetta.'); return }
    if (!addCostForm.cost_per_kg || isNaN(addCostForm.cost_per_kg)) { setAddCostError('Inserisci un costo valido.'); return }
    setSavingCost(true); setAddCostError('')
    const { data, error } = await supabase.from('product_costs')
      .insert([{ product_id: expandedId, label: addCostForm.label.trim(), cost_per_kg: parseFloat(addCostForm.cost_per_kg) }])
      .select().single()
    if (error) { setAddCostError('Errore nel salvataggio. Riprova.'); setSavingCost(false); return }
    setCostsMap(m => ({ ...m, [expandedId]: [...(m[expandedId] ?? []), data] }))
    setAddCostForm(EMPTY_COST); setSavingCost(false)
  }

  /* ── edit cost ── */
  const openEditCost = (cost) => {
    setEditCostTarget(cost)
    setEditCostForm({ label: cost.label, cost_per_kg: String(cost.cost_per_kg) })
    setEditCostError('')
  }

  const handleEditCost = async (e) => {
    e.preventDefault()
    if (!editCostForm.label.trim()) { setEditCostError("Inserisci un'etichetta."); return }
    if (!editCostForm.cost_per_kg || isNaN(editCostForm.cost_per_kg)) { setEditCostError('Inserisci un costo valido.'); return }
    setSavingEditCost(true); setEditCostError('')
    const { data, error } = await supabase.from('product_costs')
      .update({ label: editCostForm.label.trim(), cost_per_kg: parseFloat(editCostForm.cost_per_kg) })
      .eq('id', editCostTarget.id).select().single()
    if (error) { setEditCostError('Errore nel salvataggio. Riprova.'); setSavingEditCost(false); return }
    setCostsMap(m => ({
      ...m,
      [editCostTarget.product_id]: (m[editCostTarget.product_id] ?? []).map(c => c.id === editCostTarget.id ? data : c),
    }))
    setEditCostTarget(null); setSavingEditCost(false)
  }

  /* ── delete cost ── */
  const handleDeleteCost = async () => {
    if (!deleteCostTarget) return
    setDeletingCost(true)
    await supabase.from('product_costs').delete().eq('id', deleteCostTarget.id)
    setCostsMap(m => ({
      ...m,
      [deleteCostTarget.product_id]: (m[deleteCostTarget.product_id] ?? []).filter(c => c.id !== deleteCostTarget.id),
    }))
    setDeleteCostTarget(null); setDeletingCost(false)
  }

  const tabCounts = {
    glues: products.filter(p => p.category === 'glues').length,
    abrasives: products.filter(p => p.category === 'abrasives').length,
  }

  /* ── shared product form fields ── */
  function ProductFormFields({ f, setF, err }) {
    return (
      <>
        {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{err}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome prodotto *</label>
          <input type="text" value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} required
            className={fieldCls} placeholder="Es. Colla Epossidica Bicomponente" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria *</label>
          <select value={f.category} onChange={e => setF(x => ({ ...x, category: e.target.value }))} className={fieldCls}>
            <option value="glues">Colle</option>
            <option value="abrasives">Abrasivi</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
          <input type="text" value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value }))}
            className={fieldCls} placeholder="Es. Epossidica, Disco, Carta..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Costo acquisto base (€/kg) *</label>
          <input type="number" value={f.purchase_cost_kg} onChange={e => setF(x => ({ ...x, purchase_cost_kg: e.target.value }))}
            required min="0" step="0.0001" className={fieldCls} placeholder="0.0000" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Margine base (%)</label>
          <input type="number" value={f.base_margin} onChange={e => setF(x => ({ ...x, base_margin: e.target.value }))}
            min="0" max="999" step="0.01" className={fieldCls} placeholder="Es. 35" />
        </div>
        {f.purchase_cost_kg && f.base_margin && (
          <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
            Prezzo vendita stimato: <strong>
              {formatCurrency(parseFloat(f.purchase_cost_kg) * (1 + parseFloat(f.base_margin) / 100))}/kg
            </strong>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title="Prodotti" showLogout />

      <main className="max-w-4xl mx-auto px-4 py-5">

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca prodotto..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-navy-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-800 focus:border-transparent text-base" />
        </div>

        {/* Tabs */}
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-4">
          {[{ key: 'glues', label: 'Colle' }, { key: 'abrasives', label: 'Abrasivi' }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key ? 'bg-navy-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
              <span className={`ml-1.5 text-xs ${activeTab === tab.key ? 'text-white/70' : 'text-gray-400'}`}>
                ({tabCounts[tab.key]})
              </span>
            </button>
          ))}
        </div>

        {/* Add button */}
        <button onClick={() => { setModalOpen(true); setFormError(''); setForm({ ...EMPTY_FORM, category: activeTab }) }}
          className="w-full bg-navy-800 text-white py-3 rounded-xl font-semibold text-sm hover:bg-navy-900 active:bg-navy-950 transition-colors flex items-center justify-center gap-2 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Aggiungi prodotto
        </button>

        {/* Product list */}
        {loading ? (
          <Spinner size="lg" className="py-12" />
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? 'Nessun prodotto trovato per questa ricerca.' : 'Nessun prodotto in questa categoria.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(product => {
              const salePrice  = product.purchase_cost_kg * (1 + product.base_margin / 100)
              const isExpanded = expandedId === product.id
              const costs      = costsMap[product.id] ?? []

              return (
                <div key={product.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {/* Product row */}
                  <div className="flex items-stretch gap-2 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy-800">{product.name}</p>
                          {product.type && <p className="text-xs text-gray-400 mt-0.5">{product.type}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-navy-700">
                            {formatCurrency(product.purchase_cost_kg)}<span className="text-xs font-normal text-gray-400">/kg</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Margine: <span className="font-semibold text-gray-600">{product.base_margin}%</span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Prezzo vendita stimato</span>
                        <span className="text-xs font-semibold text-green-600">{formatCurrency(salePrice)}/kg</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {/* Costi toggle */}
                      <button onClick={() => toggleExpand(product.id)}
                        className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-colors ${
                          isExpanded
                            ? 'bg-navy-800 border-navy-800 text-white'
                            : 'bg-white border-gray-100 text-gray-400 hover:text-navy-600 hover:border-navy-200'
                        }`}
                        aria-label={isExpanded ? 'Chiudi costi' : 'Mostra costi'}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                        </svg>
                      </button>
                      {/* Edit */}
                      <button onClick={() => openEditProduct(product)}
                        className="flex items-center justify-center w-10 h-10 bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-navy-600 hover:border-navy-200 transition-colors"
                        aria-label="Modifica prodotto">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button onClick={() => setDeleteTarget(product)}
                        className="flex items-center justify-center w-10 h-10 bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-red-500 hover:border-red-200 transition-colors"
                        aria-label="Elimina prodotto">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded costs section ── */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-4 pb-4 pt-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Costi fornitore</p>

                      {costsLoading && !costsMap[product.id] ? (
                        <Spinner size="sm" className="py-2" />
                      ) : costs.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">Nessun costo aggiunto</p>
                      ) : (
                        <div className="space-y-1">
                          {costs.map(cost => (
                            <div key={cost.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                              <span className="flex-1 text-sm text-navy-800 font-medium truncate">{cost.label}</span>
                              <span className="text-sm font-semibold text-gray-600 tabular-nums flex-shrink-0">
                                {formatCurrency(cost.cost_per_kg)}/kg
                              </span>
                              <button onClick={() => openEditCost(cost)}
                                className="p-1 rounded text-gray-300 hover:text-navy-600 transition-colors flex-shrink-0"
                                aria-label="Modifica costo">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button onClick={() => setDeleteCostTarget(cost)}
                                className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                                aria-label="Elimina costo">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add cost inline form */}
                      <form onSubmit={handleAddCost} className="pt-1 space-y-2">
                        {addCostError && (
                          <p className="text-xs text-red-600">{addCostError}</p>
                        )}
                        <div className="flex gap-2">
                          <input type="text" value={addCostForm.label}
                            onChange={e => setAddCostForm(f => ({ ...f, label: e.target.value }))}
                            placeholder="Es. Fornitore 1"
                            className={`flex-1 ${smallFieldCls}`} />
                          <input type="number" value={addCostForm.cost_per_kg} min="0" step="0.0001"
                            onChange={e => setAddCostForm(f => ({ ...f, cost_per_kg: e.target.value }))}
                            placeholder="€/kg"
                            className="w-24 flex-shrink-0 px-3 py-2.5 border border-gray-200 rounded-xl text-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white" />
                          <button type="submit" disabled={savingCost}
                            className="flex-shrink-0 flex items-center gap-1 px-3 py-2.5 bg-navy-800 text-white rounded-xl text-xs font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60">
                            {savingCost ? <Spinner size="sm" /> : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            )}
                            {savingCost ? '' : 'Aggiungi'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Delete product confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Elimina prodotto">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sei sicuro di voler eliminare <span className="font-semibold text-navy-800">{deleteTarget?.name}</span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleDeleteProduct} disabled={deleting}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {deleting && <Spinner size="sm" />}
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Product Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuovo prodotto">
        <form onSubmit={handleAdd} className="space-y-4">
          <ProductFormFields f={form} setF={setForm} err={formError} />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Spinner size="sm" />}
              {saving ? 'Salvataggio...' : 'Aggiungi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Modifica prodotto">
        <form onSubmit={handleEditProduct} className="space-y-4">
          <ProductFormFields f={editForm} setF={setEditForm} err={editError} />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingEdit}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingEdit && <Spinner size="sm" />}
              {savingEdit ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete cost confirmation */}
      <Modal isOpen={!!deleteCostTarget} onClose={() => setDeleteCostTarget(null)} title="Elimina costo">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Elimina il costo <span className="font-semibold text-navy-800">{deleteCostTarget?.label}</span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteCostTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleDeleteCost} disabled={deletingCost}
              className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {deletingCost && <Spinner size="sm" />}
              {deletingCost ? 'Eliminazione...' : 'Elimina'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit cost modal */}
      <Modal isOpen={!!editCostTarget} onClose={() => setEditCostTarget(null)} title="Modifica costo">
        <form onSubmit={handleEditCost} className="space-y-4">
          {editCostError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{editCostError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Etichetta</label>
            <input type="text" value={editCostForm.label}
              onChange={e => setEditCostForm(f => ({ ...f, label: e.target.value }))}
              className={fieldCls} placeholder="Es. Fornitore 1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Costo (€/kg)</label>
            <input type="number" value={editCostForm.cost_per_kg} min="0" step="0.0001"
              onChange={e => setEditCostForm(f => ({ ...f, cost_per_kg: e.target.value }))}
              className={fieldCls} placeholder="0.0000" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditCostTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={savingEditCost}
              className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-semibold hover:bg-navy-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {savingEditCost && <Spinner size="sm" />}
              {savingEditCost ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

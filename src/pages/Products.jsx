import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import BottomNav from '../components/BottomNav'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const EMPTY_FORM = {
  name: '',
  category: 'glues',
  type: '',
  purchase_cost_kg: '',
  base_margin: '',
}

function formatCurrency(val) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val ?? 0)
}

export default function Products() {
  const [products,    setProducts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [search,      setSearch]      = useState('')
  const [activeTab,   setActiveTab]   = useState('glues')

  /* add */
  const [modalOpen,   setModalOpen]   = useState(false)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  /* edit */
  const [editTarget,  setEditTarget]  = useState(null)
  const [editForm,    setEditForm]    = useState(EMPTY_FORM)
  const [savingEdit,  setSavingEdit]  = useState(false)
  const [editError,   setEditError]   = useState('')

  /* delete */
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')
      if (error) throw error
      setProducts(data)
    } catch (e) {
      setError('Errore nel caricamento dei prodotti.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = products.filter(p =>
    p.category === activeTab &&
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  /* ── add ── */
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Il nome del prodotto è obbligatorio.'); return }
    if (!form.purchase_cost_kg || isNaN(form.purchase_cost_kg)) { setFormError('Inserisci un costo di acquisto valido.'); return }
    setSaving(true); setFormError('')
    const { data, error } = await supabase
      .from('products')
      .insert([{ ...form, purchase_cost_kg: parseFloat(form.purchase_cost_kg), base_margin: parseFloat(form.base_margin) || 0 }])
      .select().single()
    if (error) { setFormError('Errore nel salvataggio. Riprova.'); setSaving(false); return }
    setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setModalOpen(false); setForm(EMPTY_FORM); setSaving(false)
  }

  /* ── edit ── */
  const openEdit = (product) => {
    setEditTarget(product)
    setEditForm({
      name:             product.name,
      category:         product.category,
      type:             product.type || '',
      purchase_cost_kg: String(product.purchase_cost_kg),
      base_margin:      String(product.base_margin),
    })
    setEditError('')
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (!editForm.name.trim()) { setEditError('Il nome del prodotto è obbligatorio.'); return }
    if (!editForm.purchase_cost_kg || isNaN(editForm.purchase_cost_kg)) { setEditError('Inserisci un costo di acquisto valido.'); return }
    setSavingEdit(true); setEditError('')
    const { data, error } = await supabase
      .from('products')
      .update({ ...editForm, purchase_cost_kg: parseFloat(editForm.purchase_cost_kg), base_margin: parseFloat(editForm.base_margin) || 0 })
      .eq('id', editTarget.id)
      .select().single()
    if (error) { setEditError('Errore nel salvataggio. Riprova.'); setSavingEdit(false); return }
    setProducts(prev => prev.map(p => p.id === editTarget.id ? data : p).sort((a, b) => a.name.localeCompare(b.name)))
    setEditTarget(null); setSavingEdit(false)
  }

  /* ── delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('products').delete().eq('id', deleteTarget.id)
    setProducts(prev => prev.filter(p => p.id !== deleteTarget.id))
    setDeleteTarget(null); setDeleting(false)
  }

  const tabCounts = {
    glues:     products.filter(p => p.category === 'glues').length,
    abrasives: products.filter(p => p.category === 'abrasives').length,
  }

  /* ── shared form fields ── */
  const fieldCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white'

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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Costo acquisto (€/kg) *</label>
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
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca prodotto..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-navy-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-800 focus:border-transparent text-base"
          />
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
        <button
          onClick={() => { setModalOpen(true); setFormError(''); setForm({ ...EMPTY_FORM, category: activeTab }) }}
          className="w-full bg-navy-800 text-white py-3 rounded-xl font-semibold text-sm hover:bg-navy-900 active:bg-navy-950 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Aggiungi prodotto
        </button>

        {/* List */}
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
              const salePrice = product.purchase_cost_kg * (1 + product.base_margin / 100)
              return (
                <div key={product.id} className="flex items-stretch gap-2">
                  <div className="flex-1 bg-white rounded-xl p-4 border border-gray-100 min-w-0">
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
                          Margine base: <span className="font-semibold text-gray-600">{product.base_margin}%</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                      <span className="text-xs text-gray-400">Prezzo vendita stimato</span>
                      <span className="text-xs font-semibold text-green-600">{formatCurrency(salePrice)}/kg</span>
                    </div>
                  </div>
                  {/* Edit button */}
                  <button
                    onClick={() => openEdit(product)}
                    className="flex-shrink-0 flex items-center justify-center w-10 bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-navy-600 hover:border-navy-200 transition-colors"
                    aria-label="Modifica prodotto"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={() => setDeleteTarget(product)}
                    className="flex-shrink-0 flex items-center justify-center w-10 bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-red-500 hover:border-red-200 transition-colors"
                    aria-label="Elimina prodotto"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Elimina prodotto">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sei sicuro di voler eliminare <span className="font-semibold text-navy-800">{deleteTarget?.name}</span>?
            Tutti i suoi dati verranno persi.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button onClick={handleDelete} disabled={deleting}
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
        <form onSubmit={handleEdit} className="space-y-4">
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
    </div>
  )
}

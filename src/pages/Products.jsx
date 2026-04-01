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
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('glues')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    fetchProducts()
  }, [])

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

  const filtered = products.filter(p => p.category === activeTab)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Il nome del prodotto è obbligatorio.')
      return
    }
    if (!form.purchase_cost_kg || isNaN(form.purchase_cost_kg)) {
      setFormError('Inserisci un costo di acquisto valido.')
      return
    }

    setSaving(true)
    setFormError('')

    const { data, error } = await supabase
      .from('products')
      .insert([{
        ...form,
        purchase_cost_kg: parseFloat(form.purchase_cost_kg),
        base_margin: parseFloat(form.base_margin) || 0,
      }])
      .select()
      .single()

    if (error) {
      setFormError('Errore nel salvataggio. Riprova.')
      setSaving(false)
      return
    }

    setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  const tabCounts = {
    glues: products.filter(p => p.category === 'glues').length,
    abrasives: products.filter(p => p.category === 'abrasives').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Topbar title="Prodotti" showLogout />

      <main className="max-w-4xl mx-auto px-4 py-5">
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
            Nessun prodotto in questa categoria.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(product => {
              const salePrice = product.purchase_cost_kg * (1 + product.base_margin / 100)
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl p-4 border border-gray-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-800">{product.name}</p>
                      {product.type && (
                        <p className="text-xs text-gray-400 mt-0.5">{product.type}</p>
                      )}
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
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Add Product Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuovo prodotto">
        <form onSubmit={handleAdd} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{formError}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome prodotto *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="Es. Colla Epossidica Bicomponente"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria *</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base bg-white"
            >
              <option value="glues">Colle</option>
              <option value="abrasives">Abrasivi</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
            <input
              type="text"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="Es. Epossidica, Disco, Carta..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Costo acquisto (€/kg) *</label>
            <input
              type="number"
              value={form.purchase_cost_kg}
              onChange={e => setForm(f => ({ ...f, purchase_cost_kg: e.target.value }))}
              required
              min="0"
              step="0.0001"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Margine base (%)</label>
            <input
              type="number"
              value={form.base_margin}
              onChange={e => setForm(f => ({ ...f, base_margin: e.target.value }))}
              min="0"
              max="999"
              step="0.01"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800 text-base"
              placeholder="Es. 35"
            />
          </div>

          {form.purchase_cost_kg && form.base_margin && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
              Prezzo vendita stimato: <strong>
                {formatCurrency(parseFloat(form.purchase_cost_kg) * (1 + parseFloat(form.base_margin) / 100))}/kg
              </strong>
            </div>
          )}

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
    </div>
  )
}

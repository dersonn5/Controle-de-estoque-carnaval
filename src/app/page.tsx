'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Plus, Minus, ShoppingCart, BarChart3, Package,
  TrendingUp, Target, Zap, Clock, ArrowUpRight,
  Droplets, Beer, Star, Flame, Sparkles, Crown,
  AlertTriangle, CheckCircle2, XCircle, Warehouse,
  CircleDollarSign, GlassWater, Disc3, Wine,
  Snowflake, RefreshCw, ArrowDownCircle, Pencil,
} from 'lucide-react'

// ─── Types ───
interface Produto {
  id: number; nome: string; categoria: string
  custo_unitario: number; preco_venda_sugerido: number; unidades_por_pack: number
}
interface EstoqueItem {
  produto_id: number; quantidade_total_inicial: number; quantidade_atual: number
}
interface Venda {
  id: number; produto_id: number; quantidade_vendida: number
  valor_total_venda: number; data_hora_venda: string
}
interface Promocao {
  id: number; produto_id: number; qtd_gatilho: number; valor_final: number
}

// ─── Brand colors per product ───
const prodVisuals: Record<number, {
  icon: React.ReactNode
  iconColor: string
  gradient: string
  btnColor: string
}> = {
  1: { // Skol
    icon: <Beer strokeWidth={1.5} />,
    iconColor: '#D97706',
    gradient: 'linear-gradient(145deg, #F59E0B, #FBBF24)',
    btnColor: '#B45309',
  },
  2: { // Beats Senses (Azul)
    icon: <Disc3 strokeWidth={1.5} />,
    iconColor: '#2563EB',
    gradient: 'linear-gradient(145deg, #2563EB, #60A5FA)',
    btnColor: '#1D4ED8',
  },
  3: { // Spaten
    icon: <Beer strokeWidth={1.5} />,
    iconColor: '#15803D',
    gradient: 'linear-gradient(145deg, #166534, #22C55E)',
    btnColor: '#166534',
  },
  4: { // Brutal Fruit
    icon: <Wine strokeWidth={1.5} />,
    iconColor: '#EC4899',
    gradient: 'linear-gradient(145deg, #F472B6, #FBCFE8)',
    btnColor: '#DB2777',
  },
  5: { // Água
    icon: <GlassWater strokeWidth={1.5} />,
    iconColor: '#0891B2',
    gradient: 'linear-gradient(145deg, #06B6D4, #67E8F9)',
    btnColor: '#0E7490',
  },
  6: { // Stella Artois
    icon: <Star strokeWidth={1.5} />,
    iconColor: '#B91C1C',
    gradient: 'linear-gradient(145deg, #B91C1C, #EF4444)',
    btnColor: '#991B1B',
  },
  7: { // Beats Red Mix
    icon: <Disc3 strokeWidth={1.5} />,
    iconColor: '#DC2626',
    gradient: 'linear-gradient(145deg, #DC2626, #F87171)',
    btnColor: '#B91C1C',
  },
}

const fallbackVisual = {
  icon: <Package strokeWidth={1.5} />,
  iconColor: '#059669',
  gradient: 'linear-gradient(145deg, #059669, #10B981)',
  btnColor: '#059669',
}

const EVENT_START = 8, EVENT_END = 18.5, NUM_SOCIOS = 2, META = 4000

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function elapsed() {
  const h = new Date().getHours() + new Date().getMinutes() / 60
  return h < EVENT_START ? 0 : h > EVENT_END ? EVENT_END - EVENT_START : h - EVENT_START
}
function remaining() { return (EVENT_END - EVENT_START) - elapsed() }

export default function App() {
  const [tab, setTab] = useState<'vender' | 'dashboard' | 'estoque' | 'reposicao'>('vender')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [estoque, setEstoque] = useState<EstoqueItem[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [promocoes, setPromocoes] = useState<Promocao[]>([])
  const [cart, setCart] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [despesasTotal, setDespesasTotal] = useState(0)

  const fetchAll = useCallback(async () => {
    const [p, e, v, pr] = await Promise.all([
      supabase.from('produtos').select('*').order('id'),
      supabase.from('estoque').select('*'),
      supabase.from('vendas').select('*').order('data_hora_venda', { ascending: false }),
      supabase.from('promocoes').select('*'),
    ])
    if (p.data) setProdutos(p.data)
    if (e.data) setEstoque(e.data)
    if (v.data) setVendas(v.data)
    if (pr.data) setPromocoes(pr.data)

    // Fetch expenses from compras_pulmao
    const { data: gastos } = await supabase.from('compras_pulmao').select('custo_total')
    if (gastos) {
      setDespesasTotal(gastos.reduce((acc, g) => acc + (g.custo_total || 0), 0))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const i = setInterval(fetchAll, 12000)
    return () => clearInterval(i)
  }, [fetchAll])

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 3000)
  }

  const getEst = useCallback((id: number) => estoque.find(e => e.produto_id === id), [estoque])

  // ─── Greedy Promotion Calculator ───
  const calcularPrecoItem = useCallback((produtoId: number, quantidade: number): number => {
    const prod = produtos.find(p => p.id === produtoId)
    if (!prod || quantidade <= 0) return 0

    // Get promotions for this product, sorted descending by qtd_gatilho
    const promos = promocoes
      .filter(p => p.produto_id === produtoId)
      .sort((a, b) => b.qtd_gatilho - a.qtd_gatilho)

    let restante = quantidade
    let totalPreco = 0

    // Greedy: apply the largest bundle first, then smaller ones
    for (const promo of promos) {
      while (restante >= promo.qtd_gatilho) {
        totalPreco += promo.valor_final
        restante -= promo.qtd_gatilho
      }
    }

    // Remaining units at base price
    if (restante > 0) {
      totalPreco += restante * prod.preco_venda_sugerido
    }

    return totalPreco
  }, [produtos, promocoes])

  // Check if a product has any active promotions
  const hasPromo = useCallback((produtoId: number) => {
    return promocoes.some(p => p.produto_id === produtoId)
  }, [promocoes])

  // Get the best promo label for display (smallest bundle)
  const getPromoLabel = useCallback((produtoId: number): string | null => {
    const promos = promocoes
      .filter(p => p.produto_id === produtoId)
      .sort((a, b) => a.qtd_gatilho - b.qtd_gatilho)
    if (promos.length === 0) return null
    const best = promos[0]
    return `${best.qtd_gatilho}un ${fmt(best.valor_final)}`
  }, [promocoes])

  const add = (id: number) => {
    const e = getEst(id); const q = cart[id] || 0
    if (e && q < e.quantidade_atual) setCart(p => ({ ...p, [id]: q + 1 }))
  }
  const remove = (id: number) => {
    const q = cart[id] || 0
    if (q > 1) setCart(p => ({ ...p, [id]: q - 1 }))
    else setCart(p => { const n = { ...p }; delete n[id]; return n })
  }

  const items = useMemo(() =>
    Object.entries(cart).filter(([, q]) => q > 0)
      .map(([id, q]) => ({ produto: produtos.find(p => p.id === +id)!, quantidade: q }))
      .filter(i => i.produto), [cart, produtos])

  // Total uses promotion pricing
  const total = useMemo(() => items.reduce((s, i) => s + calcularPrecoItem(i.produto.id, i.quantidade), 0), [items, calcularPrecoItem])
  const count = useMemo(() => items.reduce((s, i) => s + i.quantidade, 0), [items])

  const submit = async () => {
    if (!items.length || submitting) return
    setSubmitting(true)
    try {
      for (const it of items) {
        const v = calcularPrecoItem(it.produto.id, it.quantidade)
        const { error: e1 } = await supabase.from('vendas').insert({
          produto_id: it.produto.id, quantidade_vendida: it.quantidade, valor_total_venda: v,
        })
        if (e1) throw e1
        const est = getEst(it.produto.id)
        if (est) {
          const { error: e2 } = await supabase.from('estoque')
            .update({ quantidade_atual: est.quantidade_atual - it.quantidade })
            .eq('produto_id', it.produto.id)
          if (e2) throw e2
        }
      }
      showToast('success', `${fmt(total)} registrado!`)
      setCart({})
      await fetchAll()
    } catch { showToast('error', 'Erro ao registrar.') }
    finally { setSubmitting(false) }
  }

  // ─── Reposição (Restock) ───
  const reporEstoque = async (produtoId: number, nome: string) => {
    const qtdStr = window.prompt(`📦 PULMÃO: ${nome}\n\nQuantas unidades você comprou?`)
    if (!qtdStr) return
    const qtd = parseInt(qtdStr)

    const custoStr = window.prompt(`💰 CUSTO: ${nome}\n\nQuanto custou essa compra no TOTAL (R$)?`)
    if (!custoStr) return
    const custoVal = parseFloat(custoStr.replace(',', '.'))

    if (isNaN(qtd) || isNaN(custoVal) || qtd <= 0 || custoVal <= 0) {
      showToast('error', 'Valores inválidos!')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.rpc('registrar_compra_pulmao', {
      p_produto_id: produtoId,
      p_nome: nome,
      p_qtd: qtd,
      p_custo: custoVal,
    })

    if (error) {
      showToast('error', 'Erro: ' + error.message)
    } else {
      showToast('success', `✅ ${nome}: +${qtd}un | -${fmt(custoVal)}`)
      await fetchAll()
    }
    setSubmitting(false)
  }

  // ─── Gelo / Despesas extras ───
  const registrarGelo = async () => {
    const custoStr = window.prompt(`🧊 COMPRA DE GELO/EXTRAS\n\nQuanto custou (R$)?`)
    if (!custoStr) return
    const custoVal = parseFloat(custoStr.replace(',', '.'))
    if (isNaN(custoVal) || custoVal <= 0) return

    setSubmitting(true)
    const { error } = await supabase.rpc('registrar_compra_pulmao', {
      p_produto_id: null,
      p_nome: 'Gelo/Diversos',
      p_qtd: 1,
      p_custo: custoVal,
    })

    if (!error) {
      showToast('success', `❄️ Gelo ${fmt(custoVal)} registrado!`)
      await fetchAll()
    } else {
      showToast('error', 'Erro: ' + error.message)
    }
    setSubmitting(false)
  }

  // ─── Editar Estoque (corrigir contagem) ───
  const editarEstoque = async (produtoId: number, nome: string) => {
    const est = getEst(produtoId)
    const atualQty = est?.quantidade_atual ?? 0
    const inicialQty = est?.quantidade_total_inicial ?? 0

    const novaAtualStr = window.prompt(`✏️ EDITAR: ${nome}\n\nQuantidade ATUAL (hoje: ${atualQty}):`)
    if (!novaAtualStr) return
    const novaAtual = parseInt(novaAtualStr)

    const novaInicialStr = window.prompt(`📦 EDITAR: ${nome}\n\nQuantidade INICIAL TOTAL (hoje: ${inicialQty}):`)
    if (!novaInicialStr) return
    const novaInicial = parseInt(novaInicialStr)

    if (isNaN(novaAtual) || isNaN(novaInicial) || novaAtual < 0 || novaInicial < 0) {
      showToast('error', 'Valores inválidos!')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('estoque')
      .update({ quantidade_atual: novaAtual, quantidade_total_inicial: novaInicial })
      .eq('produto_id', produtoId)

    if (error) {
      showToast('error', 'Erro: ' + error.message)
    } else {
      showToast('success', `✅ ${nome}: ${novaAtual}/${novaInicial}`)
      await fetchAll()
    }
    setSubmitting(false)
  }

  // ─── Dashboard calcs ───
  const today = new Date().toISOString().split('T')[0]
  const tVendas = useMemo(() => vendas.filter(v => v.data_hora_venda?.startsWith(today)), [vendas, today])
  const bruto = useMemo(() => tVendas.reduce((s, v) => s + +v.valor_total_venda, 0), [tVendas])
  const custo = useMemo(() => tVendas.reduce((s, v) => {
    const p = produtos.find(x => x.id === v.produto_id)
    return s + (p ? p.custo_unitario * v.quantidade_vendida : 0)
  }, 0), [tVendas, produtos])
  const liquido = bruto - custo
  const saldoCaixa = bruto - despesasTotal
  const porSocio = saldoCaixa / NUM_SOCIOS
  const metaPct = Math.min((porSocio / META) * 100, 100)
  const hrs = elapsed(), hrsLeft = remaining()
  const porHora = hrs > 0 ? bruto / hrs : 0
  const projTotal = hrs > 0 ? bruto + porHora * hrsLeft : 0
  const projCusto = hrs > 0 ? despesasTotal + (despesasTotal / Math.max(hrs, 0.5)) * hrsLeft : 0
  const projSocio = (projTotal - projCusto) / NUM_SOCIOS
  const itensVendidos = useMemo(() => tVendas.reduce((s, v) => s + v.quantidade_vendida, 0), [tVendas])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center animate-fade-in">
        <Sparkles className="w-10 h-10 text-green mx-auto mb-3" strokeWidth={1.5} />
        <h1 className="text-xl font-black text-green-dark">Carnaval Control</h1>
        <p className="text-text-muted text-sm mt-1">Carregando...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 glass-header border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-sm font-black text-green-dark leading-tight">Carnaval Control</h1>
              <p className="text-[10px] text-text-muted leading-tight">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>
          <div className="green-card rounded-xl px-3 py-1.5">
            <p className="text-[9px] text-white/70 uppercase tracking-wider">Hoje</p>
            <p className="text-sm font-black text-white number-display">{fmt(bruto)}</p>
          </div>
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-16 left-4 right-4 z-50 rounded-2xl px-4 py-3 text-sm font-semibold animate-slide-up flex items-center gap-2 ${toast.type === 'success'
          ? 'bg-green/10 border border-green/20 text-green-dark'
          : 'bg-red-50 border border-red-200 text-danger'
          }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="w-5 h-5 text-green shrink-0" strokeWidth={1.5} />
            : <XCircle className="w-5 h-5 text-danger shrink-0" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-44">

        {/* ═══ VENDER — Full-height cards + Mask BG ═══ */}
        {tab === 'vender' && (
          <div className="p-2 animate-fade-in relative" style={{ height: 'calc(100vh - 8rem)' }}>
            {/* Carnival mask watermark */}
            <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 opacity-[0.05] pointer-events-none z-0" viewBox="0 0 200 200" fill="none">
              <path d="M100 40C60 40 30 65 25 95C23 108 28 120 40 125C50 129 62 126 70 118C78 110 88 105 100 105C112 105 122 110 130 118C138 126 150 129 160 125C172 120 177 108 175 95C170 65 140 40 100 40Z" fill="#1A2E1F" />
              <ellipse cx="70" cy="85" rx="18" ry="14" fill="white" />
              <ellipse cx="130" cy="85" rx="18" ry="14" fill="white" />
              <path d="M85 125C90 132 95 135 100 135C105 135 110 132 115 125" stroke="#1A2E1F" strokeWidth="3" strokeLinecap="round" />
              <path d="M25 80C15 75 8 82 5 90" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M175 80C185 75 192 82 195 90" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="55" cy="50" r="4" fill="#059669" />
              <circle cx="100" cy="35" r="5" fill="#059669" />
              <circle cx="145" cy="50" r="4" fill="#059669" />
              <path d="M45 45L55 50L50 38" stroke="#059669" strokeWidth="1.5" />
              <path d="M90 32L100 35L95 25" stroke="#059669" strokeWidth="1.5" />
              <path d="M135 45L145 50L140 38" stroke="#059669" strokeWidth="1.5" />
            </svg>

            <div className="grid grid-cols-3 gap-2 h-full relative z-10" style={{ gridTemplateRows: 'repeat(3, 1fr)' }}>
              {produtos.map((prod, idx) => {
                const est = getEst(prod.id)
                const qty = cart[prod.id] || 0
                const atual = est?.quantidade_atual ?? 0
                const out = atual <= 0
                const vis = prodVisuals[prod.id] || fallbackVisual

                return (
                  <div
                    key={prod.id}
                    style={{
                      background: vis.gradient,
                      animationDelay: `${idx * 40}ms`,
                      ...(qty > 0 ? { boxShadow: `0 0 14px ${vis.btnColor}40`, ['--tw-ring-color' as string]: `${vis.btnColor}99` } : {}),
                    } as React.CSSProperties}
                    className={`rounded-2xl p-2 flex flex-col items-center justify-center text-center animate-fade-in transition-all duration-200 shadow-md ${qty > 0 ? 'ring-2' : ''} ${out ? 'opacity-30 grayscale' : ''}`}
                  >
                    <div className="icon-box w-9 h-9 rounded-lg flex items-center justify-center">
                      <div className="w-5 h-5 text-white">{vis.icon}</div>
                    </div>

                    <p className="text-[10px] font-bold text-white leading-tight line-clamp-1 mt-1 mb-0.5 drop-shadow-sm">
                      {prod.nome}
                    </p>

                    <p className="text-xs font-black text-white number-display drop-shadow-sm">
                      {fmt(prod.preco_venda_sugerido)}
                    </p>

                    {hasPromo(prod.id) && (
                      <p className="text-[7px] font-bold text-white/90 bg-white/20 rounded-full px-1.5 py-0.5 mt-0.5">
                        🏷️ {getPromoLabel(prod.id)}
                      </p>
                    )}

                    {qty > 0 ? (
                      <p className="text-[8px] font-bold text-white/90 mt-0.5 number-display">
                        = {fmt(calcularPrecoItem(prod.id, qty))}
                      </p>
                    ) : (
                      <p className="text-[8px] font-semibold text-white/70 mt-0.5">{atual}un</p>
                    )}

                    {qty > 0 ? (
                      <div className="flex items-center gap-1 mt-1">
                        <button onClick={() => remove(prod.id)}
                          className="w-7 h-7 rounded-lg bg-white/20 text-white flex items-center justify-center press-scale">
                          <Minus className="w-3 h-3" strokeWidth={2.5} />
                        </button>
                        <span className="w-5 text-center text-xs font-black text-white number-display">{qty}</span>
                        <button onClick={() => add(prod.id)} disabled={out}
                          className="w-7 h-7 rounded-lg flex items-center justify-center press-scale"
                          style={{ background: 'white', border: `2px solid ${vis.btnColor}`, color: vis.btnColor }}>
                          <Plus className="w-3 h-3" strokeWidth={3} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => add(prod.id)} disabled={out}
                        className="w-8 h-8 rounded-xl flex items-center justify-center press-scale mt-1"
                        style={{ background: 'white', border: `2px solid ${vis.btnColor}`, color: vis.btnColor, boxShadow: `0 0 6px ${vis.btnColor}40` }}>
                        <Plus className="w-4 h-4" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ DASHBOARD — White cards for legibility ═══ */}
        {tab === 'dashboard' && (
          <div className="p-4 space-y-4 animate-fade-in">
            {/* Hero — green */}
            <div className="green-card rounded-2xl p-5 text-center">
              <CircleDollarSign className="w-7 h-7 text-white/70 mx-auto mb-1.5" strokeWidth={1.5} />
              <p className="text-[10px] text-white/60 uppercase tracking-[0.15em] mb-1">Faturamento Bruto</p>
              <p className="text-4xl font-black text-white number-display">{fmt(bruto)}</p>
              <div className="flex items-center justify-center gap-3 mt-2 text-white/60 text-[11px]">
                <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" strokeWidth={1.5} />{tVendas.length} pedidos</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span className="flex items-center gap-1"><Package className="w-3 h-3" strokeWidth={1.5} />{itensVendidos} itens</span>
              </div>
            </div>

            {/* Metrics — white */}
            <div className="grid grid-cols-2 gap-3">
              <div className="metric-card rounded-2xl p-3">
                <div className="flex items-center gap-1 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green" strokeWidth={1.5} />
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium">Líquido</p>
                </div>
                <p className="text-lg font-black text-green-dark number-display">{fmt(liquido)}</p>
              </div>
              <div className="metric-card rounded-2xl p-3">
                <div className="flex items-center gap-1 mb-1.5">
                  <ArrowDownCircle className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium">Despesas</p>
                </div>
                <p className="text-lg font-black text-danger number-display">{fmt(despesasTotal)}</p>
              </div>
              <div className="metric-card rounded-2xl p-3">
                <div className="flex items-center gap-1 mb-1.5">
                  <Zap className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.5} />
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium">Saldo Caixa</p>
                </div>
                <p className={`text-lg font-black number-display ${saldoCaixa >= 0 ? 'text-green-dark' : 'text-danger'}`}>{fmt(saldoCaixa)}</p>
              </div>
              <div className="metric-card rounded-2xl p-3">
                <div className="flex items-center gap-1 mb-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
                  <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium">/ Sócio</p>
                </div>
                <p className={`text-lg font-black number-display ${porSocio >= 0 ? 'text-text-dark' : 'text-danger'}`}>{fmt(porSocio)}</p>
              </div>
            </div>

            {/* Goal — white card */}
            <div className="metric-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-green" strokeWidth={1.5} />
                  <p className="text-xs text-text-dark font-semibold">Meta R$ 4.000 / Sócio</p>
                </div>
                <span className="text-sm font-black text-green number-display">{metaPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-green stock-bar" style={{ width: `${metaPct}%` }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-text-muted">{fmt(porSocio)}</span>
                <span className="text-[10px] text-text-muted">{fmt(META)}</span>
              </div>
            </div>

            {/* Velocity — white */}
            <div className="grid grid-cols-2 gap-3">
              <div className="metric-card rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-4 h-4 text-yellow-500" strokeWidth={1.5} />
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium">R$/Hora</p>
                </div>
                <p className="text-lg font-black text-text-dark number-display">{fmt(porHora)}</p>
              </div>
              <div className="metric-card rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium">Projeção</p>
                </div>
                <p className="text-lg font-black text-text-dark number-display">{fmt(projTotal)}</p>
              </div>
            </div>

            {/* Projected profit — accent card */}
            <div className="metric-card rounded-2xl p-4 border-green/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
                  <Target className="w-5 h-5 text-green" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Projeção Lucro/Sócio 18:30</p>
                  <p className="text-2xl font-black text-text-dark number-display">{fmt(projSocio)}</p>
                </div>
              </div>
              <p className="text-[10px] text-text-muted mt-2 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-green" strokeWidth={1.5} />
                {hrsLeft > 0 ? `${hrsLeft.toFixed(1)}h restantes · ${fmt(porHora)}/h` : 'Encerrado'}
              </p>
            </div>

            {/* Recent sales — white card */}
            <div className="metric-card rounded-2xl p-4">
              <p className="text-xs text-text-dark font-bold uppercase tracking-wider mb-3">Últimas Vendas</p>
              {tVendas.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">Nenhuma venda ainda</p>
              ) : (
                <div className="space-y-0 max-h-64 overflow-y-auto">
                  {tVendas.slice(0, 15).map(v => {
                    const p = produtos.find(x => x.id === v.produto_id)
                    const vis = prodVisuals[v.produto_id] || fallbackVisual
                    return (
                      <div key={v.id} className="flex items-center gap-2.5 py-2.5 border-b border-gray-100 last:border-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4"
                          style={{ background: vis.gradient }}>
                          <div className="text-white [&>svg]:w-4 [&>svg]:h-4">{vis.icon}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-text-dark truncate">{p?.nome || `#${v.produto_id}`}</p>
                          <p className="text-[10px] text-text-muted">{v.quantidade_vendida}x · {new Date(v.data_hora_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <p className="text-xs font-bold text-text-dark number-display">{fmt(+v.valor_total_venda)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ ESTOQUE — Brand-colored cards ═══ */}
        {tab === 'estoque' && (
          <div className="p-4 space-y-4 animate-fade-in">
            <div className="green-card rounded-2xl p-4 text-center relative">
              <Warehouse className="w-6 h-6 text-white/70 mx-auto mb-1" strokeWidth={1.5} />
              <p className="text-[10px] text-white/60 uppercase tracking-[0.15em] mb-1">Estoque Restante</p>
              <p className="text-3xl font-black text-white number-display">
                {estoque.reduce((s, e) => s + e.quantidade_atual, 0)}
              </p>
              <p className="text-[11px] text-white/50 mt-0.5">
                de {estoque.reduce((s, e) => s + e.quantidade_total_inicial, 0)} iniciais
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {produtos.map((prod, idx) => {
                const est = getEst(prod.id)
                const vis = prodVisuals[prod.id] || fallbackVisual
                const atual = est?.quantidade_atual ?? 0
                const inicial = est?.quantidade_total_inicial ?? 1
                const pct = (atual / inicial) * 100
                const isLow = pct <= 25 && atual > 0

                return (
                  <div key={prod.id}
                    style={{ background: vis.gradient, animationDelay: `${idx * 40}ms` }}
                    className={`rounded-2xl p-2.5 flex flex-col items-center text-center animate-fade-in shadow-lg relative ${isLow ? 'ring-1 ring-red-400/50' : ''}`}>
                    {/* Edit button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); editarEstoque(prod.id, prod.nome) }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-white/20 flex items-center justify-center active:bg-white/40 transition-colors">
                      <Pencil className="w-3 h-3 text-white" strokeWidth={1.5} />
                    </button>
                    <div className="icon-box w-9 h-9 rounded-lg flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
                      <div className="text-white [&>svg]:w-4 [&>svg]:h-4">{vis.icon}</div>
                    </div>
                    <p className="text-[9px] font-bold text-white leading-tight line-clamp-2 mt-1 mb-0.5 min-h-[20px] drop-shadow-sm">
                      {prod.nome}
                    </p>
                    <p className={`text-xl font-black number-display mb-0.5 drop-shadow-sm ${pct > 50 ? 'text-white' : pct > 25 ? 'text-yellow-100' : 'text-red-100'}`}>{atual}</p>
                    <p className="text-[8px] text-white/60 mb-1">de {inicial}</p>
                    <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full stock-bar ${pct > 50 ? 'bg-white' : pct > 25 ? 'bg-yellow-100' : 'bg-red-200'}`}
                        style={{ width: `${Math.max(pct, 0)}%` }}
                      />
                    </div>
                    {isLow && (
                      <div className="flex items-center gap-0.5 mt-1.5 text-white">
                        <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                        <span className="text-[8px] font-bold">BAIXO</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ REPOSIÇÃO — Dedicated restock tab ═══ */}
        {tab === 'reposicao' && (
          <div className="p-4 space-y-4 animate-fade-in">
            <div className="metric-card rounded-2xl p-4 border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="w-5 h-5 text-blue-500" strokeWidth={1.5} />
                <p className="text-sm font-bold text-text-dark">Reposição de Estoque</p>
              </div>
              <p className="text-[11px] text-text-muted">Toque no produto para registrar compra. Valor será subtraído do caixa.</p>
              {despesasTotal > 0 && (
                <p className="text-xs font-bold text-danger mt-1.5">Total investido hoje: {fmt(despesasTotal)}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {produtos.map((prod, idx) => {
                const est = getEst(prod.id)
                const vis = prodVisuals[prod.id] || fallbackVisual
                const atual = est?.quantidade_atual ?? 0

                return (
                  <button key={prod.id}
                    onClick={() => reporEstoque(prod.id, prod.nome)}
                    disabled={submitting}
                    style={{ background: vis.gradient, animationDelay: `${idx * 40}ms` }}
                    className="rounded-2xl p-3 flex flex-col items-center text-center animate-fade-in shadow-lg cursor-pointer active:scale-95 transition-transform disabled:opacity-50">
                    <div className="icon-box w-12 h-12 rounded-xl flex items-center justify-center">
                      <div className="w-7 h-7 text-white">{vis.icon}</div>
                    </div>
                    <p className="text-[10px] font-bold text-white leading-tight line-clamp-2 mt-1.5 mb-1 min-h-[24px] drop-shadow-sm">
                      {prod.nome}
                    </p>
                    <p className="text-lg font-black text-white number-display drop-shadow-sm">{atual}un</p>
                    <div className="flex items-center gap-0.5 mt-1.5 text-white bg-white/20 rounded-full px-2 py-0.5">
                      <ArrowDownCircle className="w-3 h-3" strokeWidth={1.5} />
                      <span className="text-[8px] font-bold">REPOR</span>
                    </div>
                  </button>
                )
              })}

              {/* Gelo / Extras card */}
              <button
                onClick={registrarGelo}
                disabled={submitting}
                className="rounded-2xl p-3 flex flex-col items-center text-center shadow-lg cursor-pointer active:scale-95 transition-transform disabled:opacity-50"
                style={{ background: 'linear-gradient(145deg, #0891B2, #67E8F9)' }}>
                <div className="icon-box w-12 h-12 rounded-xl flex items-center justify-center">
                  <Snowflake className="w-7 h-7 text-white" strokeWidth={1.5} />
                </div>
                <p className="text-[10px] font-bold text-white leading-tight mt-1.5 mb-1 min-h-[24px] drop-shadow-sm">
                  Gelo / Extras
                </p>
                <p className="text-lg font-black text-white number-display drop-shadow-sm">❄️</p>
                <div className="flex items-center gap-0.5 mt-1.5 text-white bg-white/20 rounded-full px-2 py-0.5">
                  <CircleDollarSign className="w-3 h-3" strokeWidth={1.5} />
                  <span className="text-[8px] font-bold">CUSTO</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Cart CTA ── */}
      {tab === 'vender' && count > 0 && (
        <div className="fixed left-4 right-4 z-30 animate-slide-up" style={{ bottom: 84 }}>
          <button onClick={submit} disabled={submitting}
            className={`w-full h-14 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${submitting ? 'bg-green/40 text-white/50 cursor-wait' : 'neon-btn animate-pulse-neon text-base'
              }`}>
            {submitting ? <>⏳ Registrando...</> : (
              <>
                <ShoppingCart className="w-5 h-5" strokeWidth={1.5} />
                FINALIZAR · {count} {count === 1 ? 'item' : 'itens'} · {fmt(total)}
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 glass-header border-t border-gray-200">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto">
          {[
            { id: 'vender' as const, Icon: ShoppingCart, label: 'Vender' },
            { id: 'dashboard' as const, Icon: BarChart3, label: 'Dashboard' },
            { id: 'estoque' as const, Icon: Warehouse, label: 'Estoque' },
            { id: 'reposicao' as const, Icon: RefreshCw, label: 'Reposição' },
          ].map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex flex-col items-center justify-center w-20 h-full gap-0.5 press-scale transition-colors ${active ? 'text-green' : 'text-text-muted'
                  }`}>
                <t.Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} strokeWidth={active ? 2 : 1.5} />
                <span className="text-[10px] font-semibold">{t.label}</span>
                {active && <div className="w-6 h-0.5 rounded-full bg-green mt-0.5" />}
              </button>
            )
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}

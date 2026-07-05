import { ArrowLeft, Info, Loader2, Map, Navigation } from 'lucide-react'
import { useEffect, useState } from 'react'
import { generateRoutePlan } from '../services/api'

function RouteSummaryPage({ city, places, onBack }) {
  const [routePlan, setRoutePlan] = useState(null)
  const [status, setStatus] = useState('正在生成路线方案')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError('')
      setStatus('正在根据行程草案生成路线信息')
      const plan = await generateRoutePlan(city, places)
      if (cancelled) return
      setRoutePlan(plan)
      setStatus('路线方案已生成')
    }

    load().catch(loadError => {
      if (!cancelled) {
        setError(loadError.message || '路线方案生成失败')
        setStatus('路线方案生成失败')
      }
    })

    return () => {
      cancelled = true
    }
  }, [city, places])

  return (
    <main className="route-summary-page">
      <header className="route-summary-header">
        <button type="button" className="icon-button" onClick={onBack} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">FINAL ROUTE</p>
          <h1>{city || '当前城市'}旅行路线方案</h1>
        </div>
        <div className="route-status">
          {status.includes('正在') ? <Loader2 size={17} className="spinning" /> : <Navigation size={17} />}
          <span>{error || status}</span>
        </div>
      </header>

      <section className="route-summary-layout">
        <aside className="route-overview-panel">
          <Map size={26} />
          <h2>{routePlan?.title || `${places.length} 个地点路线草案`}</h2>
          <p>{routePlan?.overview || '系统会按当前行程顺序整理游览节奏、交通衔接和注意事项。'}</p>
          <div className="route-metrics">
            <span><b>{places.length}</b><small>地点</small></span>
            <span><b>{routePlan?.duration || '半日-1日'}</b><small>建议时长</small></span>
            <span><b>{routePlan?.transport || '步行/公共交通'}</b><small>交通</small></span>
          </div>
        </aside>

        <section className="route-detail-panel">
          {error ? (
            <div className="ai-call-error">
              <strong>路线生成中断</strong>
              <span>{error}</span>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <Navigation size={18} />
                <strong>路线分段</strong>
              </div>
              <ol className="final-route-steps">
                {(routePlan?.steps || places.map((place, index) => ({
                  order: index + 1,
                  title: place.name,
                  description: index === 0 ? '作为出发点' : '按当前顺序前往'
                }))).map(step => (
                  <li key={`${step.order}-${step.title}`}>
                    <b>{step.order}</b>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                      {step.transport && <small>{step.transport}</small>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <aside className="route-notice-panel">
          <div className="panel-heading">
            <Info size={18} />
            <strong>注意事项</strong>
          </div>
          {(routePlan?.notes || ['请先加入地点后生成路线方案。']).map(note => <p key={note}>{note}</p>)}
        </aside>
      </section>
    </main>
  )
}

export default RouteSummaryPage

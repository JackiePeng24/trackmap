import { ArrowDown, ArrowUp, Check, Info, ListChecks, Navigation, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'

function routeSummary(planItems) {
  if (!planItems.length) {
    return {
      title: '等待加入地点',
      notes: ['先从真实地图或 AI 场景里选择地点，再生成顺路建议。'],
      steps: []
    }
  }

  return {
    title: `${planItems.length} 个地点的路线草案`,
    steps: planItems.map((item, index) => ({
      id: item.id,
      order: index + 1,
      title: item.name,
      meta: index === 0 ? '起点' : index === planItems.length - 1 ? '收尾' : '中途停靠',
      description: `${item.type || '地点'} · ${item.duration || '建议停留 45-90 分钟'}`
    })),
    notes: [
      '正式出行前核对营业时间、预约要求和交通管制。',
      '跨区移动优先使用地铁、公交或网约车，近距离景点可步行串联。',
      '餐饮与商场适合安排在午晚餐或景点闭馆后的时间段。'
    ]
  }
}

function TripPlanDrawer({ open, planItems, onClose, onRemove, onMove, onUpdate, onRouteSummary }) {
  const [editingId, setEditingId] = useState('')
  const [draft, setDraft] = useState('')
  const summary = routeSummary(planItems)

  return (
    <aside className={open ? 'planner-drawer open' : 'planner-drawer'}>
      <header>
        <div>
          <p className="eyebrow">TRIP PLAN</p>
          <h2>{summary.title}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="收起规划">
          <X size={19} />
        </button>
      </header>

      <div className="plan-list">
        {planItems.length ? planItems.map((item, index) => (
          <article key={item.id}>
            <b>{String(index + 1).padStart(2, '0')}</b>
            <div>
              <span>{item.type}</span>
              <strong>{item.name}</strong>
              {editingId === item.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    onUpdate(item.id, { note: draft })
                    setEditingId('')
                  }}
                >
                  <input value={draft} onChange={event => setDraft(event.target.value)} aria-label="修改备注" />
                  <button type="submit"><Check size={15} /></button>
                </form>
              ) : (
                <small>{item.note || item.address || '可添加备注'}</small>
              )}
            </div>
            <div className="plan-actions">
              <button type="button" onClick={() => onMove(item.id, -1)} aria-label="上移"><ArrowUp size={15} /></button>
              <button type="button" onClick={() => onMove(item.id, 1)} aria-label="下移"><ArrowDown size={15} /></button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(item.id)
                  setDraft(item.note || '')
                }}
                aria-label="编辑备注"
              >
                <Pencil size={15} />
              </button>
              <button type="button" onClick={() => onRemove(item.id)} aria-label="删除"><Trash2 size={15} /></button>
            </div>
          </article>
        )) : (
          <div className="empty-plan">
            <ListChecks size={28} />
            <strong>还没有地点</strong>
            <span>点击地图 Marker、周边 POI 或详情页地点加入。</span>
          </div>
        )}
      </div>

      <section className="route-result">
        <div className="panel-heading">
          <Navigation size={17} />
          <strong>路线信息</strong>
        </div>
        {summary.steps.length > 0 && (
          <ol>
            {summary.steps.map(step => (
              <li key={step.id}>
                <b>{step.order}</b>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.meta} · {step.description}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="route-notes">
          <div className="panel-heading">
            <Info size={16} />
            <strong>注意事项</strong>
          </div>
          {summary.notes.map(note => <p key={note}>{note}</p>)}
        </div>
        <button type="button" className="primary-action route-summary-action" disabled={!planItems.length} onClick={onRouteSummary}>
          <Navigation size={17} />
          生成最终路线
        </button>
      </section>
    </aside>
  )
}

export default TripPlanDrawer

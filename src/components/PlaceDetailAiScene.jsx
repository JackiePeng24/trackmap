import { ArrowLeft, Check, Image, Loader2, Navigation, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { generateSceneImage } from '../services/api'

function detailRows(place, isLandmark) {
  const typeText = `${place.type || ''} ${place.typeName || ''}`
  const base = [
    ['位置', place.address || '暂无详细地址'],
    ['距离', place.distance ? `距离中心景点约 ${place.distance}m` : '暂无距离信息']
  ]

  if (isLandmark) {
    return [
      ...base,
      ['建议停留', place.duration || '60-120 分钟'],
      ['体验重点', place.reason || '适合作为路线中的核心游览节点。']
    ]
  }

  if (/food|餐|饮|美食|小吃|咖啡|饭|菜|甜品|火锅/.test(typeText)) {
    return [...base, ['适合安排', '午餐、晚餐或景点间补给'], ['选择建议', '优先核对排队时间、营业时段和人均消费。']]
  }
  if (/stay|酒店|住宿|宾馆|旅馆|民宿|公寓/.test(typeText)) {
    return [...base, ['适合安排', '路线收尾或中途休整'], ['选择建议', '关注入住时间、交通便利度、行李寄存和退订规则。']]
  }
  if (/transit|交通|地铁|公交|车站|停车|机场|码头/.test(typeText)) {
    return [...base, ['适合安排', '跨区移动或返程节点'], ['选择建议', '提前确认首末班、换乘口、打车上落点和步行距离。']]
  }
  if (/shopping|购物|商场|商城|商业|百货|步行街/.test(typeText)) {
    return [...base, ['适合安排', '餐后、雨天或夜间补充体验'], ['选择建议', '关注营业时间、品牌类型、停车和餐饮配套。']]
  }

  return [...base, ['适合安排', '作为当前路线的补充节点'], ['选择建议', '结合营业时间和距离决定是否加入行程。']]
}

function PlaceDetailAiScene({ city, place, detailMode = 'unit', onBack, onAddPlanItem, onPlanOpen }) {
  const [imageUrl, setImageUrl] = useState(detailMode === 'landmark' ? place.imageUrl || null : null)
  const [status, setStatus] = useState(detailMode === 'landmark' ? '正在生成详情图' : '正在整理单位信息')
  const [error, setError] = useState('')
  const isLandmark = detailMode === 'landmark'
  const rows = detailRows(place, isLandmark)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isLandmark) {
        setImageUrl(null)
        setError('')
        setStatus('单位信息已整理')
        return
      }

      setImageUrl(null)
      setError('')
      setStatus(`正在生成${place.name} AI 详情图`)
      const image = await generateSceneImage({
        sceneType: 'place-detail',
        city,
        place,
        style: '2D visual travel illustration'
      })
      if (cancelled) return
      setImageUrl(image.imageUrl || null)
      if (!image.imageUrl) throw new Error('AI 生图接口未返回 imageUrl')
      setStatus('AI 详情图已生成')
    }

    load().catch(loadError => {
      if (!cancelled) {
        setError(loadError.message || '详情图生成失败')
        setStatus('AI 调用失败，已停止生成')
      }
    })

    return () => {
      cancelled = true
    }
  }, [city, place, isLandmark])

  return (
    <main className="place-detail-page">
      <header className="map-toolbar city-toolbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="返回第二层">
          <ArrowLeft size={20} />
        </button>
        <div className="map-title-block">
          <span>AI 第三层</span>
          <strong>{place.name}</strong>
          <small>{isLandmark ? '景点精细图' : '周边单位详情'}</small>
        </div>
        <button type="button" className="icon-button" onClick={onPlanOpen} aria-label="打开行程规划">
          <Navigation size={19} />
        </button>
      </header>

      <section className={imageUrl ? 'detail-hero has-image' : 'detail-hero ai-scene-empty detail-info-only'}>
        {imageUrl && <img src={imageUrl} alt="" />}
        {!isLandmark && (
          <div className="unit-detail-hero">
            <strong>{place.name}</strong>
            <span>{place.typeName || place.type || '周边单位'}</span>
          </div>
        )}
        {error && (
          <div className="ai-call-error">
            <strong>详情图生成中断</strong>
            <span>{error}</span>
          </div>
        )}
      </section>

      <aside className={isLandmark ? 'place-info-card' : 'place-info-card unit-info-card'}>
        <div className="panel-heading">
          {status.includes('正在') ? <Loader2 size={17} className="spinning" /> : <Sparkles size={17} />}
          <strong>{status}</strong>
        </div>
        {error && <p className="panel-warning">{error}</p>}
        <h1>{place.name}</h1>
        <div className="place-meta">
          <span>{place.typeName || place.type || '地点'}</span>
          {place.distance && <span>约 {place.distance}m</span>}
          <span>{place.duration || (isLandmark ? '建议停留 60-120 分钟' : '建议停留 20-45 分钟')}</span>
        </div>
        <p>{place.address || '暂无详细地址。'}</p>
        <p>{place.reason || '可作为当前路线的体验节点，适合结合前后景点顺路安排。'}</p>
        <dl className="unit-detail-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="primary-action" onClick={() => onAddPlanItem(place, place.typeName || '地点')}>
          <Check size={17} />
          加入行程
        </button>
        <div className="detail-image-note">
          <Image size={16} />
          {isLandmark ? '中心景点会生成更具体的 AI 介绍图。' : '周边单位仅展示结构化信息，不额外生成 AI 图。'}
        </div>
      </aside>
    </main>
  )
}

export default PlaceDetailAiScene

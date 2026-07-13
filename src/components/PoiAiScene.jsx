import { ArrowLeft, Check, Coffee, Hotel, Info, Loader2, Navigation, ShoppingBag, Sparkles, Train } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchPoiAround, generateSceneImage } from '../services/api'
import { loadAmap } from '../utils/amapLoader'

const modes = [
  { id: 'food', label: '美食', full: '美食小吃', icon: Coffee },
  { id: 'stay', label: '住宿', full: '酒店旅馆', icon: Hotel },
  { id: 'transit', label: '交通', full: '交通站点', icon: Train },
  { id: 'shopping', label: '购物', full: '商场购物', icon: ShoppingBag }
]

function fallbackOverlayPosition(index, count) {
  const angle = (Math.round((360 * index) / Math.max(count, 1)) * Math.PI) / 180
  const radius = 32
  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius * 0.72}%`
  }
}

function rectsOverlap(a, b, gap = 10) {
  return !(
    a.right + gap < b.left ||
    a.left - gap > b.right ||
    a.bottom + gap < b.top ||
    a.top - gap > b.bottom
  )
}

function avoidOverlap(point, rect, placed) {
  const isNarrow = rect.width < 640
  const cardWidth = isNarrow ? 132 : 152
  const cardHeight = isNarrow ? 58 : 64
  const centerWidth = isNarrow ? 178 : 310
  const centerHeight = isNarrow ? 236 : 350
  const obstacles = [{
    left: rect.width / 2 - centerWidth / 2,
    right: rect.width / 2 + centerWidth / 2,
    top: rect.height / 2 - centerHeight / 2,
    bottom: rect.height / 2 + centerHeight / 2
  }]

  if (!isNarrow) {
    obstacles.push(
      { left: rect.width - 350, right: rect.width - 16, top: 74, bottom: 306 },
      { left: 0, right: 138, top: 0, bottom: 230 }
    )
  }

  const bounds = {
    minX: cardWidth / 2 + 12,
    maxX: isNarrow ? rect.width - cardWidth / 2 - 12 : Math.max(cardWidth / 2 + 12, rect.width - cardWidth / 2 - 370),
    minY: isNarrow ? 80 : 76,
    maxY: rect.height - cardHeight / 2 - (isNarrow ? 128 : 24)
  }
  const originAngle = Math.atan2(point.y - rect.height / 2, point.x - rect.width / 2)
  const radii = [0, 44, 78, 116, 154, 196]
  const angleOffsets = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, Math.PI]

  for (const radius of radii) {
    for (const offset of angleOffsets) {
      const x = Math.min(bounds.maxX, Math.max(bounds.minX, point.x + Math.cos(originAngle + offset) * radius))
      const y = Math.min(bounds.maxY, Math.max(bounds.minY, point.y + Math.sin(originAngle + offset) * radius))
      const next = {
        x,
        y,
        left: x - cardWidth / 2,
        right: x + cardWidth / 2,
        top: y - cardHeight / 2,
        bottom: y + cardHeight / 2
      }
      if (obstacles.every(item => !rectsOverlap(next, item, isNarrow ? 8 : 14)) && placed.every(item => !rectsOverlap(next, item, isNarrow ? 8 : 12))) {
        return next
      }
    }
  }

  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y))
  }
}

function mobileSlotPosition(point, rect, usedSlots) {
  const slots = [
    [0.22, 0.25],
    [0.78, 0.25],
    [0.18, 0.44],
    [0.82, 0.44],
    [0.22, 0.64],
    [0.78, 0.64],
    [0.36, 0.18],
    [0.64, 0.18],
    [0.36, 0.76],
    [0.64, 0.76]
  ].map(([x, y], index) => ({ index, x: rect.width * x, y: rect.height * y }))
  const ranked = slots
    .filter(slot => !usedSlots.has(slot.index))
    .sort((a, b) => ((a.x - point.x) ** 2 + (a.y - point.y) ** 2) - ((b.x - point.x) ** 2 + (b.y - point.y) ** 2))
  const slot = ranked[0] || slots[usedSlots.size % slots.length]
  usedSlots.add(slot.index)
  return slot
}

function PoiAiScene({ cityScene, centerPoi, onBack, onPlaceSelect, onAddPlanItem, onPlanOpen }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const placesRef = useRef([])
  const [mode, setMode] = useState('food')
  const [places, setPlaces] = useState([])
  const [cardPositions, setCardPositions] = useState({})
  const [centerImageUrl, setCenterImageUrl] = useState(centerPoi.imageUrl || null)
  const [status, setStatus] = useState('正在准备 AI 场景')
  const [error, setError] = useState('')
  const modeInfo = useMemo(() => modes.find(item => item.id === mode) || modes[0], [mode])
  const updateCardPositions = useCallback((nextPlaces = placesRef.current) => {
    const map = mapRef.current
    const container = mapContainerRef.current
    if (!map || !container) return
    const rect = container.getBoundingClientRect()
    const nextPositions = {}
    const placed = []
    const usedMobileSlots = new Set()
    nextPlaces.forEach((place, index) => {
      const lng = Number(place.lng)
      const lat = Number(place.lat)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      const point = map.lngLatToContainer([lng, lat])
      const projected = { x: Number(point.x), y: Number(point.y) }
      const adjusted = rect.width < 640
        ? mobileSlotPosition(projected, rect, usedMobileSlots)
        : avoidOverlap(projected, rect, placed)
      placed.push(adjusted)
      nextPositions[place.id || `${place.name}-${index}`] = {
        left: `${adjusted.x}px`,
        top: `${adjusted.y}px`
      }
    })
    setCardPositions(nextPositions)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      const AMap = await loadAmap()
      if (cancelled || !mapContainerRef.current) return
      const map = new AMap.Map(mapContainerRef.current, {
        zoom: 15,
        center: [centerPoi.lng, centerPoi.lat],
        viewMode: '2D',
        mapStyle: 'amap://styles/whitesmoke',
        features: ['bg', 'road', 'point']
      })
      mapRef.current = map
      map.setStatus({
        dragEnable: false,
        zoomEnable: false,
        rotateEnable: false,
        pitchEnable: false,
        keyboardEnable: false
      })
      map.on('complete', () => updateCardPositions())
      map.on('zoomchange', () => updateCardPositions())
      map.on('mapmove', () => updateCardPositions())
    }

    initMap().catch(loadError => {
      if (!cancelled) setError(loadError.message || '第二层地图加载失败')
    })

    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [centerPoi, updateCardPositions])

  useEffect(() => {
    let cancelled = false

    async function loadCenterImage() {
      setCenterImageUrl(centerPoi.imageUrl || null)
      if (centerPoi.imageUrl) {
        return
      }
      setStatus(`正在生成${centerPoi.name}中心地标图`)
      const image = await generateSceneImage({
        sceneType: 'landmark-center',
        city: cityScene.city,
        centerPoi,
        style: 'clear landmark sticker illustration'
      })
      if (cancelled) return
      if (!image.imageUrl) throw new Error('中心地标生图接口未返回 imageUrl')
      setCenterImageUrl(image.imageUrl)
      setStatus('中心地标图已生成')
    }

    loadCenterImage().catch(loadError => {
      if (!cancelled) {
        setError(loadError.message || '中心地标图生成失败')
        setStatus('中心地标图生成失败')
      }
    })

    return () => {
      cancelled = true
    }
  }, [cityScene.city, centerPoi])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError('')
      setStatus(`正在检索${centerPoi.name}周边${modeInfo.full}`)
      const around = await fetchPoiAround(cityScene.city, centerPoi, mode)
      if (cancelled) return
      const nextPois = around.pois || []
      placesRef.current = nextPois
      setPlaces(nextPois)
      window.requestAnimationFrame(() => updateCardPositions(nextPois))
      setStatus(`${modeInfo.full}已按地理位置环绕中心地标`)
    }

    load().catch(loadError => {
      if (!cancelled) {
        setError(loadError.message || '第二层生成失败')
        setStatus('AI 调用失败，已停止生成')
      }
    })

    return () => {
      cancelled = true
    }
  }, [cityScene, centerPoi, mode, modeInfo.full, updateCardPositions])

  useEffect(() => {
    placesRef.current = places
    updateCardPositions(places)
  }, [places, updateCardPositions])

  return (
    <main className="ai-scene-page">
      <header className="map-toolbar city-toolbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="返回真实地图">
          <ArrowLeft size={20} />
        </button>
        <div className="map-title-block">
          <span>AI 第二层</span>
          <strong>{centerPoi.name}</strong>
          <small>真实地图 + 中心 AI 地标 + 周边 POI</small>
        </div>
        <button type="button" className="icon-button" onClick={onPlanOpen} aria-label="打开行程规划">
          <Navigation size={19} />
        </button>
      </header>

      <section className="mode-switcher ai-mode-switcher" aria-label="周边模式">
        {modes.map(item => {
          const Icon = item.icon
          return (
            <button type="button" className={mode === item.id ? 'active' : ''} key={item.id} onClick={() => setMode(item.id)}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </section>

      <section className="mobile-plan-actions" aria-label="行程操作">
        <button type="button" className="primary-action" onClick={() => onAddPlanItem(centerPoi, '景点')}>
          <Check size={16} />
          加入行程
        </button>
        <button type="button" className="secondary-action" onClick={onPlanOpen}>
          <Navigation size={16} />
          查看规划
        </button>
      </section>

      <section className="city-status-panel ai-status-floating">
        <div className="panel-heading">
          {status.includes('正在') ? <Loader2 size={17} className="spinning" /> : <Sparkles size={17} />}
          <strong>AI 状态</strong>
        </div>
        <p>{error || status}</p>
      </section>

      <section className="ai-scene-stage poi-map-stage">
        <div ref={mapContainerRef} className="poi-amap-container" />
        {error && (
          <div className="ai-call-error">
            <strong>第二层生成中断</strong>
            <span>{error}</span>
          </div>
        )}
        <button type="button" className="center-poi-card center-landmark-visual" onClick={() => onPlaceSelect({ ...centerPoi, imageUrl: centerImageUrl }, 'landmark')}>
          <span className="center-landmark-image">
            {centerImageUrl ? <img src={centerImageUrl} alt="" /> : <i />}
          </span>
          <strong>{centerPoi.name}</strong>
          <small>{centerPoi.address || centerPoi.typeName}</small>
        </button>
        {places.map((place, index) => (
          <button
            type="button"
            className="around-poi-card"
            key={place.id}
            style={cardPositions[place.id] || fallbackOverlayPosition(index, places.length)}
            onClick={() => onPlaceSelect(place, 'unit')}
          >
            <strong>{place.name}</strong>
            <small>{place.distance ? `${place.distance}m` : place.typeName}</small>
          </button>
        ))}
        <aside className="second-plan-card">
          <div>
            <span>当前中心景点</span>
            <strong>{centerPoi.name}</strong>
            <small>{centerPoi.address || centerPoi.typeName}</small>
          </div>
          <button type="button" onClick={() => onAddPlanItem(centerPoi, '景点')}>
            <Check size={16} />
            加入行程
          </button>
          <button type="button" className="secondary-action" onClick={onPlanOpen}>
            <Navigation size={16} />
            查看规划
          </button>
        </aside>
      </section>

      <aside className="ai-scene-tip">
        <Info size={17} />
        点击中心地标生成景点精细图；点击周边卡片只查看该单位详情。
      </aside>
    </main>
  )
}

export default PoiAiScene

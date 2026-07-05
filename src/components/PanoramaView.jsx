import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Compass,
  Heart,
  Image,
  Info,
  List,
  Loader2,
  MapPin,
  Navigation,
  RotateCcw,
  Share2,
  Sparkles,
  Wallet,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { generatePanoramaImage, generateTravelGuide } from '../services/api'

const fallbackImages = {
  北京: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1920&q=85',
  成都: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=1920&q=85',
  杭州: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=1920&q=85',
  西安: 'https://images.unsplash.com/photo-1591122947157-26bad3a117d2?w=1920&q=85',
  上海: 'https://images.unsplash.com/photo-1537531383496-f4749b8032cf?w=1920&q=85',
  三亚: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=85'
}

const loadingSteps = [
  '理解目的地气质',
  '生成漫游路线',
  '核验真实地点',
  '铺开旅行画卷'
]

function PanoramaView({
  destination,
  vibe,
  onBack,
  isFavorite,
  onToggleFavorite
}) {
  const [guide, setGuide] = useState(null)
  const [source, setSource] = useState('')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [loadingStep, setLoadingStep] = useState(0)
  const [imageStatus, setImageStatus] = useState('idle')
  const [imageError, setImageError] = useState('')
  const [imageUrl, setImageUrl] = useState(fallbackImages[destination] || fallbackImages.北京)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedHotspot, setSelectedHotspot] = useState(null)
  const [itineraryOpen, setItineraryOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const containerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setGuide(null)
    setError('')
    setWarning('')
    setSource('')
    setSelectedHotspot(null)
    setItineraryOpen(false)
    setImageStatus('idle')
    setImageError('')
    setImageUrl(fallbackImages[destination] || fallbackImages.北京)

    const stepTimer = setInterval(() => {
      setLoadingStep(step => Math.min(step + 1, loadingSteps.length - 1))
    }, 1200)

    async function load() {
      try {
        const payload = await generateTravelGuide(destination, vibe)
        if (cancelled) return

        setGuide(payload.guide)
        setSource(payload.source)
        setWarning(payload.warning || '')
        clearInterval(stepTimer)

        if (payload.guide?.panoramaPrompt && payload.source === 'vivo') {
          setImageStatus('generating')
          try {
            const imagePayload = await generatePanoramaImage(
              destination,
              payload.guide.panoramaPrompt
            )
            if (!cancelled) {
              setImageUrl(imagePayload.imageUrl)
              setImageStatus('ready')
            }
          } catch (imageGenerationError) {
            if (!cancelled) {
              setImageStatus('error')
              setImageError(imageGenerationError.message)
            }
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || '暂时无法生成这次漫游')
          clearInterval(stepTimer)
        }
      }
    }

    load()
    return () => {
      cancelled = true
      clearInterval(stepTimer)
    }
  }, [destination, vibe, reloadKey])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  const quickFactIcons = useMemo(
    () => [Calendar, Clock, Wallet],
    []
  )

  const clampPosition = (next, currentZoom = zoom) => {
    const maxX = Math.max(0, (currentZoom - 1) * window.innerWidth * 0.34)
    const maxY = Math.max(0, (currentZoom - 1) * window.innerHeight * 0.3)
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y))
    }
  }

  const changeZoom = (delta) => {
    setZoom(current => {
      const next = Math.max(1, Math.min(2.6, Number((current + delta).toFixed(2))))
      if (next === 1) setPosition({ x: 0, y: 0 })
      else setPosition(currentPosition => clampPosition(currentPosition, next))
      return next
    })
  }

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsDragging(true)
    setDragStart({
      x: event.clientX - position.x,
      y: event.clientY - position.y
    })
  }

  const handlePointerMove = (event) => {
    if (!isDragging) return
    setPosition(clampPosition({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y
    }))
  }

  const handlePointerUp = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsDragging(false)
  }

  const handleWheel = (event) => {
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 0.12 : -0.12)
  }

  const resetView = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }

  const shareJourney = async () => {
    const shareText = `我正在用“行迹”探索${guide?.destination || destination}：${guide?.subtitle || 'AI 漫游路线'}`
    try {
      if (navigator.share) {
        await navigator.share({ title: '行迹 AI 漫游', text: shareText })
      } else {
        await navigator.clipboard.writeText(shareText)
        setToast('旅行灵感已复制')
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') setToast('暂时无法分享')
    }
  }

  const retryImage = async () => {
    if (!guide?.panoramaPrompt || imageStatus === 'generating') return
    setImageStatus('generating')
    setImageError('')
    try {
      const payload = await generatePanoramaImage(destination, guide.panoramaPrompt)
      setImageUrl(payload.imageUrl)
      setImageStatus('ready')
    } catch (retryError) {
      setImageStatus('error')
      setImageError(retryError.message)
    }
  }

  if (!guide) {
    return (
      <main className="journey-loading" style={{ backgroundImage: `url("${imageUrl}")` }}>
        <span className="journey-loading-overlay" />
        <button type="button" className="round-button loading-back" onClick={onBack} aria-label="返回首页">
          <ArrowLeft size={22} />
        </button>
        <div className="loading-compass">
          <span className="loading-orbit" />
          <CompassMark />
        </div>
        {error ? (
          <div className="loading-copy error-copy">
            <p className="eyebrow">JOURNEY INTERRUPTED</p>
            <h1>这次灵感暂时迷路了</h1>
            <p>{error}</p>
            <button type="button" onClick={() => setReloadKey(key => key + 1)}>
              再试一次
            </button>
          </div>
        ) : (
          <div className="loading-copy">
            <p className="eyebrow">VIVO AIGC IS CREATING</p>
            <h1>正在打开 {destination}</h1>
            <p>{loadingSteps[loadingStep]}…</p>
            <div className="loading-progress">
              {loadingSteps.map((step, index) => (
                <span
                  key={step}
                  className={index <= loadingStep ? 'active' : ''}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="panorama-page" ref={containerRef}>
      <div
        className={isDragging ? 'panorama-canvas dragging' : 'panorama-canvas'}
        style={{
          backgroundImage: `url("${imageUrl}")`,
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoom})`
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <span className="panorama-vignette" />
      </div>

      <header className="panorama-header">
        <button type="button" className="round-button" onClick={onBack} aria-label="返回首页">
          <ArrowLeft size={22} />
        </button>
        <div className="destination-title">
          <span>{guide.subtitle}</span>
          <strong>{guide.destination}</strong>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={isFavorite ? 'round-button active' : 'round-button'}
            onClick={onToggleFavorite}
            aria-label={isFavorite ? '取消收藏' : '收藏目的地'}
          >
            <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="round-button" onClick={shareJourney} aria-label="分享旅程">
            <Share2 size={20} />
          </button>
        </div>
      </header>

      <aside className="guide-summary glass-panel">
        <div className="summary-provider">
          <span className="provider-dot" />
          {source === 'vivo' ? 'vivo AI 实时生成' : '离线灵感路线'}
        </div>
        <h1>{guide.subtitle}</h1>
        <p>{guide.overview}</p>
        <div className="quick-facts">
          {guide.quickFacts.map((fact, index) => {
            const FactIcon = quickFactIcons[index] || Info
            return (
              <div key={`${fact.label}-${fact.value}`}>
                <FactIcon size={17} />
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            )
          })}
        </div>
        <button type="button" className="primary-action" onClick={() => setItineraryOpen(true)}>
          <List size={19} />
          查看完整路线
          <span>{guide.itinerary.length} 站</span>
        </button>
        {warning && <p className="panel-warning">{warning}</p>}
      </aside>

      <div className="image-status glass-panel">
        {imageStatus === 'generating' && (
          <>
            <Loader2 size={17} className="spinning" />
            <span>vivo AI 正在绘制专属画卷</span>
          </>
        )}
        {imageStatus === 'ready' && (
          <>
            <Sparkles size={17} />
            <span>AI 专属画卷已生成</span>
          </>
        )}
        {imageStatus === 'error' && (
          <>
            <Image size={17} />
            <button type="button" onClick={retryImage} title={imageError}>
              画卷生成失败，点击重试
            </button>
          </>
        )}
        {imageStatus === 'idle' && (
          <>
            <Image size={17} />
            <span>当前使用精选目的地图像</span>
          </>
        )}
      </div>

      <div className="hotspot-layer">
        {guide.hotspots.map((hotspot, index) => (
          <button
            type="button"
            key={hotspot.id}
            className={selectedHotspot?.id === hotspot.id ? 'hotspot-marker active' : 'hotspot-marker'}
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
              '--hotspot-delay': `${index * 120}ms`
            }}
            onClick={() => setSelectedHotspot(hotspot)}
            aria-label={`探索 ${hotspot.title}`}
          >
            <span>{hotspot.icon}</span>
            <small>{hotspot.title}</small>
          </button>
        ))}
      </div>

      <div className="map-controls glass-panel">
        <button type="button" onClick={() => changeZoom(0.2)} aria-label="放大">
          <ZoomIn size={20} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => changeZoom(-0.2)} aria-label="缩小">
          <ZoomOut size={20} />
        </button>
        <button type="button" onClick={resetView} aria-label="复位视图">
          <RotateCcw size={19} />
        </button>
      </div>

      <div className="gesture-hint">
        <span>拖拽漫游</span>
        <i />
        <span>滚轮缩放</span>
        <i />
        <span>点击地点</span>
      </div>

      {selectedHotspot && (
        <section className="hotspot-card glass-panel" aria-live="polite">
          <button
            type="button"
            className="card-close"
            onClick={() => setSelectedHotspot(null)}
            aria-label="关闭地点详情"
          >
            <X size={19} />
          </button>
          <div className="hotspot-card-heading">
            <span>{selectedHotspot.icon}</span>
            <div>
              <small>{selectedHotspot.category} · {selectedHotspot.typeName}</small>
              <h2>{selectedHotspot.title}</h2>
            </div>
          </div>
          <p>{selectedHotspot.description}</p>
          <div className="hotspot-tags">
            {selectedHotspot.tags.map(tag => <span key={tag}>{tag}</span>)}
          </div>
          <div className="hotspot-meta">
            <span><Clock size={15} /> {selectedHotspot.duration}</span>
            <span><Sparkles size={15} /> {selectedHotspot.bestTime}</span>
          </div>
          {selectedHotspot.address && (
            <div className="hotspot-address">
              <MapPin size={16} />
              <span>{selectedHotspot.address}</span>
              {selectedHotspot.coordinates && <Check size={15} />}
            </div>
          )}
          <button
            type="button"
            className="primary-action"
            onClick={() => setItineraryOpen(true)}
          >
            <Navigation size={18} />
            加入今日路线
          </button>
        </section>
      )}

      <section className={itineraryOpen ? 'itinerary-drawer open' : 'itinerary-drawer'}>
        <div className="drawer-handle" />
        <header>
          <div>
            <p className="eyebrow">ONE DAY JOURNEY</p>
            <h2>{guide.destination} · 一日漫游</h2>
          </div>
          <button type="button" className="round-button" onClick={() => setItineraryOpen(false)} aria-label="关闭路线">
            <X size={20} />
          </button>
        </header>
        <div className="itinerary-list">
          {guide.itinerary.map((item, index) => (
            <article key={`${item.time}-${item.title}`}>
              <div className="timeline-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="timeline-copy">
                <time>{item.time}</time>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="drawer-note">
          <Info size={16} />
          开放时间、票务与交通可能变化，出发前请以场馆实时信息为准。
        </div>
      </section>
      {itineraryOpen && <button type="button" className="drawer-backdrop" aria-label="关闭路线" onClick={() => setItineraryOpen(false)} />}

      {toast && <div className="toast-message">{toast}</div>}
    </main>
  )
}

function CompassMark() {
  return (
    <div className="compass-mark">
      <span>N</span>
      <Compass size={50} />
    </div>
  )
}

export default PanoramaView

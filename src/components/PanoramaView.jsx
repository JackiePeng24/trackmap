import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Compass,
  Heart,
  Eye,
  EyeOff,
  Image,
  Info,
  Layers,
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
import {
  createFallbackMapImage,
  exploreMapArea,
  generatePanoramaImage,
  generateTravelGuide
} from '../services/api'

const loadingSteps = ['理解目的地结构', '绘制视觉首帧', '检索真实 POI', '铺开 flipbook 画卷']

const modeOptions = [
  { id: 'food', label: '饮食', icon: '🥢', helper: '餐厅 / 小吃 / 咖啡' },
  { id: 'shopping', label: '购物', icon: '🛍️', helper: '商场 / 市集 / 文创' },
  { id: 'stay', label: '住宿', icon: '🏨', helper: '酒店 / 民宿 / 休息点' },
  { id: 'transit', label: '交通', icon: '🚇', helper: '地铁 / 公交 / 出入口' }
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
  const [imageUrl, setImageUrl] = useState(() => createFallbackMapImage(destination, '城市中轴', 'food'))
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [pointerStart, setPointerStart] = useState(null)
  const [selectedHotspot, setSelectedHotspot] = useState(null)
  const [selectedArea, setSelectedArea] = useState(null)
  const [activeMode, setActiveMode] = useState('food')
  const [areaLoading, setAreaLoading] = useState(false)
  const [itineraryOpen, setItineraryOpen] = useState(false)
  const [lowUiMode, setLowUiMode] = useState(false)
  const [frameStack, setFrameStack] = useState([])
  const [toast, setToast] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setGuide(null)
    setError('')
    setWarning('')
    setSource('')
    setSelectedHotspot(null)
    setSelectedArea(null)
    setItineraryOpen(false)
    setLowUiMode(false)
    setFrameStack([])
    setImageStatus('idle')
    setImageError('')
    setImageUrl(createFallbackMapImage(destination, '城市中轴', activeMode))
    setZoom(1)
    setPosition({ x: 0, y: 0 })

    const stepTimer = setInterval(() => {
      setLoadingStep(step => Math.min(step + 1, loadingSteps.length - 1))
    }, 1100)

    async function load() {
      try {
        const payload = await generateTravelGuide(destination, vibe)
        if (cancelled) return

        setGuide(payload.guide)
        setSource(payload.source)
        setWarning(payload.warning || '')
        setFrameStack([{
          id: `frame-${Date.now()}`,
          title: payload.guide?.destination || destination,
          subtitle: payload.guide?.subtitle || '全景画册',
          modeLabel: '初始画面',
          x: 50,
          y: 50,
          imageUrl
        }])
        clearInterval(stepTimer)

        if (payload.guide?.panoramaPrompt) {
          setImageStatus('generating')
          try {
            const imagePayload = await generatePanoramaImage(
              destination,
              payload.guide.panoramaPrompt,
              { focus: payload.guide.subtitle, mode: activeMode }
            )
            if (!cancelled) {
              setImageUrl(imagePayload.imageUrl)
              setImageStatus('ready')
              setFrameStack(frames => frames.map((frame, index) => (
                index === 0 ? { ...frame, imageUrl: imagePayload.imageUrl } : frame
              )))
            }
          } catch (imageGenerationError) {
            if (!cancelled) {
              setImageStatus('error')
              setImageError(imageGenerationError.message)
              setImageUrl(createFallbackMapImage(destination, payload.guide.subtitle, activeMode))
            }
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || '暂时无法生成这次地图漫游')
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

  const quickFactIcons = useMemo(() => [Calendar, Clock, Wallet], [])
  const activeModeInfo = modeOptions.find(mode => mode.id === activeMode) || modeOptions[0]

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
    setPointerStart({ x: event.clientX, y: event.clientY })
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

  const handlePointerUp = async (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsDragging(false)

    const moved = pointerStart
      ? Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
      : 0
    setPointerStart(null)

    if (moved <= 6) {
      await exploreAtPoint(event)
    }
  }

  const handleWheel = (event) => {
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 0.12 : -0.12)
  }

  const resetView = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }

  const exploreAtPoint = async (event) => {
    if (!guide || areaLoading) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(1))
    const y = Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(1))
    const click = {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    }

    setAreaLoading(true)
    navigator.vibrate?.(18)
    setSelectedHotspot(null)
    setSelectedArea({
      area: {
        title: '识别中',
        summary: `正在按「${activeModeInfo.label}」模式读取这块地图。`,
        icon: activeModeInfo.icon,
        modeLabel: activeModeInfo.label,
        ...click
      },
      pois: [],
      route: []
    })

    try {
      const insight = await exploreMapArea(destination, click, activeMode, guide, imageUrl)
      setSelectedArea(insight)
      setImageStatus('generating')
      let nextImageUrl = imageUrl
      try {
        const imagePayload = await generatePanoramaImage(
          destination,
          insight.mapPrompt,
          { focus: insight.area.title, mode: activeMode }
        )
        nextImageUrl = imagePayload.imageUrl
        setImageUrl(nextImageUrl)
        setImageStatus('ready')
      } catch (imageGenerationError) {
        setImageStatus('error')
        setImageError(imageGenerationError.message)
        nextImageUrl = createFallbackMapImage(destination, insight.area.title, activeMode)
        setImageUrl(nextImageUrl)
      }
      setFrameStack(frames => [
        ...frames.slice(-5),
        {
          id: `frame-${Date.now()}`,
          title: insight.area.title,
          subtitle: insight.area.summary,
          modeLabel: insight.area.modeLabel || activeModeInfo.label,
          x: click.x,
          y: click.y,
          imageUrl: nextImageUrl
        }
      ])
    } catch (areaError) {
      setToast(areaError.message || '区域识别暂时失败')
      setSelectedArea(null)
    } finally {
      setAreaLoading(false)
    }
  }

  const shareJourney = async () => {
    const shareText = `我正在用“行迹”探索 ${guide?.destination || destination}：${guide?.subtitle || 'AI 视觉漫游'}`
    try {
      if (navigator.share) {
        await navigator.share({ title: '行迹 AI 地图漫游', text: shareText })
      } else {
        await navigator.clipboard.writeText(shareText)
        setToast('旅行灵感已复制')
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') setToast('暂时无法分享')
    }
  }

  const retryImage = async () => {
    const prompt = selectedArea?.mapPrompt || guide?.panoramaPrompt
    if (!prompt || imageStatus === 'generating') return
    setImageStatus('generating')
    setImageError('')
    try {
      const payload = await generatePanoramaImage(
        destination,
        prompt,
        { focus: selectedArea?.area?.title || guide.subtitle, mode: activeMode }
      )
      setImageUrl(payload.imageUrl)
      setImageStatus('ready')
    } catch (retryError) {
      setImageStatus('error')
      setImageError(retryError.message)
      setImageUrl(createFallbackMapImage(destination, selectedArea?.area?.title || guide.subtitle, activeMode))
    }
  }

  if (!guide) {
    return (
      <main className="journey-loading map-loading" style={{ backgroundImage: `url("${imageUrl}")` }}>
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
            <p className="eyebrow">MAP INTERRUPTED</p>
            <h1>这张地图暂时迷路了</h1>
            <p>{error}</p>
            <button type="button" onClick={() => setReloadKey(key => key + 1)}>
              再试一次
            </button>
          </div>
        ) : (
          <div className="loading-copy">
            <p className="eyebrow">VIVO AIGC IS DRAWING</p>
            <h1>正在铺开 {destination}</h1>
            <p>{loadingSteps[loadingStep]}…</p>
            <div className="loading-progress">
              {loadingSteps.map((step, index) => (
                <span key={step} className={index <= loadingStep ? 'active' : ''} />
              ))}
            </div>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className={lowUiMode ? 'panorama-page map-page low-ui-mode' : 'panorama-page map-page'}>
      <div className="map-book-frame">
        <div className="map-browser-bar">
          <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
          <div className="map-session-title">
            <strong>{guide.destination}: {guide.subtitle}</strong>
            <span>/ Tap anywhere to expand</span>
          </div>
          <button type="button" onClick={() => setSelectedArea(null)}>Clear</button>
        </div>

        <div
          ref={canvasRef}
          className={isDragging ? 'panorama-canvas map-canvas dragging' : 'panorama-canvas map-canvas'}
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
          <span className="panorama-vignette map-paper-vignette" />
        </div>
      </div>

      <header className="panorama-header map-header">
        <button type="button" className="round-button" onClick={onBack} aria-label="返回首页">
          <ArrowLeft size={22} />
        </button>
        <div className="destination-title map-title">
          <span>{source === 'vivo' ? 'vivo AI VISUAL FLOW' : 'STATIC VISUAL FLOW'}</span>
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
          <button
            type="button"
            className={lowUiMode ? 'round-button active' : 'round-button'}
            onClick={() => setLowUiMode(value => !value)}
            aria-label={lowUiMode ? '显示界面控件' : '进入低 UI 漫游'}
          >
            {lowUiMode ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        </div>
      </header>

      <aside className="guide-summary glass-panel map-summary">
        <div className="summary-provider">
          <span className="provider-dot" />
          {source === 'vivo' ? 'vivo 大模型 · 图片生成 · POI 搜索' : 'GitHub Pages 静态演示'}
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
          查看路线参考
          <span>{guide.itinerary.length} 站</span>
        </button>
        {warning && <p className="panel-warning">{warning}</p>}
      </aside>

      <section className="map-mode-panel glass-panel" aria-label="探索模式">
        {modeOptions.map(mode => (
          <button
            type="button"
            key={mode.id}
            className={activeMode === mode.id ? 'active' : ''}
            onClick={() => setActiveMode(mode.id)}
          >
            <span>{mode.icon}</span>
            <strong>{mode.label}</strong>
            <small>{mode.helper}</small>
          </button>
        ))}
      </section>

      <div className="image-status map-status glass-panel">
        {imageStatus === 'generating' && (
          <>
            <Loader2 size={17} className="spinning" />
            <span>vivo AI 正在续画地图</span>
          </>
        )}
        {imageStatus === 'ready' && (
          <>
            <Sparkles size={17} />
            <span>{frameStack.length > 1 ? '视觉画册已续帧' : '视觉画册首帧已生成'}</span>
          </>
        )}
        {imageStatus === 'error' && (
          <>
            <Image size={17} />
            <button type="button" onClick={retryImage} title={imageError}>
              地图生成失败，点击重试
            </button>
          </>
        )}
        {imageStatus === 'idle' && (
          <>
            <Image size={17} />
            <span>点击画面任意位置继续探索</span>
          </>
        )}
      </div>

      <div className="hotspot-layer map-hotspot-layer">
        {guide.hotspots.map((hotspot, index) => (
          <button
            type="button"
            key={hotspot.id}
            className={selectedHotspot?.id === hotspot.id ? 'hotspot-marker map-marker active' : 'hotspot-marker map-marker'}
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
              '--hotspot-delay': `${index * 120}ms`
            }}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedArea(null)
              setSelectedHotspot(hotspot)
            }}
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

      <div className="gesture-hint map-hint">
        <span>点击任意区域续帧</span>
        <i />
        <span>{activeModeInfo.icon} 当前：{activeModeInfo.label}</span>
        <i />
        <span>滚轮缩放 / 拖拽地图</span>
      </div>

      <section className="visual-flow-strip glass-panel" aria-label="视觉流帧栈">
        <div className="flow-strip-title">
          <Layers size={17} />
          <span>视觉流</span>
        </div>
        <div className="flow-frames">
          {frameStack.map((frame, index) => (
            <button
              type="button"
              key={frame.id}
              className={index === frameStack.length - 1 ? 'active' : ''}
              onClick={() => {
                setImageUrl(frame.imageUrl)
                setSelectedArea(null)
                setToast(`已回到 ${frame.title}`)
              }}
              title={frame.subtitle}
            >
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>{frame.title}</span>
              <small>{frame.modeLabel} · {Math.round(frame.x)}%/{Math.round(frame.y)}%</small>
            </button>
          ))}
        </div>
      </section>

      {selectedHotspot && (
        <section className="hotspot-card glass-panel map-card" aria-live="polite">
          <button type="button" className="card-close" onClick={() => setSelectedHotspot(null)} aria-label="关闭地点详情">
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
          <button type="button" className="primary-action" onClick={() => setItineraryOpen(true)}>
            <Navigation size={18} />
            加入路线参考
          </button>
        </section>
      )}

      {selectedArea && (
        <section className="area-insight-card glass-panel map-card" aria-live="polite">
          <button type="button" className="card-close" onClick={() => setSelectedArea(null)} aria-label="关闭区域详情">
            <X size={19} />
          </button>
          <div className="hotspot-card-heading">
            <span>{selectedArea.area.icon || activeModeInfo.icon}</span>
            <div>
              <small>点击坐标 {selectedArea.area.x}% · {selectedArea.area.y}%</small>
              <h2>{selectedArea.area.title}</h2>
            </div>
          </div>
          <p>{selectedArea.area.summary}</p>
          <div className={selectedArea.vlm ? 'model-call-note active' : 'model-call-note'}>
            <strong>VLM</strong>
            {selectedArea.vlm
              ? `已调用 ${selectedArea.vlmModel || '视觉模型'}`
              : selectedArea.vlmReserved
                ? `未调用：${selectedArea.vlmModel || 'VLM'} 未配置 API Key`
                : `已配置 ${selectedArea.vlmModel || 'VLM'}，本次识别降级`}
            {selectedArea.vlmProvider && <small>{selectedArea.vlmProvider}</small>}
            {selectedArea.vlmWarning && <small>降级原因：{selectedArea.vlmWarning}</small>}
          </div>
          {selectedArea.vlmReserved && (
            <div className="reserved-note">
              视觉识别接口已预留；当前使用点击坐标 + vivo POI 搜索生成参考信息。
            </div>
          )}
          {!selectedArea.vlmReserved && !selectedArea.vlm && (
            <div className="reserved-note">
              VLM 已配置但本次调用失败或图片不可用，已自动切换为点击坐标 + POI 搜索。
            </div>
          )}
          {selectedArea.area.visualElements?.length > 0 && (
            <div className="hotspot-tags">
              {selectedArea.area.visualElements.map(item => <span key={item}>识别：{item}</span>)}
            </div>
          )}
          {areaLoading ? (
            <div className="area-loading-line">
              <Loader2 size={17} className="spinning" />
              正在识别区域与附近单位…
            </div>
          ) : (
            <>
              <div className="poi-list">
                {(selectedArea.pois || []).slice(0, 5).map(poi => (
                  <article key={poi.id}>
                    <strong>{poi.name}</strong>
                    <span>{poi.typeName || selectedArea.area.modeLabel}</span>
                    <small>{poi.address || '暂无地址信息'}</small>
                  </article>
                ))}
                {(!selectedArea.pois || selectedArea.pois.length === 0) && (
                  <article>
                    <strong>暂无实时 POI</strong>
                    <small>可切换模式或点击其他地图区域重试。</small>
                  </article>
                )}
              </div>
              <div className="route-strip">
                {(selectedArea.route || []).slice(0, 4).map(step => (
                  <span key={`${step.order}-${step.title}`}>
                    <b>{step.order}</b>{step.title}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className={itineraryOpen ? 'itinerary-drawer open' : 'itinerary-drawer'}>
        <div className="drawer-handle" />
        <header>
          <div>
            <p className="eyebrow">ROUTE REFERENCE</p>
            <h2>{guide.destination} · 视觉路线</h2>
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
          GitHub Pages 展示静态演示；本地后端会通过 vivo POI 搜索补充真实地址、类型和坐标。
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

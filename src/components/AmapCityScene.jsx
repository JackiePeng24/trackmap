import { ArrowLeft, Info, Loader2, MapPin, Navigation, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchCityScene, generateLandmarkMarkerImage } from '../services/api'
import { getAmapDiagnostics, loadAmap } from '../utils/amapLoader'

function poiPosition(poi) {
  const lng = Number(poi.lng ?? poi.coordinates?.longitude)
  const lat = Number(poi.lat ?? poi.coordinates?.latitude)
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
}

function markerContent(poi) {
  const image = poi.imageUrl
  return `
    <div class="landmark-marker">
      <div class="landmark-marker-card">
        <div class="landmark-marker-image">
          ${image ? `<img src="${image}" alt="" />` : '<span class="landmark-marker-skeleton"></span>'}
        </div>
        <span class="landmark-marker-name">${poi.name}</span>
      </div>
    </div>
  `
}

async function hydrateMarkerImages(city, pois, markers, onProgress) {
  let done = 0
  let cursor = 0
  const workerCount = Math.min(3, pois.length)

  async function worker() {
    while (cursor < pois.length) {
      const index = cursor
      cursor += 1
      const poi = pois[index]
      const marker = markers[index]
      if (!marker || poi.imageUrl) {
        done += 1
        continue
      }
      onProgress?.(done, pois.length, poi.name)
      const image = await generateLandmarkMarkerImage(city, poi)
      poi.imageUrl = image.imageUrl
      marker.setContent(markerContent(poi))
      done += 1
      onProgress?.(done, pois.length, poi.name)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  onProgress?.(done, pois.length, '')
}

function AmapCityScene({ keyword, vibe, saved, onBack, onToggleSaved, onPoiSelect, onPlanOpen }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [scene, setScene] = useState(null)
  const [status, setStatus] = useState('正在获取城市中心与核心 POI')
  const [error, setError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [diagnostics, setDiagnostics] = useState(() => (typeof window === 'undefined' ? null : getAmapDiagnostics()))

  useEffect(() => {
    let cancelled = false
    let markers = []

    async function init() {
      setError('')
      setMapReady(false)
      setDiagnostics(getAmapDiagnostics())
      setStatus('正在获取城市中心与核心 POI')
      const nextScene = await fetchCityScene(keyword, vibe)
      if (cancelled) return
      setScene(nextScene)

      if (!import.meta.env.VITE_AMAP_JS_API_KEY) {
        throw new Error('VITE_AMAP_JS_API_KEY 未配置')
      }

      setStatus('正在加载高德地图 JS API 2.0')
      const AMap = await loadAmap({
        onStage: stage => {
          setStatus(stage)
          setDiagnostics(getAmapDiagnostics())
        }
      })
      if (cancelled || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width < 20 || rect.height < 20) {
        throw new Error(`地图容器尺寸异常：${Math.round(rect.width)} x ${Math.round(rect.height)}`)
      }

      setStatus('正在初始化真实城市地图')
      const map = new AMap.Map(containerRef.current, {
        zoom: 12,
        center: [nextScene.center.lng, nextScene.center.lat],
        viewMode: '2D',
        mapStyle: 'amap://styles/whitesmoke',
        features: ['bg', 'road', 'point']
      })

      mapRef.current = map
      markers = nextScene.pois
        .map(poi => {
          const position = poiPosition(poi)
          if (!position) return null
          const marker = new AMap.Marker({
            position,
            title: poi.name,
            content: markerContent(poi),
            anchor: 'bottom-center',
            offset: new AMap.Pixel(0, -8)
          })
          marker.on('click', () => onPoiSelect({ ...poi, lng: position[0], lat: position[1] }, nextScene))
          map.add(marker)
          return marker
        })
        .filter(Boolean)

      if (markers.length) map.setFitView(markers, false, [80, 80, 80, 80])
      map.on('click', event => {
        setStatus(`已读取空白点击坐标：${event.lnglat.lng.toFixed(5)}, ${event.lnglat.lat.toFixed(5)}`)
      })
      setMapReady(true)
      setDiagnostics(getAmapDiagnostics())
      setStatus(`真实地图已就绪，正在生成 ${markers.length} 个地标图片 Marker`)
      hydrateMarkerImages(nextScene.city, nextScene.pois, markers, (done, total, name) => {
        if (cancelled) return
        setStatus(done >= total
          ? '地标图片 Marker 已生成，点击景点图进入 AI 第二层'
          : `AI 正在生成地标图片 Marker：${done}/${total}，当前 ${name}`)
      }).catch(imageError => {
        if (!cancelled) {
          setError(imageError.message || '地标 Marker 生图失败')
          setStatus('地标图片 Marker 生成失败，已停止在诊断状态')
        }
      })
    }

    init().catch(initError => {
      if (!cancelled) {
        setError(initError.message || '高德地图加载失败')
        setDiagnostics(getAmapDiagnostics())
        setStatus('地图初始化失败，已停止在诊断状态')
      }
    })

    return () => {
      cancelled = true
      markers.forEach(marker => marker?.setMap?.(null))
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [keyword, vibe, onPoiSelect, retryKey])

  return (
    <main className="city-map-page">
      <header className="map-toolbar city-toolbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="返回首页">
          <ArrowLeft size={20} />
        </button>
        <div className="map-title-block">
          <span>AMap JS API 2.0</span>
          <strong>{scene?.city || keyword}</strong>
          <small>真实第一层城市地图</small>
        </div>
        <div className="toolbar-actions">
          <button type="button" className={saved ? 'icon-button active' : 'icon-button'} onClick={onToggleSaved} aria-label="收藏目的地">
            <Sparkles size={19} />
          </button>
          <button type="button" className="icon-button" onClick={onPlanOpen} aria-label="打开行程规划">
            <Navigation size={19} />
          </button>
        </div>
      </header>

      <section className="city-status-panel">
        <div className="panel-heading">
          {error ? <Info size={17} /> : <Loader2 size={17} className={status.includes('就绪') ? '' : 'spinning'} />}
          <strong>AI / 地图状态</strong>
        </div>
        <p>{error || status}</p>
      </section>

      {import.meta.env.VITE_AMAP_JS_API_KEY ? (
        <>
          <div ref={containerRef} className="amap-container" />
          {error && !mapReady && (
            <section className="amap-load-error">
              <MapPin size={36} />
              <h2>高德地图没有加载出来</h2>
              <p>{error}</p>
              {diagnostics && (
                <dl className="amap-diagnostics">
                  <div><dt>页面来源</dt><dd>{diagnostics.protocol}//{diagnostics.host}</dd></div>
                  <div><dt>Key</dt><dd>{diagnostics.keyConfigured ? diagnostics.keyPreview : '未配置'}</dd></div>
                  <div><dt>安全密钥</dt><dd>{diagnostics.securityJsCodeConfigured ? diagnostics.securityJsCodePreview : '未配置'}</dd></div>
                  <div><dt>网络状态</dt><dd>{diagnostics.online ? 'online' : 'offline'}</dd></div>
                  <div><dt>AMap 对象</dt><dd>{diagnostics.amapReady ? '已存在' : '未就绪'}</dd></div>
                </dl>
              )}
              <p>请确认当前浏览器能访问 webapi.amap.com，并确认高德 JS API Key 已允许 localhost、127.0.0.1 或当前访问 IP 来源。</p>
              <button type="button" onClick={() => setRetryKey(key => key + 1)}>重试加载地图</button>
            </section>
          )}
        </>
      ) : (
        <section className="amap-missing-key">
          <MapPin size={36} />
          <h2>需要配置高德地图 Key</h2>
          <p>设置 VITE_AMAP_JS_API_KEY 和 VITE_AMAP_SECURITY_JSCODE 后，第一层会显示真实高德地图。</p>
        </section>
      )}
    </main>
  )
}

export default AmapCityScene

import { useEffect, useState } from 'react'
import { Compass, Heart, Info, Map, Navigation } from 'lucide-react'
import AmapCityScene from './components/AmapCityScene'
import Home from './components/Home'
import PlaceDetailAiScene from './components/PlaceDetailAiScene'
import PoiAiScene from './components/PoiAiScene'
import RouteSummaryPage from './components/RouteSummaryPage'
import TripPlanDrawer from './components/TripPlanDrawer'
import { fetchHealth } from './services/api'

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '')
    return Array.isArray(value) ? value : fallback
  } catch {
    return fallback
  }
}

function createPlanItem(source, type, destination) {
  const name = source.name || source.title || '未命名地点'
  return {
    id: source.id || `${destination}-${type}-${name}`,
    destination,
    name,
    type,
    note: source.reason || source.description || source.address || '',
    address: source.address || '',
    phone: source.phone || '',
    distance: source.distance,
    typeName: source.typeName || '',
    duration: source.duration || (type === '景点' ? '60-120 分钟' : '30-60 分钟'),
    lng: source.lng,
    lat: source.lat
  }
}

function App() {
  const [view, setView] = useState('home')
  const [keyword, setKeyword] = useState('')
  const [vibe, setVibe] = useState('综合')
  const [cityScene, setCityScene] = useState(null)
  const [selectedPoi, setSelectedPoi] = useState(null)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [detailMode, setDetailMode] = useState('unit')
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [savedPlaces, setSavedPlaces] = useState(() => readJson('xingji-saved-places', []))
  const [planItems, setPlanItems] = useState(() => readJson('xingji-trip-plan', []))
  const [health, setHealth] = useState(null)

  useEffect(() => {
    localStorage.setItem('xingji-saved-places', JSON.stringify(savedPlaces))
  }, [savedPlaces])

  useEffect(() => {
    localStorage.setItem('xingji-trip-plan', JSON.stringify(planItems))
  }, [planItems])

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth({ configured: false }))
  }, [])

  const startExplore = (nextKeyword, nextVibe = '综合') => {
    setKeyword(nextKeyword)
    setVibe(nextVibe)
    setCityScene(null)
    setSelectedPoi(null)
    setSelectedPlace(null)
    setDetailMode('unit')
    setView('city-map')
  }

  const toggleSavedPlace = (place = keyword) => {
    if (!place) return
    setSavedPlaces(items => (
      items.includes(place) ? items.filter(item => item !== place) : [place, ...items]
    ))
  }

  const addPlanItem = (item, type = item.typeName || item.type || '地点') => {
    const planItem = createPlanItem(item, type, cityScene?.city || keyword)
    setPlanItems(items => {
      if (items.some(current => current.id === planItem.id)) return items
      return [...items, { ...planItem, addedAt: Date.now() }]
    })
  }

  const removePlanItem = (id) => {
    setPlanItems(items => items.filter(item => item.id !== id))
  }

  const updatePlanItem = (id, patch) => {
    setPlanItems(items => items.map(item => (item.id === id ? { ...item, ...patch } : item)))
  }

  const movePlanItem = (id, direction) => {
    setPlanItems(items => {
      const index = items.findIndex(item => item.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= items.length) return items
      const next = [...items]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const openRouteSummary = () => {
    setPlannerOpen(false)
    setView('route-summary')
  }

  const selectCityPoi = (poi, scene) => {
    setCityScene(scene)
    setSelectedPoi(poi)
    setSelectedPlace(null)
    setDetailMode('unit')
    setView('poi-ai')
  }

  const selectPlace = (place, mode = 'unit') => {
    setSelectedPlace(place)
    setDetailMode(mode)
    setView('place-detail')
  }

  if (view === 'city-map' || (view === 'poi-ai' && selectedPoi && cityScene) || (view === 'place-detail' && selectedPlace && cityScene)) {
    return (
      <>
        <AmapCityScene
          keyword={keyword}
          vibe={vibe}
          saved={savedPlaces.includes(keyword)}
          hidden={view !== 'city-map'}
          onBack={() => setView('home')}
          onToggleSaved={() => toggleSavedPlace(keyword)}
          onPoiSelect={selectCityPoi}
          onPlanOpen={() => setPlannerOpen(true)}
        />
        {view === 'poi-ai' && (
          <PoiAiScene
            cityScene={cityScene}
            centerPoi={selectedPoi}
            onBack={() => setView('city-map')}
            onPlaceSelect={selectPlace}
            onAddPlanItem={addPlanItem}
            onPlanOpen={() => setPlannerOpen(true)}
          />
        )}
        {view === 'place-detail' && (
          <PlaceDetailAiScene
            city={cityScene.city}
            place={selectedPlace}
            detailMode={detailMode}
            onBack={() => setView('poi-ai')}
            onAddPlanItem={addPlanItem}
            onPlanOpen={() => setPlannerOpen(true)}
          />
        )}
        <TripPlanDrawer open={plannerOpen} planItems={planItems} onClose={() => setPlannerOpen(false)} onRemove={removePlanItem} onMove={movePlanItem} onUpdate={updatePlanItem} onRouteSummary={openRouteSummary} />
      </>
    )
  }

  if (view === 'route-summary') {
    return (
      <RouteSummaryPage
        city={cityScene?.city || keyword || '当前城市'}
        places={planItems}
        onBack={() => setView(cityScene && selectedPoi ? 'poi-ai' : cityScene ? 'city-map' : 'home')}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button type="button" className="brand" onClick={() => setView('home')}>
          <span className="brand-mark"><Map size={21} /></span>
          <span>
            <strong>行迹</strong>
            <small>AMap + AI 旅行地图</small>
          </span>
        </button>
        <nav className="top-tabs" aria-label="主导航">
          <button type="button" className="active">
            <Compass size={17} />
            探索
          </button>
          <button type="button" onClick={() => setPlannerOpen(true)}>
            <Navigation size={17} />
            规划 {planItems.length ? planItems.length : ''}
          </button>
          <button type="button" onClick={() => setView('home')}>
            <Heart size={17} />
            收藏 {savedPlaces.length ? savedPlaces.length : ''}
          </button>
        </nav>
      </header>

      <Home
        onSearch={startExplore}
        savedPlaces={savedPlaces}
        planItems={planItems}
        health={health}
        onExploreSaved={startExplore}
        onToggleSaved={toggleSavedPlace}
      />

      <footer className="app-footnote">
        <Info size={15} />
        第一层使用高德真实地图；第二、三层使用 AI 生图与真实 POI 数据。
      </footer>
      <TripPlanDrawer open={plannerOpen} planItems={planItems} onClose={() => setPlannerOpen(false)} onRemove={removePlanItem} onMove={movePlanItem} onUpdate={updatePlanItem} onRouteSummary={openRouteSummary} />
    </div>
  )
}

export default App

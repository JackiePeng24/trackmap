import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Compass,
  Cpu,
  Heart,
  Image,
  MapPin,
  ShieldCheck,
  User
} from 'lucide-react'
import Home from './components/Home'
import PanoramaView from './components/PanoramaView'
import { fetchHealth } from './services/api'

function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem('xingji-favorites') || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [selectedDestination, setSelectedDestination] = useState('')
  const [selectedVibe, setSelectedVibe] = useState('全部')
  const [activeTab, setActiveTab] = useState('explore')
  const [favorites, setFavorites] = useState(readFavorites)

  useEffect(() => {
    localStorage.setItem('xingji-favorites', JSON.stringify(favorites))
  }, [favorites])

  const handleSearch = (destination, vibe = '全部') => {
    setSelectedDestination(destination)
    setSelectedVibe(vibe)
    setCurrentView('panorama')
  }

  const switchTab = (tab) => {
    setActiveTab(tab)
    setCurrentView('home')
  }

  const toggleFavorite = () => {
    if (!selectedDestination) return
    setFavorites(items => (
      items.includes(selectedDestination)
        ? items.filter(item => item !== selectedDestination)
        : [selectedDestination, ...items]
    ))
  }

  if (currentView === 'panorama') {
    return (
      <PanoramaView
        destination={selectedDestination}
        vibe={selectedVibe}
        onBack={() => setCurrentView('home')}
        isFavorite={favorites.includes(selectedDestination)}
        onToggleFavorite={toggleFavorite}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button type="button" className="brand" onClick={() => switchTab('explore')}>
          <span className="brand-mark"><Compass size={22} /></span>
          <span>
            <strong>行迹</strong>
            <small>AI 漫游向导</small>
          </span>
        </button>
        <div className="header-provider">
          <span className="provider-dot" />
          Powered by vivo AIGC
        </div>
      </header>

      {activeTab === 'explore' && <Home onSearch={handleSearch} />}
      {activeTab === 'favorites' && (
        <FavoritesView favorites={favorites} onExplore={handleSearch} />
      )}
      {activeTab === 'profile' && <ProfileView />}

      <nav className="bottom-nav" aria-label="主导航">
        <button
          type="button"
          className={activeTab === 'explore' ? 'active' : ''}
          onClick={() => switchTab('explore')}
        >
          <Compass size={22} />
          <span>探索</span>
        </button>
        <button
          type="button"
          className={activeTab === 'favorites' ? 'active' : ''}
          onClick={() => switchTab('favorites')}
        >
          <Heart size={22} />
          <span>收藏</span>
          {favorites.length > 0 && <i>{favorites.length}</i>}
        </button>
        <button
          type="button"
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => switchTab('profile')}
        >
          <User size={22} />
          <span>关于</span>
        </button>
      </nav>
    </div>
  )
}

function FavoritesView({ favorites, onExplore }) {
  return (
    <main className="utility-page">
      <div className="utility-heading">
        <p className="eyebrow">YOUR COLLECTION</p>
        <h1>收藏的远方</h1>
        <p>把心动目的地留在这里，随时重新生成一条漫游路线。</p>
      </div>
      {favorites.length ? (
        <div className="favorite-list">
          {favorites.map((destination, index) => (
            <button
              type="button"
              key={destination}
              onClick={() => onExplore(destination, '收藏')}
            >
              <span className="favorite-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="favorite-place">
                <MapPin size={19} />
                <strong>{destination}</strong>
              </span>
              <span>重新探索 <ArrowRight size={18} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Heart size={36} />
          <h2>还没有收藏目的地</h2>
          <p>进入旅行画卷后，点击右上角的爱心即可收藏。</p>
        </div>
      )}
    </main>
  )
}

function ProfileView() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth({ configured: false }))
  }, [])

  return (
    <main className="utility-page about-page">
      <div className="utility-heading">
        <p className="eyebrow">ABOUT XINGJI</p>
        <h1>让旅行规划变成视觉流</h1>
        <p>行迹把“搜索-列表-详情”改写为“意图-视觉-深入”：先生成画面，再从画面里继续走下去。</p>
      </div>

      <section className="tech-grid">
        <article>
          <span><Cpu size={24} /></span>
          <strong>蓝心大模型</strong>
          <p>理解目的地与偏好，输出首帧画册、热点与路线 JSON。</p>
        </article>
        <article>
          <span><MapPin size={24} /></span>
          <strong>vivo LBS</strong>
          <p>按饮食、购物、住宿和交通模式补充真实 POI 信息。</p>
        </article>
        <article>
          <span><Image size={24} /></span>
          <strong>图片生成</strong>
          <p>把全景、局部特写和路线提示连续渲染成视觉帧。</p>
        </article>
        <article>
          <span><ShieldCheck size={24} /></span>
          <strong>安全后端代理</strong>
          <p>AppKey 只保存在服务端，不会暴露给浏览器。</p>
        </article>
      </section>

      <div className={health?.configured ? 'connection-card online' : 'connection-card'}>
        <span className="provider-dot" />
        <div>
          <strong>{health?.configured ? 'vivo AIGC 服务已连接' : '正在检查服务连接'}</strong>
          <p>
            {health?.models
              ? `${health.models.chat} · ${health.models.image}`
              : '攻略、地点与画卷能力由统一后端安全调度'}
          </p>
        </div>
      </div>
    </main>
  )
}

export default App

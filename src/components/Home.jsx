import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Building2,
  Coffee,
  Compass,
  Heart,
  Hotel,
  Map,
  MapPin,
  Search,
  Train
} from 'lucide-react'

const quickDestinations = [
  { name: '北京', note: '中轴线、胡同与博物馆', image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1000&q=82' },
  { name: '杭州', note: '西湖、河坊街与湖山路线', image: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=1000&q=82' },
  { name: '成都', note: '茶馆、小吃与慢行街区', image: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=1000&q=82' },
  { name: '西安', note: '城墙、博物馆与夜游', image: 'https://images.unsplash.com/photo-1591122947157-26bad3a117d2?w=1000&q=82' }
]

const modes = [
  { id: '综合', label: '综合', icon: Compass },
  { id: '美食', label: '美食', icon: Coffee },
  { id: '住宿', label: '住宿', icon: Hotel },
  { id: '交通', label: '交通', icon: Train },
  { id: '购物', label: '购物', icon: Building2 }
]

function Home({ onSearch, savedPlaces, planItems, health, onExploreSaved, onToggleSaved }) {
  const [keyword, setKeyword] = useState('')
  const [mode, setMode] = useState('综合')
  const [message, setMessage] = useState('')

  const recentPlan = useMemo(() => planItems.slice(0, 4), [planItems])

  const submit = (event) => {
    event.preventDefault()
    const destination = keyword.trim()
    if (destination.length < 2) {
      setMessage('请输入至少两个字的目的地或关键词')
      return
    }
    setMessage('')
    onSearch(destination, mode)
  }

  return (
    <main className="home-workspace">
      <section className="search-stage">
        <div className="search-copy">
          <p className="eyebrow">AI TRAVEL MAP</p>
          <h1>输入关键词，生成可点击的 2D 旅行地图</h1>
          <p>
            首层呈现道路、河流与景点轮廓；点击地标进入精细页，再围绕景点查看酒店、交通、美食和商场，并把地点加入规划。
          </p>
        </div>

        <form className="search-console" onSubmit={submit}>
          <div className="search-input-row">
            <MapPin size={21} />
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                if (message) setMessage('')
              }}
              placeholder="例如：南京夫子庙、上海外滩、成都宽窄巷子"
              aria-label="输入旅行关键词"
            />
            <button type="submit">
              <Search size={18} />
              生成地图
            </button>
          </div>
          <div className="mode-row" aria-label="初始探索偏好">
            {modes.map(item => {
              const Icon = item.icon
              return (
                <button
                  type="button"
                  key={item.id}
                  className={mode === item.id ? 'active' : ''}
                  onClick={() => setMode(item.id)}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              )
            })}
          </div>
          <p className={message ? 'form-message warning' : 'form-message'}>
            {message || (health?.configured ? '后端已连接，可调用模型与 POI 服务' : '未检测到完整密钥时会自动使用降级数据')}
          </p>
        </form>
      </section>

      <section className="dashboard-grid">
        <div className="map-preview-panel">
          <div className="mini-map">
            <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200&q=82" alt="" />
            <div className="mini-map-caption">
              <strong>AI 图文地图</strong>
              <span>道路、河流、建筑插画和景点标牌由模型直接生成</span>
            </div>
          </div>
          <div className="preview-copy">
            <strong>三层地图流</strong>
            <span>城市底图 {'->'} 景点精细页 {'->'} 地点详情 / 路线规划</span>
          </div>
        </div>

        <div className="quick-panel">
          <div className="panel-heading">
            <Map size={18} />
            <strong>快速开始</strong>
          </div>
          <div className="destination-list">
            {quickDestinations.map(item => (
              <button type="button" key={item.name} onClick={() => onSearch(item.name, mode)}>
                <img src={item.image} alt="" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.note}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="quick-panel">
          <div className="panel-heading">
            <Heart size={18} />
            <strong>已保存地点</strong>
          </div>
          {savedPlaces.length ? (
            <div className="saved-list">
              {savedPlaces.slice(0, 5).map(place => (
                <div className="saved-row" key={place}>
                  <button type="button" onClick={() => onExploreSaved(place, '收藏')}>
                    <MapPin size={16} />
                    <span>{place}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`取消收藏${place}`}
                    onClick={() => onToggleSaved(place)}
                  >
                    <Heart size={15} fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">进入地图后可保存目的地。</p>
          )}
        </div>

        <div className="quick-panel">
          <div className="panel-heading">
            <Compass size={18} />
            <strong>当前规划</strong>
          </div>
          {recentPlan.length ? (
            <ol className="plan-preview">
              {recentPlan.map(item => (
                <li key={item.id}>
                  <span>{item.type}</span>
                  <strong>{item.name}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-copy">点击地图中的景点或周边地点即可加入。</p>
          )}
        </div>
      </section>
    </main>
  )
}

export default Home

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Compass,
  MapPin,
  Navigation,
  Search,
  Sparkles
} from 'lucide-react'

const categories = ['全部', '热门', '美食', '城市', '自然', '文化']

const quickDestinations = [
  {
    name: '北京',
    emoji: '🏛️',
    tag: '热门',
    caption: '皇城中轴与胡同烟火',
    image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=900&q=82'
  },
  {
    name: '成都',
    emoji: '🐼',
    tag: '美食',
    caption: '在茶馆与巷子里慢下来',
    image: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=900&q=82'
  },
  {
    name: '杭州',
    emoji: '🌸',
    tag: '自然',
    caption: '湖山相映的东方诗意',
    image: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=900&q=82'
  },
  {
    name: '西安',
    emoji: '🏺',
    tag: '文化',
    caption: '城墙内外一眼千年',
    image: 'https://images.unsplash.com/photo-1591122947157-26bad3a117d2?w=900&q=82'
  },
  {
    name: '上海',
    emoji: '🌃',
    tag: '城市',
    caption: '海派建筑与城市天际线',
    image: 'https://images.unsplash.com/photo-1537531383496-f4749b8032cf?w=900&q=82'
  },
  {
    name: '三亚',
    emoji: '🏖️',
    tag: '自然',
    caption: '热带海岸的松弛假日',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=82'
  }
]

function Home({ onSearch }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [validation, setValidation] = useState('')

  const destinations = useMemo(() => {
    if (selectedCategory === '全部') return quickDestinations
    return quickDestinations.filter(item => item.tag === selectedCategory)
  }, [selectedCategory])

  const submitSearch = (event) => {
    event?.preventDefault()
    const destination = searchQuery.trim()

    if (destination.length < 2) {
      setValidation('请输入至少两个字的目的地')
      return
    }

    setValidation('')
    onSearch(destination, selectedCategory)
  }

  const chooseDestination = (destination) => {
    setSearchQuery(destination.name)
    setValidation('')
    onSearch(destination.name, destination.tag)
  }

  return (
    <main className="home-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="hero-section">
        <div className="hero-copy fade-in">
          <div className="provider-pill">
            <span className="provider-dot" />
            vivo 蓝心大模型 · 视觉流生成 · POI 识别
          </div>
          <p className="eyebrow">INFINITE VISUAL TRAVEL</p>
          <h1>
            规划旅行，
            <span>像翻开一本活的画册。</span>
          </h1>
          <p className="hero-description">
            输入目的地，AI 先生成一帧全景视觉画面；点击画面任意区域，就继续展开下一帧特写、周边地点与路线灵感。
          </p>

          <form className="hero-search" onSubmit={submitSearch}>
            <MapPin size={22} aria-hidden="true" />
            <input
              aria-label="搜索目的地"
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                if (validation) setValidation('')
              }}
              placeholder="想从哪里开始？例如：天津、泉州、阿勒泰"
            />
            <button type="submit" aria-label="生成漫游画卷">
              <Search size={19} />
              <span>生成首帧</span>
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="search-meta">
            <span className={validation ? 'validation-message visible' : 'validation-message'}>
              {validation || '所见即所得：先看见，再深入，再生成路线'}
            </span>
            <span>AI 画面与路线仅供旅行灵感参考</span>
          </div>

          <div className="filter-row" aria-label="目的地分类">
            {categories.map(category => (
              <button
                type="button"
                key={category}
                className={selectedCategory === category ? 'filter-pill active' : 'filter-pill'}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-orbit fade-in delay-one" aria-hidden="true">
          <div className="orbit-card orbit-main">
            <div className="orbit-image" />
            <div className="orbit-caption">
              <span>今日灵感</span>
              <strong>点击画面，继续生成下一帧</strong>
            </div>
          </div>
          <div className="floating-note note-one">
            <Sparkles size={17} />
            AI 像素流渲染
          </div>
          <div className="floating-note note-two">
            <Navigation size={17} />
            意图-视觉-深入
          </div>
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
        </div>
      </section>

      <section className="destination-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURATED DESTINATIONS</p>
            <h2>{selectedCategory === '全部' ? '从一座城市开始' : `${selectedCategory}目的地`}</h2>
          </div>
          <p>点开一张卡片，让 AI 生成首帧画面，再从任意细节继续探索。</p>
        </div>

        <div className="destination-grid">
          {destinations.map((destination, index) => (
            <button
              type="button"
              className="destination-card"
              key={destination.name}
              onClick={() => chooseDestination(destination)}
              style={{ '--card-delay': `${index * 55}ms` }}
            >
              <img src={destination.image} alt="" />
              <span className="destination-overlay" />
              <span className="destination-tag">{destination.tag}</span>
              <span className="destination-content">
                <span className="destination-emoji">{destination.emoji}</span>
                <strong>{destination.name}</strong>
                <small>{destination.caption}</small>
              </span>
              <span className="destination-arrow">
                <ArrowRight size={19} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="capability-section">
        <article>
          <span className="capability-icon"><Sparkles size={22} /></span>
          <div>
            <strong>意图理解</strong>
            <p>基于 vivo 蓝心大模型，把目的地和偏好转成可延展的视觉叙事。</p>
          </div>
        </article>
        <article>
          <span className="capability-icon"><Compass size={22} /></span>
          <div>
            <strong>视觉深入</strong>
            <p>点击任意画面区域，生成局部画面、周边单位和下一步路线。</p>
          </div>
        </article>
        <article>
          <span className="capability-icon"><Navigation size={22} /></span>
          <div>
            <strong>低 UI 漫游</strong>
            <p>辅助控件可隐藏，让规划过程更接近 PPT 中的纯视觉浏览器。</p>
          </div>
        </article>
      </section>
    </main>
  )
}

export default Home

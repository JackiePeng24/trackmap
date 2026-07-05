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
            vivo 蓝心大模型 · LBS · 图片生成
          </div>
          <p className="eyebrow">AI IMMERSIVE TRAVEL</p>
          <h1>
            去一个地方，
            <span>先走进它的故事。</span>
          </h1>
          <p className="hero-description">
            输入目的地，行迹会理解城市、核验真实地点，并生成一幅可探索的旅行画卷。
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
              placeholder="想去哪里？例如：泉州、北京、阿勒泰"
            />
            <button type="submit" aria-label="生成漫游画卷">
              <Search size={19} />
              <span>生成画卷</span>
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="search-meta">
            <span className={validation ? 'validation-message visible' : 'validation-message'}>
              {validation || '支持中国城市与目的地，自由输入即可开始'}
            </span>
            <span>AI 内容仅供旅行灵感参考</span>
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
              <strong>在城市里，重新学习漫步</strong>
            </div>
          </div>
          <div className="floating-note note-one">
            <Sparkles size={17} />
            AI 生成专属路线
          </div>
          <div className="floating-note note-two">
            <Navigation size={17} />
            真实 POI 坐标
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
          <p>点开一张卡片，让 AI 为你现场生成路线与画卷。</p>
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
            <strong>懂你的 AI 策划</strong>
            <p>基于 vivo 蓝心大模型，生成有节奏的一日漫游方案。</p>
          </div>
        </article>
        <article>
          <span className="capability-icon"><Compass size={22} /></span>
          <div>
            <strong>真实地点核验</strong>
            <p>通过 vivo LBS 搜索补充地址、坐标和地点类型。</p>
          </div>
        </article>
        <article>
          <span className="capability-icon"><Navigation size={22} /></span>
          <div>
            <strong>沉浸式旅行画卷</strong>
            <p>标志性风景由 AI 融合呈现，热点可点击、缩放和探索。</p>
          </div>
        </article>
      </section>
    </main>
  )
}

export default Home

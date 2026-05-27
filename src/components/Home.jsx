import { useState } from 'react'
import { MapPin, Sparkles } from 'lucide-react'

function Home({ onSearch }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [isSearching, setIsSearching] = useState(false)

  const categories = ['全部', '热门', '美食', '城市', '自然', '文化']

  const quickDestinations = [
    { name: '北京', emoji: '🏛️', tag: '热门' },
    { name: '成都', emoji: '🐼', tag: '美食' },
    { name: '杭州', emoji: '🌸', tag: '自然' },
    { name: '西安', emoji: '🏺', tag: '文化' },
    { name: '上海', emoji: '🌃', tag: '城市' },
    { name: '三亚', emoji: '🏖️', tag: '自然' }
  ]

  const handleSearch = (query) => {
    setIsSearching(true)
    // 模拟搜索延迟
    setTimeout(() => {
      setIsSearching(false)
      if (query) {
        onSearch(query)
      }
    }, 1500)
  }

  return (
    <div className="animated-gradient min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* 主标题 */}
      <div className="text-center mb-12 fade-in">
        <h1 className="text-7xl font-bold text-white mb-4">行迹</h1>
        <p className="text-2xl text-white/90">AI 漫游向导</p>
      </div>

      {/* 搜索框 */}
      <div className="search-container w-full mb-6 fade-in" style={{ animationDelay: '0.2s' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
          placeholder="搜索目的地..."
          className="search-input"
          disabled={isSearching}
        />
        <MapPin className="search-icon" />
      </div>

      {/* 快速筛选标签 */}
      <div className="filter-chips fade-in" style={{ animationDelay: '0.4s' }}>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`filter-chip ${selectedCategory === category ? 'active' : ''}`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* 热门目的地 */}
      <div className="mt-12 w-full max-w-2xl fade-in" style={{ animationDelay: '0.6s' }}>
        <h3 className="text-white/80 text-lg mb-6 flex items-center gap-2">
          <Sparkles size={20} />
          热门目的地
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {quickDestinations.map((dest) => (
            <button
              key={dest.name}
              onClick={() => handleSearch(dest.name)}
              disabled={isSearching}
              className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-center hover:bg-white/20 transition-all hover:scale-105 disabled:opacity-50 border border-white/20"
            >
              <div className="text-4xl mb-3">{dest.emoji}</div>
              <div className="text-white font-semibold text-lg">{dest.name}</div>
              <div className="text-white/60 text-sm mt-1">{dest.tag}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 特性介绍 */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl fade-in" style={{ animationDelay: '0.8s' }}>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-center border border-white/20">
          <div className="text-4xl mb-4">🎨</div>
          <div className="text-white font-semibold mb-2">AI 实时渲染</div>
          <div className="text-white/70 text-sm">生成专属全景画卷</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-center border border-white/20">
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-white font-semibold mb-2">沉浸式探索</div>
          <div className="text-white/70 text-sm">自由缩放交互体验</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-center border border-white/20">
          <div className="text-4xl mb-4">✨</div>
          <div className="text-white font-semibold mb-2">个性化旅程</div>
          <div className="text-white/70 text-sm">点击热点生成攻略</div>
        </div>
      </div>

      {/* 搜索加载状态 */}
      {isSearching && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 text-center">
            <div className="loading-spinner mx-auto mb-4"></div>
            <p className="text-gray-800 font-semibold">AI 正在生成全景画卷...</p>
            <p className="text-gray-500 text-sm mt-2">探索 {searchQuery}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home

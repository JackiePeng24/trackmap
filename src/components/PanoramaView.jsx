import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ZoomIn, ZoomOut, Info, Navigation } from 'lucide-react'

function PanoramaView({ destination, onBack }) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedHotspot, setSelectedHotspot] = useState(null)
  const containerRef = useRef(null)

  // 模拟热点数据
  const hotspots = [
    {
      id: 1,
      x: 30,
      y: 40,
      title: '故宫博物院',
      description: '中国明清两代的皇家宫殿，世界文化遗产',
      icon: '🏛️',
      tags: ['历史文化', '必游']
    },
    {
      id: 2,
      x: 60,
      y: 55,
      title: '景山公园',
      description: '俯瞰故宫全景的最佳地点',
      icon: '🏔️',
      tags: ['自然风光', '摄影']
    },
    {
      id: 3,
      x: 45,
      y: 70,
      title: '天安门广场',
      description: '世界最大的城市广场之一',
      icon: '🏛️',
      tags: ['地标', '历史']
    }
  ]

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 1))
  }

  const handleMouseDown = (e) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleHotspotClick = (hotspot) => {
    setSelectedHotspot(hotspot)
  }

  return (
    <div className="panorama-container" ref={containerRef}>
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="absolute top-6 left-6 z-20 w-12 h-12 bg-white/90 backdrop-blur-lg rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all"
      >
        <ArrowLeft size={24} className="text-gray-800" />
      </button>

      {/* 目的地标题 */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-lg px-6 py-3 rounded-full shadow-lg">
        <h2 className="text-lg font-semibold text-gray-800">{destination}</h2>
      </div>

      {/* 全景图像 */}
      <div
        className="panorama-image"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1920&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 热点标记 */}
        {hotspots.map((hotspot) => (
          <div
            key={hotspot.id}
            className="hotspot"
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
              transform: 'translate(-50%, -50%)'
            }}
            onClick={() => handleHotspotClick(hotspot)}
          >
            <span className="text-2xl">{hotspot.icon}</span>
          </div>
        ))}
      </div>

      {/* 缩放控制 */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={handleZoomIn}>
          <ZoomIn size={20} className="text-gray-800" />
        </button>
        <button className="zoom-btn" onClick={handleZoomOut}>
          <ZoomOut size={20} className="text-gray-800" />
        </button>
      </div>

      {/* 信息卡片 */}
      {selectedHotspot && (
        <div className="info-card fade-in">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{selectedHotspot.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-gray-800">{selectedHotspot.title}</h3>
                <div className="flex gap-2 mt-2">
                  {selectedHotspot.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedHotspot(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-600 leading-relaxed mb-4">
            {selectedHotspot.description}
          </p>
          <button className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2">
            <Navigation size={20} />
            开始规划旅程
          </button>
        </div>
      )}

      {/* 操作提示 */}
      {!selectedHotspot && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-lg px-6 py-3 rounded-full text-white text-sm flex items-center gap-4">
          <span>🖱️ 拖拽平移</span>
          <span>🔍 滚轮缩放</span>
          <span>📍 点击热点探索</span>
        </div>
      )}
    </div>
  )
}

export default PanoramaView

import { useState } from 'react'
import Home from './components/Home'
import PanoramaView from './components/PanoramaView'

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [selectedDestination, setSelectedDestination] = useState(null)
  const [activeTab, setActiveTab] = useState('explore')

  const handleSearch = (destination) => {
    setSelectedDestination(destination)
    setCurrentView('panorama')
  }

  return (
    <div className="app">
      {currentView === 'home' ? (
        <Home onSearch={handleSearch} />
      ) : (
        <PanoramaView
          destination={selectedDestination}
          onBack={() => setCurrentView('home')}
        />
      )}

      {/* 底部导航栏 */}
      <nav className="bottom-nav">
        <div
          className={`nav-item ${activeTab === 'explore' ? 'active' : ''}`}
          onClick={() => setActiveTab('explore')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
          </svg>
          <span>探索</span>
        </div>

        <div
          className={`nav-item ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span>收藏</span>
        </div>

        <div
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>我的</span>
        </div>
      </nav>
    </div>
  )
}

export default App

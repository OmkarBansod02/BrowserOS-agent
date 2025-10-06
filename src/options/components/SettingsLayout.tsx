import React, { useState, useEffect } from 'react'
import { useTheme } from './ThemeProvider'
import {
  Bot, Settings, Menu, X, Moon, Sun, Cloud
} from 'lucide-react'

interface SidebarItem {
  id: string
  label: string
  icon: React.ElementType
  disabled?: boolean
}

const sidebarItems: SidebarItem[] = [
  { id: 'browseros-ai', label: 'BrowserOS AI', icon: Bot }
]

interface SettingsLayoutProps {
  children: React.ReactNode
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const { theme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState('browseros-ai')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar on larger screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleSectionClick = (sectionId: string, disabled?: boolean) => {
    if (!disabled) {
      setActiveSection(sectionId)
      setSidebarOpen(false) // Close on mobile after selection
    }
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'dark':
        return <Moon className="w-5 h-5" />
      case 'gray':
        return <Cloud className="w-5 h-5" />
      default:
        return <Sun className="w-5 h-5" />
    }
  }

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'gray'> = ['light', 'dark', 'gray']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Header - Full Width */}
      <header className="settings-header h-14 flex items-center px-6 border-b border-border shrink-0">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-accent rounded-md transition-colors md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Settings Title */}
            <h1 className="text-[20px] font-medium" style={{ fontFamily: 'Arial, sans-serif' }}>Settings</h1>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={cycleTheme}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title={`Current theme: ${theme}`}
          >
            {getThemeIcon()}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          className={`
            settings-sidebar fixed md:relative w-[240px] h-full z-30 md:z-auto
            transform transition-transform md:transform-none
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <div className="flex flex-col h-full">
            {/* Sidebar Header - Mobile only */}
            <div className="flex md:hidden items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-medium" style={{ fontFamily: 'Arial, sans-serif' }}>Menu</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-accent rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sidebar Items */}
            <div className="flex-1 overflow-y-auto pt-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.id}
                    className={`
                      settings-sidebar-item
                      ${activeSection === item.id ? 'active' : ''}
                      ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    onClick={() => handleSectionClick(item.id, item.disabled)}
                  >
                    <Icon
                      className="absolute left-5 w-5 h-5 flex-shrink-0"
                      style={{ strokeWidth: 1.5 }}
                    />
                    <span className="font-normal" style={{ fontFamily: 'Arial, sans-serif' }}>{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-[696px] mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
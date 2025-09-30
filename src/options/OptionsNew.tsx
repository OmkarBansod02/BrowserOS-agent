import React, { useEffect, useState } from 'react'
import { LLMProvidersSection } from './components/LLMProvidersSection'
import { ProviderTemplates } from './components/ProviderTemplates'
import { ConfiguredModelsList } from './components/ConfiguredModelsList'
import { AddProviderModal } from './components/AddProviderModal'
import { useBrowserOSPrefs } from './hooks/useBrowserOSPrefs'
import { LLMProvider } from './types/llm-settings'

export function OptionsNew() {
  const { providers, defaultProvider, setDefaultProvider, addProvider, updateProvider, deleteProvider } = useBrowserOSPrefs()
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null)

  const handleUseTemplate = (template: LLMProvider) => {
    setEditingProvider(template)
    setIsAddingProvider(true)
  }

  const handleSaveProvider = async (provider: Partial<LLMProvider>) => {
    if (editingProvider?.id) {
      await updateProvider(provider as LLMProvider)
    } else {
      await addProvider(provider as LLMProvider)
    }
    setIsAddingProvider(false)
    setEditingProvider(null)
  }


  return (
    <div className="chrome-settings-container">
      <header className="chrome-settings-header">
        <div className="chrome-settings-header-content">
          <div className="chrome-settings-title">
            <h1>Settings</h1>
          </div>
          <div className="chrome-settings-nav">
            <div className="chrome-settings-nav-item">
              <span>BrowserOS AI</span>
            </div>
          </div>
        </div>
      </header>

      <main className="chrome-settings-main">
        <LLMProvidersSection
          defaultProvider={defaultProvider}
          providers={providers}
          onDefaultChange={setDefaultProvider}
          onAddProvider={() => setIsAddingProvider(true)}
        />

        <ProviderTemplates onUseTemplate={handleUseTemplate} />

        <ConfiguredModelsList
          providers={providers}
          defaultProvider={defaultProvider}
          onEditProvider={(provider) => {
            setEditingProvider(provider)
            setIsAddingProvider(true)
          }}
          onDeleteProvider={deleteProvider}
        />
      </main>

      <AddProviderModal
        isOpen={isAddingProvider}
        onClose={() => {
          setIsAddingProvider(false)
          setEditingProvider(null)
        }}
        onSave={handleSaveProvider}
        editProvider={editingProvider}
      />
    </div>
  )
}
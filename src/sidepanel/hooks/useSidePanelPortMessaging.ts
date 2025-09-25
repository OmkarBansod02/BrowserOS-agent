import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '@/sidepanel/stores/chatStore'
import { PortMessaging, PortPrefix } from '@/lib/runtime/PortMessaging'
import { MessageType } from '@/lib/types/messaging'

const buildPortName = (tabId: number): string => `${PortPrefix.SIDEPANEL}|tab-${tabId}`

const queryActiveTabId = (): Promise<number | null> => {
  return new Promise((resolve) => {
    if (!chrome?.tabs?.query) {
      resolve(null)
      return
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn('[SidePanelPortMessaging] Failed to detect active tab:', chrome.runtime.lastError.message)
        resolve(null)
        return
      }

      const activeTab = tabs[0]
      resolve(activeTab?.id ?? null)
    })
  })
}

/**
 * Custom hook for managing port messaging for the side panel.
 * Uses per-tab port naming for multi-execution support.
 */
export function useSidePanelPortMessaging() {
  const messagingRef = useRef<PortMessaging | null>(null)
  const [connected, setConnected] = useState<boolean>(false)
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [tabId, setTabId] = useState<number | null>(null)
  const { setCurrentExecution, setCurrentTab, setTabExecution } = useChatStore()
  const lastContextRef = useRef<{ executionId: string | null; tabId: number | null }>({ executionId: null, tabId: null })


  const applyExecutionContext = useCallback(
  (nextExecutionId: string | null | undefined, nextTabId?: number) => {
    if (typeof nextTabId === 'number') {
      setTabId((prev) => (prev === nextTabId ? prev : nextTabId))
      setCurrentTab(nextTabId)
    }

    const ensureExecution = (candidate: string) => {
      setExecutionId((prev) => {
        if (prev === candidate) {
          return prev
        }
        setCurrentExecution(candidate)
        return candidate
      })
    }

    let resolvedExecutionId: string | null = nextExecutionId ?? null

    if (nextExecutionId) {
      ensureExecution(nextExecutionId)
      if (typeof nextTabId === 'number') {
        setTabExecution(nextTabId, nextExecutionId)
      }
    } else if (typeof nextTabId === 'number') {
      const mapped = useChatStore.getState().getExecutionForTab(nextTabId)
      if (mapped) {
        resolvedExecutionId = mapped
        ensureExecution(mapped)
        setTabExecution(nextTabId, mapped)
      } else {
        resolvedExecutionId = null
        setExecutionId((prev) => (prev === null ? prev : null))
        setCurrentExecution(null)
      }
    } else {
      resolvedExecutionId = null
      setExecutionId((prev) => (prev === null ? prev : null))
      setCurrentExecution(null)
    }

    const nextTabContext = typeof nextTabId === 'number' ? nextTabId : lastContextRef.current.tabId
    lastContextRef.current = {
      executionId: resolvedExecutionId,
      tabId: nextTabContext
    }
  },
  [setCurrentExecution, setCurrentTab, setTabExecution]
)

  const handleConnectionChange = useCallback((isConnected: boolean) => {
    setConnected(isConnected)
  }, [])

  const handleExecutionContext = useCallback(
    (payload: { executionId: string; tabId?: number }) => {
      console.log('[SidePanelPortMessaging] Received execution context:', payload)
      const previous = lastContextRef.current

      if (payload.executionId !== previous.executionId || payload.tabId !== previous.tabId) {
        console.log('[SidePanelPortMessaging] Switching execution context:', {
          from: { tabId: previous.tabId, executionId: previous.executionId },
          to: { tabId: payload.tabId, executionId: payload.executionId }
        })
      }

      applyExecutionContext(payload.executionId, payload.tabId)
    },
    [applyExecutionContext]
  )

  useEffect(() => {
    let cancelled = false

    queryActiveTabId()
      .then((detectedTabId) => {
        if (cancelled || detectedTabId === null) {
          return
        }
        setTabId((prev) => (prev === detectedTabId ? prev : detectedTabId))
        applyExecutionContext(null, detectedTabId)
      })
      .catch((error) => {
        console.warn('[SidePanelPortMessaging] Failed to resolve active tab id:', error)
      })

    return () => {
      cancelled = true
    }
  }, [applyExecutionContext])

  useEffect(() => {
    if (!chrome?.tabs?.onActivated) {
      return
    }

    const handleActivated = ({ tabId: activeTabId }: { tabId: number }) => {
      if (typeof activeTabId !== 'number') {
        return
      }
      applyExecutionContext(null, activeTabId)
    }

    chrome.tabs.onActivated.addListener(handleActivated)

    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated)
    }
  }, [applyExecutionContext])

  useEffect(() => {
    if (tabId === null) {
      return
    }

    const portName = buildPortName(tabId)
    const messaging = PortMessaging.getInstance(portName)
    messagingRef.current = messaging
    PortMessaging.setActiveInstance(portName, messaging)

    messaging.addConnectionListener(handleConnectionChange)
    messaging.addMessageListener(MessageType.EXECUTION_CONTEXT, handleExecutionContext)

    const alreadyConnected = messaging.isConnected() && messaging.getCurrentPortName() === portName
    if (!alreadyConnected) {
      const success = messaging.connect(portName, true)
      if (!success) {
        console.error(`[SidePanelPortMessaging] Failed to connect with port ${portName}`)
      } else {
        console.log(`[SidePanelPortMessaging] Connected successfully with port ${portName}`)
      }
    } else {
      handleConnectionChange(true)
    }

    return () => {
      messaging.removeConnectionListener(handleConnectionChange)
      messaging.removeMessageListener(MessageType.EXECUTION_CONTEXT, handleExecutionContext)
      PortMessaging.clearInstance(portName)
      if (messagingRef.current === messaging) {
        messagingRef.current = null
      }
    }
  }, [tabId, handleConnectionChange, handleExecutionContext])

  const sendMessage = useCallback(
    <T,>(type: MessageType, payload: T, messageId?: string): boolean => {
      const messaging = PortMessaging.getActiveInstance() ?? messagingRef.current
      return messaging?.sendMessage(type, payload, messageId) ?? false
    },
    []
  )

  const addMessageListener = useCallback(
    <T,>(type: MessageType, callback: (payload: T, messageId?: string) => void): void => {
      const messaging = PortMessaging.getActiveInstance() ?? messagingRef.current
      messaging?.addMessageListener(type, callback)
    },
    []
  )

  const removeMessageListener = useCallback(
    <T,>(type: MessageType, callback: (payload: T, messageId?: string) => void): void => {
      const messaging = PortMessaging.getActiveInstance() ?? messagingRef.current
      messaging?.removeMessageListener(type, callback)
    },
    []
  )

  return {
    connected,
    executionId,
    tabId,
    sendMessage,
    addMessageListener,
    removeMessageListener
  }
}



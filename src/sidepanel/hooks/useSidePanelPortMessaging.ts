import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '@/sidepanel/stores/chatStore'
import { PortMessaging, PortPrefix } from '@/lib/runtime/PortMessaging'
import { MessageType } from '@/lib/types/messaging'

const GLOBAL_PORT_STATE_KEY = '__BROWSEROS_SIDE_PANEL_PORT_STATE__'

interface SharedSidePanelPortState {
  portName: string
  messaging: PortMessaging | null
  usageCount: number
}

const getSharedPortState = (): SharedSidePanelPortState => {
  const globalObject = globalThis as Record<string, unknown>
  const existing = globalObject[GLOBAL_PORT_STATE_KEY] as SharedSidePanelPortState | undefined
  if (existing) {
    return existing
  }

  const initial: SharedSidePanelPortState = {
    portName: '',
    messaging: null,
    usageCount: 0
  }
  globalObject[GLOBAL_PORT_STATE_KEY] = initial
  return initial
}

const makeUniquePortName = (): string => {
  const randomSuffix = Math.random().toString(36).slice(2)
  return `${PortPrefix.SIDEPANEL}|instance-${Date.now()}-${randomSuffix}`
}
/**

 * Custom hook for managing port messaging for the side panel.

 * Relies on background-provided execution context instead of the active tab.

 */

export function useSidePanelPortMessaging() {

  const sharedState = getSharedPortState()



  if (!sharedState.portName) {

    sharedState.portName = makeUniquePortName()

  }



  const portNameRef = useRef<string>(sharedState.portName)

  if (!portNameRef.current) {

    portNameRef.current = sharedState.portName

  }



  const messagingInstance = PortMessaging.getInstance(portNameRef.current)

  sharedState.messaging = messagingInstance

  const messagingRef = useRef<PortMessaging | null>(messagingInstance)



  const [connected, setConnected] = useState<boolean>(false)

  const [executionId, setExecutionId] = useState<string | null>(null)

  const [tabId, setTabId] = useState<number | null>(null)

  const { setCurrentExecution, setCurrentTab, setTabExecution } = useChatStore()

  const lastContextRef = useRef<{ executionId: string | null; tabId: number | null }>({ executionId: null, tabId: null })



  const applyExecutionContext = useCallback(

    (nextExecutionId: string | null | undefined, nextTabId?: number | null) => {

      const hasTabId = typeof nextTabId === 'number'

      if (hasTabId) {

        const numericTabId = nextTabId as number

        setTabId((prev) => (prev === numericTabId ? prev : numericTabId))

        setCurrentTab(numericTabId)

      } else if (nextTabId === null) {

        setTabId(null)

        setCurrentTab(null)

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

        if (hasTabId) {

          setTabExecution(nextTabId as number, nextExecutionId)

        }

      } else if (hasTabId) {

        const numericTabId = nextTabId as number

        const mapped = useChatStore.getState().getExecutionForTab(numericTabId)

        if (mapped) {

          resolvedExecutionId = mapped

          ensureExecution(mapped)

          setTabExecution(numericTabId, mapped)

        } else {

          resolvedExecutionId = null

          setExecutionId(null)

          setCurrentExecution(null)

        }

      } else {

        resolvedExecutionId = null

        setExecutionId(null)

        setCurrentExecution(null)

      }



      const nextResolvedTab = hasTabId ? (nextTabId as number) : nextTabId === null ? null : lastContextRef.current.tabId

      lastContextRef.current = {

        executionId: resolvedExecutionId,

        tabId: nextResolvedTab ?? null

      }

    },

    [setCurrentExecution, setCurrentTab, setTabExecution]

  )



  const handleConnectionChange = useCallback((isConnected: boolean) => {

    setConnected(isConnected)

  }, [])



  const handleExecutionContext = useCallback(

    (payload: { executionId?: string; tabId?: number | null }) => {

      console.log('[SidePanelPortMessaging] Received execution context:', payload)

      const previous = lastContextRef.current

      if (payload.executionId !== previous.executionId || payload.tabId !== previous.tabId) {

        console.log('[SidePanelPortMessaging] Switching execution context:', {

          from: { tabId: previous.tabId, executionId: previous.executionId },

          to: { tabId: payload.tabId ?? null, executionId: payload.executionId ?? null }

        })

      }



      applyExecutionContext(payload.executionId ?? null, payload.tabId ?? undefined)

    },

    [applyExecutionContext]

  )



  useEffect(() => {

    const messaging = messagingInstance

    sharedState.usageCount += 1

    messagingRef.current = messaging

    PortMessaging.setActiveInstance(portNameRef.current, messaging)



    messaging.addConnectionListener(handleConnectionChange)

    messaging.addMessageListener(MessageType.EXECUTION_CONTEXT, handleExecutionContext)



    const requestSync = () => {

      messaging.sendMessage(MessageType.SYNC_REQUEST, {

        portName: portNameRef.current,

        tabId: lastContextRef.current.tabId ?? null

      })

    }



    if (!messaging.isConnected() || messaging.getCurrentPortName() !== portNameRef.current) {

      const success = messaging.connect(portNameRef.current, true)

      if (!success) {

        console.error('[SidePanelPortMessaging] Failed to connect with sidepanel port')

      } else {

        console.log('[SidePanelPortMessaging] Connected successfully with sidepanel port')

        setTimeout(requestSync, 100)

      }

    } else {

      handleConnectionChange(true)

      requestSync()

    }



    return () => {

      messaging.removeConnectionListener(handleConnectionChange)

      messaging.removeMessageListener(MessageType.EXECUTION_CONTEXT, handleExecutionContext)

      if (messagingRef.current === messaging) {

        messagingRef.current = null

      }



      sharedState.usageCount = Math.max(0, sharedState.usageCount - 1)

      if (sharedState.usageCount === 0) {

        messaging.disconnect()

        sharedState.messaging = null

        // CRITICAL FIX: Don't clear portName - keep it for reuse
        // sharedState.portName = ''

      }

    }

  }, [handleConnectionChange, handleExecutionContext])  // CRITICAL FIX: Remove unstable dependencies



  const sendMessage = useCallback(

    <T,>(type: MessageType, payload: T, messageId?: string): boolean => {

      return messagingRef.current?.sendMessage(type, payload, messageId) ?? false

    },

    []

  )



  const addMessageListener = useCallback(

    <T,>(type: MessageType, callback: (payload: T, messageId?: string) => void): void => {

      messagingRef.current?.addMessageListener(type, callback)

    },

    []

  )



  const removeMessageListener = useCallback(

    <T,>(type: MessageType, callback: (payload: T, messageId?: string) => void): void => {

      messagingRef.current?.removeMessageListener(type, callback)

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


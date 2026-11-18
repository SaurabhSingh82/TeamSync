import { useEffect, useRef, useState } from 'react'

export interface RealtimeEvent {
  type: string
  payload?: Record<string, unknown>
}

function websocketUrl(path: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

export function useRealtime(
  path: string | null,
  onEvent: (event: RealtimeEvent) => void,
) {
  const onEventRef = useRef(onEvent)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!path) {
      return
    }
    let active = true
    let socket: WebSocket | null = null
    let retryTimer: number | undefined
    let retryDelay = 500

    const connect = () => {
      if (!active) return
      socket = new WebSocket(websocketUrl(path))
      socket.onopen = () => {
        retryDelay = 500
        setConnected(true)
        socket?.send(JSON.stringify({ type: 'resync' }))
      }
      socket.onmessage = (message) => {
        try {
          onEventRef.current(JSON.parse(message.data) as RealtimeEvent)
        } catch {
          // Ignore malformed server frames; the next resync remains authoritative.
        }
      }
      socket.onclose = () => {
        setConnected(false)
        if (active) {
          retryTimer = window.setTimeout(connect, retryDelay)
          retryDelay = Math.min(retryDelay * 2, 10_000)
        }
      }
      socket.onerror = () => socket?.close()
    }
    connect()
    return () => {
      active = false
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      socket?.close()
      setConnected(false)
    }
  }, [path])

  return connected
}

"use client"

// Single shared fetch for the whole dashboard (Section 6c). Both the hero globe
// map and the operational polar map consume the returned data, so they always
// render the same forecast/risk/route. Handles loading + error states so the UI
// never shows a blank/broken screen (Section 8).

import { useCallback, useEffect, useState } from "react"

import { fetchNavigationData } from "@/lib/api"
import type { NavigationData } from "@/lib/types"

export interface UseNavigationData {
  data: NavigationData | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useNavigationData(): UseNavigationData {
  const [data, setData] = useState<NavigationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)

    fetchNavigationData(controller.signal)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError") {
          console.log("[nav] Error loading navigation data:", err)
          setError(err?.message ?? "Failed to load navigation data")
          setLoading(false)
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [nonce])

  return { data, loading, error, reload }
}

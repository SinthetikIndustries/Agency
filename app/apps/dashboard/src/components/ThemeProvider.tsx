// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { type ThemeKey, DEFAULT_THEME, STORAGE_KEY, flipMode } from '@/lib/themes'

interface ThemeContextValue {
  theme: ThemeKey
  setTheme: (key: ThemeKey) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggleMode: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(DEFAULT_THEME)

  // On mount, read from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeKey | null
      if (stored) {
        setThemeState(stored)
        document.documentElement.setAttribute('data-theme', stored)
      }
    } catch { /* ignore */ }
  }, [])

  function setTheme(key: ThemeKey) {
    setThemeState(key)
    try {
      localStorage.setItem(STORAGE_KEY, key)
    } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', key)
  }

  function toggleMode() {
    setTheme(flipMode(theme))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

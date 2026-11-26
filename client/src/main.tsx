import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/manrope'
import './styles/global.css'
import { App } from './App'
import { aplicarApariencia, leerApariencia } from './lib/apariencia'

aplicarApariencia(leerApariencia())
try {
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => {
      const a = leerApariencia()
      if (a.tema === 'sistema') aplicarApariencia(a)
    }
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', alCambiar)
    else if (typeof mq.addListener === 'function') mq.addListener(alCambiar)
  }
} catch { /* sin matchMedia: el tema "sistema" se resuelve solo al abrir */ }

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

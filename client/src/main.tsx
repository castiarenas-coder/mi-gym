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
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const a = leerApariencia()
    if (a.tema === 'sistema') aplicarApariencia(a)
  })
}

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

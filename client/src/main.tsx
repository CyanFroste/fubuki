import '@/styles.css'

import ReactDOM from 'react-dom/client'
import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { HeroUIProvider as UIProvider, ToastProvider } from '@heroui/react'
import { HomeScreen } from '@/components/home'

const router = createBrowserRouter([{ path: '/', Component: HomeScreen }])

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 2 * 60 * 1000, refetchOnMount: 'always' },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UIProvider className="size-full">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />

        <ToastProvider
          toastOffset={40}
          placement="top-center"
          toastProps={{
            radius: 'sm',
            classNames: { description: 'whitespace-pre-wrap not-empty:pt-1' },
          }}
        />
      </QueryClientProvider>
    </UIProvider>
  </StrictMode>,
)

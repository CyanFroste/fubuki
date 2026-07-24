import '@/styles.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider, Button } from '@heroui/react'
import { MinusIcon, XIcon } from 'lucide-react'

const currentWindow = getCurrentWindow()

export function Window() {
  return (
    <>
      <div
        data-tauri-drag-region
        className="flex items-center pointer-events-auto shrink-0 p-2 gap-2"
      >
        <img src="/images/icon.png" alt="logo" className="size-8 mx-2" />
        <div className="text-large font-semibold leading-none">Fubuki Launcher</div>

        <Button
          isIconOnly
          size="sm"
          radius="full"
          variant="flat"
          className="ml-auto"
          onPress={() => currentWindow.minimize()}
        >
          <MinusIcon className="text-lg" />
        </Button>

        <Button
          isIconOnly
          size="sm"
          radius="full"
          color="danger"
          variant="flat"
          onPress={() => currentWindow.close()}
        >
          <XIcon className="text-lg" />
        </Button>
      </div>

      <div className="size-full flex p-4"></div>
    </>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Window />

      <ToastProvider
        toastOffset={40}
        placement="top-center"
        toastProps={{
          radius: 'sm',
          classNames: { description: 'whitespace-pre-wrap not-empty:pt-1' },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)

try {
  await currentWindow.show()
  await currentWindow.setFocus()
} catch {
  await currentWindow.close()
}

document.addEventListener('contextmenu', evt => {
  if (import.meta.env.PROD) evt.preventDefault()
})

window.addEventListener('keydown', evt => {
  if (import.meta.env.PROD && evt.ctrlKey && evt.key.toLowerCase() === 'r') evt.preventDefault()
})

import '@/styles.css'

import ReactDOM from 'react-dom/client'
import { StrictMode, useEffect, useState } from 'react'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import {
  BaseDirectory,
  resolveResource,
  appConfigDir,
  appDataDir,
  sep as pathSeparator,
} from '@tauri-apps/api/path'
import { defaultWindowIcon, getVersion } from '@tauri-apps/api/app'
import { TrayIcon } from '@tauri-apps/api/tray'
import { Menu } from '@tauri-apps/api/menu'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { Child, Command } from '@tauri-apps/plugin-shell'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrent as getStartUrls, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { Button, cn, Input } from '@heroui/react'
import {
  CurlyBracesIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FolderSearchIcon,
  LogsIcon,
  MinusIcon,
  PlayIcon,
  SaveCheckIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react'

const SIDECAR_KEY = '../../bin/fubuki'
const CONFIG_FILE_NAME = 'fubuki-config.json'

const currentWindow = getCurrentWindow()
const [initialStartUrl] = (await getStartUrls()) ?? []
const versions = await getVersions()

try {
  const tray = await TrayIcon.new({
    icon: (await defaultWindowIcon())!,
    action: event => {
      switch (event.type) {
        case 'DoubleClick':
          currentWindow.show()
          break
      }
    },
  })

  tray.setMenu(
    await Menu.new({
      items: [
        { id: 'open', text: 'Open', action: () => currentWindow.show() },
        { id: 'close', text: 'Close', action: () => currentWindow.close() },
        // TODO dynamic menu items - toggle start/stop
      ],
    }),
  )
} catch (err) {
  if (err instanceof Error) console.error(err.message)
  else console.error(err)
}

export function Window() {
  const [command, setCommand] = useState<Command<string> | null>(null)
  const [child, setChild] = useState<Child | null>(null)
  const [outputs, setOutputs] = useState<string[]>([])
  const [startUrl, setStartUrl] = useState(initialStartUrl)

  const [port, setPort] = useState('')
  const [dbPath, setDbPath] = useState('')
  const [showLogs, setShowLogs] = useState(false)

  const addOutput = (output: string) => setOutputs(prev => prev.concat(output))
  const addErrorOutput = (output: unknown) => {
    if (typeof output === 'string') addOutput(output)
    else addOutput((output as Error).message)
  }

  const init = async (force = false) => {
    if (command && !force) return

    try {
      const config = await getConfig()
      addOutput(`loaded config: ${JSON.stringify(config)}`)

      setPort(config.port.toString() ?? '3200')
      setDbPath(config.dbPath)

      const cmd = Command.sidecar(SIDECAR_KEY, [
        '--client-path',
        await resolveResource('client'),
        '--config',
        JSON.stringify(force ? { port: +port, dbPath } : config),
      ])

      cmd.stdout.addListener('data', addOutput)
      cmd.stderr.addListener('data', addOutput)

      cmd.addListener('error', err => {
        addOutput(err)
        setChild(null)
      })

      cmd.addListener('close', data => {
        addOutput(`Exit with code: ${data.code} and signal: ${data.signal}`)
        setChild(null)
      })

      child?.kill()
      setCommand(cmd)
      setChild(null)
    } catch (err) {
      addErrorOutput(err)
    }
  }

  const mutationSaveConfig = useMutation({
    mutationFn: async () => await setConfig({ port: +port, dbPath }),
    onSuccess: async () => {
      const path = `${await appConfigDir()}${pathSeparator()}${CONFIG_FILE_NAME}`
      addOutput(`config saved to path: ${path}`)
      await init(true)
    },
  })

  const onPickDbDir = async () => {
    try {
      const dir = await open({ directory: true, defaultPath: await appDataDir() })
      if (!dir) return

      const dbPath = `${dir}${pathSeparator()}fubuki.db`

      if (await exists(dbPath)) {
        addOutput(`db exists at path: ${dbPath}`)
        return setDbPath(dbPath)
      }

      await Command.sidecar(SIDECAR_KEY, [
        'init',
        '--config',
        JSON.stringify({ port: +port, dbPath }),
      ]).execute()

      addOutput(`db created at path: ${dbPath}`)
      setDbPath(dbPath)
    } catch (err) {
      addErrorOutput(err)
    }
  }

  const onToggle = async () => {
    try {
      if (!command) throw new Error('no command found to start the process')
      if (!child) {
        addOutput('starting...')
        setChild(await command.spawn())
        openUrl(`http://localhost:${port}`)
      } else {
        addOutput('stopping...')
        await child.kill()
        setChild(null)
      }
    } catch (err) {
      addErrorOutput(err)
    }
  }

  useEffect(() => {
    init()
  }, [command])

  useEffect(() => {
    if (showLogs) currentWindow.setSize(new LogicalSize(1400, 720))
    else currentWindow.setSize(new LogicalSize(360, 720))
  }, [showLogs])

  useEffect(() => {
    const onDeepLink = async ([url]: string[]) => {
      if (!url) return
      if (command && !child) onToggle() // takes time to start the process

      // dispatch after a while
      setTimeout(() => sendDataFromDeepLink(url, +port), 1000)
    }

    if (startUrl) onDeepLink([startUrl]).then(() => setStartUrl(''))
    const unlisten = onOpenUrl(onDeepLink)

    return () => {
      unlisten.then(fn => fn())
    }
  }, [command, child])

  return (
    <>
      <div
        data-tauri-drag-region
        className="flex items-center pointer-events-auto shrink-0 p-2 gap-2 border-b border-divider"
      >
        <img src="/images/icon.png" alt="logo" className="size-8 mx-2 pointer-events-none" />
        <div className="text-large font-semibold leading-none pointer-events-none">
          Fubuki Launcher
        </div>

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
          onPress={evt => {
            if (evt.shiftKey) currentWindow.close()
            else currentWindow.hide()
          }}
        >
          <XIcon className="text-lg" />
        </Button>
      </div>

      <div className="size-full flex overflow-auto">
        <div
          className={cn(
            'flex flex-col gap-4 p-4 shrink-0',
            showLogs ? 'border-r border-divider' : 'w-full',
          )}
        >
          <Button
            size="lg"
            radius="full"
            variant={child ? 'solid' : 'flat'}
            color={child ? 'danger' : 'success'}
            className={cn('text-xl mb-auto', showLogs ? 'size-82' : 'w-full h-auto aspect-square')}
            onPress={onToggle}
          >
            {child ? <SquareIcon /> : <PlayIcon />}
            {child ? 'Stop' : 'Start'}
          </Button>

          <Button
            fullWidth
            radius="sm"
            color="primary"
            variant="flat"
            onPress={() => setShowLogs(!showLogs)}
          >
            <LogsIcon className="text-lg" /> Show Logs
          </Button>

          <div className="flex items-center gap-2 w-full">
            <Input
              radius="sm"
              label="Port"
              value={port}
              onValueChange={setPort}
              classNames={{ input: 'font-mono' }}
              placeholder="Port number"
            />

            <Button
              radius="sm"
              variant="flat"
              color="secondary"
              className="h-full shrink-0"
              onPress={() => openUrl(`http://localhost:${port}`)}
            >
              <ExternalLinkIcon className="text-lg" /> Open
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <Input
              radius="sm"
              label="Database Path"
              value={dbPath}
              onValueChange={setDbPath}
              classNames={{ input: 'font-mono' }}
              placeholder="Path to database file"
            />

            <Button
              isIconOnly
              radius="sm"
              variant="flat"
              color="warning"
              className="h-full w-16"
              onPress={onPickDbDir}
            >
              <FolderSearchIcon className="text-lg" />
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <Button
              isIconOnly
              radius="sm"
              color="warning"
              variant="flat"
              onPress={() => revealItemInDir(dbPath)}
            >
              <DatabaseIcon className="text-lg" />
            </Button>

            <Button
              isIconOnly
              radius="sm"
              color="warning"
              variant="flat"
              onPress={async () => revealItemInDir(`${await appConfigDir()}/${CONFIG_FILE_NAME}`)}
            >
              <CurlyBracesIcon className="text-lg" />
            </Button>

            <Button
              fullWidth
              radius="sm"
              color="primary"
              variant="flat"
              isLoading={mutationSaveConfig.isPending}
              onPress={() => mutationSaveConfig.mutate()}
            >
              <SaveCheckIcon className="text-lg" /> Save
            </Button>
          </div>

          <div className="flex items-center">
            <div className="text-tiny text-default-500">
              Fubuki v{versions.server} / v{versions.launcher}
            </div>

            <div className="text-tiny text-default-500 ml-auto">
              Cyan Froste © {new Date().getFullYear()}
            </div>
          </div>
        </div>

        {showLogs && (
          <div className="flex flex-col p-4 size-full">
            <div
              className="size-full rounded-small flex flex-col overflow-auto 
              bg-gray-900 text-gray-100 font-mono text-small p-4 gap-1.5"
            >
              {outputs.map((output, i) => (
                <div key={i}>{output}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Window />
    </QueryClientProvider>
  </StrictMode>,
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

type Config = { port: number; dbPath: string }

async function getConfig() {
  const text = await readTextFile(CONFIG_FILE_NAME, { baseDir: BaseDirectory.AppConfig })
  const config: Config = JSON.parse(text)

  return config
}

async function setConfig(config: Config) {
  await writeTextFile(CONFIG_FILE_NAME, JSON.stringify(config), {
    baseDir: BaseDirectory.AppConfig,
  })
}

async function sendDataFromDeepLink(deepLinkUrl: string, port: number) {
  // extract data from deep link's query params ???
  const searchParams = new URL(deepLinkUrl).searchParams
  const action = searchParams.get('action')
  const data = searchParams.get('data')
  const body = JSON.parse(decodeURIComponent(data ?? '[]'))

  const res = await fetch(`http://localhost:${port}/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error((await res.text()) ?? res.statusText)
  return await res.json()
}

async function getVersions() {
  const cmd = Command.sidecar(SIDECAR_KEY, ['-V'])
  const [, server] = (await cmd.execute()).stdout.split(' ')
  const launcher = await getVersion()

  return { server, launcher }
}

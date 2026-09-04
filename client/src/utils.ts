import { useParams as usePathParams, useSearchParams } from 'react-router'
import { createStore, useStore } from 'zustand'
import qs from 'qs'
import axios from 'axios'
import MiniSearch from 'minisearch'
import type { AxiosError } from 'axios'
import type {
  Dictionary,
  Nullable,
  StringifyQueryOptions,
  RawQueryParams,
  RawQueryParam,
  HttpClientOptions,
  Response,
  Headers,
  Link,
  Domain,
  GetLinksParams,
  LinkFn,
} from '@/types'

export const useGlobalState = useStore
export const createGlobalState = createStore

export const DEFAULT_STRINGIFY_QUERY_OPTIONS: StringifyQueryOptions = {
  encode: false,
  addQueryPrefix: true,
  arrayFormat: 'repeat',
}

export type LinkMap = { '/': GetLinksParams }

export const link: LinkFn<LinkMap> = (url, params, stringifyOptions) => {
  return url.slice(url.indexOf('/')) + stringifyQuery(params, stringifyOptions)
}

export function createSearchIndex() {
  return new MiniSearch({
    idField: 'url',
    storeFields: ['url'],
    fields: ['title', 'url', 'host'],
    searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: true },
  })
}

type ClientRequest<T> = {
  action:
    | 'process-urls'
    | 'get-links'
    | 'get-domains'
    | 'remove-links'
    | 'set-link-favorite'
    | 'replace-host'
  data?: Nullable<T>
}

export class Client {
  static async request<U, T = unknown>(req: ClientRequest<T>) {
    const res = await request<U>(`/api/${req.action}`, {
      body: req.data as Dictionary,
      method: 'POST',
    })

    return res.data
  }

  async processUrls(urls: string[], processDuplicates: boolean) {
    return await Client.request<string[]>({
      action: 'process-urls',
      data: [urls, processDuplicates],
    })
  }

  async getLinks(params: GetLinksParams) {
    return await Client.request<Link[], GetLinksParams>({ action: 'get-links', data: params })
  }

  async getDomains() {
    return await Client.request<Domain[]>({ action: 'get-domains' })
  }

  async removeLinks(urls: string[]) {
    return await Client.request({ action: 'remove-links', data: urls })
  }

  async setLinkFavorite({ url, favorite }: Pick<Link, 'url' | 'favorite'>) {
    return await Client.request({ action: 'set-link-favorite', data: [url, favorite] })
  }

  async replaceHost(old: string, replace: string) {
    return await Client.request({ action: 'replace-host', data: [old, replace] })
  }

  parseGetLinksParams(params: RawQueryParams): GetLinksParams {
    const p = params as Nullable<Dictionary<RawQueryParam>>

    return { host: p?.host?.toString(), favorite: parseBooleanParam(p?.favorite) }
  }
}

export async function request<T, Q extends Dictionary = Dictionary>(
  url: string,
  {
    method = 'GET',
    responseType = 'json',
    query,
    body,
    headers,
    stringifyQueryOptions = {},
  }: HttpClientOptions<Q> = {},
): Promise<Response<T>> {
  if (query) url += stringifyQuery(query, stringifyQueryOptions)

  try {
    const res = await axios(url, {
      method,
      headers,
      responseType,
      ...(body && { data: body }),
    })

    const response: Response<T> = {
      data: res.data,
      headers: res.headers as Headers,
      status: res.status,
    }

    return response
  } catch (err) {
    const error = err as AxiosError<Error>
    const message = error.response?.data?.message ?? error.message

    throw new Error(message)
  }
}

export function stringifyQuery<Q>(query: Q, options: StringifyQueryOptions = {}) {
  const stringified = qs.stringify(query, { ...DEFAULT_STRINGIFY_QUERY_OPTIONS, ...options })
  if (options.append) return '&' + stringified.slice(stringified.indexOf('?') + 1)
  return stringified
}

export function useUrlParams<T = RawQueryParams>(transform?: (raw: RawQueryParams) => T) {
  const pathParams = usePathParams()
  const [searchParams] = useSearchParams()

  const raw = { ...pathParams, ...qs.parse(searchParams.toString()) } as RawQueryParams
  const parsed = transform?.(raw) ?? (raw as T)

  return parsed
}

export function parseBooleanParam(value: RawQueryParam) {
  return value?.toString() === 'true'
}

export function parseNumberParam(value: RawQueryParam) {
  if (!value) return
  const it = +value
  if (Number.isNaN(it)) return
  return it
}

export function parseArrayParam<T extends string>(
  value: RawQueryParam,
  validate: (v: unknown) => v is T = (v): v is T => !!v && typeof v === 'string',
) {
  if (Array.isArray(value) && value.length && value.every(validate)) return value
  else if (validate(value)) return [value]
}

export function stripHostFromUrl(value: URL | string) {
  if (!value) return value
  const url = value instanceof URL ? value : new URL(value)
  return url.pathname + url.search
}

export function areUrlsEqual(a: string, b: string) {
  return (
    (a.startsWith('/') ? a : stripHostFromUrl(a)) === (b.startsWith('/') ? b : stripHostFromUrl(b))
  )
}

export function getStorageItem<T>(key: string, storage = localStorage) {
  const item = storage.getItem(key)
  if (!item) return
  return JSON.parse(item) as T
}

export function setStorageItem<T>(key: string, value: T, storage = localStorage) {
  storage.setItem(key, JSON.stringify(value))
}

export function removeStorageItem(key: string, storage = localStorage) {
  storage.removeItem(key)
}

export async function copyToClipboard(text: string) {
  return await navigator.clipboard.writeText(text)
}

export function safelyParseJSON<T>(value: Nullable<string>): Nullable<T> {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

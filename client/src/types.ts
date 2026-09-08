import type { StoreApi } from 'zustand'
import type { IStringifyOptions as ExternalStringifyQueryOptions } from 'qs'

export type Link = {
  url: string
  host: string
  title?: Nullable<string>
  tags?: Nullable<string[]>
  thumbnail?: Nullable<string>
  favorite?: Nullable<boolean>
  modified?: Nullable<string>
}

export type Domain = {
  host: string
  icon?: Nullable<string>
}

export type Counts = { links: number; domains: number }

export type GetLinksParams = {
  host?: Nullable<string>
  favorite?: Nullable<boolean>
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
export type ResponseType = 'json' | 'text' | 'blob' | 'stream'
export type Headers = Dictionary<string>

export type HttpClientOptions<Q> = {
  method?: Method
  responseType?: ResponseType
  headers?: Headers
  query?: Q
  stringifyQueryOptions?: StringifyQueryOptions
  proxy?: boolean
  body?: Nullable<
    | Dictionary
    | ReadonlyArray<Dictionary>
    | string
    | ArrayBuffer
    | Blob
    | FormData
    | URLSearchParams
    | Iterable<Uint8Array>
    | AsyncIterable<Uint8Array>
  >
}

export type Response<T> = { data: T; headers: Headers; status: number }

export type HttpClient = {
  <T, Q extends Dictionary = Dictionary>(
    url: string,
    options?: HttpClientOptions<Q>,
  ): Promise<Response<T>>
  prefix?: string
}

export type StringifyQueryOptions = ExternalStringifyQueryOptions & { append?: boolean }

export type RawQueryParam = Nullable<string | string[]>
export type RawQueryParams = Dictionary<RawQueryParam | Dictionary<RawQueryParam>>

export type PaginationParams = { page?: number; limit?: number }
export type SortParams = { key: string; dir: number }

export type LinkFn<M> = <K extends keyof M>(
  url: K,
  params?: M[K],
  stringifyOptions?: StringifyQueryOptions,
) => string

export type UseQueryOptions = { enabled?: boolean }
export type GlobalState<T> = StoreApi<T>

export type Nullable<T> = T | null | undefined
export type Dictionary<T = unknown> = Record<string, T>

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number
  }
}

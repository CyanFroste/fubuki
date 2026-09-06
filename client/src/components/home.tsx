import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import {
  Button,
  Checkbox,
  cn,
  Image,
  Input,
  Modal,
  ModalContent,
  ScrollShadow,
  Switch,
  Textarea,
  useDisclosure,
} from '@heroui/react'
import {
  CheckIcon,
  ClockIcon,
  HeartIcon,
  HeartOffIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react'
import { VirtualList } from '@/components/lists'
import { Domains, DomainIcon } from '@/components/domains'
import { useUrlParams, Client, link, createSearchIndex } from '@/utils'
import type { Domain, Link } from '@/types'
import type {
  ContainerProps as ListContainerProps,
  HeaderProps as ListHeaderProps,
  FooterProps as ListFooterProps,
} from '@/components/lists'

const client = new Client()
const searchIndex = createSearchIndex()

export function HomeScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useUrlParams(client.parseGetLinksParams.bind(client))

  const queryLinks = useQuery({
    queryKey: ['links', params],
    queryFn: async () => await client.getLinks(params),
  })

  const queryDomains = useQuery({
    queryKey: ['domains'],
    queryFn: client.getDomains.bind(client),
  })

  const queryCounts = useQuery({
    queryKey: ['counts'],
    queryFn: async () => await client.getCounts(),
  })

  const linksMap = new Map(queryLinks.data?.map(it => [it.url, it]) ?? [])
  const [filtered, setFiltered] = useState<Link[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(new Map())

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500)

  const [linksToRemove, setLinksToRemove] = useState<Link[]>([])
  const [urlsToProcess, setUrlsToProcess] = useState<string[]>([])
  const [processDuplicates, setProcessDuplicates] = useState(false)

  const removeLinksModal = useDisclosure()
  const processUrlsModal = useDisclosure()

  const removeConfirmButtonRef = useRef<HTMLButtonElement>(null)

  const refetchData = async () => {
    await queryClient.refetchQueries({ queryKey: ['links'] })
    await queryDomains.refetch()
    await queryCounts.refetch()
  }

  const mutationProcessUrl = useMutation({
    mutationFn: async () => await client.processUrls(urlsToProcess, processDuplicates),
    onSuccess: failed => {
      if (!failed.length) refetchData()
      processUrlsModal.onClose()
      setUrlsToProcess([])
    },
  })

  const mutationRemoveLinks = useMutation({
    mutationFn: async () => {
      if (!linksToRemove.length) return
      await client.removeLinks(linksToRemove.map(it => it.url))
    },
    onSuccess: () => {
      refetchData()
      removeLinksModal.onClose()

      if (params.host) {
        let count = counts.get(params.host) ?? 0

        for (const link of linksToRemove) if (link.host === params.host) count -= 1
        if (count <= 0) navigate(link('/'))
      }

      setLinksToRemove([])
    },
  })

  useEffect(() => {
    searchIndex.removeAll()
    searchIndex.addAll(queryLinks.data ?? [])
  }, [queryLinks.data])

  useEffect(() => {
    if (!debouncedSearchQuery.trim()) return setFiltered(queryLinks.data ?? [])

    const data = searchIndex
      .search(debouncedSearchQuery)
      .map(it => linksMap.get(it.id))
      .filter(Boolean) as Link[]

    setFiltered(data)
  }, [queryLinks.data, debouncedSearchQuery])

  useEffect(() => {
    if (!queryLinks.data || !queryDomains.data) return
    const map = new Map<string, number>()

    for (const link of queryLinks.data)
      if (queryDomains.data.some(it => it.host === link.host))
        map.set(link.host, (map.get(link.host) ?? 0) + 1)

    setCounts(map)
  }, [queryLinks.data, queryDomains.data])

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 bg-background/40 backdrop-blur-lg border-b border-divider">
        <div className="container h-[calc(--spacing(12)-1px)] mx-auto flex items-center px-4">
          <RouterLink to="/" className="flex items-center gap-2.5 group">
            <Image radius="sm" shadow="none" src="/images/icon.png" className="size-8" />
            <div className="text-2xl font-semibold leading-none group-hover:text-primary-500 transition-colors">
              Fubuki
            </div>
          </RouterLink>

          <Button
            size="sm"
            radius="none"
            variant="light"
            color="primary"
            className="ml-auto text-small h-full"
            onPress={processUrlsModal.onOpen}
          >
            <PlusIcon className="text-base" /> Add Links
          </Button>
        </div>
      </div>

      <div className="container mx-auto flex h-full">
        <div className="flex pt-12 w-80 h-full shrink-0">
          <div className="flex flex-col size-full border-r border-divider">
            <div className="flex flex-col p-4 gap-4">
              <Input
                radius="sm"
                startContent={<SearchIcon className="text-lg" />}
                placeholder="Search"
                value={searchQuery}
                onValueChange={setSearchQuery}
                onClear={() => setSearchQuery('')}
              />

              <label className="flex items-center gap-2 cursor-pointer">
                <HeartIcon
                  className={cn(
                    params?.favorite ? 'text-success-600' : 'text-primary-600',
                    'text-lg',
                  )}
                />

                <div className="mr-auto text-small font-medium">Favorites only</div>

                <Switch
                  size="sm"
                  color="success"
                  isSelected={!!params?.favorite}
                  onValueChange={value => navigate(link('/', { ...params, favorite: value }))}
                />
              </label>

              <div className="text-tiny text-default-500 ml-auto">
                {queryCounts.data?.links} links and {queryCounts.data?.domains} domains
              </div>

              <hr className="border-divider" />
            </div>

            <Domains
              counts={counts}
              params={params}
              refetchData={refetchData}
              data={queryDomains.data ?? []}
            />
          </div>
        </div>

        <VirtualList
          data={filtered}
          components={{ Container: ListContainer, Header: ListHeader, Footer: ListFooter }}
          className="shrink mr-4"
        >
          {item => (
            <LinkCard
              key={item.url}
              data={item}
              refetchData={refetchData}
              domain={queryDomains.data?.find(it => it.host === item.host)}
              onRemove={() => {
                removeLinksModal.onOpen()
                setLinksToRemove([item])

                setTimeout(() => removeConfirmButtonRef.current?.focus(), 100)
              }}
            />
          )}
        </VirtualList>
      </div>

      <Modal
        size="5xl"
        radius="sm"
        hideCloseButton
        isOpen={removeLinksModal.isOpen}
        onOpenChange={removeLinksModal.onOpenChange}
        isDismissable={!mutationRemoveLinks.isPending}
        isKeyboardDismissDisabled={mutationRemoveLinks.isPending}
      >
        <ModalContent>
          <div className="flex flex-col">
            <div className="text-large font-semibold p-4 border-b border-divider leading-none">
              Remove Links
            </div>

            <div className="flex flex-col gap-2 p-4 border-b border-divider h-80 overflow-auto">
              {linksToRemove.map((it, index) => (
                <div key={it.url} className="text-small text-default-500">
                  {index + 1}. {it.url}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 p-4 justify-end">
              <Button radius="sm" variant="flat" onPress={removeLinksModal.onClose}>
                Cancel
              </Button>

              <Button
                radius="sm"
                color="danger"
                ref={removeConfirmButtonRef}
                isDisabled={!linksToRemove.length}
                onPress={() => mutationRemoveLinks.mutate()}
                isLoading={mutationRemoveLinks.isPending}
              >
                <CheckIcon className="text-lg" /> Confirm
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal
        size="5xl"
        radius="sm"
        hideCloseButton
        isOpen={processUrlsModal.isOpen}
        onOpenChange={processUrlsModal.onOpenChange}
        isDismissable={!mutationProcessUrl.isPending}
        isKeyboardDismissDisabled={mutationProcessUrl.isPending}
      >
        <ModalContent>
          <div className="flex flex-col">
            <div className="text-large font-semibold p-4 border-b border-divider leading-none">
              Add Links
            </div>

            <div className="flex flex-col border-b border-divider">
              <Textarea
                radius="none"
                minRows={40}
                maxRows={40}
                value={urlsToProcess.join('\n')}
                onValueChange={value => setUrlsToProcess(value.split('\n'))}
                placeholder="Paste newline seperated URLs here..."
              />
            </div>

            <div className="flex items-center gap-2 p-4">
              <Checkbox
                radius="full"
                isSelected={processDuplicates}
                onValueChange={setProcessDuplicates}
              >
                Process duplicates?
              </Checkbox>

              <Button
                radius="sm"
                variant="flat"
                className="ml-auto"
                onPress={processUrlsModal.onClose}
              >
                Cancel
              </Button>

              <Button
                radius="sm"
                color="success"
                isDisabled={!urlsToProcess.length}
                onPress={() => mutationProcessUrl.mutate()}
                isLoading={mutationProcessUrl.isPending}
              >
                <CheckIcon className="text-lg" /> Confirm
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  )
}

type LinkCardProps = {
  data: Link
  domain?: Domain
  refetchData: () => void
  onRemove: () => void
}

function LinkCard({ data, domain, refetchData, onRemove }: LinkCardProps) {
  const placeholderThumbnail = '/images/thumbnail-placeholder.png'
  const [thumbnail, setThumbnail] = useState(data.thumbnail ?? placeholderThumbnail)

  const modified = new Date(data.modified!).toLocaleString('en-IN').replace(',', '')

  useEffect(() => {
    setThumbnail(data.thumbnail ?? placeholderThumbnail)
  }, [data.thumbnail])

  const mutationProcessUrl = useMutation({
    mutationFn: async () => await client.processUrls([data.url], true),
    onSuccess: failed => {
      if (!failed.length) refetchData()
    },
  })

  const mutationSetFavorite = useMutation({
    mutationFn: async () =>
      await client.setLinkFavorite({ url: data.url, favorite: !data.favorite }),
    onSuccess: () => {
      refetchData()
    },
  })

  return (
    <div className="flex p-4 border-b border-divider gap-6 h-36">
      <div className="h-full aspect-video overflow-hidden rounded-small shrink-0">
        <Image
          isBlurred
          width="100%"
          height="100%"
          radius="none"
          shadow="none"
          src={thumbnail}
          className="object-contain"
          classNames={{ wrapper: 'size-full' }}
          onError={() => setThumbnail(placeholderThumbnail)}
        />
      </div>

      <div className="flex flex-col size-full overflow-auto">
        <RouterLink
          to={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-0.5 w-full overflow-auto"
        >
          {data.title && (
            <ScrollShadow hideScrollBar orientation="horizontal" className="text-nowrap">
              {data.title}
            </ScrollShadow>
          )}

          <div className="flex items-center gap-1">
            {domain && <DomainIcon data={domain} />}

            <ScrollShadow
              hideScrollBar
              orientation="horizontal"
              className="text-nowrap text-small text-default-500"
            >
              {data.url}
            </ScrollShadow>
          </div>
        </RouterLink>

        <div className="flex items-end mt-auto">
          <div className="text-tiny flex items-center gap-1 text-default-500">
            <ClockIcon /> {modified}
          </div>

          <Button
            isIconOnly
            variant="light"
            radius="full"
            color="danger"
            className="ml-auto"
            onPress={onRemove}
          >
            <TrashIcon className="text-base text-danger-600" />
          </Button>

          <Button
            isIconOnly
            radius="full"
            variant="light"
            isLoading={mutationProcessUrl.isPending}
            onPress={() => mutationProcessUrl.mutate()}
          >
            <RefreshCwIcon className="text-base" />
          </Button>

          <Button
            isIconOnly
            radius="full"
            color="success"
            className="ml-2 text-base text-success-600"
            variant={data.favorite ? 'flat' : 'light'}
            isLoading={mutationSetFavorite.isPending}
            onPress={() => mutationSetFavorite.mutate()}
          >
            {data.favorite ? <HeartOffIcon /> : <HeartIcon />}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ListContainer(props: ListContainerProps) {
  return <div {...props} className="flex flex-col shrink-0 w-full" />
}

function ListHeader(props: ListHeaderProps) {
  return <div {...props} className="h-12" />
}

function ListFooter(props: ListFooterProps) {
  return <div {...props} className="h-12" />
}

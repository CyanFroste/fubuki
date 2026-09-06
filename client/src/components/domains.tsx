import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Image,
  Input,
  Modal,
  ModalContent,
  ScrollShadow,
  useDisclosure,
} from '@heroui/react'
import { CheckIcon, MoveRightIcon, ReplaceIcon, SearchIcon } from 'lucide-react'
import { Client, link, createDomainSearchIndex } from '@/utils'
import type { Domain, GetLinksParams, Nullable } from '@/types'

const client = new Client()
const searchIndex = createDomainSearchIndex()

type DomainProps = {
  data: Domain[]
  counts: Map<string, number>
  params: GetLinksParams
  refetchData: () => void
}

export function Domains({ data, counts, params, refetchData }: DomainProps) {
  const navigate = useNavigate()

  const domainsMap = new Map(data?.map(it => [it.host, it]) ?? [])
  const [filtered, setFiltered] = useState<Domain[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500)

  const [oldHost, setOldHost] = useState('')
  const [newHost, setNewHost] = useState('')

  const replaceHostModal = useDisclosure()

  const mutationReplaceHost = useMutation({
    mutationFn: async () => {
      if (!oldHost.trim() || !newHost.trim() || oldHost === newHost) return
      await client.replaceHost(oldHost, newHost)
    },
    onSuccess: () => {
      refetchData()
      replaceHostModal.onClose()
      navigate(link('/', { host: newHost }))
      setOldHost('')
      setNewHost('')
    },
  })

  useEffect(() => {
    searchIndex.removeAll()
    searchIndex.addAll(data)
  }, [data])

  useEffect(() => {
    if (!debouncedSearchQuery.trim()) return setFiltered(data)

    setFiltered(
      searchIndex
        .search(debouncedSearchQuery)
        .map(it => domainsMap.get(it.host))
        .filter(Boolean) as Domain[],
    )
  }, [data, debouncedSearchQuery])

  useEffect(() => {
    setNewHost(oldHost)
  }, [oldHost])

  return (
    <>
      <div className="flex items-center px-4 pb-4 gap-2">
        <Input
          radius="sm"
          startContent={<SearchIcon className="text-lg" />}
          placeholder="Search Domains"
          value={searchQuery}
          onValueChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />

        <Button
          isIconOnly
          variant="light"
          radius="full"
          className="ml-auto"
          onPress={() => {
            setOldHost(params.host ?? '')
            replaceHostModal.onOpen()
          }}
        >
          <ReplaceIcon className="text-lg" />
        </Button>
      </div>
      <div className="flex flex-col h-full overflow-auto px-4 pb-4">
        {filtered.map(it => (
          <DomainCard
            key={it.host}
            data={it}
            count={counts.get(it.host)}
            isActive={params.host === it.host}
          />
        ))}
      </div>

      <Modal
        size="5xl"
        radius="sm"
        hideCloseButton
        isOpen={replaceHostModal.isOpen}
        onOpenChange={replaceHostModal.onOpenChange}
        isDismissable={!mutationReplaceHost.isPending}
        isKeyboardDismissDisabled={mutationReplaceHost.isPending}
      >
        <ModalContent>
          <div className="flex flex-col">
            <div className="text-large font-semibold p-4 border-b border-divider leading-none">
              Replace Host
            </div>

            <div className="p-4 border-b border-divider h-80">
              <div className="flex items-center gap-4">
                <Autocomplete
                  radius="sm"
                  label="Select Domain"
                  value={oldHost}
                  onChange={(key: Nullable<React.Key>) => setOldHost(key?.toString() ?? '')}
                  defaultItems={data}
                >
                  {it => (
                    <AutocompleteItem key={it.host} startContent={<DomainIcon data={it} />}>
                      {it.host}
                    </AutocompleteItem>
                  )}
                </Autocomplete>

                <MoveRightIcon className="text-xl shrink-0 text-default-500" />

                <Input
                  autoFocus
                  radius="sm"
                  label="New Host"
                  value={newHost}
                  onValueChange={setNewHost}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 p-4 justify-end">
              <Button radius="sm" variant="flat" onPress={replaceHostModal.onClose}>
                Cancel
              </Button>

              <Button
                radius="sm"
                color="success"
                isLoading={mutationReplaceHost.isPending}
                onPress={() => mutationReplaceHost.mutate()}
                isDisabled={!oldHost.trim() || !newHost.trim() || oldHost === newHost}
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

type DomainCardProps = { data: Domain; count?: number; isActive?: boolean }

function DomainCard({ data, count, isActive }: DomainCardProps) {
  return (
    <Button
      as={RouterLink}
      to={link('/', { host: data.host })}
      key={data.host}
      radius="sm"
      variant={isActive ? 'flat' : 'light'}
      className="justify-start shrink-0 px-2"
    >
      <DomainIcon data={data} />

      <ScrollShadow hideScrollBar orientation="horizontal">
        {data.host}
      </ScrollShadow>

      {count && (
        <div className="ml-auto text-tiny py-1 px-2 leading-none text-default-600 bg-default-50 rounded-full">
          {count}
        </div>
      )}
    </Button>
  )
}

type DomainIconProps = { data: Domain }

export function DomainIcon({ data }: DomainIconProps) {
  const [placeholder, setPlaceholder] = useState(`https://${data.host}/favicon.ico`)
  const [icon, setIcon] = useState(data.icon ?? placeholder)

  useEffect(() => {
    setIcon(data.icon ?? placeholder)
  }, [data.icon])

  return (
    <Image
      src={icon}
      radius="none"
      shadow="none"
      removeWrapper
      disableSkeleton
      className="size-4 shrink-0 mr-1"
      onError={() => {
        const p = '/images/domain-icon-placeholder.png'
        setPlaceholder(p)
        setIcon(p)
      }}
    />
  )
}

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import { Button, Chip, Input, Modal, ModalContent, Textarea, useDisclosure } from '@heroui/react'
import { CheckIcon, SearchIcon, TagsIcon } from 'lucide-react'
import { Client } from '@/utils'

const client = new Client()

type TagsProps = { data: string[]; refetchData: () => void }

export function Tags({ data, refetchData }: TagsProps) {
  const modal = useDisclosure()
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => setTags(data), [data])

  const mutationSetTags = useMutation({
    mutationFn: async () => await client.setTags(tags),
    onSuccess: () => refetchData(),
    onSettled: () => modal.onClose(),
  })

  return (
    <>
      <Button
        size="sm"
        radius="none"
        variant="light"
        className="ml-auto text-small h-full"
        onPress={modal.onOpen}
      >
        <TagsIcon className="text-base" /> Tags
      </Button>

      <Modal
        size="5xl"
        radius="sm"
        hideCloseButton
        isOpen={modal.isOpen}
        onOpenChange={modal.onOpenChange}
        isDismissable={!mutationSetTags.isPending}
        isKeyboardDismissDisabled={mutationSetTags.isPending}
      >
        <ModalContent>
          <div className="flex flex-col">
            <div className="text-large font-semibold p-4 border-b border-divider leading-none">
              Tags
            </div>

            <div className="flex flex-col border-b border-divider">
              <Textarea
                radius="none"
                minRows={40}
                maxRows={40}
                value={tags.join('\n')}
                onValueChange={value => setTags(value.split('\n'))}
                placeholder="Enter newline seperated tags here..."
              />
            </div>

            <div className="flex items-center gap-2 p-4">
              <Button radius="sm" variant="flat" className="ml-auto" onPress={modal.onClose}>
                Cancel
              </Button>

              <Button
                radius="sm"
                color="success"
                onPress={() => mutationSetTags.mutate()}
                isLoading={mutationSetTags.isPending}
              >
                <CheckIcon className="text-lg" /> Save
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  )
}

type TagsSelectProps = { options: string[]; values: string[]; onChange: (values: string[]) => void }

export function TagsSelect({ values, onChange, ...props }: TagsSelectProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500)

  const options = props.options.filter(it => it.includes(debouncedSearchQuery))

  return (
    <div className="flex flex-col rounded-small overflow-hidden">
      <div className="flex gap-4 p-2 items-center">
        <div className="text-small text-default-600">Tags</div>

        <Input
          type="search"
          radius="sm"
          placeholder="Search"
          startContent={<SearchIcon className="text-lg" />}
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
      </div>

      <div className="flex gap-3">
        <div className="h-80 w-1/2">
          {options.map(option => {
            const isSelected = values.includes(option)

            return (
              <button
                key={option}
                className="p-2 flex items-center w-full text-small rounded-small hover:bg-default-200"
                onClick={() => {
                  if (isSelected) onChange(values.filter(v => v !== option))
                  else onChange(values.concat(option))
                }}
              >
                {option} {isSelected && <CheckIcon className="text-lg ml-auto shrink-0" />}
              </button>
            )
          })}
        </div>

        <div className="flex h-80 w-1/2 overflow-auto">
          <div className="flex gap-2 p-2 self-start flex-wrap">
            {values.map(it => (
              <Chip
                key={it}
                radius="sm"
                variant="flat"
                onClose={() => onChange(values.filter(v => v !== it))}
              >
                {it}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

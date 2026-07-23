const input = document.getElementById('host')
const saveBtn = document.getElementById('save')

// Load saved value
chrome.storage.local.get('host', ({ host }) => {
  if (host) input.value = host
})

// Save value
saveBtn.addEventListener('click', () => {
  const host = input.value.trim()

  chrome.storage.local.set({ host }, () => {
    alert('Fubuki settings saved!')
  })
})

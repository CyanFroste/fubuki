// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendLinkToFubuki',
    title: 'Send link to Fubuki',
    contexts: ['link'],
  })

  chrome.contextMenus.create({
    id: 'sendPageLinkToFubuki',
    title: 'Send page link to Fubuki',
    contexts: ['page'],
  })

  chrome.contextMenus.create({
    id: 'sendPageDataToFubuki',
    title: 'Send page data to Fubuki',
    contexts: ['page'],
  })

  // chrome.storage.local.set({ host: 'launcher' })
  chrome.storage.local.set({ host: 'http://localhost:3200' })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'sendLinkToFubuki' || info.menuItemId === 'sendPageLinkToFubuki') {
    try {
      const { host } = await chrome.storage.local.get('host')
      if (!host) throw new Error('host not found (set your fubuki host in the extension popup)')

      const linkUrl = info.linkUrl ?? info.pageUrl

      sendBasicNotification('Fubuki Success', `successfully sent link: ${linkUrl}`)

      const res =
        host === 'launcher'
          ? await sendToLauncher('process-urls', [[linkUrl], true])
          : await sendToServer(host, 'process-urls', [[linkUrl], true])

      if (!res.ok) throw new Error((await res.text()) || res.statusText)

      const failed = await res.json()
      if (failed.length > 0) throw new Error(failed.join('\n'))
    } catch (err) {
      sendBasicNotification('Fubuki Error', `failed to send link: ${err?.message}`)
    }
  }
  //
  else if (info.menuItemId === 'sendPageDataToFubuki') {
    try {
      if (!tab?.id) throw new Error('tab not found')

      const { host } = await chrome.storage.local.get('host')
      if (!host) throw new Error('host not found (set your fubuki host in the extension popup)')

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractData,
      })

      const link = {
        url: tab.url,
        host: new URL(tab.url).host,
        title: result.title,
        thumbnail: result.thumbnail,
      }

      const domain = {
        host: new URL(tab.url).host,
        icon: result.icon ? new URL(result.icon, tab.url).href : null,
      }

      sendBasicNotification('Fubuki Success', 'successfully sent page data')

      let resAddLinks =
        host === 'launcher'
          ? await sendToLauncher('add-links', [link])
          : await sendToServer(host, 'add-links', [link])

      if (!resAddLinks.ok) throw new Error((await resAddLinks.text()) || resAddLinks.statusText)

      const resAddDomains =
        host === 'launcher'
          ? await sendToLauncher('add-domains', [domain])
          : await sendToServer(host, 'add-domains', [domain])

      // mostly not reporting UNIQUENESS errors
      // if (!resAddDomains.ok)
      //   throw new Error((await resAddDomains.text()) || resAddDomains.statusText)
    } catch (err) {
      sendBasicNotification('Fubuki Error', `failed to send page data: ${err?.message}`)
    }
  }
})

// this causes a new tab to open and not a fun ui experience tbh...
async function sendToLauncher(action, data) {
  const url = `fubuki://?action=${action}&data=${encodeURIComponent(JSON.stringify(data))}`
  const tab = await chrome.tabs.create({ url })

  setTimeout(() => chrome.tabs.remove(tab.id), 1000)
  return { ok: true }
}

async function sendToServer(host, action, data) {
  return await fetch(`${host}/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

function extractData() {
  const title = document.title
  const thumbnail = document.querySelector('meta[property="og:image"]')?.content || null
  const icon = document.querySelector('link[rel~="icon"]')?.href || null

  return { title, thumbnail, icon }
}

function sendBasicNotification(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message })
}

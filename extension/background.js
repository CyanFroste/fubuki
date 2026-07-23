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
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'sendLinkToFubuki' || info.menuItemId === 'sendPageLinkToFubuki') {
    try {
      const { host } = await chrome.storage.local.get('host')
      if (!host) throw new Error('host not found (set your fubuki host in the extension popup)')

      const linkUrl = info.linkUrl ?? info.pageUrl

      sendBasicNotification('Fubuki Success', `successfully sent link: ${linkUrl}`)

      const res = await fetch(`${host}/api/process-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([linkUrl]),
      })

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

      let resAddLinks = await fetch(`${host}/api/add-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([link]),
      })

      if (!resAddLinks.ok) throw new Error((await resAddLinks.text()) || resAddLinks.statusText)

      const resAddDomains = await fetch(`${host}/api/add-domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([domain]),
      })

      // mostly not reporting UNIQUENESS errors
      // if (!resAddDomains.ok)
      //   throw new Error((await resAddDomains.text()) || resAddDomains.statusText)
    } catch (err) {
      sendBasicNotification('Fubuki Error', `failed to page data: ${err?.message}`)
    }
  }
})

function extractData() {
  const title = document.title
  const thumbnail = document.querySelector('meta[property="og:image"]')?.content || null
  const icon = document.querySelector('link[rel~="icon"]')?.href || null

  return { title, thumbnail, icon }
}

function sendBasicNotification(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message })
}

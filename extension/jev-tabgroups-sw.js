// The Jev server marks a tab it owns with "#jev-group=<session>|<title>" on its first about:blank load,
// or a temporary document.title "jev-group:<session>|<title>" for tabs it adopts. Tab events wake this
// worker, so it needs no long-lived connection.
const MARK = /(?:#jev-group=|^jev-group:)([\w-]+)\|(.*)$/

async function group (tabId, session, title) {
  const key = `g:${session}`
  const stored = (await chrome.storage.session.get(key))[key]
  const tab = await chrome.tabs.get(tabId)
  if (stored !== undefined) {
    try {
      const existing = await chrome.tabGroups.get(stored)
      if (existing.windowId === tab.windowId) {
        if (tab.groupId !== stored) await chrome.tabs.group({ tabIds: [tabId], groupId: stored })
        return
      }
    } catch (_) { /* group was closed */ }
  }
  const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } })
  await chrome.tabGroups.update(groupId, { title, color: 'orange', collapsed: false })
  await chrome.storage.session.set({ [key]: groupId })
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  const source = decodeURIComponent(change.url || '') || change.title || ''
  const m = source.match(MARK)
  if (m) group(tabId, m[1], m[2]).catch(err => console.warn('jev group failed', err))
})

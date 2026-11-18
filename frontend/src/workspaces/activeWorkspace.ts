const STORAGE_PREFIX = 'teamsync.activeWorkspace.'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

export function workspaceIdFromPath(pathname: string) {
  const match = pathname.match(/^\/workspaces\/([^/]+)/)
  if (!match || match[1] === 'new') return null
  return match[1]
}

export function getStoredWorkspaceId(userId: string) {
  return window.sessionStorage.getItem(storageKey(userId))
}

export function setStoredWorkspaceId(userId: string, workspaceId: string) {
  window.sessionStorage.setItem(storageKey(userId), workspaceId)
}

export function clearStoredWorkspaceId(userId: string) {
  window.sessionStorage.removeItem(storageKey(userId))
}

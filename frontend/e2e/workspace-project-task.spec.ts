import { expect, test } from '@playwright/test'

test('a user registers, creates a workspace, project, task, and searches for it', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const unique = `${Date.now()}`
  const username = `e2e-user-${unique}`
  const workspaceName = `E2E workspace ${unique}`
  const projectName = `E2E project ${unique}`
  const taskTitle = `E2E task ${unique}`
  const password = `Violet!Harbor_47-${crypto.randomUUID()}`

  await page.goto('/register')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Email', { exact: true }).fill(`${username}@example.com`)
  await page.getByLabel('First name', { exact: true }).fill('E2E')
  await page.getByLabel('Last name', { exact: true }).fill('User')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/login\?registered=1$/)
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/profile$/)

  await page.goto('/workspaces/new')
  await page.getByLabel('Workspace name').fill(workspaceName)
  await page.getByLabel('Description').fill('Browser-driven acceptance test')
  await page.getByRole('button', { name: 'Create workspace' }).click()

  await expect(page.getByRole('heading', { name: workspaceName })).toBeVisible()
  const workspaceId = page.url().match(/\/workspaces\/([^/]+)/)?.[1]
  expect(workspaceId).toBeTruthy()
  await page.goto(`/workspaces/${workspaceId}/projects`)

  await page.getByRole('button', { name: 'New project' }).first().click()
  await page.getByRole('dialog', { name: 'Create a project' })
    .getByLabel('Project name')
    .fill(projectName)
  await page.getByRole('dialog', { name: 'Create a project' })
    .getByRole('button', { name: 'Create project' })
    .click()
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible()

  await page.getByRole('link', { name: 'Tasks', exact: true }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await page.getByRole('dialog', { name: 'Create task' })
    .getByLabel('Task title')
    .fill(taskTitle)
  await page.getByRole('dialog', { name: 'Create task' })
    .getByRole('button', { name: 'Create task', exact: true })
    .click()
  await expect(page).toHaveURL(/\/tasks\/[^/]+/)

  await page.goto('/search')
  await page.getByRole('searchbox', {
    name: 'Search projects, tasks, members, and comments',
  }).fill(taskTitle)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('link', { name: taskTitle })).toBeVisible()
  expect(pageErrors).toEqual([])
})

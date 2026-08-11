import { expect, test } from '@playwright/test';

/** Smoke E2E: tela de login e fluxo de registro → dashboard. */
test('tela de login renderiza', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Central de Mensageria').first()).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByLabel('Senha')).toBeVisible();
});

test('registro cria conta e leva ao dashboard', async ({ page }) => {
  const email = `e2e_${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar uma nova conta' }).click();
  await page.getByLabel('Empresa').fill('Empresa E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('a-strong-password');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Wise API Manager').first()).toBeVisible();
  // Navega para Templates e cria um template.
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('link', { name: 'Novo template' }).click();
  await page.getByLabel('Nome').fill('aviso_e2e');
  await page.getByLabel('Corpo (BODY)').fill('Olá {{1}}');
  await page.getByRole('button', { name: 'Criar template' }).click();
  await expect(page.getByText('Replicar para contas')).toBeVisible();
});

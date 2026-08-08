import { expect, test } from '@playwright/test';

/** E2E: cadastro de contato com normalização de telefone (não depende da Meta). */
test('cria contato e vê na lista com telefone normalizado', async ({ page }) => {
  const email = `e2e_c_${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar uma nova conta' }).click();
  await page.getByLabel('Empresa').fill('Empresa Contatos');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('a-strong-password');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Contatos' }).click();
  await page.getByLabel('Telefone').fill('(11) 99000-1234');
  await page.getByRole('button', { name: 'Adicionar' }).click();

  await expect(page.getByText('+5511990001234')).toBeVisible();
});

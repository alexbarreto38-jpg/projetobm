import { expect, test } from '@playwright/test';

/**
 * E2E de exportação/LGPD pelo painel (fluxos síncronos, sem worker):
 * download de contatos em CSV, exportação LGPD (JSON), purga de retenção e a
 * trava de confirmação da exclusão da organização.
 */
test('exporta contatos (CSV), exporta LGPD (JSON), purga e protege exclusão', async ({ page }) => {
  const email = `e2e_exp_${Date.now()}@example.com`;

  // Cadastro → dashboard
  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar uma nova conta' }).click();
  await page.getByLabel('Empresa').fill('Empresa Export');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('a-strong-password');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Cria um contato para ter conteúdo no CSV.
  await page.getByRole('link', { name: 'Contatos' }).click();
  await page.getByLabel('Telefone').fill('(11) 99000-4321');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('+5511990004321')).toBeVisible();

  // Baixa o CSV de contatos (attachment → download).
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar CSV' }).click(),
  ]);
  expect(csv.suggestedFilename()).toContain('contatos');

  // Configurações → exportação LGPD (JSON).
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page.getByText('Exportar dados (LGPD)')).toBeVisible();
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar exportação (JSON)' }).click(),
  ]);
  expect(json.suggestedFilename()).toContain('export');

  // Purga de retenção retorna mensagem de conclusão.
  await page.getByRole('button', { name: 'Purgar antigos' }).click();
  await expect(page.getByText(/Purga concluída/)).toBeVisible();

  // Trava de exclusão: slug errado NÃO exclui (continua em /settings).
  await page.locator('input[name="confirmSlug"]').fill('slug-errado');
  await page.getByRole('button', { name: 'Excluir tudo' }).click();
  // A trava barra no backend; permanecemos em /settings (não vai para /login).
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText('Exportar dados (LGPD)')).toBeVisible();
});

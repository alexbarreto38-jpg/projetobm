import { expect, test } from '@playwright/test';

/**
 * E2E do painel do assistente (spec §1, §2). Cadastra, abre /assistant e valida
 * que o chat renderiza. Como a stack de e2e não define ANTHROPIC_API_KEY, o
 * envio exercita o caminho de "assistente não habilitado" pelo BFF — o painel
 * nunca quebra e mostra a mensagem clara (a resposta do LLM em si é coberta
 * pelos testes unitários do orquestrador).
 */
test('painel do assistente renderiza e trata assistente não configurado', async ({ page }) => {
  const email = `e2e_assist_${Date.now()}@example.com`;

  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar uma nova conta' }).click();
  await page.getByLabel('Empresa').fill('Empresa Assistente');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('a-strong-password');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Navega para o assistente.
  await page.getByRole('link', { name: 'Assistente' }).click();
  await expect(page).toHaveURL(/\/assistant/);

  // Chat renderizado: boas-vindas, sugestões, composer e reiniciar.
  await expect(page.getByText(/Posso preparar e disparar campanhas/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Quais remetentes/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reiniciar' })).toBeVisible();
  const composer = page.getByPlaceholder(/Escreva sua mensagem/);
  await expect(composer).toBeVisible();

  // Envia uma mensagem: a bolha do usuário aparece e o BFF responde de forma
  // graciosa que o assistente não está habilitado nesta stack.
  await composer.fill('Quero fazer 2.000 envios hoje.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Quero fazer 2.000 envios hoje.')).toBeVisible();
  await expect(page.getByText(/não está habilitado/)).toBeVisible();
});

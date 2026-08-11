import { expect, test } from '@playwright/test';

/**
 * E2E de ponta a ponta pelo painel, contra a stack de desenvolvimento
 * (API + web + worker + Postgres + Redis + mock-meta). Exercita o caminho
 * completo do produto usando SOMENTE fluxos oficiais simulados pelo
 * MetaMockServer: cadastro → conexão de conta (descoberta de números) →
 * criação de template → criação de campanha → preflight de compliance.
 *
 * O envio real de mensagens é assíncrono (worker) e coberto pelo teste
 * determinístico `fullFlow.integration.test.ts`; aqui validamos que o painel
 * conduz o operador por todo o fluxo até o preflight.
 */
test('fluxo completo: conecta conta, cria template e campanha, vê preflight', async ({ page }) => {
  const email = `e2e_camp_${Date.now()}@example.com`;

  // 1) Cadastro → dashboard
  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar uma nova conta' }).click();
  await page.getByLabel('Empresa').fill('Empresa Campanha');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('a-strong-password');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 2) Conecta uma conta (WABA do mock) — descoberta de números é síncrona.
  await page.getByRole('link', { name: 'Meta' }).click();
  await page.getByLabel('WABA ID').fill('WABA_DEMO');
  await page.getByLabel('Access token').fill('SYSTEM_USER_TOKEN_DEMO');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  // A conta conectada aparece com seu identificador externo.
  await expect(page.getByText('WABA_DEMO').first()).toBeVisible();

  // 3) Cria um template.
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('link', { name: 'Novo template' }).click();
  await page.getByLabel('Nome').fill('campanha_e2e');
  await page.getByLabel('Corpo (BODY)').fill('Olá {{1}}, tudo bem?');
  await page.getByRole('button', { name: 'Criar template' }).click();
  await expect(page.getByText('Replicar para contas')).toBeVisible();

  // 4) Cria a campanha pelo assistente de 3 passos.
  await page.getByRole('link', { name: 'Campanhas' }).click();
  await page.getByRole('link', { name: 'Nova campanha' }).click();

  // Passo 1: nome + template (o primeiro já vem selecionado).
  await page.getByLabel('Nome da campanha').fill('Campanha E2E');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Passo 2: seleciona a conta conectada.
  await page.locator('input[name="accountIds"]').first().check();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Passo 3: revisão → cria.
  await expect(page.getByRole('heading', { name: 'Revisão' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar campanha' }).click();

  // 5) Página da campanha com o preflight de compliance renderizado.
  // O regex exclui "/new" para que o toHaveURL aguarde o redirect do server
  // action (a criação da campanha é assíncrona no submit).
  await expect(page).toHaveURL(/\/campaigns\/(?!new$)[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Preflight de compliance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Público' })).toBeVisible();
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testes de integração compartilham o mesmo banco/Redis e usam TRUNCATE;
    // serializamos os arquivos para um não apagar os dados do outro.
    fileParallelism: false,
  },
});

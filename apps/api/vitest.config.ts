import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes de integração compartilham o mesmo banco e usam TRUNCATE no
    // beforeEach; rodá-los em paralelo faria um arquivo apagar os dados do
    // outro. Serializamos os arquivos deste pacote.
    fileParallelism: false,
  },
});

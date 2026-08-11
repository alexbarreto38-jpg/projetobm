/**
 * Dicionário base (pt-BR) — fonte da verdade dos textos do painel.
 * Outros idiomas implementam `Dictionary` (= typeof ptBR), então o TypeScript
 * garante que nenhuma chave fique faltando ao adicionar uma tradução.
 */
export const ptBR = {
  app: {
    name: 'Wise API Manager',
    tagline: 'Central de Mensageria',
  },
  common: {
    save: 'Salvar',
    cancel: 'Cancelar',
    create: 'Criar',
    remove: 'Remover',
    edit: 'Editar',
    back: 'Voltar',
    next: 'Continuar',
    loading: 'Aguarde…',
    loadMore: 'Carregar mais',
    start: '← Início',
    nextPage: 'Próxima página →',
    empty: '—',
    active: 'Ativo',
  },
  nav: {
    dashboard: 'Dashboard',
    organizations: 'Empresas',
    meta: 'Meta',
    templates: 'Templates',
    campaigns: 'Campanhas',
    contacts: 'Contatos',
    reports: 'Relatórios',
    alerts: 'Alertas',
    deadLetters: 'Dead-letter',
    audit: 'Auditoria',
    settings: 'Configurações',
  },
  topbar: {
    context: 'Central de Mensageria',
    breadcrumb: 'Painel',
    logout: 'Sair',
    language: 'Idioma',
  },
  auth: {
    company: 'Empresa',
    companyPlaceholder: 'Minha Empresa',
    email: 'E-mail',
    password: 'Senha',
    signIn: 'Entrar',
    createAccount: 'Criar conta',
    toSignup: 'Criar uma nova conta',
    toLogin: 'Já tenho conta — entrar',
  },
  audit: {
    title: 'Auditoria',
    description: 'Registro de ações sensíveis (quem fez o quê e quando).',
    emptyTitle: 'Sem registros',
    emptyDescription: 'As ações sensíveis aparecerão aqui.',
    colAction: 'Ação',
    colUser: 'Usuário',
    colEntity: 'Entidade',
    colDate: 'Data',
  },
};

/**
 * Formato do dicionário: chaves fixas, valores string. Derivado do pt-BR (sem
 * `as const` de propósito, para que outros idiomas possam ter textos diferentes
 * nas mesmas chaves). O compilador cobra chaves faltantes/sobrando.
 */
export type Dictionary = typeof ptBR;

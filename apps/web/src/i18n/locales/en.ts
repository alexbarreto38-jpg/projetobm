import type { Dictionary } from './pt-BR';

/**
 * Tradução em inglês. Implementa `Dictionary`, então o compilador acusa
 * qualquer chave faltante em relação ao dicionário base (pt-BR).
 */
export const en: Dictionary = {
  app: {
    name: 'Wise API Manager',
    tagline: 'Messaging Hub',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    create: 'Create',
    remove: 'Remove',
    edit: 'Edit',
    back: 'Back',
    next: 'Continue',
    loading: 'Please wait…',
    loadMore: 'Load more',
    start: '← Start',
    nextPage: 'Next page →',
    empty: '—',
    active: 'Active',
  },
  nav: {
    dashboard: 'Dashboard',
    assistant: 'Assistant',
    organizations: 'Companies',
    meta: 'Meta',
    templates: 'Templates',
    campaigns: 'Campaigns',
    contacts: 'Contacts',
    reports: 'Reports',
    alerts: 'Alerts',
    deadLetters: 'Dead-letter',
    audit: 'Audit',
    settings: 'Settings',
  },
  topbar: {
    context: 'Messaging Hub',
    breadcrumb: 'Panel',
    logout: 'Sign out',
    language: 'Language',
  },
  auth: {
    company: 'Company',
    companyPlaceholder: 'My Company',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    createAccount: 'Create account',
    toSignup: 'Create a new account',
    toLogin: 'I already have an account — sign in',
  },
  audit: {
    title: 'Audit',
    description: 'Log of sensitive actions (who did what and when).',
    emptyTitle: 'No records',
    emptyDescription: 'Sensitive actions will show up here.',
    colAction: 'Action',
    colUser: 'User',
    colEntity: 'Entity',
    colDate: 'Date',
  },
};

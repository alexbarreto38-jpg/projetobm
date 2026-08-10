import * as React from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-wise-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-wise-border p-12 text-center">
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="mt-1 text-sm text-wise-muted">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-400">
      {message}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-wise-border', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-wise-border bg-wise-surface px-4 py-3 text-left font-medium text-wise-muted">
      {children}
    </th>
  );
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-wise-border/50 px-4 py-3">{children}</td>;
}

/** Paginação por cursor (avançar). `hasCursor` mostra o link de voltar ao início. */
export function Pagination({
  basePath,
  nextCursor,
  hasCursor,
}: {
  basePath: string;
  nextCursor?: string | null;
  hasCursor?: boolean;
}) {
  if (!nextCursor && !hasCursor) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {hasCursor ? (
        <a href={basePath} className="text-wise-muted hover:text-wise-text">
          ← Início
        </a>
      ) : (
        <span />
      )}
      {nextCursor ? (
        <a href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}`} className="text-wise-yellow hover:underline">
          Próxima página →
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

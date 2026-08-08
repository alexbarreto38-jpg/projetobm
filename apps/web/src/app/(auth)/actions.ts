'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, SESSION_COOKIE } from '@/lib/api';

/**
 * Login/registro via Server Action (BFF): o servidor Next chama a API, captura o
 * cookie de sessão HttpOnly e o reemite no domínio do painel. O token nunca
 * transita pelo JavaScript do navegador (spec §8, §46, §47).
 */
async function authenticate(
  endpoint: 'login' | 'signup',
  payload: Record<string, unknown>,
): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return body.error?.message ?? 'Falha na autenticação.';
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const value = session?.split(';')[0]?.split('=')[1];
  if (value) {
    cookies().set(SESSION_COOKIE, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return null;
}

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const error = await authenticate('login', {
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (error) return error;
  redirect('/dashboard');
}

export async function signupAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const error = await authenticate('signup', {
    email: formData.get('email'),
    password: formData.get('password'),
    organizationName: formData.get('organizationName'),
  });
  if (error) return error;
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect('/login');
}

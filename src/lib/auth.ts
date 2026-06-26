import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-super-secret-mcp-generator-key-2026'
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  if (!hashed) return false;
  return bcrypt.compare(password, hashed);
}

export interface SessionPayload {
  userId: number;
  email: string;
  name: string;
}

export async function createSession(userId: number, email: string, name: string): Promise<string> {
  // Generate a secure session token
  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 5); // 5-day session duration

  await db.user.update({
    where: { id: userId },
    data: {
      session_token: token,
      session_expires_at: expiresAt,
    },
  });

  // Create encrypted JWT containing userId, email, and sessionToken
  const jwt = await new jose.SignJWT({ userId, email, name, sessionToken: token })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5d')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set('auth_session', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return token;
}

export async function verifySession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_session')?.value;
    if (!token) return null;

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    const sessionPayload = payload as unknown as {
      userId: number;
      email: string;
      name: string;
      sessionToken: string;
    };

    // Validate token matches active database session token
    const user = await db.user.findUnique({
      where: { id: sessionPayload.userId },
    });

    if (!user || user.session_token !== sessionPayload.sessionToken) {
      return null;
    }

    if (user.session_expires_at && user.session_expires_at < new Date()) {
      // Expired
      await clearSession();
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name || '',
    };
  } catch (err) {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_session')?.value;
    
    if (token) {
      try {
        const { payload } = await jose.jwtVerify(token, JWT_SECRET);
        const userId = (payload as any).userId;
        if (userId) {
          await db.user.update({
            where: { id: userId },
            data: {
              session_token: null,
              session_expires_at: null,
            },
          });
        }
      } catch (e) {}
    }

    cookieStore.delete('auth_session');
  } catch (e) {}
}

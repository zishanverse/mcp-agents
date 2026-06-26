import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();

    if (!cleanEmail || !password) {
      return NextResponse.json({ error: 'Please enter both email and password.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !user.hashed_password) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const isMatch = await verifyPassword(password, user.hashed_password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    await createSession(user.id, user.email, user.name || '');

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

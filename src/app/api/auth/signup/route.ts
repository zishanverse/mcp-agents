import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, name, password, confirmPassword } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanName = name?.trim();

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
    }

    const hashed = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: cleanEmail,
        name: cleanName || cleanEmail.split('@')[0],
        hashed_password: hashed,
      },
    });

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

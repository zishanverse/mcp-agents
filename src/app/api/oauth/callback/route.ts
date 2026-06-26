import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import * as cc from '@/lib/composio';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  try {
    const session = await verifySession();
    if (!session) {
      // If unauthorized, redirect to login page
      return NextResponse.redirect(new URL('/login?error=unauthorized_callback', request.url));
    }

    const { searchParams } = requestUrl;
    const provider = searchParams.get('provider')?.trim().toLowerCase();
    const accountId = searchParams.get('account_id')?.trim() || searchParams.get('connected_account_id')?.trim();

    if (!provider || !accountId) {
      return NextResponse.redirect(new URL('/?connection_error=missing_parameters', request.url));
    }

    await cc.handleOauthCallback(session.userId, provider, accountId);

    // Redirect back to main page with success parameter
    return NextResponse.redirect(new URL(`/?connection_success=${provider}`, request.url));
  } catch (error: any) {
    console.error('[oauth_callback] Error handling callback:', error);
    return NextResponse.redirect(new URL(`/?connection_error=${encodeURIComponent(error.message || 'unknown_error')}`, request.url));
  }
}

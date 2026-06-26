import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import * as cc from '@/lib/composio';

export async function GET(request: Request) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider')?.trim();

    if (!provider) {
      return NextResponse.json({ error: 'Missing provider parameter.' }, { status: 400 });
    }

    // Build absolute callback URL targeting our handler endpoint
    const requestUrl = new URL(request.url);
    const redirectUrl = `${requestUrl.protocol}//${requestUrl.host}/api/oauth/callback?provider=${provider.toLowerCase()}`;

    const oauthUrl = await cc.getOauthUrl(session.userId, provider, redirectUrl);

    return NextResponse.json({ url: oauthUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

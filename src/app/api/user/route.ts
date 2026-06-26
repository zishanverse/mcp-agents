import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import * as cc from '@/lib/composio';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // 1. Get connection statuses
    const connections = await cc.getConnectionStatus(session.userId);

    // 2. Get Notion parent page ID config
    const notionConn = await db.oAuthConnection.findUnique({
      where: {
        uix_user_provider: {
          user_id: session.userId,
          provider: 'notion',
        },
      },
      select: { notion_parent_page_id: true },
    });
    const notionParentId = notionConn?.notion_parent_page_id || '';

    // 3. Get recent paths history
    const history = await db.learningPath.findMany({
      where: { user_id: session.userId },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
      },
      connections,
      notionParentId,
      history,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'save_notion_parent') {
      const { parentPageId } = body;
      
      // Clean and sanitize notion ID: extract 32-character hex string if URL is passed
      let cleanId = (parentPageId || '').trim();
      const uuidMatch = cleanId.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (uuidMatch) {
        cleanId = uuidMatch[1];
      } else {
        const hex32Match = cleanId.match(/([0-9a-f]{32})/i);
        if (hex32Match) {
          cleanId = hex32Match[1];
        }
      }

      await db.oAuthConnection.update({
        where: {
          uix_user_provider: {
            user_id: session.userId,
            provider: 'notion',
          },
        },
        data: {
          notion_parent_page_id: cleanId || null,
        },
      });

      return NextResponse.json({ success: true, parentPageId: cleanId });
    }

    if (action === 'disconnect') {
      const { provider } = body;
      if (!provider) {
        return NextResponse.json({ error: 'Missing provider.' }, { status: 400 });
      }

      await cc.disconnect(session.userId, provider);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

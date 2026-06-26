import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import * as cc from '@/lib/composio';
import { generate as generatePath } from '@/lib/planner';
import * as utils from '@/lib/utils';
import * as schemas from '@/lib/schemas';
import * as actions from '@/lib/actions';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  try {
    const { goal, modelName } = await request.json();
    if (!goal || !goal.trim()) {
      return NextResponse.json({ error: 'Please enter a goal.' }, { status: 400 });
    }

    const encoder = new TextEncoder();

    // Create a ReadableStream for Server-Sent Events (SSE) progress logs
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (msg: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ progress: msg })}\n\n`));
        };

        try {
          // Resolve connection status
          const connStatus = await cc.getConnectionStatus(session.userId);

          // 1. Generate path
          sendProgress(`🤖 Calling AI model with selected model...`);
          const learningPath = await generatePath(goal, modelName, sendProgress);

          // 2. Video validation
          let validIds: string[] = [];
          const rawIds = await utils.extractVideoIdsFromLearningPath(learningPath);
          
          if (connStatus.youtube) {
            sendProgress('📺 Extracting and validating YouTube video IDs…');
            if (rawIds.length > 0) {
              const [available, unavailable] = await utils.filterAvailableVideos(rawIds);
              validIds = available;
              if (unavailable.length > 0) {
                sendProgress(`⚠️ Filtered ${unavailable.length} unavailable video(s).`);
              }
            } else {
              sendProgress('ℹ️ No YouTube videos found in path.');
            }
          }

          // 3. Convert path to initial markdown
          sendProgress('📝 Converting generated path to markdown…');
          const initialMarkdown = schemas.learningPathToMarkdown(learningPath);

          // 4. Execute post-generation writes
          sendProgress('🔗 Running post-generation exports…');
          const actionResults = await actions.runPostGenerationActions(
            session.userId,
            goal,
            initialMarkdown,
            validIds,
            connStatus,
            sendProgress
          );

          // 5. Append exports links
          const playlistUrl = actionResults.playlist?.success ? actionResults.playlist.playlist_url : null;
          const docUrl = actionResults.google_doc?.success ? actionResults.google_doc.doc_url : null;
          const notionUrl = actionResults.notion_page?.success ? actionResults.notion_page.page_url : null;

          const finalMarkdown = schemas.learningPathToMarkdown(
            learningPath,
            playlistUrl,
            docUrl,
            notionUrl
          );

          // 6. Save path to database
          sendProgress('💾 Saving path to history database…');
          await db.learningPath.create({
            data: {
              user_id: session.userId,
              goal: goal,
              playlist_url: playlistUrl,
              google_doc_url: docUrl,
              notion_url: notionUrl,
              markdown: finalMarkdown,
            },
          });

          // Send final payload
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                success: true,
                markdown: finalMarkdown,
                playlistUrl,
                docUrl,
                notionUrl,
                actions: actionResults,
              })}\n\n`
            )
          );
        } catch (err: any) {
          console.error('[generate_route] Error in generation stream:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Generation failed' })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

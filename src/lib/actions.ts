import * as cc from './composio';
import { db } from './db';

// Extract playlist ID (starts with PL)
function extractPlaylistId(resp: any): string | null {
  const text = typeof resp === 'string' ? resp : JSON.stringify(resp);
  const match = text.match(/(PL[A-Za-z0-9_\-]{10,})/);
  return match ? match[1] : null;
}

// Extract Google Drive document ID
function extractDriveId(resp: any): string | null {
  const text = typeof resp === 'string' ? resp : JSON.stringify(resp);
  const match = text.match(/"id"\s*:\s*"([A-Za-z0-9_\-]{20,})"/);
  if (match) return match[1];
  
  // Alternative key lookup
  if (resp && typeof resp === 'object') {
    const data = resp.response || resp.data || resp;
    if (data && data.id) return data.id;
  }
  return null;
}

// Extract Notion page/block UUID
function extractNotionId(resp: any): string | null {
  const text = typeof resp === 'string' ? resp : JSON.stringify(resp);
  const match = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

function parseComposioResponse(resp: any, provider: string): [string | null, string | null] {
  if (!resp || typeof resp !== 'object') {
    return [null, `Invalid response format: ${JSON.stringify(resp)}`];
  }

  // Check top-level success field
  const successful = resp.successful !== undefined ? resp.successful : resp.success;
  if (successful === false) {
    return [null, resp.error || resp.message || `Action failed: ${JSON.stringify(resp)}`];
  }

  const data = resp.response || resp.data || resp;

  // Check for error strings in data payload
  let errorMsg: string | null = null;
  if (data && typeof data === 'object') {
    if (data.error) errorMsg = String(data.error);
    else if (data.message) errorMsg = String(data.message);
    else if (data.detail) errorMsg = String(data.detail);
  }

  let resourceId: string | null = null;
  if (data && typeof data === 'object' && data.id) {
    resourceId = data.id;
  }

  if (!resourceId && provider === 'youtube' && data && typeof data === 'object' && data.snippet) {
    resourceId = data.snippet.id;
  }

  // Fallback regex parsers
  if (!resourceId) {
    if (provider === 'youtube') resourceId = extractPlaylistId(resp);
    else if (provider === 'googledrive') resourceId = extractDriveId(resp);
    else if (provider === 'notion') resourceId = extractNotionId(resp);
  }

  if (errorMsg && !resourceId) {
    return [null, errorMsg];
  }

  if (!resourceId) {
    if (errorMsg) return [null, errorMsg];
    return [null, `No resource ID found in response: ${JSON.stringify(resp).substring(0, 300)}`];
  }

  return [resourceId, null];
}

export interface PlaylistResult {
  success: boolean;
  playlist_id: string | null;
  playlist_url: string | null;
  added: string[];
  failed: string[];
  error: string | null;
}

export async function createYoutubePlaylist(
  userId: number,
  videoIds: string[],
  title: string,
  description: string = 'Created by MCP Learning Path Generator'
): Promise<PlaylistResult> {
  const result: PlaylistResult = {
    success: false,
    playlist_id: null,
    playlist_url: null,
    added: [],
    failed: [],
    error: null,
  };

  // Step 1: Create the empty playlist
  try {
    const resp = await cc.executeTool(userId, 'youtube', 'YOUTUBE_CREATE_PLAYLIST', {
      title,
      description,
      privacyStatus: 'public',
    });

    const [playlistId, err] = parseComposioResponse(resp, 'youtube');
    if (err) {
      result.error = err;
      return result;
    }

    result.playlist_id = playlistId;
    result.playlist_url = `https://www.youtube.com/playlist?list=${playlistId}`;
  } catch (e: any) {
    result.error = e.message || String(e);
    return result;
  }

  // Step 2: Append video items to the playlist sequentially
  const playlistId = result.playlist_id!;
  for (const vid of videoIds) {
    try {
      await cc.executeTool(userId, 'youtube', 'YOUTUBE_ADD_VIDEO_TO_PLAYLIST', {
        playlistId: playlistId,
        videoId: vid,
      });
      result.added.push(vid);
    } catch (e) {
      result.failed.push(vid);
      console.error(`[actions] Failed to add video ${vid} to playlist ${playlistId}:`, e);
    }
  }

  result.success = true;
  return result;
}

export interface GoogleDocResult {
  success: boolean;
  doc_id: string | null;
  doc_url: string | null;
  error: string | null;
}

export async function createGoogleDoc(
  userId: number,
  title: string,
  markdownContent: string
): Promise<GoogleDocResult> {
  const result: GoogleDocResult = {
    success: false,
    doc_id: null,
    doc_url: null,
    error: null,
  };

  try {
    const resp = await cc.executeTool(userId, 'googledrive', 'GOOGLEDRIVE_CREATE_FILE_FROM_TEXT', {
      file_name: title,
      text_content: markdownContent,
      mimeType: 'application/vnd.google-apps.document',
    });

    const [docId, err] = parseComposioResponse(resp, 'googledrive');
    if (err) {
      result.error = err;
      return result;
    }

    result.doc_id = docId;
    result.doc_url = `https://docs.google.com/document/d/${docId}/edit`;
    result.success = true;
  } catch (e: any) {
    result.error = e.message || String(e);
  }

  return result;
}

export interface NotionPageResult {
  success: boolean;
  page_id: string | null;
  page_url: string | null;
  error: string | null;
}

export async function createNotionPage(
  userId: number,
  title: string,
  markdownContent: string,
  parentPageId?: string
): Promise<NotionPageResult> {
  const result: NotionPageResult = {
    success: false,
    page_id: null,
    page_url: null,
    error: null,
  };

  const createParams: Record<string, any> = {
    title,
  };

  let actualParentId = parentPageId;
  if (!actualParentId) {
    const conn = await db.oAuthConnection.findUnique({
      where: {
        uix_user_provider: {
          user_id: userId,
          provider: 'notion',
        },
      },
    });
    actualParentId = conn?.notion_parent_page_id || undefined;
  }

  if (!actualParentId) {
    result.error = 'Notion parent page ID is not set. Please configure it in the sidebar integrations panel.';
    return result;
  }

  createParams.parent_id = actualParentId;

  try {
    const resp = await cc.executeTool(userId, 'notion', 'NOTION_CREATE_NOTION_PAGE', createParams);
    const [pageId, err] = parseComposioResponse(resp, 'notion');
    if (err) {
      result.error = err;
      return result;
    }

    result.page_id = pageId;
    const cleanId = pageId!.replace(/-/g, '');
    result.page_url = `https://notion.so/${cleanId}`;

    // Step 2: Append page body using natural language Composio tool instructions
    try {
      await cc.executeTool(
        userId,
        'notion',
        'NOTION_ADD_MULTIPLE_PAGE_CONTENT',
        undefined,
        `Add the following markdown text as blocks to the page with ID ${pageId}:\n\n${markdownContent}`
      );
      result.success = true;
    } catch (appendErr: any) {
      result.success = true; // Still marked successful since page exists
      result.error = `Page created, but failed to write markdown body text blocks: ${appendErr.message || appendErr}`;
    }
  } catch (e: any) {
    result.error = e.message || String(e);
  }

  return result;
}

export interface PostGenerationResults {
  playlist: PlaylistResult | null;
  google_doc: GoogleDocResult | null;
  notion_page: NotionPageResult | null;
}

export async function runPostGenerationActions(
  userId: number,
  goal: string,
  markdown: string,
  videoIds: string[],
  connectionStatus: Record<string, boolean>,
  progressCallback?: (msg: string) => void
): Promise<PostGenerationResults> {
  const results: PostGenerationResults = {
    playlist: null,
    google_doc: null,
    notion_page: null,
  };

  const title = `${goal} — Learning Path`;
  const progress = (msg: string) => {
    if (progressCallback) progressCallback(msg);
  };

  if (connectionStatus.youtube && videoIds.length > 0) {
    progress('Creating YouTube playlist…');
    results.playlist = await createYoutubePlaylist(userId, videoIds, title);
  }

  if (connectionStatus.googledrive) {
    progress('Creating Google Doc…');
    results.google_doc = await createGoogleDoc(userId, title, markdown);
  }

  if (connectionStatus.notion) {
    progress('Creating Notion page…');
    results.notion_page = await createNotionPage(userId, title, markdown);
  }

  return results;
}

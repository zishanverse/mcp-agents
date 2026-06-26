import { db } from './db';

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1';

const PROVIDER_INTEGRATION_ENV: Record<string, string> = {
  youtube: 'COMPOSIO_YOUTUBE_INTEGRATION_ID',
  googledrive: 'COMPOSIO_DRIVE_INTEGRATION_ID',
  notion: 'COMPOSIO_NOTION_INTEGRATION_ID',
};

function getApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) {
    throw new Error('COMPOSIO_API_KEY is not set in the environment.');
  }
  return key;
}

function getIntegrationId(provider: string): string | null {
  const envVar = PROVIDER_INTEGRATION_ENV[provider.toLowerCase()];
  if (!envVar) return null;
  return process.env[envVar]?.trim() || null;
}

export async function getOauthUrl(
  userId: number,
  provider: string,
  redirectUrl?: string
): Promise<string> {
  const prov = provider.toLowerCase();
  const authConfigId = getIntegrationId(prov);
  if (!authConfigId) {
    throw new Error(`Missing auth config ID for provider '${provider}'. Set ${PROVIDER_INTEGRATION_ENV[prov]} in environment.`);
  }

  const payload: Record<string, any> = {
    auth_config_id: authConfigId,
    user_id: `user_${userId}`,
  };
  if (redirectUrl) {
    payload.callback_url = redirectUrl;
  }

  const response = await fetch(`${COMPOSIO_API_BASE}/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'x-api-key': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to initiate Composio OAuth: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const oauthUrl = data.redirect_url || data.redirectUrl || data.authorizationUrl || data.url;
  if (!oauthUrl) {
    throw new Error(`Composio returned no OAuth URL: ${JSON.stringify(data)}`);
  }

  return oauthUrl;
}

export async function handleOauthCallback(
  userId: number,
  provider: string,
  connectedAccountId: string
): Promise<void> {
  const prov = provider.toLowerCase();
  if (!PROVIDER_INTEGRATION_ENV[prov]) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  // Save the connection in the database
  await db.oAuthConnection.upsert({
    where: {
      uix_user_provider: {
        user_id: userId,
        provider: prov,
      },
    },
    update: {
      connected_account_id: connectedAccountId,
      created_at: new Date(),
    },
    create: {
      user_id: userId,
      provider: prov,
      connected_account_id: connectedAccountId,
    },
  });
}

export async function getConnectionStatus(userId: number): Promise<Record<string, boolean>> {
  const connections = await db.oAuthConnection.findMany({
    where: { user_id: userId },
    select: { provider: true },
  });

  const providers = ['youtube', 'googledrive', 'notion'];
  const connectedSet = new Set(connections.map((c) => c.provider));

  const result: Record<string, boolean> = {};
  for (const p of providers) {
    result[p] = connectedSet.has(p);
  }
  return result;
}

export async function disconnect(userId: number, provider: string): Promise<void> {
  await db.oAuthConnection.deleteMany({
    where: {
      user_id: userId,
      provider: provider.toLowerCase(),
    },
  });
}

async function resolveConnectedAccountId(userId: number, provider: string): Promise<string> {
  const conn = await db.oAuthConnection.findUnique({
    where: {
      uix_user_provider: {
        user_id: userId,
        provider: provider.toLowerCase(),
      },
    },
  });

  if (!conn) {
    throw new Error(`User does not have connected ${provider} account. Please connect first.`);
  }

  return conn.connected_account_id;
}

export async function executeTool(
  userId: number,
  provider: string,
  action: string,
  params?: Record<string, any>,
  textInstruction?: string
): Promise<any> {
  const connectedAccountId = await resolveConnectedAccountId(userId, provider);
  const actionName = action.trim();
  const requestUrl = `${COMPOSIO_API_BASE}/tools/execute/${actionName}`;

  const requestBody: Record<string, any> = {
    connected_account_id: connectedAccountId,
    user_id: `user_${userId}`,
  };

  if (textInstruction) {
    requestBody.text = textInstruction;
  } else {
    requestBody.arguments = params || {};
  }

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'x-api-key': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      // Token expired or revoked on Composio's end
      await disconnect(userId, provider);
      throw new Error(`OAuth token for ${provider} has expired or been revoked. Please reconnect in the sidebar.`);
    }
    throw new Error(`Composio tool execution failed: HTTP ${response.status} - ${errorBody}`);
  }

  return response.json();
}

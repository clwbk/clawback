/**
 * Google Drive read-only context service.
 *
 * Provides file listing, search, and content retrieval for
 * worker knowledge/context systems. Strictly read-only.
 */

import type { ConnectionService } from "../service.js";
import { DriveSetupError } from "./drive-credentials-validator.js";
import type { DriveConfig, DriveFileContent, DriveFileEntry, DriveSearchResult } from "./types.js";

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

type DriveContextServiceOptions = {
  connectionService: ConnectionService;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DriveContextService {
  constructor(private readonly options: DriveContextServiceOptions) {}

  /**
   * List files accessible to the connected Drive account.
   * Supports optional folder scoping and pagination.
   */
  async listFiles(
    workspaceId: string,
    connectionId: string,
    opts?: {
      folderId?: string;
      pageSize?: number;
      pageToken?: string;
    },
  ): Promise<DriveSearchResult> {
    const accessToken = await this.getAccessToken(workspaceId, connectionId);

    const params = new URLSearchParams({
      fields: "files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken",
      pageSize: String(opts?.pageSize ?? 20),
      orderBy: "modifiedTime desc",
    });

    let query = "trashed = false";
    if (opts?.folderId) {
      query += ` and '${opts.folderId}' in parents`;
    }
    params.set("q", query);

    if (opts?.pageToken) {
      params.set("pageToken", opts.pageToken);
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const json = (await response.json().catch(() => ({}))) as {
      files?: Array<{
        id?: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
        size?: string;
        webViewLink?: string;
      }>;
      nextPageToken?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new DriveSetupError(
        "drive_list_failed",
        json.error?.message ?? "Failed to list Drive files.",
        502,
      );
    }

    const files: DriveFileEntry[] = (json.files ?? [])
      .filter((f): f is Required<Pick<typeof f, "id" | "name" | "mimeType" | "modifiedTime">> & typeof f =>
        Boolean(f.id && f.name && f.mimeType && f.modifiedTime),
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
      }));

    return {
      files,
      nextPageToken: json.nextPageToken,
    };
  }

  /**
   * Search files by name or content query.
   */
  async searchFiles(
    workspaceId: string,
    connectionId: string,
    query: string,
    opts?: {
      pageSize?: number;
      pageToken?: string;
    },
  ): Promise<DriveSearchResult> {
    const accessToken = await this.getAccessToken(workspaceId, connectionId);

    const escapedQuery = query.replace(/'/g, "\\'");

    const params = new URLSearchParams({
      fields: "files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken",
      pageSize: String(opts?.pageSize ?? 20),
      q: `fullText contains '${escapedQuery}' and trashed = false`,
      orderBy: "modifiedTime desc",
    });

    if (opts?.pageToken) {
      params.set("pageToken", opts.pageToken);
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const json = (await response.json().catch(() => ({}))) as {
      files?: Array<{
        id?: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
        size?: string;
        webViewLink?: string;
      }>;
      nextPageToken?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new DriveSetupError(
        "drive_search_failed",
        json.error?.message ?? "Failed to search Drive files.",
        502,
      );
    }

    const files: DriveFileEntry[] = (json.files ?? [])
      .filter((f): f is Required<Pick<typeof f, "id" | "name" | "mimeType" | "modifiedTime">> & typeof f =>
        Boolean(f.id && f.name && f.mimeType && f.modifiedTime),
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
      }));

    return {
      files,
      nextPageToken: json.nextPageToken,
    };
  }

  /**
   * Retrieve text content of a file.
   *
   * For Google Docs/Sheets/Slides, exports as plain text.
   * For other text-based files, downloads directly.
   */
  async getFileContent(
    workspaceId: string,
    connectionId: string,
    fileId: string,
  ): Promise<DriveFileContent> {
    const accessToken = await this.getAccessToken(workspaceId, connectionId);

    // First get file metadata
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );

    const metaJson = (await metaResponse.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      mimeType?: string;
      error?: { message?: string };
    };

    if (!metaResponse.ok || !metaJson.id || !metaJson.name || !metaJson.mimeType) {
      throw new DriveSetupError(
        "drive_file_meta_failed",
        metaJson.error?.message ?? "Failed to retrieve file metadata.",
        502,
      );
    }

    const content = await this.downloadContent(accessToken, fileId, metaJson.mimeType);

    return {
      id: metaJson.id,
      name: metaJson.name,
      mimeType: metaJson.mimeType,
      content,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async getAccessToken(workspaceId: string, connectionId: string): Promise<string> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    if (connection.provider !== "drive" || connection.accessMode !== "read_only") {
      throw new DriveSetupError("invalid_connection", "Only Drive read-only connections are supported.", 400);
    }

    const config = normalizeConfig(connection.configJson);
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      throw new DriveSetupError("not_configured", "Drive connection is not configured.", 400);
    }

    // Exchange refresh token for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const tokenJson = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new DriveSetupError(
        "token_exchange_failed",
        tokenJson.error_description ?? tokenJson.error ?? "Failed to obtain Drive access token.",
        502,
      );
    }

    return tokenJson.access_token;
  }

  private async downloadContent(accessToken: string, fileId: string, mimeType: string): Promise<string> {
    // Google Workspace documents need to be exported
    const exportMimeMap: Record<string, string> = {
      "application/vnd.google-apps.document": "text/plain",
      "application/vnd.google-apps.spreadsheet": "text/csv",
      "application/vnd.google-apps.presentation": "text/plain",
    };

    const exportMime = exportMimeMap[mimeType];

    let url: string;
    if (exportMime) {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
    } else {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new DriveSetupError(
        "drive_content_failed",
        errorJson.error?.message ?? "Failed to retrieve file content.",
        502,
      );
    }

    return response.text();
  }
}

// ---------------------------------------------------------------------------
// Config normalization (shared with setup service)
// ---------------------------------------------------------------------------

function normalizeConfig(rawConfig: unknown): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
} {
  const config = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as Record<string, unknown>;
  return {
    clientId: typeof config.clientId === "string" ? config.clientId : "",
    clientSecret: typeof config.clientSecret === "string" ? config.clientSecret : "",
    refreshToken: typeof config.refreshToken === "string" ? config.refreshToken : "",
  };
}

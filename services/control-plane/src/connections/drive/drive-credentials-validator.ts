/**
 * Google Drive credential validation.
 *
 * Follows the same pattern as GoogleGmailCredentialsValidator:
 * exchange refresh token for access token, then call the Drive API
 * to verify access.
 */

export type DriveCredentialValidationResult = {
  emailAddress: string;
};

export interface DriveCredentialsValidator {
  validateReadOnly(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<DriveCredentialValidationResult>;
}

export class GoogleDriveCredentialsValidator implements DriveCredentialsValidator {
  async validateReadOnly(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<DriveCredentialValidationResult> {
    // Exchange refresh token for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
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
        tokenJson.error_description ?? tokenJson.error ?? "Google token exchange failed.",
        502,
      );
    }

    // Verify Drive API access by fetching the about resource
    const aboutResponse = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
      {
        headers: {
          authorization: `Bearer ${tokenJson.access_token}`,
        },
      },
    );

    const aboutJson = (await aboutResponse.json().catch(() => ({}))) as {
      user?: { emailAddress?: string; displayName?: string };
      error?: { message?: string };
    };

    if (!aboutResponse.ok || !aboutJson.user?.emailAddress) {
      throw new DriveSetupError(
        "drive_about_failed",
        aboutJson.error?.message ?? "Google accepted the token, but Drive API validation failed.",
        502,
      );
    }

    return {
      emailAddress: aboutJson.user.emailAddress,
    };
  }
}

export class DriveSetupError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

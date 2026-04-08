import { buildPublicDocsVersion } from "@/docs/public-docs-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const version = await buildPublicDocsVersion();
    return Response.json(version);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build public docs version.",
      },
      { status: 500 },
    );
  }
}

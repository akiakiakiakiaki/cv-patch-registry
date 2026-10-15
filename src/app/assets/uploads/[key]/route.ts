import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  UPLOAD_HEADERS,
  contentTypeForKey,
  isValidUploadKey,
  uploadFilePath,
} from "@/lib/storage/upload-files";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { key } = await params;
  if (!isValidUploadKey(key)) return new NextResponse(null, { status: 404 });

  try {
    const bytes = await readFile(uploadFilePath(key));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...UPLOAD_HEADERS,
        "Content-Type": contentTypeForKey(key),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

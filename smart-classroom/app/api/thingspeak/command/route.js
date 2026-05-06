import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const mode = Number(body.mode ?? 0);
  const auto = body.auto ? 1 : 0;
  const emergency = body.emergency ? 1 : 0;

  const writeKey = process.env.TS_COMMAND_WRITE_KEY;
  if (!writeKey) {
    return NextResponse.json(
      { error: "Missing TS_COMMAND_WRITE_KEY" },
      { status: 500 }
    );
  }

  const url = new URL("https://api.thingspeak.com/update");
  url.searchParams.set("api_key", writeKey);
  url.searchParams.set("field1", String(mode));
  url.searchParams.set("field2", String(auto));
  url.searchParams.set("field3", String(emergency));

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const text = await res.text();
  return NextResponse.json({
    ok: res.ok,
    thingSpeakResponse: text.trim(),
  });
}
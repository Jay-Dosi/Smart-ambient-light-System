import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const writeKey = process.env.TS_COMMAND_WRITE_KEY;
  if (!writeKey) {
    return NextResponse.json(
      { error: "Missing TS_COMMAND_WRITE_KEY" },
      { status: 500 }
    );
  }

  const url = new URL("https://api.thingspeak.com/update");
  url.searchParams.set("api_key", writeKey);
  
  if (body.mode !== undefined) {
    url.searchParams.set("field1", String(Number(body.mode)));
  }
  if (body.auto !== undefined) {
    url.searchParams.set("field2", body.auto ? "1" : "0");
  }
  if (body.emergency !== undefined) {
    url.searchParams.set("field3", body.emergency ? "1" : "0");
  }
  if (body.brightness !== undefined) {
    url.searchParams.set("field4", String(Number(body.brightness)));
  }

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
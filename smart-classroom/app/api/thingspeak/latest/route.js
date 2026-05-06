import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const channelId = process.env.TS_TELEMETRY_CHANNEL_ID;
  const readKey = process.env.TS_TELEMETRY_READ_KEY;

  if (!channelId) {
    return NextResponse.json(
      { error: "Missing TS_TELEMETRY_CHANNEL_ID" },
      { status: 500 }
    );
  }

  const url = new URL(`https://api.thingspeak.com/channels/${channelId}/feeds.json`);
  url.searchParams.set("results", "20");
  if (readKey) url.searchParams.set("api_key", readKey);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to read ThingSpeak telemetry" },
      { status: 502 }
    );
  }

  const data = await res.json();
  const feeds = Array.isArray(data.feeds) ? data.feeds : [];

  const latest = feeds.length > 0 ? feeds[feeds.length - 1] : null;

  return NextResponse.json({
    channel: data.channel ?? null,
    latest,
    feeds,
  });
}
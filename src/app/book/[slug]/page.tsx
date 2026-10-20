import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminDb, type ProService } from "@/lib/pro-sessions/core";
import BookingClient from "./booking-client";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<ProService | null> {
  const db = adminDb();
  if (!db) return null;
  const { data } = await db.from("pro_services").select("slug, title, tagline, description, duration_min, price_inr, popular").eq("slug", slug).eq("active", true).maybeSingle();
  return (data as ProService | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await load((await params).slug);
  return { title: s ? `${s.title} | StaffAnchor Pro Sessions` : "Pro Sessions | StaffAnchor", description: s?.tagline ?? undefined, robots: { index: false } };
}

// Public booking page (no login): pick a time, pay, get a calendar invite.
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const service = await load((await params).slug);
  if (!service) notFound();
  return (
    <Suspense fallback={null}>
      <BookingClient service={service} />
    </Suspense>
  );
}

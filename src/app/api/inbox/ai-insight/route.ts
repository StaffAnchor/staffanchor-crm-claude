import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateInboxInsight } from "@/lib/inbox-ai-insight";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = await req.json();
  const { taskType, title, detail, priority, candidateName, mandateRoleTitle, mandateClientName } = body ?? {};
  if (!taskType || !title) {
    return NextResponse.json({ error: "taskType and title are required" }, { status: 400 });
  }

  const result = await generateInboxInsight({
    taskType,
    title,
    detail: detail ?? null,
    priority: priority ?? "normal",
    candidateName: candidateName ?? null,
    mandateRoleTitle: mandateRoleTitle ?? null,
    mandateClientName: mandateClientName ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ insight: result.insight });
}

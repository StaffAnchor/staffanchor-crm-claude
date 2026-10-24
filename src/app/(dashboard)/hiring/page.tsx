import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadBoard, loadOpenRoles } from "@/lib/hiring-board";
import Board from "./board";
import Picker from "./picker";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// Several open roles side by side: pick the roles you are hiring for, see who fits which, and put people forward in one go.
export default async function HiringPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const picked = (sp.m ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 6);

  if (picked.length === 0) {
    const roles = await loadOpenRoles(supabase);
    return (
      <div className="mx-auto max-w-[900px] px-5 py-8">
        <h1 className="ros-page-title">Hiring board</h1>
        <p className="mt-1 text-[14px] text-slate-500">Tick the roles you are hiring for right now (up to 6). You will see who fits which, and can put people forward for several roles at once.</p>
        <Picker roles={roles} />
      </div>
    );
  }

  const board = await loadBoard(supabase, picked);
  return (
    <div className="mx-auto max-w-[1500px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="ros-page-title">Hiring board</h1>
          <p className="text-[13px] text-slate-500">
            {board.roles.length} roles · {board.candidates.length} people the matcher likes. Best fit first.
          </p>
        </div>
        <Link href="/hiring" className="text-[13px] font-medium text-teal-700 underline dark:text-teal-300">
          Change roles
        </Link>
      </div>
      <Board roles={board.roles} candidates={board.candidates} />
    </div>
  );
}

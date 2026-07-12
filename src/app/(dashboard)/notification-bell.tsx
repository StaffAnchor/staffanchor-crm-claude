"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Bell icon + dropdown covering: client proposes/confirms an interview time,
// client shortlist feedback (interested/not interested), new employer
// inquiry submitted, and mandate/inquiry assigned to you -- all inserted
// server-side (see notify_mandate_stakeholders / notify_admins_new_inquiry /
// assign_mandate_staff / assign_inquiry_owner RPCs) so this component just
// reads and marks-read under RLS (each user only ever sees their own rows).
export default function NotificationBell() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data ?? []) as Notification[]);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open) await load();
  }

  async function handleClick(n: Notification) {
    if (!n.read_at) {
      setNotifications((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    setNotifications((cur) => cur.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    if (!userIdRef.current) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userIdRef.current)
      .is("read_at", null);
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="ros-focusable relative text-slate-400 hover:text-white transition-colors"
        title="Notifications"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 animate-fade-in z-40"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Notifications</p>
            {unreadCount > 0 && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={markAllRead}
                className="text-[11px] text-blue-600 hover:text-blue-500"
              >
                Mark all read
              </button>
            )}
          </div>
          {!loaded ? (
            <p className="px-3 py-6 text-center text-[12px] text-slate-400">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-slate-400">Nothing yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleClick(n)}
                className={`block w-full text-left px-3 py-2.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  !n.read_at ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                }`}
              >
                <div className="flex items-start gap-1.5">
                  {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{n.body}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

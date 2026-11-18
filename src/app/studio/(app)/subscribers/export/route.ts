import { currentUser } from "@/lib/auth";
import { exportSubscribersCsv } from "@/lib/subscribers";

export async function GET() {
  if (!(await currentUser())) return new Response("Not found", { status: 404 });
  const csv = await exportSubscribersCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="the-dash-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

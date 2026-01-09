import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const businessesSnap = await adminFirestore
      .collection("businesses")
      .where("active", "==", true)
      .get();

    const businesses = await Promise.all(
      businessesSnap.docs.map(async (biz) => {
        const data = biz.data() as { name?: string; slug?: string };
        const locationsSnap = await biz.ref.collection("locations").where("active", "==", true).get();
        const locations = locationsSnap.docs.map((loc) => {
          const locData = loc.data() as { name?: string; slug?: string };
          return {
            id: loc.id,
            name: locData.name ?? loc.id,
            slug: locData.slug ?? loc.id,
          };
        });
        return {
          id: biz.id,
          name: data.name ?? biz.id,
          slug: data.slug ?? biz.id,
          locations,
        };
      }),
    );

    return NextResponse.json({ businesses });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load admin entities." },
      { status: 500 },
    );
  }
}

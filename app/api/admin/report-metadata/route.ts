import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const [businessesSnap, causesSnap, dealsSnap] = await Promise.all([
      adminFirestore.collection("businesses").get(),
      adminFirestore.collection("causes").get(),
      adminFirestore.collection("deals").get(),
    ]);

    const businesses = await Promise.all(
      businessesSnap.docs.map(async (doc) => {
        const data = doc.data() as { name?: string; slug?: string; active?: boolean };
        const locationsSnap = await doc.ref.collection("locations").get();
        const locations = locationsSnap.docs.map((loc) => {
          const locData = loc.data() as { name?: string; slug?: string; active?: boolean };
          return {
            id: loc.id,
            name: locData.name ?? loc.id,
            slug: locData.slug ?? loc.id,
            active: locData.active ?? true,
          };
        });
        return {
          id: doc.id,
          name: data.name ?? doc.id,
          slug: data.slug ?? doc.id,
          active: data.active ?? true,
          locations,
        };
      }),
    );

    const causes = causesSnap.docs.map((doc) => {
      const data = doc.data() as { title?: string; active?: boolean };
      return {
        id: doc.id,
        title: data.title ?? doc.id,
        active: data.active ?? true,
      };
    });

    const deals = dealsSnap.docs.map((doc) => {
      const data = doc.data() as { title?: string; businessId?: string; active?: boolean };
      return {
        id: doc.id,
        title: data.title ?? doc.id,
        businessId: data.businessId ?? null,
        active: data.active ?? true,
      };
    });

    return NextResponse.json({ businesses, causes, deals });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load report metadata." }, { status: 500 });
  }
}

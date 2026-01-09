"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function AdminCharitiesRedirect() {
  useEffect(() => {
    redirect("/admin/causes");
  }, []);
  return null;
}

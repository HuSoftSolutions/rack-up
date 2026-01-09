"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function AdminQrRedirect() {
  useEffect(() => {
    redirect("/admin/causes");
  }, []);
  return null;
}

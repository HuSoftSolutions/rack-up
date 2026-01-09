"use client";

import React from "react";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { usePathname } from "next/navigation";

export default function BusinessHomePage() {
  const pathname = usePathname();
  const businessId = pathname.split("/")[2];

  return (
    <div className="space-y-4">
      <div>
        <Heading level={1} className="text-xl font-semibold tracking-tight text-white">
          Overview
        </Heading>
        <Text className="mt-2 text-zinc-300">
          Welcome to the business console. Track donations, manage causes, and redeem rewards.
        </Text>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Button
          href={`/biz/${businessId}/redeem`}
          plain
          className="h-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-white hover:border-emerald-300/60 hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Redeem rewards</div>
          <div className="mt-1 text-xs text-zinc-300">
            Enter or scan reward codes and mark them used in real time.
          </div>
        </Button>
        <Button
          href={`/biz/${businessId}/donations`}
          plain
          className="h-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-white hover:border-emerald-300/60 hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Donations</div>
          <div className="mt-1 text-xs text-zinc-300">
            Review recent donations for your locations and causes.
          </div>
        </Button>
      </div>
    </div>
  );
}

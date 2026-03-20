"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/ui-kit/button";
import { Input } from "@/ui-kit/input";
import { Select } from "@/ui-kit/select";

type BusinessMeta = {
  id: string;
  name: string;
  active: boolean;
  locations: { id: string; name: string; active: boolean }[];
};

type CauseMeta = { id: string; title: string; active: boolean };
type DealMeta = { id: string; title: string; businessId: string | null; active: boolean };
type ScanEventMeta = { id: string; title: string; active: boolean };

type ReportResponse = {
  id?: string;
  name?: string | null;
  tags?: string[] | null;
  meta: {
    startDate: string;
    endDate: string;
    limit: number;
    filters: Record<string, unknown>;
  };
  summary: {
    donations: { count: number; totalCents: number };
    transactions: { count: number; pointsDelta: number };
    rewards: { issued: number; used: number };
    scanEvents?: { claims: number; pointsAwarded: number; giveawayEntriesAwarded: number };
    users: { count: number; admins: number; business: number };
  };
  datasets: {
    donations: { rows: DonationRow[]; truncated: boolean };
    transactions: { rows: TransactionRow[]; truncated: boolean };
    rewards: { rows: RewardRow[]; truncated: boolean };
    scanEventClaims?: { rows: ScanEventClaimRow[]; truncated: boolean };
    causes: { rows: CauseRow[]; truncated: boolean };
    deals: { rows: DealRow[]; truncated: boolean };
    businesses: { rows: BusinessRow[]; truncated: boolean };
    locations: { rows: LocationRow[]; truncated: boolean };
    users: { rows: UserRow[]; truncated: boolean };
  };
  warnings?: string[];
};

type ReportHistoryItem = {
  id: string;
  createdAt: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  name?: string | null;
  tags?: string[] | null;
  meta: ReportResponse["meta"] | null;
  summary: ReportResponse["summary"] | null;
  warnings?: string[] | null;
};

type ClientErrorSummaryItem = {
  message: string;
  count: number;
  chunkLikeCount: number;
  kinds: string[];
  names: string[];
  lastSeenAt: string | null;
  samplePaths: Array<{ path: string; count: number }>;
};

type ClientErrorSummary = {
  window: { days: number; since: string };
  scannedLogs: number;
  uniqueMessages: number;
  chunkLikeTotal: number;
  topMessages: ClientErrorSummaryItem[];
};

type DonationRow = {
  id: string;
  createdAt: string | null;
  status: string | null;
  amountCents: number | null;
  points: number | null;
  businessId: string | null;
  businessName: string | null;
  locationId: string | null;
  locationSlug: string | null;
  causeId: string | null;
  causeTitle: string | null;
  charityId: string | null;
  userId: string | null;
  scanSource: string | null;
  qrTarget: string | null;
  qrLocationId: string | null;
  giveawayEntries: number | null;
  donorName: string | null;
  donorEmail: string | null;
  donorPhone: string | null;
  stripe: Record<string, unknown> | null;
};

type TransactionRow = {
  id: string;
  createdAt: string | null;
  status: string | null;
  type: string | null;
  pointsDelta: number | null;
  amountCents: number | null;
  businessId: string | null;
  locationId: string | null;
  userId: string | null;
  dealId: string | null;
  causeId: string | null;
  stripePaymentIntentId: string | null;
  scanSource: string | null;
  scanEventId: string | null;
  qrTarget: string | null;
  qrLocationId: string | null;
  giveawayEntries: number | null;
};

type RewardRow = {
  id: string;
  issuedAt: string | null;
  usedAt: string | null;
  status: string | null;
  code: string | null;
  businessId: string | null;
  dealId: string | null;
  userId: string | null;
  redeemLocationId: string | null;
  redeemLocationName: string | null;
};

type ScanEventClaimRow = {
  id: string;
  createdAt: string | null;
  scanEventId: string | null;
  userId: string | null;
  claimCount: number;
  pointsAwarded: number;
  giveawayEntriesAwarded: number;
  giveawayAwardCount: number;
  giveawayTargetMode: string | null;
  giveawayIds: string[];
};

type CauseRow = { id: string; title: string; active: boolean; createdAt: string | null };
type DealRow = { id: string; title: string; active: boolean; businessId: string | null; pointCost: number | null; createdAt: string | null };
type BusinessRow = { id: string; name: string; active: boolean; createdAt: string | null };
type LocationRow = { businessId: string; locationId: string; name: string; active: boolean };
type UserRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  businessAdmin: { businessId: string | null; role: string | null; locationIds: string[] } | null;
};

function formatMoney(cents?: number | null) {
  if (typeof cents !== "number") return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DONATION_STATUS = ["completed", "pending", "failed"] as const;
const TRANSACTION_STATUS = ["completed", "pending", "failed"] as const;
const TRANSACTION_TYPES = [
  "donation",
  "redemption",
  "adjustment",
  "scan_event",
  "referral_invite",
  "referral_signup",
] as const;
const REWARD_STATUS = ["issued", "used", "expired"] as const;
const SCAN_SOURCES = ["in_person", "remote", "scan_event"] as const;

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [metadata, setMetadata] = useState<{
    businesses: BusinessMeta[];
    causes: CauseMeta[];
    deals: DealMeta[];
    scanEvents: ScanEventMeta[];
  }>({
    businesses: [],
    causes: [],
    deals: [],
    scanEvents: [],
  });
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [clientErrorSummary, setClientErrorSummary] = useState<ClientErrorSummary | null>(null);
  const [clientErrorLoading, setClientErrorLoading] = useState(false);
  const [clientErrorError, setClientErrorError] = useState<string | null>(null);
  const [clientErrorDays, setClientErrorDays] = useState(7);
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");

  const now = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(toInputDate(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30)));
  const [endDate, setEndDate] = useState(toInputDate(now));
  const [businessId, setBusinessId] = useState("");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [causeIds, setCauseIds] = useState<string[]>([]);
  const [dealIds, setDealIds] = useState<string[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [donationStatus, setDonationStatus] = useState<string[]>([]);
  const [transactionStatus, setTransactionStatus] = useState<string[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [rewardStatus, setRewardStatus] = useState<string[]>([]);
  const [scanSources, setScanSources] = useState<string[]>([]);
  const [scanEventIds, setScanEventIds] = useState<string[]>([]);
  const [limit, setLimit] = useState(1000);
  const [reportName, setReportName] = useState("");
  const [reportTags, setReportTags] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");

  const selectedBusiness = useMemo(
    () => metadata.businesses.find((biz) => biz.id === businessId) ?? null,
    [businessId, metadata.businesses],
  );

  const locationOptions = selectedBusiness?.locations ?? [];

  const loadMetadata = useCallback(async () => {
    if (!user) return;
    setMetaLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/report-metadata", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as {
        businesses?: BusinessMeta[];
        causes?: CauseMeta[];
        deals?: DealMeta[];
        scanEvents?: ScanEventMeta[];
        error?: string;
      };
      if (!res.ok || !json.businesses || !json.causes || !json.deals || !json.scanEvents) {
        throw new Error(json.error ?? "Failed to load report metadata.");
      }
      setMetadata({
        businesses: json.businesses,
        causes: json.causes,
        deals: json.deals,
        scanEvents: json.scanEvents,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report metadata.");
    } finally {
      setMetaLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/reports?limit=25", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { reports?: ReportHistoryItem[]; error?: string };
      if (!res.ok || !json.reports) {
        throw new Error(json.error ?? "Failed to load report history.");
      }
      setHistory(json.reports);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load report history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  const loadClientErrorSummary = useCallback(async () => {
    if (!user) return;
    setClientErrorLoading(true);
    setClientErrorError(null);
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams();
      params.set("days", String(clientErrorDays));
      params.set("scanLimit", "4000");
      params.set("top", "20");
      const res = await fetch(`/api/admin/client-errors/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as ClientErrorSummary & { error?: string };
      if (!res.ok || !Array.isArray(json.topMessages)) {
        throw new Error(json.error ?? "Failed to load client error summary.");
      }
      setClientErrorSummary(json);
    } catch (err) {
      setClientErrorError(err instanceof Error ? err.message : "Failed to load client error summary.");
    } finally {
      setClientErrorLoading(false);
    }
  }, [clientErrorDays, user]);

  useEffect(() => {
    void loadClientErrorSummary();
  }, [loadClientErrorSummary]);

  const runReport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams();
      params.set("start", startDate);
      params.set("end", endDate);
      params.set("limit", String(limit));
      if (businessId) params.set("businessId", businessId);
      if (locationIds.length > 0) params.set("locationIds", locationIds.join(","));
      if (causeIds.length > 0) params.set("causeIds", causeIds.join(","));
      if (dealIds.length > 0) params.set("dealIds", dealIds.join(","));
      if (userFilter.trim()) {
        if (userFilter.includes("@")) params.set("email", userFilter.trim());
        else params.set("userId", userFilter.trim());
      }
      if (donationStatus.length > 0) params.set("donationStatus", donationStatus.join(","));
      if (transactionStatus.length > 0) params.set("transactionStatus", transactionStatus.join(","));
      if (transactionTypes.length > 0) params.set("transactionTypes", transactionTypes.join(","));
      if (rewardStatus.length > 0) params.set("rewardStatus", rewardStatus.join(","));
      if (scanSources.length > 0) params.set("scanSource", scanSources.join(","));
      if (scanEventIds.length > 0) params.set("scanEventIds", scanEventIds.join(","));

      const res = await fetch(`/api/admin/reports?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reportName.trim() || undefined,
          tags: reportTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as ReportResponse & { error?: string };
      if (!res.ok || !json.datasets) {
        throw new Error(json.error ?? "Failed to load report.");
      }
      setReport(json);
      setActiveTab("generate");
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [
    user,
    startDate,
    endDate,
    limit,
    businessId,
    locationIds,
    causeIds,
    dealIds,
    userFilter,
    donationStatus,
    transactionStatus,
    transactionTypes,
    rewardStatus,
    scanSources,
    scanEventIds,
    reportName,
    reportTags,
    loadHistory,
  ]);

  function toggleInList(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function applyHeaderStyle(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { vertical: "middle", horizontal: "left" };
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F2937" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
  }

  function applyRowBorders(row: ExcelJS.Row) {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }

  function buildStyledSheet<T extends Record<string, unknown>>(
    workbook: ExcelJS.Workbook,
    title: string,
    rows: T[],
    columns: Array<{ key: string; label: string; width?: number; type?: "currency" | "date" | "number" | "text" }>,
    summary?: Array<[string, string | number]>,
  ) {
    const sheet = workbook.addWorksheet(title);
    sheet.properties.defaultRowHeight = 18;
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    if (summary && summary.length > 0) {
      sheet.addRow([`${title} Summary`]);
      const summaryTitle = sheet.getRow(1);
      summaryTitle.font = { bold: true, size: 13 };
      summaryTitle.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEEF2FF" },
      };
      sheet.mergeCells(1, 1, 1, columns.length);
      summary.forEach((item, idx) => {
        const row = sheet.addRow([item[0], item[1]]);
        row.font = { size: 10 };
        row.getCell(1).font = { bold: true };
        applyRowBorders(row);
        if (idx % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          });
        }
      });
      sheet.addRow([]);
    }

    const headerRow = sheet.addRow(columns.map((col) => col.label));
    applyHeaderStyle(headerRow);

    rows.forEach((rowData, index) => {
      const rowValues = columns.map((col) => rowData[col.key] ?? "");
      const row = sheet.addRow(rowValues);
      row.font = { size: 10 };
      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
      }
      applyRowBorders(row);
    });

    columns.forEach((col, idx) => {
      const column = sheet.getColumn(idx + 1);
      column.width = col.width ?? Math.max(12, Math.min(30, col.label.length + 6));
      if (col.type === "currency") {
        column.numFmt = '"$"#,##0.00';
      } else if (col.type === "date") {
        column.numFmt = "yyyy-mm-dd";
      } else if (col.type === "number") {
        column.numFmt = "#,##0";
      }
    });

    return sheet;
  }

  async function downloadXlsx() {
    if (!report) return;
    const scanSummary = report.summary.scanEvents ?? {
      claims: 0,
      pointsAwarded: 0,
      giveawayEntriesAwarded: 0,
    };
    const scanClaimsDataset = report.datasets.scanEventClaims ?? { rows: [], truncated: false };
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rack Up Admin";
    wb.created = new Date();

    const summarySheet = wb.addWorksheet("Summary");
    summarySheet.addRow(["Rack Up Admin Report"]);
    summarySheet.mergeCells(1, 1, 1, 2);
    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { vertical: "middle" };

    summarySheet.addRow(["Generated At", new Date().toISOString()]);
    summarySheet.addRow(["Report Start", report.meta.startDate]);
    summarySheet.addRow(["Report End", report.meta.endDate]);
    summarySheet.addRow(["Limit Per Dataset", report.meta.limit]);
    summarySheet.addRow([]);
    summarySheet.addRow(["Summary Metric", "Value"]);
    applyHeaderStyle(summarySheet.getRow(7));
    summarySheet.addRow(["Support Count", report.summary.donations.count]);
    summarySheet.addRow(["Support Total Cents", report.summary.donations.totalCents]);
    summarySheet.addRow(["Transactions Count", report.summary.transactions.count]);
    summarySheet.addRow(["Transactions Points Delta", report.summary.transactions.pointsDelta]);
    summarySheet.addRow(["Rewards Issued", report.summary.rewards.issued]);
    summarySheet.addRow(["Rewards Used", report.summary.rewards.used]);
    summarySheet.addRow(["Scan Event Claims", scanSummary.claims]);
    summarySheet.addRow(["Scan Event Points Awarded", scanSummary.pointsAwarded]);
    summarySheet.addRow(["Scan Event Giveaway Entries", scanSummary.giveawayEntriesAwarded]);
    summarySheet.addRow(["Users Count", report.summary.users.count]);
    summarySheet.addRow(["Users Admins", report.summary.users.admins]);
    summarySheet.addRow(["Users Business", report.summary.users.business]);
    summarySheet.columns = [{ width: 28 }, { width: 36 }];

    buildStyledSheet(
      wb,
      "Support",
      report.datasets.donations.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Support ID", width: 28 },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
        { key: "status", label: "Status", width: 12 },
        { key: "amountCents", label: "Amount (Cents)", width: 16, type: "number" },
        { key: "points", label: "Points", width: 10, type: "number" },
        { key: "scanSource", label: "Scan Source", width: 12 },
        { key: "scanEventId", label: "Scan Event ID", width: 20 },
        { key: "qrTarget", label: "QR Target", width: 14 },
        { key: "qrLocationId", label: "QR Location", width: 16 },
        { key: "giveawayEntries", label: "Community Drawing Entries", width: 16, type: "number" },
        { key: "businessId", label: "Business ID", width: 18 },
        { key: "businessName", label: "Business Name", width: 22 },
        { key: "locationId", label: "Location ID", width: 16 },
        { key: "locationSlug", label: "Location Slug", width: 16 },
        { key: "causeId", label: "Cause ID", width: 18 },
        { key: "causeTitle", label: "Cause Title", width: 24 },
        { key: "charityId", label: "Charity ID", width: 18 },
        { key: "userId", label: "User ID", width: 22 },
        { key: "donorName", label: "Supporter Name", width: 18 },
        { key: "donorEmail", label: "Supporter Email", width: 22 },
        { key: "donorPhone", label: "Supporter Phone", width: 16 },
      ],
      [
        ["Rows", report.datasets.donations.rows.length],
        ["Truncated", report.datasets.donations.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Transactions",
      report.datasets.transactions.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Transaction ID", width: 28 },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
        { key: "status", label: "Status", width: 12 },
        { key: "type", label: "Type", width: 12 },
        { key: "pointsDelta", label: "Points Delta", width: 14, type: "number" },
        { key: "amountCents", label: "Amount (Cents)", width: 16, type: "number" },
        { key: "scanSource", label: "Scan Source", width: 12 },
        { key: "qrTarget", label: "QR Target", width: 14 },
        { key: "qrLocationId", label: "QR Location", width: 16 },
        { key: "giveawayEntries", label: "Community Drawing Entries", width: 16, type: "number" },
        { key: "businessId", label: "Business ID", width: 18 },
        { key: "locationId", label: "Location ID", width: 16 },
        { key: "userId", label: "User ID", width: 22 },
        { key: "dealId", label: "Deal ID", width: 22 },
        { key: "causeId", label: "Cause ID", width: 18 },
        { key: "stripePaymentIntentId", label: "Stripe Payment Intent ID", width: 28 },
      ],
      [
        ["Rows", report.datasets.transactions.rows.length],
        ["Truncated", report.datasets.transactions.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Rewards",
      report.datasets.rewards.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Reward Issue ID", width: 28 },
        { key: "issuedAt", label: "Issued At", width: 16, type: "date" },
        { key: "usedAt", label: "Used At", width: 16, type: "date" },
        { key: "status", label: "Status", width: 12 },
        { key: "code", label: "Code", width: 14 },
        { key: "businessId", label: "Business ID", width: 18 },
        { key: "dealId", label: "Deal ID", width: 22 },
        { key: "userId", label: "User ID", width: 22 },
        { key: "redeemLocationId", label: "Redeem Location ID", width: 18 },
        { key: "redeemLocationName", label: "Redeem Location Name", width: 22 },
      ],
      [
        ["Rows", report.datasets.rewards.rows.length],
        ["Truncated", report.datasets.rewards.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Scan Event Claims",
      scanClaimsDataset.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Claim Event ID", width: 28 },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
        { key: "scanEventId", label: "Scan Event ID", width: 24 },
        { key: "userId", label: "User ID", width: 22 },
        { key: "claimCount", label: "Claim Count", width: 12, type: "number" },
        { key: "pointsAwarded", label: "Points Awarded", width: 14, type: "number" },
        { key: "giveawayEntriesAwarded", label: "Giveaway Entries", width: 16, type: "number" },
        { key: "giveawayAwardCount", label: "Giveaways Awarded", width: 16, type: "number" },
        { key: "giveawayTargetMode", label: "Giveaway Target Mode", width: 18 },
      ],
      [
        ["Rows", scanClaimsDataset.rows.length],
        ["Truncated", scanClaimsDataset.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Users",
      report.datasets.users.rows as Record<string, unknown>[],
      [
        { key: "uid", label: "User ID", width: 24 },
        { key: "email", label: "Email", width: 26 },
        { key: "displayName", label: "Display Name", width: 18 },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
        { key: "isAdmin", label: "Is Admin", width: 10 },
        { key: "businessAdmin", label: "Business Access", width: 24 },
      ],
      [
        ["Rows", report.datasets.users.rows.length],
        ["Truncated", report.datasets.users.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Businesses",
      report.datasets.businesses.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Business ID", width: 20 },
        { key: "name", label: "Business Name", width: 24 },
        { key: "active", label: "Active", width: 10 },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
      ],
      [
        ["Rows", report.datasets.businesses.rows.length],
        ["Truncated", report.datasets.businesses.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Locations",
      report.datasets.locations.rows as Record<string, unknown>[],
      [
        { key: "businessId", label: "Business ID", width: 20 },
        { key: "locationId", label: "Location ID", width: 18 },
        { key: "name", label: "Location Name", width: 22 },
        { key: "active", label: "Active", width: 10 },
      ],
      [
        ["Rows", report.datasets.locations.rows.length],
        ["Truncated", report.datasets.locations.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Causes",
      report.datasets.causes.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Cause ID", width: 20 },
        { key: "title", label: "Cause Title", width: 24 },
        { key: "active", label: "Active", width: 10 },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
      ],
      [
        ["Rows", report.datasets.causes.rows.length],
        ["Truncated", report.datasets.causes.truncated ? "Yes" : "No"],
      ],
    );

    buildStyledSheet(
      wb,
      "Deals",
      report.datasets.deals.rows as Record<string, unknown>[],
      [
        { key: "id", label: "Deal ID", width: 20 },
        { key: "title", label: "Deal Title", width: 26 },
        { key: "businessId", label: "Business ID", width: 20 },
        { key: "active", label: "Active", width: 10 },
        { key: "pointCost", label: "Point Cost", width: 12, type: "number" },
        { key: "createdAt", label: "Created At", width: 16, type: "date" },
      ],
      [
        ["Rows", report.datasets.deals.rows.length],
        ["Truncated", report.datasets.deals.truncated ? "Yes" : "No"],
      ],
    );

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rackup-report-${startDate}-to-${endDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reports</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Data-first reporting across support, points, rewards, causes, and user access.
          </p>
        </div>
        <div className="flex gap-2">
          <Button outline onClick={runReport} disabled={loading || metaLoading}>
            {loading ? "Running…" : "Generate report"}
          </Button>
          <Button onClick={downloadXlsx} disabled={!report}>
            Download XLSX
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {report?.warnings?.length ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {report.warnings.join(" ")}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Client Runtime Errors</div>
            <div className="text-xs text-zinc-400">
              Aggregated from <code>client_error_logs</code> to identify top crash/freeze signatures.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={clientErrorDays}
              onChange={(event) => setClientErrorDays(Number(event.target.value))}
              className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-emerald-400"
            >
              <option value={1}>Last 24h</option>
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <Button outline onClick={loadClientErrorSummary} disabled={clientErrorLoading}>
              {clientErrorLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {clientErrorError ? (
          <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {clientErrorError}
          </div>
        ) : null}

        {clientErrorSummary ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                scanned: {clientErrorSummary.scannedLogs}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                unique messages: {clientErrorSummary.uniqueMessages}
              </span>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200">
                chunk-like logs: {clientErrorSummary.chunkLikeTotal}
              </span>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="border-b border-white/10 bg-white/5 text-left uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Count</th>
                    <th className="px-3 py-2">Last Seen</th>
                    <th className="px-3 py-2">Kinds</th>
                    <th className="px-3 py-2">Message</th>
                    <th className="px-3 py-2">Paths</th>
                  </tr>
                </thead>
                <tbody>
                  {clientErrorSummary.topMessages.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-zinc-400" colSpan={5}>
                        No client errors in selected window.
                      </td>
                    </tr>
                  ) : (
                    clientErrorSummary.topMessages.map((row) => (
                      <tr key={`${row.message}:${row.lastSeenAt ?? "none"}`} className="border-t border-white/10">
                        <td className="px-3 py-2 text-zinc-200">
                          <div className="font-semibold text-white">{row.count}</div>
                          {row.chunkLikeCount > 0 ? (
                            <div className="text-[10px] text-amber-300">chunk-like: {row.chunkLikeCount}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {row.kinds.length > 0 ? row.kinds.join(", ") : "—"}
                        </td>
                        <td className="max-w-[480px] px-3 py-2 text-zinc-200">
                          <div className="line-clamp-3 break-words">{row.message}</div>
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {row.samplePaths.length > 0 ? row.samplePaths.map((item) => item.path).join(", ") : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              { id: "generate", label: "Generate report" },
              { id: "history", label: "History" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "history") void loadHistory();
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeTab === tab.id
                  ? "border-emerald-300 bg-emerald-300 text-emerald-950"
                  : "border-white/15 bg-white/5 text-white hover:border-white/25"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "history" ? (
          <div className="space-y-3">
            {historyError ? (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {historyError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Input
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                placeholder="Filter by name, tag, or creator"
              />
              <Button outline onClick={loadHistory} disabled={historyLoading}>
                Refresh
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead className="border-b border-white/10 bg-white/5 text-left uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Name / Tags</th>
                    <th className="px-3 py-2">Range</th>
                    <th className="px-3 py-2">Filters</th>
                    <th className="px-3 py-2">Summary</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td className="px-3 py-3 text-zinc-400" colSpan={6}>
                        Loading history…
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-zinc-400" colSpan={6}>
                        No reports generated yet.
                      </td>
                    </tr>
                  ) : (
                    history
                      .filter((item) => {
                        if (!historyFilter.trim()) return true;
                        const query = historyFilter.trim().toLowerCase();
                        const name = (item.name ?? "").toLowerCase();
                        const tags = Array.isArray(item.tags) ? item.tags.join(",").toLowerCase() : "";
                        const creator = (item.createdByEmail ?? item.createdBy ?? "").toLowerCase();
                        return name.includes(query) || tags.includes(query) || creator.includes(query);
                      })
                      .map((item) => (
                        <tr key={item.id} className="border-t border-white/10">
                          <td className="px-3 py-2 text-zinc-200">
                            {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                            <div className="text-[10px] text-zinc-500">
                              {item.createdByEmail ?? item.createdBy ?? "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-zinc-300">
                            <div className="font-semibold text-white">{item.name ?? "Untitled"}</div>
                            {Array.isArray(item.tags) && item.tags.length > 0 ? (
                              <div className="text-[10px] text-zinc-500">{item.tags.join(", ")}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-zinc-300">
                            {item.meta?.startDate?.slice(0, 10) ?? "—"} →{" "}
                            {item.meta?.endDate?.slice(0, 10) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {item.meta?.filters?.businessId
                              ? `Business: ${item.meta.filters.businessId as string}`
                              : "All businesses"}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {item.summary
                              ? `${item.summary.donations.count} support · ${item.summary.transactions.count} tx`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              outline
                              onClick={async () => {
                                if (!user) return;
                                setLoading(true);
                                setError(null);
                                try {
                                  const idToken = await user.getIdToken();
                                  const res = await fetch(`/api/admin/reports/${item.id}`, {
                                    headers: { Authorization: `Bearer ${idToken}` },
                                  });
                                  const json = (await res.json()) as ReportResponse & { error?: string };
                                  if (!res.ok || !json.datasets) {
                                    throw new Error(json.error ?? "Failed to load report.");
                                  }
                                  setReport(json);
                                  setActiveTab("generate");
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Failed to load report.");
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              View
                            </Button>
                            <Button
                              outline
                              onClick={async () => {
                                if (!user) return;
                                if (!window.confirm("Delete this report? This cannot be undone.")) return;
                                try {
                                  const idToken = await user.getIdToken();
                                  const res = await fetch(`/api/admin/reports/${item.id}`, {
                                    method: "DELETE",
                                    headers: { Authorization: `Bearer ${idToken}` },
                                  });
                                  const json = (await res.json()) as { ok?: boolean; error?: string };
                                  if (!res.ok || !json.ok) {
                                    throw new Error(json.error ?? "Failed to delete report.");
                                  }
                                  await loadHistory();
                                } catch (err) {
                                  setHistoryError(err instanceof Error ? err.message : "Failed to delete report.");
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {activeTab === "generate" ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Report name
            </label>
            <Input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. Q4 Support Audit"
            />
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Tags (comma-separated)
            </label>
            <Input
              value={reportTags}
              onChange={(e) => setReportTags(e.target.value)}
              placeholder="finance, audit, stripe"
            />
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Date range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Business
            </label>
            <Select
              value={businessId}
              onChange={(event) => {
                setBusinessId(event.target.value);
                setLocationIds([]);
              }}
            >
              <option value="">All businesses</option>
              {metadata.businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </Select>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Locations
            </label>
            {locationOptions.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                {businessId ? "No locations found for this business." : "Select a business to filter locations."}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {locationOptions.map((loc) => {
                  const checked = locationIds.includes(loc.id);
                  return (
                    <label
                      key={loc.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                        checked
                          ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                          : "border-white/15 bg-white/5 text-white hover:border-white/25"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => setLocationIds(toggleInList(locationIds, loc.id))}
                      />
                      {loc.name}
                    </label>
                  );
                })}
              </div>
            )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-4">
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Causes
            </label>
            <div className="flex flex-wrap gap-2">
              {metadata.causes.map((cause) => {
                const checked = causeIds.includes(cause.id);
                return (
                  <label
                    key={cause.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setCauseIds(toggleInList(causeIds, cause.id))}
                    />
                    {cause.title}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Deals
            </label>
            <div className="flex flex-wrap gap-2">
              {metadata.deals.map((deal) => {
                const checked = dealIds.includes(deal.id);
                return (
                  <label
                    key={deal.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setDealIds(toggleInList(dealIds, deal.id))}
                    />
                    {deal.title}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              User (ID or email)
            </label>
            <Input
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="uid or email"
            />
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Support status
            </label>
            <div className="flex flex-wrap gap-2">
              {DONATION_STATUS.map((status) => {
                const checked = donationStatus.includes(status);
                return (
                  <label
                    key={status}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setDonationStatus(toggleInList(donationStatus, status))}
                    />
                    {status}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Transaction status
            </label>
            <div className="flex flex-wrap gap-2">
              {TRANSACTION_STATUS.map((status) => {
                const checked = transactionStatus.includes(status);
                return (
                  <label
                    key={status}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setTransactionStatus(toggleInList(transactionStatus, status))}
                    />
                    {status}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Transaction types
            </label>
            <div className="flex flex-wrap gap-2">
              {TRANSACTION_TYPES.map((type) => {
                const checked = transactionTypes.includes(type);
                return (
                  <label
                    key={type}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setTransactionTypes(toggleInList(transactionTypes, type))}
                    />
                    {type}
                  </label>
                );
              })}
            </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Scan source
            </label>
            <div className="flex flex-wrap gap-2">
              {SCAN_SOURCES.map((source) => {
                const checked = scanSources.includes(source);
                return (
                  <label
                    key={source}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setScanSources(toggleInList(scanSources, source))}
                    />
                    {source.replace("_", " ")}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Scan events
            </label>
            <div className="flex flex-wrap gap-2">
              {metadata.scanEvents.map((event) => {
                const checked = scanEventIds.includes(event.id);
                return (
                  <label
                    key={event.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setScanEventIds(toggleInList(scanEventIds, event.id))}
                    />
                    {event.title}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Reward status
            </label>
            <div className="flex flex-wrap gap-2">
              {REWARD_STATUS.map((status) => {
                const checked = rewardStatus.includes(status);
                return (
                  <label
                    key={status}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                        : "border-white/15 bg-white/5 text-white hover:border-white/25"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => setRewardStatus(toggleInList(rewardStatus, status))}
                    />
                    {status}
                  </label>
                );
              })}
            </div>
              </div>
              <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Max rows per dataset
            </label>
            <Input
              type="number"
              value={limit}
              min={100}
              max={5000}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {report ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Support</div>
            <div className="mt-1 text-2xl font-bold text-white">{report.summary.donations.count}</div>
            <div className="text-xs text-zinc-500">{formatMoney(report.summary.donations.totalCents)} total</div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Transactions</div>
            <div className="mt-1 text-2xl font-bold text-white">{report.summary.transactions.count}</div>
            <div className="text-xs text-zinc-500">{report.summary.transactions.pointsDelta} points delta</div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rewards</div>
            <div className="mt-1 text-2xl font-bold text-white">
              {report.summary.rewards.issued} issued / {report.summary.rewards.used} used
            </div>
            <div className="text-xs text-zinc-500">Issued vs redeemed</div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Users</div>
            <div className="mt-1 text-2xl font-bold text-white">{report.summary.users.count}</div>
            <div className="text-xs text-zinc-500">
              {report.summary.users.admins} admins · {report.summary.users.business} business
            </div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Scan Events</div>
            <div className="mt-1 text-2xl font-bold text-white">{report.summary.scanEvents?.claims ?? 0}</div>
            <div className="text-xs text-zinc-500">
              {report.summary.scanEvents?.pointsAwarded ?? 0} pts · {report.summary.scanEvents?.giveawayEntriesAwarded ?? 0} entries
            </div>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="space-y-6">
          <ReportSection
            title="Support"
            description="Stripe and recorded support within the selected date range."
            rows={report.datasets.donations.rows}
            truncated={report.datasets.donations.truncated}
            columns={[
              { key: "createdAt", label: "Created", render: (row: DonationRow) => formatDate(row.createdAt) },
              { key: "amountCents", label: "Amount", render: (row: DonationRow) => formatMoney(row.amountCents) },
              { key: "status", label: "Status" },
              { key: "scanSource", label: "Scan source" },
              { key: "scanEventId", label: "Scan event" },
              { key: "qrTarget", label: "QR target" },
              { key: "giveawayEntries", label: "Entries" },
              { key: "businessName", label: "Business" },
              { key: "locationId", label: "Location" },
              { key: "causeTitle", label: "Cause" },
              { key: "userId", label: "User" },
              { key: "stripe", label: "Stripe", render: (row: DonationRow) => (row.stripe ? "Yes" : "—") },
            ]}
          />

          <ReportSection
            title="Transactions"
            description="Ledger entries for points awarded and redeemed."
            rows={report.datasets.transactions.rows}
            truncated={report.datasets.transactions.truncated}
            columns={[
              { key: "createdAt", label: "Created", render: (row: TransactionRow) => formatDate(row.createdAt) },
              { key: "type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "pointsDelta", label: "Points" },
              { key: "amountCents", label: "Amount", render: (row: TransactionRow) => formatMoney(row.amountCents) },
              { key: "scanSource", label: "Scan source" },
              { key: "qrTarget", label: "QR target" },
              { key: "giveawayEntries", label: "Entries" },
              { key: "businessId", label: "Business" },
              { key: "locationId", label: "Location" },
              { key: "userId", label: "User" },
            ]}
          />

          <ReportSection
            title="Rewards"
            description="Issued and redeemed rewards with location attribution."
            rows={report.datasets.rewards.rows}
            truncated={report.datasets.rewards.truncated}
            columns={[
              { key: "issuedAt", label: "Issued", render: (row: RewardRow) => formatDate(row.issuedAt) },
              { key: "status", label: "Status" },
              { key: "code", label: "Code" },
              { key: "businessId", label: "Business" },
              { key: "dealId", label: "Deal" },
              { key: "redeemLocationName", label: "Location" },
              { key: "userId", label: "User" },
            ]}
          />

          <ReportSection
            title="Scan Event Claims"
            description="Successful scan claims captured from public QR scans."
            rows={report.datasets.scanEventClaims?.rows ?? []}
            truncated={report.datasets.scanEventClaims?.truncated ?? false}
            columns={[
              { key: "createdAt", label: "Created", render: (row: ScanEventClaimRow) => formatDate(row.createdAt) },
              { key: "scanEventId", label: "Scan event" },
              { key: "userId", label: "User" },
              { key: "claimCount", label: "Claim #" },
              { key: "pointsAwarded", label: "Points" },
              { key: "giveawayEntriesAwarded", label: "Entries" },
              { key: "giveawayAwardCount", label: "Giveaways" },
              { key: "giveawayTargetMode", label: "Target mode" },
              {
                key: "giveawayIds",
                label: "Giveaway IDs",
                render: (row: ScanEventClaimRow) => (row.giveawayIds?.length ? row.giveawayIds.join(", ") : "—"),
              },
            ]}
          />

          <ReportSection
            title="Users"
            description="Registered accounts with admin and business affiliation."
            rows={report.datasets.users.rows}
            truncated={report.datasets.users.truncated}
            columns={[
              { key: "email", label: "Email" },
              { key: "displayName", label: "Name" },
              { key: "createdAt", label: "Created", render: (row: UserRow) => formatDate(row.createdAt) },
              { key: "isAdmin", label: "Admin", render: (row: UserRow) => (row.isAdmin ? "Yes" : "No") },
              {
                key: "businessAdmin",
                label: "Business Access",
                render: (row: UserRow) =>
                  row.businessAdmin
                    ? `${row.businessAdmin.role ?? "staff"} · ${row.businessAdmin.businessId ?? "—"}`
                    : "Public",
              },
              {
                key: "locationIds",
                label: "Locations",
                render: (row: UserRow) =>
                  row.businessAdmin?.locationIds?.length
                    ? row.businessAdmin.locationIds.join(", ")
                    : row.businessAdmin
                      ? "All/None"
                      : "—",
              },
            ]}
          />

          <ReportSection
            title="Businesses"
            description="Business entities in the platform."
            rows={report.datasets.businesses.rows}
            truncated={report.datasets.businesses.truncated}
            columns={[
              { key: "name", label: "Name" },
              { key: "id", label: "ID" },
              { key: "active", label: "Active", render: (row: BusinessRow) => (row.active ? "Yes" : "No") },
              { key: "createdAt", label: "Created", render: (row: BusinessRow) => formatDate(row.createdAt) },
            ]}
          />

          <ReportSection
            title="Locations"
            description="Locations grouped by business."
            rows={report.datasets.locations.rows}
            truncated={report.datasets.locations.truncated}
            columns={[
              { key: "businessId", label: "Business" },
              { key: "locationId", label: "Location ID" },
              { key: "name", label: "Name" },
              { key: "active", label: "Active", render: (row: LocationRow) => (row.active ? "Yes" : "No") },
            ]}
          />

          <ReportSection
            title="Causes"
            description="Public causes configured in the platform."
            rows={report.datasets.causes.rows}
            truncated={report.datasets.causes.truncated}
            columns={[
              { key: "title", label: "Title" },
              { key: "id", label: "ID" },
              { key: "active", label: "Active", render: (row: CauseRow) => (row.active ? "Yes" : "No") },
              { key: "createdAt", label: "Created", render: (row: CauseRow) => formatDate(row.createdAt) },
            ]}
          />

          <ReportSection
            title="Deals"
            description="Reward offers tied to businesses."
            rows={report.datasets.deals.rows}
            truncated={report.datasets.deals.truncated}
            columns={[
              { key: "title", label: "Title" },
              { key: "id", label: "ID" },
              { key: "businessId", label: "Business" },
              { key: "pointCost", label: "Points" },
              { key: "active", label: "Active", render: (row: DealRow) => (row.active ? "Yes" : "No") },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReportSection<T extends { [key: string]: unknown }>({
  title,
  description,
  rows,
  truncated,
  columns,
}: {
  title: string;
  description: string;
  rows: T[];
  truncated: boolean;
  columns: { key: string; label: string; render?: (row: T) => React.ReactNode }[];
}) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-xs text-zinc-500">{description}</div>
        </div>
        <div className="text-xs text-zinc-500">
          {rows.length} rows {truncated ? "· limited" : ""}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 border-b border-white/5 bg-white/[0.03] text-left uppercase tracking-wide text-zinc-400">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-zinc-500" colSpan={columns.length}>
                  No data for this range.
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => (
              <tr key={(row as { id?: string }).id ?? index} className="border-t border-white/5">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-zinc-200">
                    {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

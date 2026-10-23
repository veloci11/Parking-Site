export const reportCategories = {
  harassment: "Harcèlement ou propos menaçants",
  fraud: "Fraude suspectée",
  personal_data: "Divulgation de données personnelles",
  spam: "Messages indésirables",
  other: "Autre problème",
} as const;
export type ContextReportCategory = keyof typeof reportCategories;
export interface ContextReport {
  id: string;
  userId: string;
  targetType: "conversation" | "message";
  targetId: string;
  conversationId: string;
  category: ContextReportCategory;
  reason: string;
  status: "open" | "reviewed" | "dismissed" | "appealed";
  version: number;
  decisionReason: string | null;
  decidedAt: string | null;
  appealReason: string | null;
  appealedAt: string | null;
  createdAt: string;
}
export interface ReportEvidence {
  scope: "reported_message_only" | "last_20_at_report_time";
  conversationId: string;
  listingId: string;
  messages: { id: string; senderId: string; body: string; createdAt: string }[];
  capturedAt: string;
}
export interface ContextReportDetail {
  report: ContextReport;
  evidence: ReportEvidence | null;
  decisions: { decision: string; reason: string; createdAt: string }[];
}
export const reportStatusLabels: Record<ContextReport["status"], string> = {
  open: "À examiner",
  reviewed: "Traité",
  dismissed: "Classé sans suite",
  appealed: "Réexamen demandé",
};

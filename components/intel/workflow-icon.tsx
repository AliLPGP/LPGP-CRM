import { BarChart3, Banknote, Briefcase, ClipboardCheck, FolderKanban, Handshake, PieChart, Radar, Search, Users } from "lucide-react";

// One glyph per workflow, by the name the workflow definition carries.
const ICONS = { search: Search, radar: Radar, handshake: Handshake, users: Users, clipboard: ClipboardCheck, banknote: Banknote, chart: BarChart3, briefcase: Briefcase, pie: PieChart, folder: FolderKanban } as const;

export function WorkflowIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? Search;
  return <Icon className={className} />;
}

import type { RegistryConnectionProvider } from "@/lib/control-plane";

export type ProviderGroup = {
  category: string;
  label: string;
  providers: RegistryConnectionProvider[];
};

const CATEGORY_ORDER: string[] = ["email", "knowledge", "project", "crm", "other"];

const CATEGORY_LABELS: Record<string, string> = {
  email: "Email",
  knowledge: "Knowledge Sources",
  project: "Project Management",
  crm: "CRM",
  other: "Other",
};

/**
 * Group registry providers by category, sorted by category order then priority.
 */
export function groupProvidersByCategory(
  providers: RegistryConnectionProvider[],
): ProviderGroup[] {
  const sorted = [...providers].sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category ?? "other");
    const catB = CATEGORY_ORDER.indexOf(b.category ?? "other");
    const orderA = catA === -1 ? CATEGORY_ORDER.length : catA;
    const orderB = catB === -1 ? CATEGORY_ORDER.length : catB;
    if (orderA !== orderB) return orderA - orderB;
    return (a.priority ?? 999) - (b.priority ?? 999);
  });

  const groups: ProviderGroup[] = [];
  const seen = new Set<string>();

  for (const provider of sorted) {
    const category = provider.category ?? "other";
    if (!seen.has(category)) {
      seen.add(category);
      groups.push({
        category,
        label: CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1),
        providers: [],
      });
    }
    groups.find((group) => group.category === category)?.providers.push(provider);
  }

  return groups;
}

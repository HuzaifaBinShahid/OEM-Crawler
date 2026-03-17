import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PartTermType = "slang" | "official";

export interface PartTermEntry {
  type: PartTermType;
  canonical_name: string;
  category: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let terminology: Record<string, PartTermEntry> | null = null;

function loadTerminology(): Record<string, PartTermEntry> {
  if (terminology) return terminology;
  const candidates = [
    path.resolve(__dirname, "part-terminology.json"),
    path.resolve(process.cwd(), "src/data/part-terminology.json"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, "utf8");
      const data = JSON.parse(raw) as Record<string, PartTermEntry>;
      terminology = typeof data === "object" && data !== null ? data : {};
      return terminology;
    } catch {
      continue;
    }
  }
  terminology = {};
  return terminology;
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function resolvePartTerm(term: string): string {
  const t = term.trim();
  if (!t) return term;
  const terms = loadTerminology();
  const key = normalizeKey(t);
  const entry = terms[key];
  if (entry && entry.type === "slang" && entry.canonical_name) {
    return entry.canonical_name;
  }
  return term;
}

export function getTerminologyForPrompt(): string {
  const terms = loadTerminology();
  const slangEntries = Object.entries(terms)
    .filter(([, e]) => e.type === "slang")
    .map(([k, e]) => `"${k}" → "${e.canonical_name}"`)
    .slice(0, 80);
  if (slangEntries.length === 0) return "";
  return (
    "Industry slang to canonical part names (use canonical for search when the user said the slang): " +
    slangEntries.join("; ") +
    ". If the user's term is an official part name (e.g. alternator, fuel pump, rotors) or not in this list, use it as-is and do not substitute."
  );
}

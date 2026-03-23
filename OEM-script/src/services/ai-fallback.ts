const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function suggestPartFromList(
  apiKey: string,
  query: string,
  partNames: string[],
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || partNames.length === 0) return null;
  const listText = partNames.map((p, i) => `${i + 1}. ${p}`).join("\n");
  let systemContent =
    "You are a parts catalog assistant. Given a user search query and a numbered list of part categories, reply with the exact text of the single category most likely to contain the part the user needs. Reply with only that category name, nothing else. If none fit, reply with the first category.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }
  const body = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: `User is looking for: "${query}"\n\nPart categories:\n${listText}\n\nWhich category (reply with exact name from list)?`,
      },
    ],
    max_tokens: 200,
    temperature: 0.2,
  };
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, " ").trim();
  for (const name of partNames) {
    const n = name.replace(/\s+/g, " ").trim();
    if (n === normalized) return name;
    if (normalized.toLowerCase().includes(n.toLowerCase())) return name;
    if (n.toLowerCase().includes(normalized.toLowerCase())) return name;
  }
  return partNames[0] ?? null;
}

export async function suggestSearchTermForPart(
  apiKey: string,
  userTerm: string,
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || !userTerm.trim()) return null;
  let systemContent =
    "You are an automotive parts catalog search assistant. The user will give a single part term. Your job is to decide: is this already a clear, specific part name we should search as-is, or is it slang/ambiguous?\n\n" +
    "Examples: 'rotors' in automobiles usually means brake rotors (or brake discs) → reply 'brake rotors'. 'starter' → 'starter motor'. 'alternator' is a clear part name → reply 'alternator' as-is. 'fuel pump' → 'fuel pump' as-is. 'rad' → 'radiator'. 'plugs' → 'spark plugs'. 'head' → 'cylinder head'.\n\n" +
    "Reply with ONLY the exact phrase to type in the catalog search box: one line, no explanation. If the term is already a specific part name, return it unchanged. If it is slang or ambiguous, return the canonical/specific automotive part name.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `The user entered: "${userTerm.trim()}"\n\nWhat exact search phrase should we use in the parts catalog? Reply with only that phrase:`,
      },
    ],
    max_tokens: 80,
    temperature: 0.2,
  };
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ").trim();
}

export async function extractPartNameForSearch(
  apiKey: string,
  userQuery: string,
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || !userQuery.trim()) return null;

  const examples =
    'Examples: "i need an alternator" -> alternator. "HVAC CONTROL" -> HVAC CONTROL (use the complete phrase as-is, do not split or change). ' +
    '"need the accelerator pedal sensor" -> accelerator pedal sensor. "left headlight" -> left headlight. "muffler" -> muffler. ' +
    "If the user said a slang term (e.g. starter, rad, plugs), return the canonical part name from the terminology. If the term is an official part name (e.g. alternator, fuel pump), return it as-is. " +
    "Reply with ONLY the part name to type in the search box, nothing else.";

  let systemContent =
    "You are a parts catalog search assistant. The user entered a natural language query. Extract the single part name or phrase to use for the catalog search box. " +
    "If the query is already a part name or code (e.g. HVAC CONTROL, EXP VALVE), return it exactly as given. " +
    "If the query is a sentence (e.g. 'i need an alternator'), return only the part name. " +
    "When the user uses industry slang (e.g. starter, rad, plugs), return the canonical part name for search. When the term is an official part name, return it as-is. One line, no explanation.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Query: "${userQuery.trim()}"\n\n${examples}\n\nPart name for search:`,
      },
    ],
    max_tokens: 100,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ").trim();
}

export async function extractPartTermsFromQuery(
  apiKey: string,
  query: string,
  referenceText?: string,
): Promise<string[]> {
  if (!apiKey.trim() || !query.trim()) return [query.trim()];

  let systemContent =
    "You are a parts catalog search assistant. The user entered a query that may describe one or more parts. Your job is to list the individual part or component names they are looking for. Reply with ONLY the searchable part terms, one per line. Use short terms suitable for a search box (e.g. 'muffler', 'clamp', 'fuel tank', 'straps'). Do not include filler words ('i need', 'the', 'a', 'an') or quantities ('2', 'x2'); just the part name. Use singular form when it works for search (e.g. 'clamp' not '2 clamps'). When a term is industry slang (e.g. starter, rad, plugs), use the canonical part name from the terminology; when it is an official part name (e.g. alternator, fuel pump), use it as-is. If there is only one part, return one line.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Query: "${query.trim()}"\n\nList each part/component to search for, one per line:`,
      },
    ],
    max_tokens: 200,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [query.trim()];

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [query.trim()];

  const terms = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (terms.length === 0) return [query.trim()];
  return terms;
}

export async function pickCategory(
  apiKey: string,
  userPartTerm: string,
  categoryNames: string[],
  referenceText?: string,
): Promise<string | null> {
  return suggestPartFromList(
    apiKey,
    userPartTerm,
    categoryNames,
    referenceText,
  );
}

export type TreePath = string;

export async function pickPathFromFullTree(
  apiKey: string,
  userPartTerm: string,
  treePaths: TreePath[],
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || treePaths.length === 0) return null;

  const listText = treePaths.map((p, i) => `${i + 1}. ${p}`).join("\n");
  let systemContent =
    "You are a parts catalog assistant. The user is searching for a part. Below is the list of catalog sections (Category > Subcategory, no VIN/chassis prefix). Pick the ONE section that is most likely to contain the part.\n\n" +
    "Use the hierarchy: e.g. 'Expansion Valve' is HVAC/AC, so pick 'Cab > HVAC Control' or 'Cab > HVAC', NOT just 'Cab'. 'Water pump' is engine/cooling; 'fuel pump' under Fuel or Engines. Always pick a subcategory path (e.g. 'Cab > HVAC Control') so we can open the parts table — never pick only a top-level category like 'Cab' or 'Engines'.\n\n" +
    "Reply with ONLY the exact path from the list (e.g. 'Cab > HVAC Control'). Do not add numbering or explanation.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `User wants this part: "${userPartTerm}"\n\nCatalog sections (pick one subcategory, e.g. Cab > HVAC Control):\n${listText}\n\nWhich section should we open? Reply with the exact path from the list:`,
      },
    ],
    max_tokens: 200,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ").trim();
  for (const path of treePaths) {
    const p = path.replace(/\s+/g, " ").trim();
    if (p === normalized) return path;
    if (normalized.toLowerCase() === p.toLowerCase()) return path;
    if (normalized.toLowerCase().includes(p.toLowerCase())) return path;
    if (p.toLowerCase().includes(normalized.toLowerCase())) return path;
  }
  return treePaths[0] ?? null;
}

export async function pickSubcategories(
  apiKey: string,
  userPartTerm: string,
  subcategoryNames: string[],
  referenceText?: string,
): Promise<string[]> {
  if (!apiKey.trim() || subcategoryNames.length === 0) return [];

  const listText = subcategoryNames.map((p, i) => `${i + 1}. ${p}`).join("\n");
  let systemContent =
    "You are a parts catalog assistant. Given the part the user wants and a numbered list of subcategories/options, reply with the exact name(s) of the option(s) that contain the part. Reply with one or more names from the list, one per line. If only one option fits, reply with that one line. If multiple options might contain the part (e.g. different variants), reply with each on its own line. Use only exact names from the list.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `User wants this part: "${userPartTerm}"\n\nSubcategories:\n${listText}\n\nWhich option(s) should we open? Reply with exact name(s) from the list, one per line:`,
      },
    ],
    max_tokens: 200,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const lines = raw
    .split(/\n/)
    .map((s) => s.replace(/^[\d.)\s-]+/, "").trim())
    .filter(Boolean);
  const normalizedNames = subcategoryNames.map((n) =>
    n.toLowerCase().replace(/\s+/g, " "),
  );
  const out: string[] = [];
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/\s+/g, " ").trim();
    const match = subcategoryNames.find(
      (n) =>
        n.toLowerCase().replace(/\s+/g, " ") === normalized ||
        normalized.includes(n.toLowerCase()) ||
        n.toLowerCase().includes(normalized),
    );
    if (match && !out.includes(match)) out.push(match);
  }
  return out.length > 0 ? out : [subcategoryNames[0]!];
}

export async function pickNextSubcategory(
  apiKey: string,
  userPartTerm: string,
  subcategoryNames: string[],
  excludedSubcategoryNames: string[],
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || subcategoryNames.length === 0) return null;
  const excludedSet = new Set(
    excludedSubcategoryNames.map((n) => n.toLowerCase().replace(/\s+/g, " ")),
  );
  const remaining = subcategoryNames.filter(
    (n) => !excludedSet.has(n.toLowerCase().replace(/\s+/g, " ")),
  );
  if (remaining.length === 0) return null;
  const listText = remaining.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const triedText =
    excludedSubcategoryNames.length > 0
      ? `We already looked in these subcategories and did not find the part: ${excludedSubcategoryNames.join(", ")}. `
      : "";
  let systemContent =
    "You are a parts catalog assistant. We are searching for a part within a parent category. " +
    triedText +
    "Reply with the exact name of ONE subcategory from the numbered list below that is most likely to contain the part. Reply with only that subcategory name, nothing else.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Part we need: "${userPartTerm}"\n\nRemaining subcategories to try:\n${listText}\n\nWhich one should we try next? Reply with exact name from the list:`,
      },
    ],
    max_tokens: 200,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return remaining[0] ?? null;

  const normalized = raw.replace(/\s+/g, " ").trim();
  for (const name of remaining) {
    const n = name.toLowerCase().replace(/\s+/g, " ");
    if (n === normalized.toLowerCase()) return name;
    if (normalized.toLowerCase().includes(n)) return name;
    if (n.includes(normalized.toLowerCase())) return name;
  }
  return remaining[0] ?? null;
}

export interface TableRowOption {
  partNumber: string;
  description: string;
  item?: string;
}

export async function pickTableRow(
  apiKey: string,
  userPartTerm: string,
  tableRows: TableRowOption[],
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || tableRows.length === 0) return null;

  const listText = tableRows
    .map(
      (r, i) =>
        `${i + 1}. Part #${r.partNumber} | ${r.description || "(no description)"}${r.item ? ` | Item: ${r.item}` : ""}`,
    )
    .join("\n");
  let systemContent =
    "You are a parts catalog assistant. Given the part the user wants and a numbered list of table rows (part number and description), pick the row that matches the user's part BY MEANING.\n\n" +
    "MATCH BY MEANING: If the user wants 'water pump', pick any row that is clearly about a water pump: e.g. 'Kit, Water Pump', 'Water Pump', 'Water Pump Assembly', 'Pump - Water'. Order of words does not matter ('Water Pump' = 'water pump'). Only reply NOT_ON_PAGE when NONE of the rows are about the requested part type at all (e.g. user wants water pump but the list only has alternator, belt, filter).\n\n" +
    "Reply with ONLY the exact part number (Part # value) from the list, or NOT_ON_PAGE if truly no row is about that part. Do not add explanation. When in doubt, pick the best-matching row rather than NOT_ON_PAGE.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `User wants this part: "${userPartTerm}"\n\nTable rows (current page):\n${listText}\n\nWhich part number should we pick? Reply with only the part number, or NOT_ON_PAGE if none of these rows are about that part:`,
      },
    ],
    max_tokens: 100,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ").trim().toUpperCase();
  if (normalized === "NOT_ON_PAGE") return null;

  const match = tableRows.find(
    (r) =>
      r.partNumber === raw.trim() ||
      r.partNumber.toLowerCase() === raw.trim().toLowerCase() ||
      raw.trim().toLowerCase().includes(r.partNumber.toLowerCase()) ||
      r.partNumber.toLowerCase().includes(raw.trim().toLowerCase()),
  );
  if (match) return match.partNumber;

  const termLower = userPartTerm.toLowerCase().replace(/\s+/g, " ").trim();
  const termNorm = termLower.replace(/,/g, " ");
  const byDescription = tableRows.filter((r) => {
    const desc = (r.description || "").toLowerCase();
    const item = (r.item || "").toLowerCase();
    return (
      desc.includes(termLower) ||
      desc.replace(/,/g, " ").includes(termNorm) ||
      item.includes(termLower) ||
      item.replace(/,/g, " ").includes(termNorm)
    );
  });
  if (byDescription.length === 1) return byDescription[0]!.partNumber;
  if (byDescription.length > 1) return byDescription[0]!.partNumber;

  return null;
}

export async function pickSuggestedPartFromSearchResults(
  apiKey: string,
  userQuery: string,
  tableRows: TableRowOption[],
  referenceText?: string,
): Promise<string | null> {
  if (!apiKey.trim() || tableRows.length === 0) return null;

  const listText = tableRows
    .map(
      (r, i) =>
        `${i + 1}. Part #${r.partNumber} | ${r.description || "(no description)"}${r.item ? ` | Item: ${r.item}` : ""}`,
    )
    .join("\n");
  let systemContent =
    "You are a parts catalog assistant. You have reference data of user queries and the part numbers they needed (and sometimes category). " +
    "Given the user's current search query and a numbered list of parts from the search results, pick the ONE part that is most likely the correct one based on that knowledge and the descriptions. " +
    "Match by meaning: e.g. 'left headlight' can match a row with description 'Light, Head, Led Sae, Left Hand'. " +
    "Reply with ONLY the exact part number (Part # value) from the list. No explanation.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `User's search query: "${userQuery}"\n\nSearch results (pick the one most likely correct):\n${listText}\n\nWhich part number? Reply with only the part number:`,
      },
    ],
    max_tokens: 100,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  const trimmed = raw.replace(/\s+/g, " ").trim();
  const match = tableRows.find(
    (r) =>
      r.partNumber === trimmed ||
      r.partNumber.toLowerCase() === trimmed.toLowerCase() ||
      trimmed.toLowerCase().includes(r.partNumber.toLowerCase()) ||
      r.partNumber.toLowerCase().includes(trimmed.toLowerCase()),
  );
  if (match) return match.partNumber;
  return null;
}

export async function pickMatchingTableRows(
  apiKey: string,
  userPartTerm: string,
  tableRows: TableRowOption[],
  referenceText?: string,
): Promise<string[]> {
  if (!apiKey.trim() || tableRows.length === 0) return [];

  const listText = tableRows
    .map(
      (r, i) =>
        `${i + 1}. Part #${r.partNumber} | ${r.description || "(no description)"}${r.item ? ` | Item: ${r.item}` : ""}`,
    )
    .join("\n");
  let systemContent =
    "You are a parts catalog assistant. Given the part the user wants and a numbered list of table rows (part number and description), list ALL rows that match the user's part BY MEANING.\n\n" +
    "MATCH BY MEANING: The description text may not be exact. The user's part name can appear as separate or reordered words. E.g. 'left headlight' matches 'Light, Head, Led Sae, Left Hand' (left + head + light). 'Steering gear' matches 'Yoke, U-joint, Steering Gear' or 'Kit, Power Steering Gear'. Include every row that is clearly about the requested part type. Order of words and exact phrasing do not matter; synonyms and split words (Head + Light = headlight) count as a match. Exclude only rows that are clearly about a different part.\n\n" +
    "Reply with ONLY the part numbers that match, one per line. No numbering, no explanation. Use the exact Part # value from the list.";
  if (referenceText) {
    systemContent += "\n\n" + referenceText;
  }

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `User wants this part: "${userPartTerm}"\n\nTable rows:\n${listText}\n\nWhich part numbers match? Reply with each matching part number on its own line:`,
      },
    ],
    max_tokens: 500,
    temperature: 0.2,
  };

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const lines = raw
    .split(/\n/)
    .map((s) => s.replace(/^[\d.)\s-]+/, "").trim())
    .filter(Boolean);
  const partNumbers = new Set<string>();
  const normalizedRows = tableRows.map((r) => ({
    partNumber: r.partNumber.trim(),
    lower: r.partNumber.trim().toLowerCase(),
  }));
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const match = normalizedRows.find(
      (r) =>
        r.partNumber === trimmed ||
        r.lower === lower ||
        lower.includes(r.lower) ||
        r.lower.includes(lower),
    );
    if (match) partNumbers.add(match.partNumber);
  }
  return Array.from(partNumbers);
}

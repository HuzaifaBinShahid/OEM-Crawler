import fs from "node:fs";
import path from "node:path";

export interface QueryExample {
  query: string;
  answer: string;
  category?: string;
  subcategories?: string[];
}

const BUILTIN_EXAMPLES: QueryExample[] = [
  { query: "EXP VALVE", answer: "2512331C1" },
  { query: "DRIER", answer: "3670134C1" },
  { query: "THERMISTORS", answer: "2606229C92" },
  { query: "FUEL PUMP", answer: "5010870R92" },
  { query: "FUEL REG", answer: "1832232C95" },
  { query: "LEFT HEADLIGHT", answer: "4049967C99" },
  { query: "HVAC CONTROL", answer: "3545543C6" },
  { query: "DRIVE SHOCKS", answer: "H60657008 X4" },
  { query: "WINDOW SWITCH", answer: "4061965c4" },
  { query: "PS RES", answer: "3501732C91" },
  { query: "REAR WINDOW", answer: "3554253C2" },
  { query: "X2 INJECTORS", answer: "5010657R92 X2" },
  { query: "DS WIPER ARM", answer: "3535049C2" },
  { query: "PS FUEL TANK STRAPS", answer: "3590583C1 X2" },
  { query: "ISOLATORS", answer: "2643614R1 X8" },
  { query: "WATER PUMP", answer: "1842665c93" },
  { query: "EXPANSION VALVE", answer: "2512331C1" },
  { query: "TURN SIGNAL SWITCH", answer: "3544933C94" },
  { query: "FUEL SENDER", answer: "6128686C3" },
  { query: "need the accelerator pedal sensor and the air filter", answer: "2507256C91 and 3532799C1" },
  { query: "need the rear wheel speed sensor and an air dryer but just the cartridge", answer: "3539548C92 and BX107796" },
  { query: "i want the part number for the battery box cover", answer: "3567277C2" },
  { query: "need a clutch bearing and a clutch brake", answer: "2004507C1 and C127760" },
  { query: "need RH fuel tank and straps and rubber lining", answer: "3515591C96 and 3566084C1 and 596590C1" },
  { query: "need the muffler and 2 clamps", answer: "muffler and clamps" },
  { query: "Expansion Valve", answer: "2512331C1" },
  { query: "Receiver Drier", answer: "3670134C1" },
  { query: "Thermistors", answer: "2606229C92" },
  { query: "Fuel Pump", answer: "5010870R92" },
  { query: "Fuel Regulator", answer: "1832232C95" },
  { query: "Left Headlight", answer: "4049967C99" },
  { query: "HVAC Control", answer: "3545543C6" },
  { query: "Drive Shocks", answer: "H60657008 X4" },
  { query: "Window Switch", answer: "4061965C4" },
  { query: "Power Steering Reservoir", answer: "3501732C91" },
  { query: "Rear Window", answer: "3554253C2" },
  { query: "Injectors", answer: "5010657R92 X2" },
  { query: "Driver Side Wiper Arm", answer: "3535049C2" },
  { query: "Fuel Tank Straps", answer: "3590583C1 X2" },
  { query: "Isolators", answer: "2643614R1 X8" },
  { query: "Water Pump", answer: "1842665C93" },
  { query: "Turn Signal Switch", answer: "3544933C94" },
  { query: "Fuel Sender", answer: "6128686C3" },
  { query: "I need an alternator for my truck", answer: "8600066" },
  { query: "i need the muffler and 2 clamps", answer: "FLTXC35AF and 2018471C1" },
  { query: "steering gear", answer: "3554372C92" },
  { query: "need the accelerator pedal sensor and the air filter", answer: "2507256C91 and 3532799C1" },
  { query: "need the rear wheel speed sensor and an air dryer but just the cartridge", answer: "3539548C92 and BX107796" },
  { query: "i want the part number for the battery box cover", answer: "3567277C2" },
  { query: "need a clutch bearing and a clutch brake", answer: "2004507C1 and C127760" },
  { query: "need RH fuel tank and straps and rubber lining", answer: "3515591C96 and 3566084C1 and 596590C1" },
];

const REFERENCE_FILE = "storage/ai-reference.json";

export function getBuiltinExamples(): QueryExample[] {
  return [...BUILTIN_EXAMPLES];
}

export function getReferenceTextForPrompt(): string {
  const examples = getBuiltinExamples();
  const lines = examples.map((e) => `Query: "${e.query}" -> Parts/answer: ${e.answer}`);
  return "Reference examples of user queries and the parts they need:\n" + lines.join("\n");
}

export function getReferenceTextForPromptAsync(): string {
  const builtin = getBuiltinExamples().map((e) => formatExample(e));
  const learned = loadLearnedExamples().map((e) => formatExample(e));
  const lines = [...builtin, ...learned].slice(-50);
  const treeContext = getDetailListTreeContext();
  return (
    "Reference examples of user queries and the parts they need (use these to improve your choices):\n" +
    lines.join("\n") +
    (treeContext ? "\n\n" + treeContext : "")
  );
}

export function getDetailListTreeContext(): string {
  return (
    "Detail List catalog structure (use this to pick the right parent and subcategory): " +
    "Top-level parents: Frame, Front Axle, Suspension, Brakes, Steering Gear, Propeller Shafts, Exhaust, Electrical, Front Sheet Metal, Miscellaneous, Clutch, Engines, Transmissions, Rear Axle, Fuel Tanks, Cab, Wheels. " +
    "Expansion valve, receiver drier, thermistors, HVAC, A/C control, heater → Cab (subcategories like HVAC UNIT, HTR & A/C, IP MODULE EFFECTS HVAC CONTROL, SLEEPER CONTROL PANEL HEATER). " +
    "Water pump, alternator, engine parts, air cleaner, radiator, starter → Engines. " +
    "Steering gear, power steering, steering column, steering wheel → Steering Gear. " +
    "Left headlight, lights, headlamp, front end wiring → Electrical (e.g. FRONT END WIRING INSTL, IP EFFECTS HEADLIGHT) or Cab. " +
    "Fuel pump, fuel sender, fuel tank straps, fuel tank → Fuel Tanks. " +
    "Window switch, door, mirror, wiper → Cab. " +
    "Muffler, exhaust → Exhaust. " +
    "Clutch, clutch bearing, clutch brake → Clutch or Engines. " +
    "Battery box cover, batteries → Electrical. " +
    "Turn signal switch → Electrical or Cab. " +
    "Always pick a subcategory that can open a parts table (leaf nodes with picture icon), not only the parent name."
  );
}

function formatExample(e: QueryExample): string {
  let line = `Query: "${e.query}" -> Parts/answer: ${e.answer}`;
  if (e.category) line += ` (Category: ${e.category}`;
  if (e.subcategories?.length) line += (e.category ? ", " : " (") + `Subcategories: ${e.subcategories.join(", ")}`;
  if (e.category || e.subcategories?.length) line += ")";
  return line;
}

export function loadLearnedExamples(): QueryExample[] {
  try {
    const file = path.resolve(process.cwd(), REFERENCE_FILE);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw) as QueryExample[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function appendLearnedExample(
  query: string,
  answer: string,
  context?: { category?: string; subcategories?: string[] }
): void {
  try {
    const file = path.resolve(process.cwd(), REFERENCE_FILE);
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = loadLearnedExamples();
    const example: QueryExample = { query: query.trim(), answer: answer.trim() };
    if (context?.category) example.category = context.category;
    if (context?.subcategories?.length) example.subcategories = context.subcategories;
    existing.push(example);
    const keep = existing.slice(-150);
    fs.writeFileSync(file, JSON.stringify(keep, null, 0), "utf8");
  } catch {
    //
  }
}

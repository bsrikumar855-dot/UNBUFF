import type { CodeLanguage, CodeLanguageId } from "../types.js";
import type { ProviderLanguage } from "./provider.js";

/**
 * The languages the product wants to offer. Provider ids are NEVER hard-coded: they differ between
 * Judge0 deployments and versions. Each language is matched by name against what the service's
 * GET /languages really returns, taking the newest matching version. A language the service does not
 * have simply does not appear.
 */

interface LanguageSpec {
  id: CodeLanguageId;
  /** Must match the provider's own label, e.g. "Python (3.12.5)". */
  match: RegExp;
  starter: string;
}

const SPECS: LanguageSpec[] = [
  {
    id: "python",
    match: /^Python \(3\.\d+(?:\.\d+)?\)$/,
    starter: "import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # Read your input from data, then print the answer.\n    print()\n\n\nmain()\n",
  },
  {
    id: "javascript",
    match: /^JavaScript \(Node\.js \d+(?:\.\d+)*\)$/,
    starter: "const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\n// Read your input from data, then print the answer.\nconsole.log();\n",
  },
  {
    id: "cpp",
    match: /^C\+\+ \(GCC \d+(?:\.\d+)*\)$/,
    starter: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Read your input from cin, then print the answer.\n    return 0;\n}\n",
  },
  {
    id: "java",
    match: /^Java \((?:Open)?JDK \d+(?:\.\d+)*\)$/,
    starter: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        // Read your input from in, then print the answer.\n    }\n}\n",
  },
];

/** Compares "3.12.5" style versions numerically. */
function versionOf(name: string): number[] {
  const m = /(\d+(?:\.\d+)*)\)$/.exec(name);
  return m ? m[1]!.split(".").map(Number) : [0];
}

function newer(a: string, b: string): boolean {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (va[i] ?? 0) - (vb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export interface ResolvedLanguage extends CodeLanguage {
  providerId: number;
}

export function resolveLanguages(provided: ProviderLanguage[]): ResolvedLanguage[] {
  const out: ResolvedLanguage[] = [];
  for (const spec of SPECS) {
    let best: ProviderLanguage | null = null;
    for (const l of provided) if (spec.match.test(l.name) && (!best || newer(l.name, best.name))) best = l;
    if (best) out.push({ id: spec.id, name: best.name, starter_code: spec.starter, providerId: best.id });
  }
  return out;
}

export const LANGUAGE_IDS = SPECS.map((s) => s.id) as [CodeLanguageId, ...CodeLanguageId[]];

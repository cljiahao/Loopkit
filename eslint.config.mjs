import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
      "test-results/**",
      "playwright-report/**",
      "scripts/demo/out/**",
      ".claude/worktrees/**",
    ],
  },
  // sonarjs's own recommended config carries its plugin registration; every
  // other block below reuses that same registration via bare `rules` keys
  // instead of re-declaring `plugins: { sonarjs }` with a second import
  // reference — two different plugin object identities under the same name
  // throws "Cannot redefine plugin sonarjs" in flat config.
  sonarjs.configs.recommended,
  {
    // Comment hygiene (templateCentral standard, full parity): own-line
    // comments are a hard gate, not a nudge — a comment states the *why*
    // above the code rather than trailing it, and commented-out code never
    // survives a commit (version control has the history).
    rules: {
      "no-inline-comments": "error",
      "sonarjs/no-commented-code": "error",
    },
  },
  {
    // Every use of Math.random() in this codebase is either cosmetic
    // (confetti/scratch-card jitter, animation timing) or a loyalty-program
    // "chance" roll authorized server-side by the RLS `owns_program` check
    // (loopkit.record_visit) — the vendor who submits it already has full
    // authority over their own program's rewards, so an unpredictable RNG
    // isn't a security requirement here. Audited every call site; none are
    // tokens/session-ids/crypto material.
    rules: {
      "sonarjs/pseudo-random": "off",
    },
  },
  {
    // Generated shadcn/ui primitives (CLI-managed, not hand-edited) — the
    // recommended set's complexity/duplication rules fire on vendored
    // component boilerplate that this project doesn't own or refactor.
    files: ["src/components/ui/**"],
    rules: {
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
  {
    // Pre-existing complexity hotspots (95 and 67 vs. the 15 threshold, with
    // a matching pile of nested view-kind ternaries) — the two largest files
    // in the codebase. Decomposing them safely needs a dedicated, tested
    // refactor pass, not a rushed rewrite as a side effect of a lint-rule
    // rollout. Tracked as follow-up debt, not silently ignored — see the
    // code-debt sweep notes for this repo.
    files: ["src/app/setup/page.tsx", "src/app/setup/setup-form.tsx"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
    },
  },
  {
    // Tests and one-off scripts routinely label table-driven cases and
    // fixtures with short trailing notes; that reads better inline, so the
    // gate would be pure noise there. Table-driven fixtures also legitimately
    // repeat literal strings/duplicate structure and chained-mock-builder
    // nesting (Supabase's fluent query builder needs 4+ levels to mock one
    // call), and a fixture password string like "newpassword123" isn't a
    // real secret.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**", "e2e/**"],
    rules: {
      "no-inline-comments": "off",
      "sonarjs/no-commented-code": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-identical-functions": "off",
      "sonarjs/no-nested-functions": "off",
      "sonarjs/no-hardcoded-passwords": "off",
    },
  },
  {
    // Harness enforcement scripts: hash-tracked by .claude/harness.json and
    // gated behind human approval to edit (protect-files.sh) — not this
    // rollout's to rewrite.
    files: [".claude/hooks/**", ".claude/.harness-base/**"],
    rules: {
      "sonarjs/concise-regex": "off",
    },
  },
];

export default eslintConfig;

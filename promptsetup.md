git add CLAUDE.md context.md diff.md
git commit -m "chore: add agent context files (CLAUDE.md, context.md, diff.md)"
git push
```

Once they are in the repo, Antigravity reads them from the folder automatically every time you open the project.

---

### Step 3 — The session workflow

**Start of every session — paste this exactly:**
```
Read CLAUDE.md, context.md, and diff.md before doing anything.
Confirm you have read them by listing:
- Current phase we are on
- Last thing completed (from diff.md)
- Any open questions that need answering before we proceed

Then we will start today's task.
```

This forces the AI to confirm it loaded your files before touching any code.

---

**During the session — how to give tasks:**
```
Phase 1 task: build the commission_rules migration file.
Follow the constraints in claude.md.
Use the schema in context.md as the source of truth.
```

Short and direct. No need to re-explain the project — it already knows from the files.

---

**End of every session — paste this:**
```
We are done for today. 
Update diff.md with:
- What was built or changed
- Why
- Any impact on other modules
- Follow-up tasks for next session

Show me the updated diff.md content so I can save it.
```

Then copy the output, open your `diff.md` file, paste the new entry at the top, save, and commit.

---

### Step 4 — When to use file upload instead of folder read

Antigravity reads from the folder automatically, but use **manual file upload** in these two situations:

| Situation | What to do |
|---|---|
| You updated `diff.md` outside the repo (e.g. copy-pasted from chat) | Upload the new `diff.md` at session start to make sure it has the latest version |
| You are starting a chat in Antigravity that is **not** connected to your repo | Upload all 3 files manually at the start of that chat |

For the manual upload session opener, say:
```
I am uploading 3 files: CLAUDE.md, context.md, diff.md.
Read all three. These define the project, the rules, and the current state.
Do not proceed until you confirm you have read all three.
```

---

### Step 5 — Module-level files (when you get to complex phases)

When you reach Phase 6 (commission ledger) or Phase 7 (fraud), create local files inside those modules:
```
src/modules/commission/
├── CLAUDE.md     ← commission-specific agent rules
├── context.md    ← commission schema, rule versioning details
└── diff.md       ← commission-specific change log

src/modules/ledger/
├── CLAUDE.md
├── context.md
└── diff.md
```

When working inside those modules, tell Antigravity:
```
We are working inside src/modules/commission.
Read the local CLAUDE.md and context.md in this folder in addition to the root files.
```

---

### The complete picture in one diagram
```
You open Antigravity
        │
        ▼
Antigravity reads CLAUDE.md from root
        │
        ▼  (because of @imports inside CLAUDE.md)
Loads context.md  ←── full project knowledge
Loads diff.md     ←── last session's state
        │
        ▼
You give today's task
        │
        ▼
AI builds code following claude.md rules,
using context.md schema, aware of diff.md history
        │
        ▼
End of session → AI updates diff.md
        │
        ▼
You save + commit the updated diff.md
        │
        ▼
Next session starts exactly where this one ended
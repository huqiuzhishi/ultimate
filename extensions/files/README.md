# Files

Type `@` in the composer, followed by part of a path. Ultimate searches tracked and unignored files in that conversation's checkout. Arrow keys select a result; Enter, Tab or click inserts `@<relative-path>` into the draft. The agent receives the path as ordinary prompt text and can read it with its tools.

Search runs in the conversation's checkout, so coordinator worktrees see their own files. Git repositories use `git ls-files`; folders outside Git fall back to `rg --files`. Empty queries do not scan the checkout.

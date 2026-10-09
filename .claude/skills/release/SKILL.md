---
name: release
description: Build, prerender and deploy the site with npm run release, then verify the live site matches the build. Only when the user types /release.
disable-model-invocation: true
---

The user typed `/release`. That is their request to run `npm run release` (build, prerender,
FTP deploy), which `AGENTS.md` otherwise forbids running unasked. It covers this one release
only. It does not cover committing, pushing, or editing anything.

## 1. Check the working tree first

Run `git status -sb`.

- **Uncommitted changes:** stop and list them. The build reads the working tree, so a
  release now would publish content that is not in a commit. Ask whether to go ahead.
- **Commits not pushed:** say so, then continue. That only means GitHub is behind the site.

## 2. Run the release without reading the FTP session

`npm run deploy` runs `ftp -i -s:ftpDeploy.txt`, and the session's login replies can include
the FTP host and user name. `AGENTS.md` keeps those out of anything an agent reads, so the
raw output must never reach the conversation: no `tee`, no `cat` of the log, no Read of it,
and no terminal-panel read of a release run.

Run this as one Bash call (foreground, timeout 600000). It writes everything to a temporary
log, prints only what comes before the deploy step plus FTP reply codes and counts, then
deletes the log. The cut point is the first of: npm's `> deploy` header (with or without a
`name@version` prefix), the `ftp -i -s:` command line, or any `ftp>` line. Without any of
those, ftp never ran, and only then is the tail of the log safe to print.

```bash
LOG="$(mktemp)"
npm run release > "$LOG" 2>&1
STATUS=$?
DEPLOY_AT=$(grep -nE '^> ([^ ]+@[^ ]+ )?deploy$|ftp -i -s:|^ftp>' "$LOG" | head -1 | cut -d: -f1)
echo "exit status: $STATUS"
if [ -z "$DEPLOY_AT" ]; then
  echo "deploy never started; output before the failure:"
  tail -40 "$LOG"
else
  echo "--- build, prerender and validation (before > deploy) ---"
  head -n "$((DEPLOY_AT - 1))" "$LOG" | grep -vE 'npm warn' | tail -40
  FTP="$(tail -n "+$DEPLOY_AT" "$LOG")"
  echo "--- ftp summary (codes and counts only) ---"
  echo "transfers started:   $(printf '%s\n' "$FTP" | grep -cE '^(125|150) ')"
  echo "transfers complete:  $(printf '%s\n' "$FTP" | grep -cE '^226 ')"
  echo "session closed (221): $(printf '%s\n' "$FTP" | grep -cE '^221 ')"
  echo "4xx/5xx reply codes: $(printf '%s\n' "$FTP" | grep -oE '^[45][0-9]{2} ' | sort | uniq -c | tr -s ' ' | tr '\n' ';')"
fi
rm -f "$LOG"
```

`ftp.exe` exits 0 even when transfers fail, so judge the deploy by the summary: started
should equal complete, 221 should be 1, and there should be no 4xx/5xx codes. Report any
failure as that summary and stop. Never open the log to diagnose it. If the user wants the
details, they can rerun `npm run deploy` in their own terminal and read it themselves.

## 3. Verify the live site

The deploy uploads a named list of files, not a mirror of `dist/` (see "Deployment" in
`AGENTS.md`). Compare what is live against what was just built:

```bash
SITE="https://www.douglaskent.com"
OUT="$(mktemp -d)"
for pair in "index.html:dist/index.html" "resume.txt:src/static/resume.txt" \
            "resume-json-ld.json:src/static/resume-json-ld.json" \
            "resume.docx:src/static/resume.docx" "sitemap.xml:dist/sitemap.xml"; do
  remote="${pair%%:*}"; local="${pair#*:}"
  path="$remote"; [ "$remote" = "index.html" ] && path=""
  code=$(curl -s -o "$OUT/$remote" -w '%{http_code}' "$SITE/$path?v=$RANDOM")
  if cmp -s "$OUT/$remote" "$local"; then echo "$remote: $code, identical to $local"
  else echo "$remote: $code, DIFFERS from $local"; fi
done
for a in $(grep -oE 'assets/[^"]+\.(js|css)' dist/index.html | sort -u); do
  echo "$a: $(curl -s -o /dev/null -w '%{http_code}' "$SITE/$a")"
done
rm -rf "$OUT"
```

Anything that differs or does not return 200 is a finding. The most likely cause is a file
that Vite now emits but `ftpDeploy.txt` does not upload. Name the file and say that the
owner needs to add it to `ftpDeploy.txt`. Do not open that file to check.

## 4. Report

- the exit status and the FTP summary
- each live file: identical or not, and its HTTP status
- `git status -sb` after the run: the build regenerates `src/static/` and
  `index-prerender.html`, so anything now modified means the deployed content differs from
  what is committed. Report it; do not commit it.

Do not commit, push, or edit `ftpDeploy.txt`, `web.config` or the deploy scripts.

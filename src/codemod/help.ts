import { DEFAULT_APP_ORIGIN, DEFAULT_STUDIO_PORT } from './command-args.js';

/** The text `livelocale --help` prints. The docs tests read the commands and flags from it. */
export function helpText(): string {
  return `
LiveLocale (livelocale) CLI

Usage:
  npx livelocale <command> [options]

Commands:
  migrate     Bulk migrate existing react-i18next translation usages to wrap them with wrapTranslationEngine automatically.
  init        Initialize the API route handler inside a Next.js project automatically.
  studio      Start the visual editing studio local web server.
  doctor      Check the project for common integration problems (route, provider, middleware, CSP, locales).
  check       Check translations for missing keys, placeholder drift, broken ICU syntax and unused keys (CI-friendly).
  pack        Write the share Studio (livelocale/) into a built site folder and link every HTML page to it.
  build       Run your build command, then pack its output (Next.js: packs into public/livelocale/ first).
  apply       Apply a LiveLocale change link to your locale files (--pr opens a pull request)

Options for migrate:
  --dir <path>       Directory to scan (default: current directory)
  --exclude <list>   Comma-separated list of directories to exclude (default: node_modules,.next,dist,.git)
  --dry-run          Preview changes without writing them to disk

Options for init:
  --dir <path>       Target project directory (default: current directory)
  --share            Set up the share link build and the GitHub workflow instead of the API route
  --locales <path>   (--share) Locales directory relative to the project (default: detected)
  --source <locale>  (--share) Source locale (default: en)
  --branches <a,b>   (--share) Branches a change link may target (default: the default branch)
  --overwrite        (--share) Replace an existing .github/workflows/livelocale.yml

Options for studio:
  --port <number>    Port to run the studio server on (default: ${DEFAULT_STUDIO_PORT})
  --app <origin>     Origin of the app being edited (default: ${DEFAULT_APP_ORIGIN})
                     Can also be changed at run time with ?app=<origin> on the Studio URL.

Options for doctor:
  --dir <path>       Project directory to inspect (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --app <url>        Also probe the running app or deployed site, e.g. http://localhost:3000
                     or https://user.github.io/repo/ (a path is the app base)
  --share            Run the share link probes even when livelocale/manifest.json is missing
  --token <token>    Access token for a preview deployment (default: LIVELOCALE_TOKEN)

Options for check:
  --dir <path>       Project directory to scan (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --source <locale>  Locale the others are compared against (default: en, else the first locale)
  --no-unused        Do not report keys that code never references
  --strict           Treat warnings (unused keys, empty values, untranslated text) as failures
  --hardcoded        Also find text never passed through translation (needs typescript) and
                     translations left identical to the source or in the wrong script
  --allow <word>     Word or phrase that never counts as hardcoded (repeatable; also read
                     from livelocale.allow)
  --json             Print the full report as JSON

Options for pack:
  pack <outDir>      Built site folder, relative to --dir (e.g. dist, build, out)
  --dir <path>       Project directory (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --source <locale>  Source locale (default: en, else the first locale)
  --base <path>      Site path the app is served from, e.g. /repo/ (default: detected, else /)
  --expose-repo      Put the GitHub owner/repo into livelocale/manifest.json
  --no-inject        Do not add the flag.js script to HTML files

Options for build:
  build [--preview] [--out <dir>] [pack options] -- <command...>
  --preview          Run the command with LIVELOCALE=preview and NEXT_PUBLIC_LIVELOCALE=preview
  --out <dir>        Build output folder (default: detected from dist/, build/, out/)

Options for apply:
  apply <link|file|->  The change link, a file that holds it, or - to read stdin
  --clipboard        Read the change link from the clipboard instead
  --pr               Commit the changes on a new branch and open a pull request
  --dir <path>       Project directory (default: current directory)
  --locales <path>   Locales directory relative to the project (default: locales)
  --source <locale>  Source locale (default: en, else the first locale)
  --force            Apply edits the translator saved with "Save anyway"
  --dry-run          Show what would change without writing files
  --github-event     Run inside the generated GitHub workflow; reads the link from the event file
  --branches <a,b>   Branches a link may target (default: the repository's default branch)

Global Options:
  -h, --help         Show help information
  -v, --version      Print the livelocale version

Exit codes:
  0  Success.
  1  The command ran and found problems, or could not finish: check found a problem, doctor
     found a blocking problem, migrate could not convert a file, apply or pack could not finish.
  2  Usage error: an unknown or missing command, an unknown option, a missing value, an argument
     the command does not take, or options that do not go together. check also exits 2 when it
     could not run (missing folder, no locales folder or no locale files in it, unknown --source,
     TypeScript missing for --hardcoded).
  build exits with your build command's own code once it has started it.
`;
}

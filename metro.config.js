// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro shows the dev "Refreshing…" bar for every change to a watched file, even one the app never
// imports. Stop watching what isn't app code: IDE state, docs, the Deno-only Supabase code
// (functions/_shared stays: the app imports it), and editor/OneDrive temp files.
const SEP = '[\\\\/]';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const root = __dirname.split(/[\\/]/).map(escape).join(SEP);
// Matches a project-relative path or the same path made absolute.
const inProject = (pattern) => new RegExp(`^(?:${root}${SEP})?${pattern}`);

config.resolver.blockList = [
  ...[config.resolver.blockList ?? []].flat(),
  inProject(`\\.idea(?:${SEP}|$)`),
  inProject(`docs(?:${SEP}|$)`),
  // Directories are tested too, so `supabase/functions` itself must stay visible.
  inProject(`supabase${SEP}(?!functions${SEP}?$|functions${SEP}_shared(?:${SEP}|$))`),
  /\.tsbuildinfo$/,
  /(?:^|[\\/])~\$[^\\/]*$/,
  /\.(?:tmp|swp)$/,
];

module.exports = config;

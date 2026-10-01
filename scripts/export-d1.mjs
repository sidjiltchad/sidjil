// D1's full export cannot handle the materials_fts virtual table.
// Export regular tables individually and append the FTS rows to one restorable SQL file.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const tables = [
  'counters', 'admin_users', 'sources', 'people', 'places', 'tags',
  'collections', 'glossary', 'materials', 'files', 'image_versions',
  'transcriptions', 'translations', 'translation_segments', 'processing_jobs',
  'material_people', 'material_places', 'material_tags',
  'material_collections', 'material_relations', 'announcements',
  'sessions', 'audit_log',
];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = join(root, 'backup', `SIDJIL-${stamp}`);
mkdirSync(directory, { recursive: true });

function run(args) {
  return execFileSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function sqlLiteral(value) {
  return value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

const statements = [
  '-- Restore into a fresh SIDJIL database after applying all migrations.',
  'PRAGMA defer_foreign_keys=TRUE;',
  // Migration 0004 seeds these tables; replace seed data with the exported rows.
  'DELETE FROM collections;',
  'DELETE FROM counters;',
];

for (const table of tables) {
  const output = join(directory, `${table}.sql`);
  run(['d1', 'export', 'SIDJIL', '--remote', '--no-schema', '--table', table, '--output', output]);
  const sql = readFileSync(output, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() && !/^PRAGMA defer_foreign_keys=TRUE;$/i.test(line.trim()));
  statements.push(...sql);
  process.stdout.write(`${table}: ${sql.length} rows\n`);
}

const result = JSON.parse(run([
  'd1', 'execute', 'SIDJIL', '--remote', '--json',
  '--command', 'SELECT ark, title, body FROM materials_fts ORDER BY rowid',
]));
if (!result[0]?.success) throw new Error('Could not export materials_fts');
const ftsRows = result[0].results;
for (const row of ftsRows) {
  statements.push(`INSERT INTO materials_fts (ark, title, body) VALUES (${[
    row.ark, row.title, row.body,
  ].map(sqlLiteral).join(', ')});`);
}

const sql = `${statements.join('\n')}\n`;
const file = join(directory, 'SIDJIL-data.sql');
writeFileSync(file, sql);
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
  database: 'SIDJIL',
  exported_at: new Date().toISOString(),
  tables,
  fts_rows: ftsRows.length,
  sql_sha256: createHash('sha256').update(sql).digest('hex'),
}, null, 2));
process.stdout.write(`FTS: ${ftsRows.length} rows\nBackup: ${file}\n`);

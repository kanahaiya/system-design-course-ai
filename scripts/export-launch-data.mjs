#!/usr/bin/env node

/**
 * Export launch waitlist and feedback data from Supabase into CSV files.
 *
 * Required environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 * - EXPORT_DIR (default: ./exports)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPORT_DIR = process.env.EXPORT_DIR ?? './exports';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing required env vars. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

function escapeCsvCell(value) {
  const normalizedValue = String(value ?? '');
  const escapedValue = normalizedValue.replaceAll('"', '""');
  return `"${escapedValue}"`;
}

function toCsv(rows, headers) {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const valueLines = rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(','));
  return [headerLine, ...valueLines].join('\n');
}

async function fetchTableRows(tableName, selectedColumns) {
  const encodedColumns = encodeURIComponent(selectedColumns.join(','));
  const requestUrl = `${SUPABASE_URL}/rest/v1/${tableName}?select=${encodedColumns}&order=created_at.desc`;
  const response = await fetch(requestUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Failed to fetch ${tableName}: ${response.status} ${bodyText}`);
  }

  return response.json();
}

async function writeCsv(filePath, rows, headers) {
  const csvContent = toCsv(rows, headers);
  await fs.writeFile(filePath, csvContent, 'utf8');
}

async function main() {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const exportStamp = new Date().toISOString().replaceAll(':', '-');

  const waitlistHeaders = [
    'id',
    'email',
    'focus',
    'source_page',
    'submitted_at_iso',
    'created_at',
    'updated_at',
  ];
  const feedbackHeaders = [
    'id',
    'feedback_type',
    'email',
    'message',
    'source_page',
    'submitted_at_iso',
    'created_at',
  ];

  const waitlistRows = await fetchTableRows('launch_waitlist', waitlistHeaders);
  const feedbackRows = await fetchTableRows('launch_feedback', feedbackHeaders);

  const waitlistFile = path.join(EXPORT_DIR, `waitlist-${exportStamp}.csv`);
  const feedbackFile = path.join(EXPORT_DIR, `feedback-${exportStamp}.csv`);

  await writeCsv(waitlistFile, waitlistRows, waitlistHeaders);
  await writeCsv(feedbackFile, feedbackRows, feedbackHeaders);

  console.log(`Waitlist exported: ${waitlistFile}`);
  console.log(`Feedback exported: ${feedbackFile}`);
  console.log(`Rows exported -> waitlist: ${waitlistRows.length}, feedback: ${feedbackRows.length}`);
}

main().catch(error => {
  console.error('Export failed:', error.message);
  process.exit(1);
});

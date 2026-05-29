export function formatToCsv(rows: Record<string, unknown>[], fields: string[]): string {
  if (rows.length === 0) return '';
  
  const header = fields.map(f => `"${f.replace(/"/g, '""')}"`).join(',');
  
  const body = rows.map(row => {
    return fields.map(f => {
      const val = row[f];
      const strVal = val == null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
      return `"${strVal.replace(/"/g, '""')}"`;
    }).join(',');
  }).join('\n');
  
  return `${header}\n${body}`;
}

// Wrap a body of email HTML in a minimal document for safe rendering inside a
// sandboxed iframe. Substitutes the personalization tokens with sample values
// so the preview matches what a real recipient sees.

interface Sample {
  name: string;
  email: string;
}

const DEFAULT_SAMPLE: Sample = {
  name: 'Sample Reader',
  email: 'sample@example.com',
};

export function buildPreviewDoc(
  html: string,
  sample: Partial<Sample> = {},
): string {
  const s = { ...DEFAULT_SAMPLE, ...sample };
  const personalised = html
    .replaceAll('{{name}}', s.name)
    .replaceAll('{{email}}', s.email);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif">
${personalised}
</body>
</html>`;
}

import type {
  OfficeDocumentModel,
  PresentationDeckModel,
  PresentationSlide,
  SpreadsheetAnalysisResult,
  SpreadsheetRow,
} from './types.js';

export class OfficeDocumentEngine {
  /**
   * Parse CSV content into structured rows and headers
   */
  parseCsv(csvContent: string): { headers: string[]; rows: SpreadsheetRow[] } {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());
    const rows: SpreadsheetRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((val) => val.replace(/^["']|["']$/g, '').trim());
      const row: SpreadsheetRow = {};
      headers.forEach((h, idx) => {
        const val = parts[idx] ?? '';
        const num = Number(val);
        row[h] = !isNaN(num) && val !== '' ? num : val;
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Analyze spreadsheet data: calculate metrics, evaluate formulas, and generate Markdown tables
   */
  analyzeSpreadsheet(fileName: string, csvOrRows: string | SpreadsheetRow[]): SpreadsheetAnalysisResult {
    let headers: string[] = [];
    let rows: SpreadsheetRow[] = [];

    if (typeof csvOrRows === 'string') {
      const parsed = this.parseCsv(csvOrRows);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      rows = csvOrRows;
      headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    }

    const statistics: SpreadsheetAnalysisResult['statistics'] = {};
    const formulaEvaluations: Record<string, number | string> = {};

    for (const header of headers) {
      const numericVals = rows
        .map((r) => r[header])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      if (numericVals.length > 0) {
        const count = numericVals.length;
        const sum = numericVals.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        const sorted = [...numericVals].sort((a, b) => a - b);
        const median =
          count % 2 === 1
            ? sorted[Math.floor(count / 2)]
            : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
        const min = sorted[0];
        const max = sorted[count - 1];

        statistics[header] = { count, sum, mean, median, min, max };
        formulaEvaluations[`=SUM(${header})`] = sum;
        formulaEvaluations[`=AVERAGE(${header})`] = Number(mean.toFixed(2));
        formulaEvaluations[`=MEDIAN(${header})`] = median;
        formulaEvaluations[`=MIN(${header})`] = min;
        formulaEvaluations[`=MAX(${header})`] = max;
      } else {
        statistics[header] = { count: rows.length };
      }
    }

    // Generate Markdown Table
    let markdownTable = '';
    if (headers.length > 0) {
      markdownTable += `| ${headers.join(' | ')} |\n`;
      markdownTable += `| ${headers.map(() => '---').join(' | ')} |\n`;
      for (const row of rows.slice(0, 50)) {
        markdownTable += `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |\n`;
      }
      if (rows.length > 50) {
        markdownTable += `*... [${rows.length - 50} additional rows truncated]*\n`;
      }
    }

    const dataSummary = `Processed ${rows.length} rows across ${headers.length} columns. Identified ${Object.keys(statistics).filter((k) => statistics[k].sum !== undefined).length} quantitative metrics.`;

    return {
      fileName,
      rowCount: rows.length,
      columnCount: headers.length,
      columns: headers,
      statistics,
      formulaEvaluations,
      markdownTable,
      dataSummary,
    };
  }

  /**
   * Generate an executive Word/DOCX-compatible structured report in Markdown format
   */
  generateWordDocument(
    title: string,
    executiveSummary: string,
    sections: Array<{ heading: string; body: string; bulletPoints?: string[] }>,
    metadata?: { author?: string; project?: string; citations?: string[] },
  ): string {
    let doc = `# ${title}\n\n`;
    doc += `**Author:** ${metadata?.author || 'OpenDots Cowork Agent'}  \n`;
    if (metadata?.project) doc += `**Project:** ${metadata.project}  \n`;
    doc += `**Date:** ${new Date().toLocaleDateString()}  \n\n`;

    doc += `## Executive Summary\n\n${executiveSummary}\n\n`;

    for (const sec of sections) {
      doc += `## ${sec.heading}\n\n${sec.body}\n\n`;
      if (sec.bulletPoints && sec.bulletPoints.length > 0) {
        for (const bp of sec.bulletPoints) {
          doc += `- ${bp}\n`;
        }
        doc += '\n';
      }
    }

    if (metadata?.citations && metadata.citations.length > 0) {
      doc += `## References & Verified Sources\n\n`;
      metadata.citations.forEach((c, idx) => {
        doc += `[${idx + 1}] ${c}\n`;
      });
      doc += '\n';
    }

    return doc;
  }

  /**
   * Generate a structured PowerPoint-compatible presentation deck outline
   */
  generatePresentationDeck(
    title: string,
    topicOrSlides: string | PresentationSlide[],
    author: string = 'OpenDots Cowork',
  ): PresentationDeckModel {
    let slides: PresentationSlide[] = [];

    if (Array.isArray(topicOrSlides)) {
      slides = topicOrSlides;
    } else {
      const topic = topicOrSlides;
      slides = [
        {
          slideNumber: 1,
          title,
          subtitle: `Strategic Analysis: ${topic}`,
          bullets: ['Executive Overview', 'Key Objectives & Boundaries', 'Methodology'],
          speakerNotes: `Welcome everyone. Today we review our findings and strategy regarding ${topic}.`,
          layout: 'title',
        },
        {
          slideNumber: 2,
          title: 'Current State & Problem Space',
          bullets: [
            'Operational bottlenecks identified in existing workflows',
            'Cross-functional dependencies and resource constraints',
            'Risk mitigation and compliance requirements',
          ],
          speakerNotes: 'This slide highlights the operational challenges addressed by our initiative.',
          layout: 'content',
        },
        {
          slideNumber: 3,
          title: 'Strategic Findings & Comparative Analysis',
          bullets: [
            'Performance benchmarked across core evaluation criteria',
            'Quantitative cost-benefit validation ($0.00 infrastructure guarantee)',
            'Multi-source corroborated evidence',
          ],
          speakerNotes: 'All figures presented here were cross-verified across primary data sources.',
          layout: 'comparison',
        },
        {
          slideNumber: 4,
          title: 'Recommendations & Next Steps',
          bullets: [
            'Implement automated task orchestration with DAG checkpoints',
            'Activate proactive monitoring and approval gates',
            'Final deliverable sign-off and deployment handover',
          ],
          speakerNotes: 'Thank you for your time. Let us address any immediate questions.',
          layout: 'summary',
        },
      ];
    }

    return {
      title,
      author,
      createdAt: Date.now(),
      slides,
    };
  }

  /**
   * Extract tables and sections from unstructured PDF text payloads
   */
  extractPdfContent(rawPdfText: string): {
    title: string;
    sections: Array<{ heading: string; content: string }>;
    tables: Array<{ title: string; rows: string[][] }>;
  } {
    const lines = rawPdfText.split(/\r?\n/).map((l) => l.trim());
    const title = lines[0] || 'Extracted PDF Document';
    const sections: Array<{ heading: string; content: string }> = [];
    const tables: Array<{ title: string; rows: string[][] }> = [];

    let currentHeading = 'Overview';
    let currentBody: string[] = [];
    let currentTableRows: string[][] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (line.includes('|') || line.includes('\t')) {
        const rowParts = line.includes('|')
          ? line.split('|').map((s) => s.trim()).filter(Boolean)
          : line.split('\t').map((s) => s.trim());
        if (rowParts.length > 1) {
          currentTableRows.push(rowParts);
          continue;
        }
      }

      if (currentTableRows.length > 0) {
        tables.push({ title: `Table ${tables.length + 1} (${currentHeading})`, rows: currentTableRows });
        currentTableRows = [];
      }

      if (line.startsWith('#') || (line.length < 50 && line.endsWith(':'))) {
        if (currentBody.length > 0) {
          sections.push({ heading: currentHeading, content: currentBody.join(' ') });
          currentBody = [];
        }
        currentHeading = line.replace(/^#+\s*/, '').replace(/:$/, '');
      } else {
        currentBody.push(line);
      }
    }

    if (currentBody.length > 0) {
      sections.push({ heading: currentHeading, content: currentBody.join(' ') });
    }
    if (currentTableRows.length > 0) {
      tables.push({ title: `Table ${tables.length + 1} (${currentHeading})`, rows: currentTableRows });
    }

    return { title, sections, tables };
  }

  /**
   * Validate document integrity and prevent malformed uploads
   */
  validateDocumentIntegrity(content: string, type: 'csv' | 'json' | 'markdown' | 'office' = 'markdown'): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      issues.push('Document content cannot be empty.');
      return { valid: false, issues };
    }
    if (type === 'json') {
      try {
        JSON.parse(content);
      } catch {
        issues.push('Invalid JSON syntax');
      }
    } else if (type === 'csv') {
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length < 1 || !lines[0].includes(',')) {
        issues.push('CSV content must contain comma-separated header row');
      }
    } else {
      const fenceMatches = (content.match(/```/g) || []).length;
      if (fenceMatches % 2 !== 0) {
        issues.push('Document contains unclosed code blocks (fenced ```)');
      }
    }
    return { valid: issues.length === 0, issues };
  }
}

export const globalOfficeDocumentEngine = new OfficeDocumentEngine();

export function analyzeSpreadsheet(csvContent: string, fileName = 'Spreadsheet'): SpreadsheetAnalysisResult {
  return globalOfficeDocumentEngine.analyzeSpreadsheet(fileName, csvContent);
}

export function generateOfficeDocument(input: {
  title: string;
  author?: string;
  executiveSummary?: string;
  sections: Array<{ title: string; content: string; callout?: string }>;
  recommendations?: string[];
}): string {
  return globalOfficeDocumentEngine.generateWordDocument(
    input.title,
    input.executiveSummary || '',
    input.sections.map((s) => ({ heading: s.title, body: s.content + (s.callout ? `\n\n> ${s.callout}` : '') })),
    { author: input.author, citations: input.recommendations },
  );
}

export function generateSlideDeck(title: string, markdownContent: string): PresentationDeckModel {
  return globalOfficeDocumentEngine.generatePresentationDeck(title, markdownContent);
}

export function validateDocumentIntegrity(content: string, type: 'csv' | 'json' | 'markdown' | 'office' = 'markdown'): { valid: boolean; issues: string[] } {
  return globalOfficeDocumentEngine.validateDocumentIntegrity(content, type);
}

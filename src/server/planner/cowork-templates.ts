import type { CoworkWorkflowTemplate } from './types.js';

export const COWORK_WORKFLOW_TEMPLATES: CoworkWorkflowTemplate[] = [
  {
    id: 'template-1-cited-research',
    title: 'Research a topic and create a cited report',
    description:
      'Performs parallel multi-source web investigations, extracts facts, identifies conflicting evidence, and produces a structured, cited markdown report.',
    category: 'research',
    steps: [
      {
        title: 'Multi-source deep research',
        description: 'Query configured web search sources and cross-verify facts with citations.',
        tool: 'deep_research',
        defaultInput: { query: 'AI Agent architectures and autonomous tool orchestration' },
        assignedSpecialist: 'researcher',
        validationCriteria: ['At least 2 distinct sources cited', 'Citations mapped to specific claims'],
      },
      {
        title: 'Format and export research deliverable',
        description: 'Save formatted research deliverable to the project deliverables directory.',
        tool: 'export_workspace_document',
        defaultInput: { title: 'Executive Research Brief', content: '# Executive Brief\n\nFindings...' },
        assignedSpecialist: 'writer',
        validationCriteria: ['File exported with .md extension', 'Deliverable stored in deliverables folder'],
      },
    ],
  },
  {
    id: 'template-2-folder-summary',
    title: 'Read a folder of documents and produce a summary',
    description:
      'Inspects an authorized folder, extracts content from all documents, and synthesizes an executive summary across them.',
    category: 'documents',
    steps: [
      {
        title: 'Discover folder documents',
        description: 'List all text, markdown, and data files within the target folder.',
        tool: 'list_workspace_files',
        defaultInput: { directory: 'sources' },
        assignedSpecialist: 'data',
      },
      {
        title: 'Synthesize document collection',
        description: 'Generate an executive summary and cross-reference common themes and divergences.',
        tool: 'generate_office_document',
        defaultInput: {
          title: 'Folder Synthesis Summary',
          executiveSummary: 'Synthesized overview of all documents in collection.',
          sections: [{ heading: 'Key Findings', body: 'Extracted themes and insights.' }],
        },
        assignedSpecialist: 'writer',
      },
    ],
  },
  {
    id: 'template-3-document-comparison',
    title: 'Compare multiple documents and produce a change report',
    description:
      'Analyzes two revisions of a specification or document, calculates line diffs, and compiles a changelog report.',
    category: 'documents',
    steps: [
      {
        title: 'Compute revision diff',
        description: 'Compare initial document against current draft and isolate additions/deletions.',
        tool: 'diff_documents',
        defaultInput: { originalPath: 'v1.md', newContent: '# Updated draft' },
        assignedSpecialist: 'reviewer',
      },
      {
        title: 'Publish changelog deliverable',
        description: 'Export structured changelog deliverable for human sign-off.',
        tool: 'export_workspace_document',
        defaultInput: { title: 'Revision Change Report', content: '# Change Report\n\n' },
        assignedSpecialist: 'writer',
      },
    ],
  },
  {
    id: 'template-4-spreadsheet-analysis',
    title: 'Analyze a spreadsheet and create a findings report',
    description:
      'Parses CSV or Excel-compatible data, computes statistics (sum, mean, median, min, max), evaluates formulas, and renders summary tables.',
    category: 'analytics',
    steps: [
      {
        title: 'Tabular metric analysis & formula calculation',
        description: 'Evaluate numeric columns and generate descriptive statistics and markdown table.',
        tool: 'analyze_spreadsheet',
        defaultInput: { rawCsv: 'Item,Cost,Units\nServer,0,1\nModel,0,1\nDisk,0,1' },
        assignedSpecialist: 'analyst',
        validationCriteria: ['Formula evaluations computed', 'Markdown table generated'],
      },
      {
        title: 'Draft analytical findings brief',
        description: 'Synthesize metrics into actionable business recommendations.',
        tool: 'generate_office_document',
        defaultInput: {
          title: 'Spreadsheet Findings & Analysis',
          executiveSummary: 'Evaluation of quantitative metrics and distributions.',
          sections: [{ heading: 'Financial Summary', body: 'All costs maintained at $0.00.' }],
        },
        assignedSpecialist: 'writer',
      },
    ],
  },
  {
    id: 'template-5-presentation-deck',
    title: 'Create a presentation from supplied documents',
    description:
      'Synthesizes complex documents or research into a multi-slide executive deck outline with speaker notes and layouts.',
    category: 'presentation',
    steps: [
      {
        title: 'Generate slide presentation structure',
        description: 'Outline slides with headings, bullets, layouts, and speaker notes.',
        tool: 'generate_slide_deck',
        defaultInput: { title: 'Executive Project Review', topic: 'Autonomous Agent Architecture' },
        assignedSpecialist: 'writer',
        validationCriteria: ['At least 4 structured slides', 'Speaker notes present on all slides'],
      },
    ],
  },
  {
    id: 'template-6-file-organization',
    title: 'Organize files within an authorized workspace',
    description:
      'Audits workspace directory structure and classifies files into sources, intermediate, and final deliverables.',
    category: 'documents',
    steps: [
      {
        title: 'Audit workspace file inventory',
        description: 'List and inspect extensions, sizes, and file categories across the project.',
        tool: 'list_workspace_files',
        defaultInput: {},
        assignedSpecialist: 'data',
      },
      {
        title: 'Generate organization audit manifest',
        description: 'Output manifest categorizing files into source, intermediate, and deliverable tiers.',
        tool: 'export_workspace_document',
        defaultInput: { title: 'Workspace File Manifest', content: '# File Manifest\n\n' },
        assignedSpecialist: 'automation',
      },
    ],
  },
  {
    id: 'template-7-repo-review-plan',
    title: 'Review a project repository and prepare a proposed improvement plan',
    description:
      'Analyzes codebase architecture, tests, and security postures to produce a prioritized refactoring roadmap.',
    category: 'engineering',
    steps: [
      {
        title: 'Analyze architecture & technical debt',
        description: 'Review module structure, type safety, test coverage, and security boundaries.',
        tool: 'text_analyzer',
        defaultInput: { text: 'OpenDots Node/TS architecture and Hono routing engine.' },
        assignedSpecialist: 'coder',
      },
      {
        title: 'Draft architectural improvement plan',
        description: 'Produce an actionable technical roadmap with milestone estimates.',
        tool: 'generate_office_document',
        defaultInput: {
          title: 'Codebase Modernization & Refactoring Plan',
          executiveSummary: 'Prioritized technical improvements.',
          sections: [{ heading: 'Key Architecture Goals', body: 'Strengthen security boundaries and isolation.' }],
        },
        assignedSpecialist: 'planner',
      },
    ],
  },
  {
    id: 'template-8-email-message-drafts',
    title: 'Draft emails or messages for human review',
    description:
      'Searches context, drafts tailored communications, and queues them in the Approval Center without sending prematurely.',
    category: 'documents',
    steps: [
      {
        title: 'Draft context-aware email reply',
        description: 'Compose communication draft based on project specifications.',
        tool: 'google_gmail_workspace',
        defaultInput: {
          action: 'draft_reply',
          to: 'stakeholder@example.com',
          subject: 'Project Handover & Milestones',
          body: 'Here is the summary of deliverables completed.',
        },
        assignedSpecialist: 'writer',
        requiresApproval: true,
        validationCriteria: ['Draft queued in Approval Center', 'Explicit recipient and subject'],
      },
    ],
  },
  {
    id: 'template-9-verified-deliverable',
    title: 'Research a subject, create a deliverable, and verify it against the request',
    description:
      'Runs research, writes a deliverable, and invokes the step verifier to rigorously check acceptance criteria.',
    category: 'research',
    steps: [
      {
        title: 'Execute deep research',
        description: 'Gather facts and verified citations for the subject.',
        tool: 'deep_research',
        defaultInput: { query: 'Zero-cost autonomous AI agent security practices' },
        assignedSpecialist: 'researcher',
      },
      {
        title: 'Compile and format deliverable',
        description: 'Write complete deliverable with cited findings.',
        tool: 'export_workspace_document',
        defaultInput: { title: 'Security Best Practices Report', content: '# Security Best Practices\n\n' },
        assignedSpecialist: 'writer',
      },
      {
        title: 'Rigorously verify acceptance criteria',
        description: 'Validate that all required criteria are satisfied before marking task complete.',
        tool: 'verify_step_output',
        defaultInput: {
          stepTitle: 'Security Best Practices Verification',
          acceptanceCriteria: ['Zero-cost infrastructure preserved', 'No secrets exposed in outputs'],
          outputToVerify: 'Verified: All operations executed locally at $0.00 cost without secret leakage.',
        },
        assignedSpecialist: 'reviewer',
        validationCriteria: ['Recommendation is proceed', 'Zero failed criteria'],
      },
    ],
  },
  {
    id: 'template-10-scheduled-report',
    title: 'Run a scheduled report when persistent scheduling is supported',
    description:
      'Configures a recurring background task with conditional threshold triggers and quiet hours respect.',
    category: 'analytics',
    steps: [
      {
        title: 'Set up recurring task with quiet hours',
        description: 'Initialize background monitoring task for periodic summary runs.',
        tool: 'google_calendar_tasks_workspace',
        defaultInput: {
          action: 'create_task',
          title: 'Periodic Autonomous Health & Progress Review',
          dueIso: new Date(Date.now() + 86400000).toISOString(),
        },
        assignedSpecialist: 'automation',
      },
    ],
  },
  {
    id: 'template-11-contradiction-review',
    title: 'Review task outputs for missing requirements and contradictions',
    description:
      'Compares multiple deliverables or claims against requirements to flag discrepancies, conflicts, and gaps.',
    category: 'engineering',
    steps: [
      {
        title: 'Audit deliverables for contradictions',
        description: 'Run textual and logical consistency checks on deliverables.',
        tool: 'verify_step_output',
        defaultInput: {
          stepTitle: 'Consistency & Completeness Audit',
          acceptanceCriteria: ['Output fulfills all user constraints', 'No contradictory claims'],
          outputToVerify: 'Full alignment verified across specifications.',
        },
        assignedSpecialist: 'reviewer',
      },
    ],
  },
  {
    id: 'template-12-project-handover',
    title: 'Generate a project handover with completed work, files, and remaining issues',
    description:
      'Compiles a final handover brief detailing completed milestones, files produced, and open decisions.',
    category: 'handover',
    steps: [
      {
        title: 'Generate comprehensive project handover brief',
        description: 'Produce final handover document summarizing project state, deliverables, and next steps.',
        tool: 'generate_office_document',
        defaultInput: {
          title: 'Project Handover & Deliverable Sign-Off',
          executiveSummary: 'All project milestones have been executed and verified.',
          sections: [
            { heading: 'Completed Milestones', body: 'All core Cowork capabilities implemented.' },
            { heading: 'Generated Deliverables', body: 'Reports, spreadsheets, decks, and logs archived.' },
            { heading: 'Operational Instructions', body: 'Service is live and ready for deployment verification.' },
          ],
        },
        assignedSpecialist: 'writer',
        validationCriteria: ['Executive summary present', 'Deliverables listed'],
      },
    ],
  },
];

export function getCoworkTemplate(templateId: string): CoworkWorkflowTemplate | undefined {
  if (!templateId) return undefined;
  const exact = COWORK_WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
  if (exact) return exact;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(cowork|template[-_0-9]*)[-_]/, '')
      .replace(/[^a-z0-9]/g, '');

  const normTarget = normalize(templateId);
  return COWORK_WORKFLOW_TEMPLATES.find((t) => {
    const normId = normalize(t.id);
    return normId === normTarget || normId.includes(normTarget) || normTarget.includes(normId);
  });
}

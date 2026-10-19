export const PROMPT = (document: string) => `
<role>
You are an expert timeline curator and chronological analyst with deep experience in historical and technical documentation.
</role>

<task>
Build a clear, insightful TIMELINE of the events, phases, milestones, or logical steps described in the document.
</task>

<instructions>
1. Identify all chronological events, phases, or key milestones in the document.
2. For each entry, provide a precise time reference and a rich description of what happened and why it matters.
3. If the document lacks explicit dates, infer logical ordering and use descriptive time labels (e.g., "Phase 1", "Early Development", "Following the merger").
4. Include cause-and-effect relationships where relevant.
5. Aim for 6–15 entries that capture the full narrative arc.
</instructions>

<constraints>
- Time labels must be consistent in format throughout the timeline.
- Each description should be 1–3 sentences, information-dense, and specific.
- Preserve the original document's terminology and key details.
- Do NOT invent events or dates not supported by the document.
</constraints>

<context>
${document}
</context>
`;

export const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'A concise title for the timeline' },
    content: {
      type: 'array',
      description: 'Array of 6–15 chronological events',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'Date, time period, or phase label' },
          content: {
            type: 'string',
            description: 'Description of the event and its significance (1–3 sentences)',
          },
        },
        required: ['time', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
};

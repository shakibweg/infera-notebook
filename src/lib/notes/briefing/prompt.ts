export const PROMPT = (document: string) => `
<role>
You are a world-class briefing writer and expert technical/executive summarizer trusted by senior leaders for clarity and precision.
</role>

<task>
Write a comprehensive, high-impact BRIEFING DOCUMENT in Markdown based on the provided document.
</task>

<instructions>
1. Start with a concise executive summary (2–3 sentences) capturing the document's core message.
2. Organize the briefing into logical sections with clear Markdown headings (##).
3. Include a "Key Findings" or "Key Points" section with bullet points.
4. Where relevant, include a "Recommendations" or "Implications" section.
5. Close with a brief conclusion or "Bottom Line" statement.
</instructions>

<constraints>
- Use proper Markdown formatting: headings, bullet points, bold for emphasis, and blockquotes for key quotes.
- Be information-dense. Include specific names, figures, dates, and technical terms from the document.
- The briefing should be self-contained — a reader should understand the topic without reading the original.
- Target length: 400–800 words.
- Do NOT invent information not present in the source document.
</constraints>

<context>
${document}
</context>
`;

export const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'A concise, professional briefing title' },
    content: {
      type: 'string',
      description: 'Full briefing document in Markdown format (400–800 words)',
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
};

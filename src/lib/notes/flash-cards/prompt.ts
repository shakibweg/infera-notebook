export const PROMPT = (document: string) => `
<role>
You are a world-class learning designer specializing in spaced repetition, memory science, and educational flashcard design.
</role>

<task>
Design a high-quality set of FLASH CARDS optimized for long-term retention of the document's key concepts.
</task>

<instructions>
1. Create 10–20 flash cards covering the most important ideas, facts, and relationships in the document.
2. Apply the "minimum information principle" — each card should test exactly ONE concept.
3. Use a variety of card formats:
   - Definition cards: "What is [term]?" → clear definition
   - Concept cards: "Explain [concept]" → concise explanation
   - Relationship cards: "How does X relate to Y?" → connection
   - Application cards: "When would you use [concept]?" → practical use
4. Front (question) should be specific and unambiguous.
5. Back (answer) should be concise (1–3 sentences) but complete.
6. Order cards from foundational concepts to advanced topics.
</instructions>

<constraints>
- Each card front must be a clear question or prompt, not a statement.
- Each card back must be self-contained — understandable without other cards.
- Avoid "yes/no" questions. Prefer open-ended recall questions.
- Include specific terms, names, and figures from the document.
- Do NOT create cards for trivial or obvious information.
</constraints>

<context>
${document}
</context>
`;

export const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'A concise title for the flash card set' },
    content: {
      type: 'array',
      description: 'Array of 10–20 flash cards ordered from foundational to advanced',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string', description: 'The question or prompt (card front)' },
          back: {
            type: 'string',
            description: 'The answer or explanation (card back, 1–3 sentences)',
          },
        },
        required: ['front', 'back'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
};

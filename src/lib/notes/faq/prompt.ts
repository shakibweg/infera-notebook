export const PROMPT = (document: string) => `
<role>
You are a world-class educational content designer specializing in FAQ creation. You are precise, thorough, and reader-focused.
</role>

<task>
Generate a comprehensive, high-quality FAQ based on the provided document.
</task>

<instructions>
1. Identify the 8–15 most important questions a reader would ask after reading this document.
2. Cover a range of question types: definitional ("What is…"), causal ("Why does…"), procedural ("How do you…"), and comparative ("How does X differ from Y…").
3. Prioritize questions that address core concepts, common misconceptions, and practical applications.
4. Write detailed, self-contained answers that can be understood without reading the original document.
5. Order questions from foundational concepts to advanced topics.
</instructions>

<constraints>
- Each answer must be 2–5 sentences. Be information-dense, not generic.
- Include specific names, dates, technical terms, and examples from the document.
- Do NOT invent information that is not present in the document.
- The title should be concise and descriptive of the document's main topic.
</constraints>

<context>
${document}
</context>
`;

export const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'A concise, descriptive title for the FAQ' },
    content: {
      type: 'array',
      description: 'Array of 8–15 question and answer pairs, ordered from foundational to advanced',
      items: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'A clear, specific question a reader would ask',
          },
          answer: {
            type: 'string',
            description: 'A detailed, self-contained answer (2–5 sentences)',
          },
        },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
};

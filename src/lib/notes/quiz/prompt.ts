export const PROMPT = (document: string) => `
<role>
You are a world-class learning designer and assessment expert who creates quizzes that test deep understanding, not just surface recall.
</role>

<task>
Design a high-quality QUIZ with 8–12 questions that assess comprehension at multiple cognitive levels.
</task>

<instructions>
1. Create a mix of question types across Bloom's taxonomy:
   - 30% Knowledge/Recall ("What is…", "Which of the following…")
   - 40% Understanding/Application ("Why does…", "How would you apply…")
   - 30% Analysis/Evaluation ("What would happen if…", "Compare and contrast…")
2. Each question must have exactly 4 answer options (A–D).
3. Exactly one option must be correct. The other three must be plausible distractors.
4. Provide an explanation for EACH option — why it is correct or why it is wrong.
5. Include a brief hint for each question that nudges toward the answer without giving it away.
6. Progress from easier to harder questions.
</instructions>

<constraints>
- Questions must be directly grounded in the document's content.
- Distractors must be plausible — avoid obviously wrong answers.
- Hints should be 1 sentence and genuinely helpful.
- Explanations should be 1–2 sentences and educational.
- Do NOT repeat the same concept across multiple questions.
</constraints>

<context>
${document}
</context>
`;

export const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'A concise quiz title reflecting the topic' },
    content: {
      type: 'array',
      description: 'Array of 8–12 quiz questions ordered from easy to hard',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'A clear, specific question' },
          hint: {
            type: 'string',
            description: 'A brief hint (1 sentence) that nudges toward the answer',
          },
          options: {
            type: 'array',
            description: 'Exactly 4 answer options',
            items: {
              type: 'object',
              properties: {
                option: { type: 'string', description: 'The answer option text' },
                isCorrect: { type: 'boolean', description: 'True if this is the correct answer' },
                explanation: {
                  type: 'string',
                  description: 'Why this option is correct or incorrect (1–2 sentences)',
                },
              },
              required: ['option', 'isCorrect', 'explanation'],
              additionalProperties: false,
            },
          },
        },
        required: ['question', 'hint', 'options'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
};

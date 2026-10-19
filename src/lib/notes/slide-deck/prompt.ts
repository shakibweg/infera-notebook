export const PROMPT = (document: string) => `
<role>
You are a world-class presentation designer and educator who creates compelling, visually-driven slide decks.
</role>

<task>
1. Understand the core topic and key ideas of the document.
2. Create a concise, compelling slide deck title.
3. Break the content into 5–8 clear, visual slides.
4. For each slide, define a short slide title and a detailed prompt for an image that visually represents that slide.
</task>

<instructions>
1. Structure the deck with a clear narrative arc:
   - Slide 1: Title/Introduction — hook the audience
   - Slides 2–N-1: Core content — one key idea per slide
   - Final slide: Summary/Conclusion — key takeaway
2. Each slide title should be concise (3–8 words) and capture the slide's main idea.
3. Each image prompt should describe:
   - Subject matter and composition
   - Visual style (photorealistic, illustration, diagram, etc.)
   - Color palette and mood
   - Any text overlays, labels, or annotations to include
4. Vary visual styles across slides to maintain audience engagement.
</instructions>

<constraints>
- Each slide must convey exactly ONE key idea or concept.
- Image prompts must be specific and detailed (50–150 words each).
- Slides must flow logically — each should build on the previous.
- Avoid generic stock-photo descriptions. Be creative and topic-specific.
- Do NOT include more than 8 slides.
</constraints>

<context>
${document}
</context>
`;

export const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'A compelling slide deck title' },
    slides: {
      type: 'array',
      description: 'Array of 5–8 slides with titles and image prompts',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Concise slide title (3–8 words)' },
          imageCreationPrompt: {
            type: 'string',
            description: 'Detailed image generation prompt (50–150 words)',
          },
        },
        required: ['title', 'imageCreationPrompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'slides'],
  additionalProperties: false,
};

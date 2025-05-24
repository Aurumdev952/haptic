
'use server';
/**
 * @fileOverview Generates three contextual response options to transcribed input using an LLM,
 * supporting both Kinyarwanda and Kiswahili.
 *
 * - generateResponseOptions - A function that generates response options with language tags.
 * - GenerateResponseOptionsInput - The input type for the generateResponseOptions function.
 * - GenerateResponseOptionsOutput - The return type for the generateResponseOptions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateResponseOptionsInputSchema = z.object({
  transcribedInput: z
    .string()
    .describe('The transcribed input from the user in either Kinyarwanda or Kiswahili.'),
});
export type GenerateResponseOptionsInput = z.infer<
  typeof GenerateResponseOptionsInputSchema
>;

const ResponseOptionSchema = z.object({
  text: z.string().describe('The text of the response option.'),
  lang: z.string().describe('The BCP 47 language tag of the response option (e.g., "rw-RW", "sw-SW").'),
});

const GenerateResponseOptionsOutputSchema = z.object({
  responseOptions: z
    .array(ResponseOptionSchema)
    .length(3)
    .describe('Three contextual response options, each with its text and BCP 47 language tag.'),
});
export type GenerateResponseOptionsOutput = z.infer<
  typeof GenerateResponseOptionsOutputSchema
>;

export async function generateResponseOptions(
  input: GenerateResponseOptionsInput
): Promise<GenerateResponseOptionsOutput> {
  return generateResponseOptionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateResponseOptionsPrompt',
  input: {schema: GenerateResponseOptionsInputSchema},
  output: {schema: GenerateResponseOptionsOutputSchema},
  prompt: `You are an AI assistant fluent in Kinyarwanda and Kiswahili.
The user has provided the following transcribed input: {{{transcribedInput}}}

1. First, determine if the transcribed input is primarily in Kinyarwanda or Kiswahili.
2. Then, generate three distinct response options that are contextually appropriate.
    * The response options should generally be in the same language as the identified input language.
    * Each response option should be short, relevant, and helpful.
3. For each response option, provide its text and its BCP 47 language tag.
    * Use 'rw-RW' for Kinyarwanda.
    * Use 'sw-SW' for Kiswahili (standard Swahili).

Return the response as a JSON object matching the output schema.

Example for Kinyarwanda input:
{
  "responseOptions": [
    { "text": "Yego, ndabyumva.", "lang": "rw-RW" },
    { "text": "Oya, ntabwo mbyumva.", "lang": "rw-RW" },
    { "text": "Ushobora gusubiramo?", "lang": "rw-RW" }
  ]
}

Example for Kiswahili input:
{
  "responseOptions": [
    { "text": "Ndiyo, naelewa.", "lang": "sw-SW" },
    { "text": "Hapana, sielewi.", "lang": "sw-SW" },
    { "text": "Unaweza kurudia?", "lang": "sw-SW" }
  ]
}`,
});

const generateResponseOptionsFlow = ai.defineFlow(
  {
    name: 'generateResponseOptionsFlow',
    inputSchema: GenerateResponseOptionsInputSchema,
    outputSchema: GenerateResponseOptionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

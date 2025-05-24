// 'use server';
/**
 * @fileOverview Generates three contextual response options to transcribed input using an LLM.
 *
 * - generateResponseOptions - A function that generates response options.
 * - GenerateResponseOptionsInput - The input type for the generateResponseOptions function.
 * - GenerateResponseOptionsOutput - The return type for the generateResponseOptions function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateResponseOptionsInputSchema = z.object({
  transcribedInput: z
    .string()
    .describe('The transcribed input from the user in either Kiyarwanda or Kiswahili.'),
});
export type GenerateResponseOptionsInput = z.infer<
  typeof GenerateResponseOptionsInputSchema
>;

const GenerateResponseOptionsOutputSchema = z.object({
  responseOptions: z
    .array(z.string())
    .length(3)
    .describe('Three contextual response options to the transcribed input.'),
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
  prompt: `You are an AI assistant designed to generate contextual response options. A user has provided the following transcribed input: {{{transcribedInput}}}. Generate three distinct response options that would be appropriate in the context of this input. The responses should be short, relevant, and helpful. Return as a JSON array of strings.

For example:

{
  "responseOptions": [
    "Response option 1",
    "Response option 2",
    "Response option 3"
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

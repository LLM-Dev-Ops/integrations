/**
 * Safety Settings Example
 *
 * This example demonstrates:
 * - Configuring harm categories and block thresholds
 * - Handling SafetyBlockedError exceptions
 * - Understanding safety ratings in responses
 * - Different safety threshold levels
 *
 * Prerequisites:
 * - Set the GEMINI_API_KEY environment variable
 *
 * Usage:
 * ```bash
 * export GEMINI_API_KEY="your-api-key"
 * npm run build
 * node dist/examples/safety-settings.js
 * ```
 */

import { createClientFromEnv, SafetyBlockedError } from '../src/index.js';

/**
 * Example 1: Generate content with default safety settings
 */
async function exampleDefaultSafety(): Promise<void> {
  console.log('\n=== Example 1: Default Safety Settings ===\n');

  const client = createClientFromEnv();

  console.log('Generating content with default safety settings...');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [{ text: 'Write a short children\'s story about a friendly dragon.' }],
      },
    ],
  });

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    const text = candidate.content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Generated text:', text);

    // Show safety ratings
    if (candidate.safetyRatings && candidate.safetyRatings.length > 0) {
      console.log('\n--- Safety Ratings ---');
      for (const rating of candidate.safetyRatings) {
        console.log(`${rating.category}: ${rating.probability}`);
      }
    }
  }
}

/**
 * Example 2: Configure custom safety settings
 */
async function exampleCustomSafety(): Promise<void> {
  console.log('\n=== Example 2: Custom Safety Settings ===\n');

  const client = createClientFromEnv();

  console.log('Generating content with custom safety settings...');
  console.log('- Blocking MEDIUM and above for harassment');
  console.log('- Blocking HIGH only for hate speech\n');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [{ text: 'Tell me about the importance of kindness in society.' }],
      },
    ],
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
    ],
  });

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    const text = candidate.content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Generated text:', text);

    // Show safety ratings
    if (candidate.safetyRatings && candidate.safetyRatings.length > 0) {
      console.log('\n--- Safety Ratings ---');
      for (const rating of candidate.safetyRatings) {
        console.log(`${rating.category}: ${rating.probability}`);
      }
    }
  }
}

/**
 * Example 3: Very permissive settings (BLOCK_NONE)
 */
async function examplePermissiveSafety(): Promise<void> {
  console.log('\n=== Example 3: Permissive Safety Settings (BLOCK_NONE) ===\n');

  const client = createClientFromEnv();

  console.log('Generating content with BLOCK_NONE for all categories...');
  console.log('WARNING: This allows potentially harmful content to pass through.\n');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [{ text: 'Write a paragraph about internet safety for children.' }],
      },
    ],
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
    ],
  });

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    const text = candidate.content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('Generated text:', text);

    // Show safety ratings
    if (candidate.safetyRatings && candidate.safetyRatings.length > 0) {
      console.log('\n--- Safety Ratings ---');
      for (const rating of candidate.safetyRatings) {
        console.log(`${rating.category}: ${rating.probability}`);
      }
    }
  }
}

/**
 * Example 4: Handling SafetyBlockedError
 */
async function exampleSafetyBlock(): Promise<void> {
  console.log('\n=== Example 4: Handling Safety Blocks ===\n');

  const client = createClientFromEnv();

  try {
    console.log('Attempting to generate content with strict safety settings...');

    // Use very strict settings that might trigger a block
    const response = await client.content.generate('gemini-2.0-flash-exp', {
      contents: [
        {
          parts: [
            {
              text: 'Write a very safe and wholesome story about a puppy finding a home.',
            },
          ],
        },
      ],
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        },
      ],
    });

    console.log('Content generated successfully without safety blocks!');

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const text = candidate.content?.parts
        .map((part) => ('text' in part ? part.text : ''))
        .join('');

      console.log('Generated text:', text);
    }
  } catch (error) {
    if (error instanceof SafetyBlockedError) {
      console.log('Content was blocked by safety filters!');
      console.log(`Block reason: ${error.blockReason}`);

      if (error.safetyRatings && error.safetyRatings.length > 0) {
        console.log('\n--- Safety Ratings that caused block ---');
        for (const rating of error.safetyRatings) {
          console.log(`${rating.category}: ${rating.probability}`);
        }
      }
    } else {
      throw error;
    }
  }
}

/**
 * Example 5: Understanding prompt feedback
 */
async function examplePromptFeedback(): Promise<void> {
  console.log('\n=== Example 5: Prompt Feedback ===\n');

  const client = createClientFromEnv();

  console.log('Generating content and checking prompt feedback...');

  const response = await client.content.generate('gemini-2.0-flash-exp', {
    contents: [
      {
        parts: [{ text: 'Explain the benefits of exercise for mental health.' }],
      },
    ],
  });

  // Check prompt feedback
  if (response.promptFeedback) {
    console.log('\n--- Prompt Feedback ---');
    if (response.promptFeedback.blockReason) {
      console.log(`Block Reason: ${response.promptFeedback.blockReason}`);
    } else {
      console.log('Prompt was not blocked.');
    }

    if (response.promptFeedback.safetyRatings) {
      console.log('\n--- Prompt Safety Ratings ---');
      for (const rating of response.promptFeedback.safetyRatings) {
        console.log(`${rating.category}: ${rating.probability}`);
      }
    }
  }

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    const text = candidate.content?.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join('');

    console.log('\nGenerated text:', text);
  }
}

/**
 * Main function running all examples
 */
async function main(): Promise<void> {
  try {
    console.log('=== Safety Settings Examples ===');

    // Run all examples
    await exampleDefaultSafety();
    await exampleCustomSafety();
    await examplePermissiveSafety();
    await exampleSafetyBlock();
    await examplePromptFeedback();

    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('\nError during safety examples:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the examples
main();

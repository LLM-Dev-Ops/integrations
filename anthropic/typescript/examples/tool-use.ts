/**
 * Tool use (function calling) example
 *
 * This example demonstrates how to define tools (functions) that Claude can call,
 * handle tool use requests, execute the tools, and return results back to Claude.
 *
 * ## Usage
 *
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/tool-use.ts
 * ```
 */

import { createClientFromEnv } from '../src/index.js';

/**
 * Simulated weather API function
 */
function getWeather(location: string, unit: string): object {
  // In a real application, this would call an actual weather API
  const temperature = unit === 'celsius' ? 22 : 72;

  return {
    location,
    temperature,
    unit,
    conditions: 'Partly cloudy',
    humidity: 65,
    wind_speed: 10,
  };
}

/**
 * Simulated calculator function
 */
function calculate(operation: string, a: number, b: number): object {
  let result: number;

  switch (operation) {
    case 'add':
      result = a + b;
      break;
    case 'subtract':
      result = a - b;
      break;
    case 'multiply':
      result = a * b;
      break;
    case 'divide':
      if (b === 0) {
        return { error: 'Division by zero' };
      }
      result = a / b;
      break;
    default:
      return { error: 'Unknown operation' };
  }

  return { operation, a, b, result };
}

async function main() {
  console.log('Anthropic Tool Use Example');
  console.log('==========================\n');

  const client = createClientFromEnv();

  // Define available tools
  const tools = [
    {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      input_schema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: "City name, e.g., 'San Francisco, CA' or 'London, UK'",
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature unit',
            default: 'celsius',
          },
        },
        required: ['location'],
      },
    },
    {
      name: 'calculate',
      description: 'Perform basic arithmetic operations',
      input_schema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['add', 'subtract', 'multiply', 'divide'],
            description: 'The arithmetic operation to perform',
          },
          a: {
            type: 'number',
            description: 'First number',
          },
          b: {
            type: 'number',
            description: 'Second number',
          },
        },
        required: ['operation', 'a', 'b'],
      },
    },
  ];

  // Initial user message
  const userMessage = "What's the weather in San Francisco? Also, what's 42 multiplied by 17?";

  console.log(`User: ${userMessage}\n`);

  try {
    // First request with tools
    console.log('Sending request to Claude...\n');

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
      tools,
    });

    // Collect tool use blocks and prepare conversation history
    const toolResults: any[] = [];
    const conversation: any[] = [{ role: 'user', content: userMessage }];

    console.log("Claude's response:");
    for (const block of response.content) {
      if (block.type === 'text') {
        console.log(`Text: ${block.text}`);
      } else if (block.type === 'tool_use') {
        console.log(`\nTool Use: ${block.name}`);
        console.log(`Input: ${JSON.stringify(block.input, null, 2)}`);

        // Execute the appropriate tool
        let result: object;

        if (block.name === 'get_weather') {
          const { location, unit = 'celsius' } = block.input as any;
          console.log(`\nExecuting get_weather(${location}, ${unit})...`);
          result = getWeather(location, unit);
        } else if (block.name === 'calculate') {
          const { operation, a, b } = block.input as any;
          console.log(`\nExecuting calculate(${operation}, ${a}, ${b})...`);
          result = calculate(operation, a, b);
        } else {
          result = { error: 'Unknown tool' };
        }

        console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);

        // Store tool result for next request
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    // If tools were used, send results back to Claude
    if (toolResults.length > 0) {
      conversation.push({ role: 'assistant', content: response.content });
      conversation.push({ role: 'user', content: toolResults });

      console.log('Sending tool results back to Claude...\n');

      // Second request with tool results
      const finalResponse = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: conversation,
      });

      console.log("Claude's final response:");
      console.log('---');
      for (const block of finalResponse.content) {
        if (block.type === 'text') {
          console.log(block.text);
        }
      }
      console.log('---\n');

      console.log('Token Usage:');
      console.log(`  Total input tokens:  ${response.usage.input_tokens + finalResponse.usage.input_tokens}`);
      console.log(`  Total output tokens: ${response.usage.output_tokens + finalResponse.usage.output_tokens}`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

/**
 * PDF analysis example
 *
 * This example demonstrates how to send PDF documents to Claude for analysis.
 * Claude can extract information, summarize content, and answer questions about PDFs.
 *
 * ## Usage
 *
 * Provide a PDF file path as an argument:
 * ```bash
 * export ANTHROPIC_API_KEY=sk-ant-api03-...
 * npx tsx examples/pdf-analysis.ts /path/to/document.pdf
 * ```
 */

import { createClient, AnthropicConfigBuilder } from '../src/index.js';
import { readFileSync } from 'fs';

async function main() {
  console.log('Anthropic PDF Analysis Example');
  console.log('==============================\n');

  // Enable PDF support beta feature
  const config = new AnthropicConfigBuilder()
    .withApiKey(process.env.ANTHROPIC_API_KEY!)
    .withBetaFeature('pdfs-2024-09-25')
    .build();

  const client = createClient(config);

  // Get PDF path from command line args
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.log("No PDF path provided. Here's how to use this example:\n");
    console.log('  npx tsx examples/pdf-analysis.ts /path/to/document.pdf\n');
    console.log('What you can do with PDF analysis:');
    console.log('  - Summarize documents');
    console.log('  - Extract specific information');
    console.log('  - Answer questions about content');
    console.log('  - Analyze tables and figures');
    console.log('  - Compare sections');
    console.log('\nSupported: PDFs up to 32MB and 100 pages');
    return;
  }

  // Validate file is a PDF
  if (!pdfPath.endsWith('.pdf')) {
    console.error('File must have .pdf extension');
    process.exit(1);
  }

  console.log(`Loading PDF from: ${pdfPath}\n`);

  try {
    // Read PDF file
    const pdfData = readFileSync(pdfPath);
    const fileSizeMB = pdfData.length / (1024 * 1024);

    console.log(`PDF size: ${fileSizeMB.toFixed(2)} MB`);

    if (fileSizeMB > 32) {
      throw new Error('PDF file is too large. Maximum size is 32MB');
    }

    // Encode to base64
    const base64Pdf = pdfData.toString('base64');

    console.log('PDF loaded successfully.\n');

    // Analysis tasks to perform
    const tasks = [
      {
        name: 'Summarization',
        question: 'Provide a comprehensive summary of this document, highlighting the main points and key findings.',
      },
      {
        name: 'Key Information',
        question: 'What are the most important facts, figures, or conclusions in this document?',
      },
      {
        name: 'Structure',
        question: 'Describe the structure and organization of this document. What are the main sections?',
      },
    ];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(`=== Task ${i + 1}: ${task.name} ===`);
      console.log(`Question: ${task.question}\n`);

      // Create request with PDF and question
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf,
                },
              },
              {
                type: 'text',
                text: task.question,
              },
            ],
          },
        ],
      });

      console.log('Analyzing PDF...\n');
      console.log("Claude's response:");
      console.log('---');
      for (const block of response.content) {
        if (block.type === 'text') {
          console.log(block.text);
        }
      }
      console.log('---\n');

      if (i === 0) {
        // Show token usage for first request
        console.log('Token usage:');
        console.log(`  Input tokens:  ${response.usage.input_tokens}`);
        console.log(`  Output tokens: ${response.usage.output_tokens}`);
        console.log('Note: Input tokens include the PDF encoding\n');
      }
    }

    console.log('\n=== Tips for PDF Analysis ===');
    console.log('- Maximum PDF size: 32MB');
    console.log('- Maximum pages: 100');
    console.log('- Claude can extract text, tables, and understand document structure');
    console.log('- Works with scanned PDFs (OCR) and native PDFs');
    console.log('- You can ask specific questions about sections, tables, or figures');
    console.log('- Consider using prompt caching for multiple questions about the same PDF');

    console.log('\n=== Advanced Usage ===');
    console.log('To cache the PDF for multiple queries:');
    console.log('  1. Add cache_control to the Document block');
    console.log('  2. Enable prompt caching beta feature');
    console.log('  3. Subsequent requests will use cached PDF, saving tokens');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

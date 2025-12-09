import { describe, it, expect } from 'vitest';
import {
  COMPUTER_USE_BETA_HEADER,
  createComputerTool,
  createTextEditorTool,
  createBashTool,
  createComputerUseTools,
  ComputerToolResultBuilder,
  createComputerToolResult,
  createTextToolResult,
  createScreenshotToolResult,
  validateComputerTool,
} from '../computer-use.js';

describe('Computer Use', () => {
  describe('COMPUTER_USE_BETA_HEADER', () => {
    it('should have correct beta header value', () => {
      expect(COMPUTER_USE_BETA_HEADER).toBe('computer-use-2024-10-22');
    });
  });

  describe('createComputerTool', () => {
    it('should create computer tool with valid dimensions', () => {
      const tool = createComputerTool(1920, 1080);

      expect(tool).toEqual({
        type: 'computer_20241022',
        name: 'computer',
        display_width_px: 1920,
        display_height_px: 1080,
        display_number: 1,
      });
    });

    it('should allow custom display number', () => {
      const tool = createComputerTool(1920, 1080, 2);

      expect(tool.display_number).toBe(2);
    });

    it('should throw error for zero width', () => {
      expect(() => createComputerTool(0, 1080)).toThrow('Display dimensions must be greater than 0');
    });

    it('should throw error for zero height', () => {
      expect(() => createComputerTool(1920, 0)).toThrow('Display dimensions must be greater than 0');
    });

    it('should throw error for negative width', () => {
      expect(() => createComputerTool(-1920, 1080)).toThrow('Display dimensions must be greater than 0');
    });

    it('should throw error for negative height', () => {
      expect(() => createComputerTool(1920, -1080)).toThrow('Display dimensions must be greater than 0');
    });

    it('should throw error for negative display number', () => {
      expect(() => createComputerTool(1920, 1080, -1)).toThrow('Display number must be non-negative');
    });

    it('should support different screen sizes', () => {
      const tool1 = createComputerTool(1024, 768);
      const tool2 = createComputerTool(2560, 1440);
      const tool3 = createComputerTool(3840, 2160);

      expect(tool1.display_width_px).toBe(1024);
      expect(tool2.display_width_px).toBe(2560);
      expect(tool3.display_width_px).toBe(3840);
    });
  });

  describe('createTextEditorTool', () => {
    it('should create text editor tool', () => {
      const tool = createTextEditorTool();

      expect(tool).toEqual({
        type: 'text_editor_20241022',
        name: 'str_replace_editor',
      });
    });
  });

  describe('createBashTool', () => {
    it('should create bash tool', () => {
      const tool = createBashTool();

      expect(tool).toEqual({
        type: 'bash_20241022',
        name: 'bash',
      });
    });
  });

  describe('createComputerUseTools', () => {
    it('should create all computer use tools', () => {
      const tools = createComputerUseTools(1920, 1080);

      expect(tools).toHaveLength(3);
      expect(tools[0].type).toBe('computer_20241022');
      expect(tools[1].type).toBe('text_editor_20241022');
      expect(tools[2].type).toBe('bash_20241022');
    });

    it('should pass dimensions to computer tool', () => {
      const tools = createComputerUseTools(2560, 1440);

      expect(tools[0].display_width_px).toBe(2560);
      expect(tools[0].display_height_px).toBe(1440);
    });
  });

  describe('ComputerToolResultBuilder', () => {
    describe('constructor', () => {
      it('should create builder with tool use ID', () => {
        const builder = new ComputerToolResultBuilder('tool-123');

        expect(builder).toBeInstanceOf(ComputerToolResultBuilder);
      });

      it('should throw error for empty tool use ID', () => {
        expect(() => new ComputerToolResultBuilder('')).toThrow('Tool use ID cannot be empty');
      });

      it('should throw error for whitespace-only tool use ID', () => {
        expect(() => new ComputerToolResultBuilder('   ')).toThrow('Tool use ID cannot be empty');
      });
    });

    describe('withText', () => {
      it('should add text content', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('Command executed successfully')
          .build();

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toEqual({
          type: 'text',
          text: 'Command executed successfully',
        });
      });

      it('should allow multiple text entries', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('First line')
          .withText('Second line')
          .build();

        expect(result.content).toHaveLength(2);
      });

      it('should allow empty text string', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('')
          .build();

        expect(result.content[0].type).toBe('text');
      });

      it('should throw error for null text', () => {
        const builder = new ComputerToolResultBuilder('tool-123');
        expect(() => builder.withText(null as any)).toThrow('Text content cannot be null or undefined');
      });

      it('should throw error for undefined text', () => {
        const builder = new ComputerToolResultBuilder('tool-123');
        expect(() => builder.withText(undefined as any)).toThrow('Text content cannot be null or undefined');
      });
    });

    describe('withScreenshot', () => {
      it('should add screenshot with default media type', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withScreenshot('base64imagedata')
          .build();

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toEqual({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'base64imagedata',
          },
        });
      });

      it('should support custom media type', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withScreenshot('base64imagedata', 'image/jpeg')
          .build();

        expect(result.content[0]).toMatchObject({
          type: 'image',
          source: {
            media_type: 'image/jpeg',
          },
        });
      });

      it('should support all image types', () => {
        const types: Array<'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = [
          'image/png',
          'image/jpeg',
          'image/gif',
          'image/webp',
        ];

        for (const mediaType of types) {
          const result = new ComputerToolResultBuilder(`tool-${mediaType}`)
            .withScreenshot('data', mediaType)
            .build();

          expect(result.content[0]).toMatchObject({
            type: 'image',
            source: { media_type: mediaType },
          });
        }
      });

      it('should throw error for empty screenshot data', () => {
        const builder = new ComputerToolResultBuilder('tool-123');
        expect(() => builder.withScreenshot('')).toThrow('Screenshot data cannot be empty');
      });

      it('should throw error for whitespace-only screenshot data', () => {
        const builder = new ComputerToolResultBuilder('tool-123');
        expect(() => builder.withScreenshot('   ')).toThrow('Screenshot data cannot be empty');
      });
    });

    describe('withImage', () => {
      it('should add image with custom source', () => {
        const imageSource = {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: 'customdata',
        };

        const result = new ComputerToolResultBuilder('tool-123')
          .withImage(imageSource)
          .build();

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toEqual({
          type: 'image',
          source: imageSource,
        });
      });
    });

    describe('asError', () => {
      it('should mark result as error', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('Error occurred')
          .asError()
          .build();

        expect(result.is_error).toBe(true);
      });

      it('should not include is_error when not marked as error', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('Success')
          .build();

        expect(result.is_error).toBeUndefined();
      });
    });

    describe('build', () => {
      it('should build complete tool result', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('Output')
          .withScreenshot('screenshot-data')
          .build();

        expect(result).toEqual({
          type: 'tool_result',
          tool_use_id: 'tool-123',
          content: [
            { type: 'text', text: 'Output' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'screenshot-data',
              },
            },
          ],
          is_error: undefined,
        });
      });

      it('should throw error for empty content', () => {
        const builder = new ComputerToolResultBuilder('tool-123');
        expect(() => builder.build()).toThrow('Tool result must have at least one content item');
      });

      it('should allow chaining methods', () => {
        const result = new ComputerToolResultBuilder('tool-123')
          .withText('First')
          .withText('Second')
          .withScreenshot('screenshot')
          .asError()
          .build();

        expect(result.content).toHaveLength(3);
        expect(result.is_error).toBe(true);
      });
    });
  });

  describe('createComputerToolResult', () => {
    it('should create a builder instance', () => {
      const builder = createComputerToolResult('tool-123');

      expect(builder).toBeInstanceOf(ComputerToolResultBuilder);
    });

    it('should create functional builder', () => {
      const result = createComputerToolResult('tool-123')
        .withText('Test')
        .build();

      expect(result.tool_use_id).toBe('tool-123');
    });
  });

  describe('createTextToolResult', () => {
    it('should create text-only tool result', () => {
      const result = createTextToolResult('tool-123', 'Output text');

      expect(result).toEqual({
        type: 'tool_result',
        tool_use_id: 'tool-123',
        content: [{ type: 'text', text: 'Output text' }],
        is_error: undefined,
      });
    });

    it('should support error flag', () => {
      const result = createTextToolResult('tool-123', 'Error message', true);

      expect(result.is_error).toBe(true);
    });

    it('should handle multiline text', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const result = createTextToolResult('tool-123', text);

      expect(result.content[0]).toEqual({ type: 'text', text });
    });
  });

  describe('createScreenshotToolResult', () => {
    it('should create tool result with text and screenshot', () => {
      const result = createScreenshotToolResult(
        'tool-123',
        'Screenshot captured',
        'base64screenshot'
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Screenshot captured' });
      expect(result.content[1]).toMatchObject({
        type: 'image',
        source: { data: 'base64screenshot' },
      });
    });

    it('should support error flag', () => {
      const result = createScreenshotToolResult(
        'tool-123',
        'Error',
        'screenshot',
        true
      );

      expect(result.is_error).toBe(true);
    });
  });

  describe('validateComputerTool', () => {
    it('should validate computer tool', () => {
      const tool = createComputerTool(1920, 1080);

      expect(validateComputerTool(tool)).toBe(true);
    });

    it('should validate text editor tool', () => {
      const tool = createTextEditorTool();

      expect(validateComputerTool(tool)).toBe(true);
    });

    it('should validate bash tool', () => {
      const tool = createBashTool();

      expect(validateComputerTool(tool)).toBe(true);
    });

    it('should throw error for missing type', () => {
      const tool = {
        name: 'computer',
      } as any;

      expect(() => validateComputerTool(tool)).toThrow('Computer tool must have type and name');
    });

    it('should throw error for missing name', () => {
      const tool = {
        type: 'computer_20241022',
      } as any;

      expect(() => validateComputerTool(tool)).toThrow('Computer tool must have type and name');
    });

    it('should throw error for computer tool without dimensions', () => {
      const tool = {
        type: 'computer_20241022',
        name: 'computer',
      } as any;

      expect(() => validateComputerTool(tool)).toThrow('Computer tool must have display dimensions');
    });

    it('should not require dimensions for text editor', () => {
      const tool = {
        type: 'text_editor_20241022',
        name: 'str_replace_editor',
      };

      expect(validateComputerTool(tool)).toBe(true);
    });

    it('should not require dimensions for bash', () => {
      const tool = {
        type: 'bash_20241022',
        name: 'bash',
      };

      expect(validateComputerTool(tool)).toBe(true);
    });
  });
});

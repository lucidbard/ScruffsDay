import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
config({ path: path.resolve(PROJECT_ROOT, '.env') });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const server = new Server(
  { name: 'openai-image', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_image_openai',
      description:
        'Generate an image using OpenAI (gpt-image-1 or dall-e-3). ' +
        'Saves the result to the project assets directory.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Image generation prompt',
          },
          output_path: {
            type: 'string',
            description:
              'Relative path from project root to save the image (e.g. "assets/items/my-item.png")',
          },
          model: {
            type: 'string',
            enum: ['gpt-image-1', 'dall-e-3'],
            description: 'Model to use (default: gpt-image-1)',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1024x1536', '1536x1024', '256x256', '512x512'],
            description: 'Image size (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'auto'],
            description: 'Quality level (default: auto)',
          },
        },
        required: ['prompt', 'output_path'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'generate_image_openai') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { prompt, output_path, model, size, quality } = request.params.arguments;
  const absPath = path.resolve(PROJECT_ROOT, output_path);

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  try {
    const response = await openai.images.generate({
      model: model || 'gpt-image-1',
      prompt,
      n: 1,
      size: size || '1024x1024',
      quality: quality || 'auto',
    });

    const imageData = response.data[0];

    if (imageData.b64_json) {
      fs.writeFileSync(absPath, Buffer.from(imageData.b64_json, 'base64'));
    } else if (imageData.url) {
      const res = await fetch(imageData.url);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(absPath, buffer);
    } else {
      throw new Error('No image data in response');
    }

    return {
      content: [
        {
          type: 'text',
          text: `Image saved to ${output_path} (${model || 'gpt-image-1'}, ${size || '1024x1024'})`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
